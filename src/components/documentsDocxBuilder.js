// Word (.docx) renderer for the Documents page, mirroring DocumentsPdfDocument: same formatting
// settings (Times New Roman, justified, tunable sizes/margins/spacing/header/footer), same
// one-column / two-column layouts. A clinic logo is never added automatically - it only appears
// where the template itself places one, via the dedicated `logo` field (or, for older templates,
// a leading {{logo}}/{{logo-long}} paragraph): {{logo}} is compact, once per visible language
// column; {{logo-long}} is one shared full-width logo. Either way it renders once, before the
// title; see getTemplateLogoType/getClinicLogo in documentsCatalogUtils. The `docx` package is
// imported dynamically by the caller-facing builder so the library only loads when a Word export
// is actually requested.
import {
  DEFAULT_DOC_FORMATTING,
  allowsParagraphInternalBreak,
  getClinicLogo,
  getEffectiveDocLayout,
  getLayoutLang,
  isBilingualLayout,
  isParagraphBold,
  isSingleLanguageTwoColumnLayout,
  normalizeSignerBlockOffsetPercent,
  parseFormattedRuns,
  splitParagraphsIntoColumns,
} from './documentsCatalogUtils';

const CM_TO_TWIP = 567;
const MM_TO_PX = 96 / 25.4; // docx ImageRun transformations are CSS pixels at 96dpi

const halfPoints = pt => Math.round(pt * 2);

// data:image/png;base64,... -> bytes + docx image type
const decodeLogoDataUrl = dataUrl => {
  const match = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match) return null;
  const binary = typeof atob === 'function'
    ? atob(match[2])
    : Buffer.from(match[2], 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const subtype = match[1].toLowerCase();
  return { bytes, type: subtype === 'jpeg' ? 'jpg' : subtype };
};

export const buildDocumentsDocx = async ({
  documents = [],
  layout = 'two-column',
  formatting = DEFAULT_DOC_FORMATTING,
  clinicLogos = [],
}) => {
  const docx = await import('docx');
  const {
    AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageNumber,
    Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
  } = docx;

  // Both column layouts (bilingual UA|EN and single-language newspaper-style, spec §4) share the
  // same two-cell geometry/logo clamping - only how paragraphs are distributed between the two
  // cells differs (see singleLanguageColumnsTable below). Which layout actually applies is resolved
  // per document below (getEffectiveDocLayout), since a template can pin its own languages/columns
  // regardless of the page-wide selector (batch 16 §15/§16).
  const bodySize = halfPoints(formatting.fontSize);
  const titleSize = halfPoints(formatting.titleFontSize);
  const smallSize = halfPoints(Math.max(7, formatting.fontSize - 2));
  const lineTwips = Math.round(formatting.lineSpacing * 240);
  const afterTwips = Math.round(formatting.paragraphSpacing * 20);
  const firstLineTwips = Math.round(formatting.firstLineIndentCm * CM_TO_TWIP);
  const gapTwips = Math.round(formatting.columnGapCm * CM_TO_TWIP);
  // `showLogo` is only the global permission (spec §5) - whether a logo actually renders still
  // depends entirely on the template carrying a {{logo}}/{{logo-long}} paragraph.
  const canRenderLogo = formatting.showLogo !== false;
  const effectiveClinicLogos = canRenderLogo ? clinicLogos : [];

  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  // Off by default (spec §3): a hairline rule between the two columns, drawn as a single border on
  // the left cell only (the right cell stays borderless) so the table renders exactly one line at
  // the boundary instead of a doubled one. Same docLine hairline weight the PDF renderer uses.
  // Whether it actually applies is resolved per document (see showColumnDivider in buildDocChildren).
  const dividerBorder = { style: BorderStyle.SINGLE, size: 4, color: 'E6DCC7' };

  const contentWidthTwips = 11906
    - Math.round(formatting.marginLeftCm * CM_TO_TWIP)
    - Math.round(formatting.marginRightCm * CM_TO_TWIP);
  const columnContentWidthTwips = (contentWidthTwips - gapTwips) / 2;

  // Splits `text` on its bold/italic markup (spec §1: selection-based, not whole-paragraph) into
  // the TextRuns Word needs to render each fragment's own weight/style; `baseBold` is for a
  // heading/title paragraph that's already bold throughout (an inline-italic fragment inside it
  // still needs its own run to pick up the italic flag).
  const formattedTextRuns = (text, { size, baseBold = false } = {}) => parseFormattedRuns(text).map(run => new TextRun({
    text: run.text,
    size,
    bold: baseBold || run.bold,
    italics: run.italic,
  }));

  // batch 16 §17: an explicit `align` on a paragraph (or beforeTitle block) overrides the default
  // alignment (justified body / flush-left heading) - never inferred from the text itself.
  const alignmentForBlock = align => {
    if (align === 'right') return AlignmentType.RIGHT;
    if (align === 'center') return AlignmentType.CENTER;
    if (align === 'justify') return AlignmentType.JUSTIFIED;
    return AlignmentType.LEFT;
  };

  const bodyParagraph = (text, { keepLines = true, alignmentOverride, indentTwipsOverride } = {}) => {
    // Per-paragraph first-line indent (spec: the reference notarial statement indents only its
    // opening declaration, not the signature/registration lines after it) - undefined falls back
    // to the document-wide firstLineTwips, same as every paragraph did before this existed.
    const firstLine = indentTwipsOverride !== undefined ? indentTwipsOverride : firstLineTwips;
    return new Paragraph({
      alignment: alignmentOverride || AlignmentType.JUSTIFIED,
      spacing: { after: afterTwips, line: lineTwips, lineRule: 'auto' },
      indent: firstLine ? { firstLine } : undefined,
      keepLines,
      children: formattedTextRuns(text, { size: bodySize }),
    });
  };

  // Short numbered section titles ("1. Предмет Договору") render bold, flush left, with extra
  // room above and kept with the paragraph that follows so a heading never ends a page alone.
  const headingParagraph = (text, alignmentOverride) => new Paragraph({
    alignment: alignmentOverride || AlignmentType.LEFT,
    spacing: { before: afterTwips, after: afterTwips, line: lineTwips, lineRule: 'auto' },
    keepLines: true,
    keepNext: true,
    children: formattedTextRuns(text, { size: bodySize, baseBold: true }),
  });

  const cellParagraph = (text, allowPageBreaks, paragraph) => {
    const alignmentOverride = paragraph?.align ? alignmentForBlock(paragraph.align) : undefined;
    const indentTwipsOverride = paragraph?.indentCm !== undefined ? Math.round(paragraph.indentCm * CM_TO_TWIP) : undefined;
    return isParagraphBold(paragraph)
      ? headingParagraph(text, alignmentOverride)
      : bodyParagraph(text, {
        keepLines: !allowsParagraphInternalBreak(paragraph, allowPageBreaks),
        alignmentOverride,
        indentTwipsOverride,
      });
  };

  // Exactly the Format panel's paragraph spacing - no hidden minimum - so the Word output keeps
  // the same title-to-body rhythm as the PDF and the reference statements.
  const titleParagraph = text => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: afterTwips, line: lineTwips, lineRule: 'auto' },
    children: formattedTextRuns(text, { size: titleSize, baseBold: true }),
  });

  // The addressee/signer block between the letterhead logo and the title (notarial layout
  // standard §3.2: "ЗА МІСЦЕМ ВИМОГИ" + the signer data). Implemented exactly the way the
  // reference notarial file does it: a borderless 2-column table across the full width of its
  // container - column 1 empty (the left offset, default 8.5 cm), column 2 holding every
  // beforeTitle block. Inside the block a bold paragraph (the caption) aligns to the block's left
  // edge; a regular one (the signer data) is justified; neither ever carries a first-line indent.
  // Consecutive blocks are separated by exactly one empty line (empty blocks in the template
  // collapse into that same separator). `containerWidthTwips` is whichever width this block's own
  // column actually has (the full page in the single-column flow, or one table cell's width in
  // the bilingual layout).
  const isBlankBlockText = value => !String(value || '').trim();

  const emptyLineParagraph = () => new Paragraph({
    spacing: { after: afterTwips, line: lineTwips, lineRule: 'auto' },
    children: [new TextRun({ text: '', size: bodySize })],
  });

  const signerBlockParagraph = (text, block) => new Paragraph({
    alignment: block.bold ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
    spacing: { after: afterTwips, line: lineTwips, lineRule: 'auto' },
    children: formattedTextRuns(text, { size: bodySize, baseBold: Boolean(block.bold) }),
  });

  const signerBlockTable = (blocks, langKey, containerWidthTwips, offsetPercent) => {
    const offsetTwips = Math.round(containerWidthTwips * (offsetPercent / 100));
    const blockWidthTwips = Math.max(1, Math.round(containerWidthTwips) - offsetTwips);
    const cellChildren = blocks.flatMap((block, index) => [
      ...(index > 0 ? [emptyLineParagraph()] : []),
      signerBlockParagraph(block[langKey], block),
    ]);
    return new Table({
      width: { size: offsetTwips + blockWidthTwips, type: WidthType.DXA },
      columnWidths: [offsetTwips, blockWidthTwips],
      borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
      rows: [new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            width: { size: offsetTwips, type: WidthType.DXA },
            children: [new Paragraph({ spacing: { after: 0, line: lineTwips, lineRule: 'auto' }, children: [] })],
          }),
          new TableCell({
            borders: noBorders,
            width: { size: blockWidthTwips, type: WidthType.DXA },
            children: cellChildren,
          }),
        ],
      })],
    });
  };

  const twoColumnCellFromParagraph = (paragraphOrParagraphs, marginSide, showColumnDivider) => new TableCell({
    borders: showColumnDivider && marginSide === 'left' ? { ...noBorders, right: dividerBorder } : noBorders,
    width: { size: 50, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.TOP,
    margins: {
      top: 0,
      bottom: 0,
      left: marginSide === 'right' ? Math.round(gapTwips / 2) : 0,
      right: marginSide === 'left' ? Math.round(gapTwips / 2) : 0,
    },
    children: Array.isArray(paragraphOrParagraphs) ? paragraphOrParagraphs : [paragraphOrParagraphs],
  });

  const twoColumnTable = (rows, cantSplit, showColumnDivider = false) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: rows.map(([left, right]) => new TableRow({
      cantSplit,
      children: [
        twoColumnCellFromParagraph(left, 'left', showColumnDivider),
        twoColumnCellFromParagraph(right, 'right', showColumnDivider),
      ],
    })),
  });

  // The single-language 2-column layout (spec §4: newspaper-style, one language flowing across two
  // columns). Word does support native multi-column section flow, but splitting it out would need
  // a second, continuous-break section per document and would fight the per-document page-number
  // restart every section already carries (pageNumbers.start: 1) - so, for parity with the PDF
  // renderer (which has no native multi-column flow at all) and to keep the well-tested
  // per-document section/pagination model untouched, this uses the same up-front split into two
  // whole-paragraph groups as the PDF, laid out as a single borderless table row.
  const singleLanguageColumnsTable = (paragraphs, allowPageBreaks, lang, layoutCtx) => {
    const [leftParagraphs, rightParagraphs] = splitParagraphsIntoColumns(paragraphs, lang);
    const buildColumnChildren = columnParagraphs => columnParagraphs.flatMap(paragraph => (
      paragraph.type && paragraph.type !== 'text' ? buildLogoBlock(paragraph.type, layoutCtx) : [cellParagraph(paragraph[lang], allowPageBreaks, paragraph)]
    ));
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
      rows: [new TableRow({
        children: [
          twoColumnCellFromParagraph(buildColumnChildren(leftParagraphs), 'left', layoutCtx.showColumnDivider),
          twoColumnCellFromParagraph(buildColumnChildren(rightParagraphs), 'right', layoutCtx.showColumnDivider),
        ],
      })],
    });
  };

  const logoImageRun = (decoded, widthPx, ratio) => new ImageRun({
    data: decoded.bytes,
    type: decoded.type,
    transformation: { width: widthPx, height: Math.round(widthPx * ratio) },
  });

  const logoParagraph = (decoded, widthPx, ratio) => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [logoImageRun(decoded, widthPx, ratio)],
  });

  // {{logo}}: a compact logo duplicated above each visible language column (or once, centered,
  // in a one-column export); {{logo-long}}: one shared full-width logo, never duplicated.
  const buildLogoBlock = (paragraphType, layoutCtx) => {
    const { isTwoColumn, showUk, showEn, showColumnDivider } = layoutCtx;
    const variantKind = paragraphType === 'logo-long' ? 'logo-long' : 'logo';
    const variant = getClinicLogo(effectiveClinicLogos, variantKind);
    if (!variant?.dataUrl) return [];
    const decoded = decodeLogoDataUrl(variant.dataUrl);
    if (!decoded) return [];
    const ratio = variant.width && variant.height ? variant.height / variant.width : 0.25;

    if (variantKind === 'logo-long') {
      const widthPx = Math.round((contentWidthTwips / 1440) * 96);
      return [logoParagraph(decoded, widthPx, ratio)];
    }

    const configuredCompactWidthPx = Math.round(formatting.logoWidthMm * MM_TO_PX);
    const columnContentWidthPx = Math.round((columnContentWidthTwips / 1440) * 96);
    const compactWidthPx = isTwoColumn
      ? Math.min(configuredCompactWidthPx, columnContentWidthPx)
      : configuredCompactWidthPx;
    if (isTwoColumn && showUk && showEn) {
      return [twoColumnTable([[
        logoParagraph(decoded, compactWidthPx, ratio),
        logoParagraph(decoded, compactWidthPx, ratio),
      ]], true, showColumnDivider)];
    }
    return [logoParagraph(decoded, compactWidthPx, ratio)];
  };

  const buildDocChildren = doc => {
    const effectiveLayout = getEffectiveDocLayout(doc, layout);
    const isBilingual = isBilingualLayout(effectiveLayout);
    const isSingleLanguageFlow = isSingleLanguageTwoColumnLayout(effectiveLayout);
    const isTwoColumn = isBilingual || isSingleLanguageFlow;
    const lang = getLayoutLang(effectiveLayout);
    const showUk = isBilingual || lang === 'uk';
    const showEn = isBilingual || lang === 'en';
    const showColumnDivider = isTwoColumn && Boolean(formatting.columnDivider);
    const layoutCtx = {
      isTwoColumn, showUk, showEn, showColumnDivider,
    };

    const children = [];

    // The template's letterhead logo (doc.logo) always renders before the title, whether it came
    // from the dedicated `logo` field or a legacy leading paragraph - see getTemplateLogoType.
    if (doc.logo) children.push(...buildLogoBlock(doc.logo, layoutCtx));

    // The addressee/signer block between the logo and the title (§3.2), never merged into the
    // body. One empty line separates the whole block from the title that follows (§3.4).
    const signerBlocks = (doc.beforeTitle || []).filter(block => !isBlankBlockText(block.uk) || !isBlankBlockText(block.en));
    if (signerBlocks.length) {
      const offsetPercent = normalizeSignerBlockOffsetPercent(doc.beforeTitleOffsetPercent);
      if (isBilingual) {
        children.push(twoColumnTable([[
          signerBlockTable(signerBlocks, 'uk', columnContentWidthTwips, offsetPercent),
          signerBlockTable(signerBlocks, 'en', columnContentWidthTwips, offsetPercent),
        ]], true, showColumnDivider));
      } else {
        children.push(signerBlockTable(signerBlocks, lang, contentWidthTwips, offsetPercent));
      }
      children.push(emptyLineParagraph());
    }

    if (isBilingual) {
      children.push(twoColumnTable([[titleParagraph(doc.title.uk), titleParagraph(doc.title.en)]], true, showColumnDivider));
    } else {
      children.push(titleParagraph(doc.title[lang]));
    }

    const bodyParagraphs = doc.paragraphs.filter(paragraph => paragraph.type !== 'logo-consumed');

    if (isSingleLanguageFlow) {
      // One shared table for the whole body (not one per paragraph, unlike the bilingual/1-column
      // branches below) - the newspaper-style column split is decided once, up front, across every
      // paragraph together (see splitParagraphsIntoColumns).
      children.push(singleLanguageColumnsTable(bodyParagraphs, doc.allowPageBreaks, lang, layoutCtx));
      return children;
    }

    bodyParagraphs.forEach(paragraph => {
      if (paragraph.type && paragraph.type !== 'text') {
        children.push(...buildLogoBlock(paragraph.type, layoutCtx));
        return;
      }
      if (isBilingual) {
        const cantSplit = !allowsParagraphInternalBreak(paragraph, doc.allowPageBreaks);
        children.push(twoColumnTable([[
          cellParagraph(paragraph.uk, doc.allowPageBreaks, paragraph),
          cellParagraph(paragraph.en, doc.allowPageBreaks, paragraph),
        ]], cantSplit, showColumnDivider));
      } else {
        children.push(cellParagraph(paragraph[lang], doc.allowPageBreaks, paragraph));
      }
    });
    return children;
  };

  const headers = formatting.headerText
    ? {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: formatting.headerText, size: smallSize })],
        })],
      }),
    }
    : undefined;

  // One section per document (below), each with its own w:pgNumType/@start="1" (pageNumbers.start
  // in pageSetup) so Word's PAGE field restarts at 1 for every document instead of counting
  // through the whole combined export, and PageNumber.TOTAL_PAGES_IN_SECTION (the SECTIONPAGES
  // field) so the "of N" total is this document's own page count, not the export's.
  //
  // A Word document's real page count is only known once Word itself lays the content out, not at
  // generation time - unlike the PDF renderer, which gets a real subPageTotalPages from @react-pdf.
  // Whether a *specific* document is worth numbering at all can't be measured up front the same
  // way; `allowPageBreaks` (set on genuinely long templates) is the best available per-document
  // proxy for "this one may run past a single page" and is used instead of the previous
  // `documents.length > 1` guess, which judged the whole export rather than each document.
  const anyDocumentCanShowPageNumbers = formatting.showPageNumbers && documents.some(doc => doc.allowPageBreaks);

  const buildFooter = doc => {
    const showPageNumbers = formatting.showPageNumbers && Boolean(doc.allowPageBreaks);
    const footerChildren = [];
    if (formatting.footerText || showPageNumbers) {
      const runs = [];
      if (formatting.footerText) runs.push(new TextRun({ text: formatting.footerText, size: smallSize }));
      if (showPageNumbers) {
        if (formatting.footerText) runs.push(new TextRun({ text: '   ', size: smallSize }));
        runs.push(new TextRun({ text: 'Page ', size: smallSize }));
        runs.push(new TextRun({ children: [PageNumber.CURRENT], size: smallSize }));
        runs.push(new TextRun({ text: ' of ', size: smallSize }));
        runs.push(new TextRun({ children: [PageNumber.TOTAL_PAGES_IN_SECTION], size: smallSize }));
      }
      footerChildren.push(new Paragraph({
        alignment: formatting.footerText ? AlignmentType.LEFT : AlignmentType.CENTER,
        children: runs,
      }));
    }
    return footerChildren.length ? { default: new Footer({ children: footerChildren }) } : undefined;
  };

  const pageSetup = {
    page: {
      // A4 in twips, same sheet as the reference docx
      size: { width: 11906, height: 16838 },
      margin: {
        top: Math.round(formatting.marginTopCm * CM_TO_TWIP),
        right: Math.round(formatting.marginRightCm * CM_TO_TWIP),
        bottom: Math.round(formatting.marginBottomCm * CM_TO_TWIP),
        left: Math.round(formatting.marginLeftCm * CM_TO_TWIP),
      },
      pageNumbers: { start: 1 },
    },
  };

  // One section per document so every statement starts on a fresh page with its own header/footer.
  const doc = new Document({
    // The PAGE/SECTIONPAGES fields above are computed by Word itself, not by this builder -
    // without this, Word shows their last-cached value (0) until the user manually recalculates (F9).
    features: anyDocumentCanShowPageNumbers ? { updateFields: true } : undefined,
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: bodySize },
        },
      },
    },
    sections: documents.map(generated => ({
      properties: pageSetup,
      headers,
      footers: buildFooter(generated),
      children: buildDocChildren(generated),
    })),
  });

  return Packer.toBlob(doc);
};
