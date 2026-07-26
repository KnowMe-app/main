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
  isOfficialFormStyle,
  isParagraphBold,
  isSingleLanguageTwoColumnLayout,
  normalizeSignerBlockOffsetPercent,
  parseFormattedRuns,
  splitBlankFieldRuns,
  splitParagraphsIntoColumns,
} from './documentsCatalogUtils';

const CM_TO_TWIP = 567;
const MM_TO_TWIP = 56.6929; // 1440 twips/inch / 25.4mm/inch
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
    Paragraph, Table, TableCell, TableRow, TextRun, UnderlineType, VerticalAlign, WidthType,
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
  // still needs its own run to pick up the italic flag). Embedded newlines become explicit
  // <w:br/> line breaks (batch 2026-07-23 B §3: an empty line inside a paragraph - consecutive
  // breaks - must survive into the Word output as a full blank line, never be silently dropped
  // by a TextRun that doesn't understand "\n").
  // `blankFields` (official-form documents only, batch 22 §1) additionally splits each run at its
  // underscore stretches (see splitBlankFieldRuns) so a government form's typed "__________"
  // fill-in line renders as an underlined run of non-breaking spaces instead of literal underscore
  // characters - the PDF renderer does the same, gated the same way. Every other document leaves
  // its underscores exactly as typed.
  const formattedTextRuns = (text, { size, baseBold = false, blankFields = false } = {}) => {
    const runs = parseFormattedRuns(text);
    const renderRuns = blankFields ? splitBlankFieldRuns(runs) : runs;
    return renderRuns.flatMap(run => {
      const runText = run.blank ? ' '.repeat(run.text.length) : String(run.text);
      return runText.split('\n').map((segment, segmentIndex) => new TextRun({
        text: segment,
        size,
        bold: baseBold || run.bold,
        italics: run.italic,
        underline: run.blank ? { type: UnderlineType.SINGLE } : undefined,
        ...(segmentIndex > 0 ? { break: 1 } : {}),
      }));
    });
  };

  // batch 16 §17: an explicit `align` on a paragraph (or beforeTitle block) overrides the default
  // alignment (justified body / flush-left heading) - never inferred from the text itself.
  const alignmentForBlock = align => {
    if (align === 'right') return AlignmentType.RIGHT;
    if (align === 'center') return AlignmentType.CENTER;
    if (align === 'justify') return AlignmentType.JUSTIFIED;
    return AlignmentType.LEFT;
  };

  const bodyParagraph = (text, { keepLines = true, alignmentOverride, indentTwipsOverride, sizeOverride, blankFields = false } = {}) => {
    // Per-paragraph first-line indent (spec: the reference notarial statement indents only its
    // opening declaration, not the signature/registration lines after it) - undefined falls back
    // to the document-wide firstLineTwips, same as every paragraph did before this existed.
    const firstLine = indentTwipsOverride !== undefined ? indentTwipsOverride : firstLineTwips;
    return new Paragraph({
      alignment: alignmentOverride || AlignmentType.JUSTIFIED,
      spacing: { after: afterTwips, line: lineTwips, lineRule: 'auto' },
      indent: firstLine ? { firstLine } : undefined,
      keepLines,
      children: formattedTextRuns(text, { size: sizeOverride ?? bodySize, blankFields }),
    });
  };

  // Short numbered section titles ("1. Предмет Договору") render bold, flush left, with extra
  // room above and kept with the paragraph that follows so a heading never ends a page alone.
  const headingParagraph = (text, alignmentOverride, sizeOverride, blankFields = false) => new Paragraph({
    alignment: alignmentOverride || AlignmentType.LEFT,
    spacing: { before: afterTwips, after: afterTwips, line: lineTwips, lineRule: 'auto' },
    keepLines: true,
    keepNext: true,
    children: formattedTextRuns(text, { size: sizeOverride ?? bodySize, baseBold: true, blankFields }),
  });

  const cellParagraph = (text, allowPageBreaks, paragraph, blankFields = false) => {
    // align/indentCm/fontSize arrive already resolved from the paragraph's consolidated `style`
    // key (buildGeneratedDocument) - undefined means "inherit the document-wide value".
    const alignmentOverride = paragraph?.align ? alignmentForBlock(paragraph.align) : undefined;
    const indentTwipsOverride = paragraph?.indentCm !== undefined ? Math.round(paragraph.indentCm * CM_TO_TWIP) : undefined;
    const sizeOverride = paragraph?.fontSize !== undefined ? halfPoints(paragraph.fontSize) : undefined;
    return isParagraphBold(paragraph)
      ? headingParagraph(text, alignmentOverride, sizeOverride, blankFields)
      : bodyParagraph(text, {
        keepLines: !allowsParagraphInternalBreak(paragraph, allowPageBreaks),
        alignmentOverride,
        indentTwipsOverride,
        sizeOverride,
        blankFields,
      });
  };

  // Exactly the Format panel's paragraph spacing - no hidden minimum - so the Word output keeps
  // the same title-to-body rhythm as the PDF and the reference statements. The title is an
  // ordinary centered paragraph (batch 2026-07-23 C §2): Center is only its default - its own
  // sparse align/fontSize (resolved by buildGeneratedDocument from the title's consolidated
  // `style`) override it like any paragraph's.
  const titleParagraph = (text, title = {}, blankFields = false) => new Paragraph({
    alignment: title.align ? alignmentForBlock(title.align) : AlignmentType.CENTER,
    spacing: { after: afterTwips, line: lineTwips, lineRule: 'auto' },
    children: formattedTextRuns(text, {
      size: title.fontSize !== undefined ? halfPoints(title.fontSize) : titleSize,
      baseBold: true,
      blankFields,
    }),
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

  // An explicitly aligned block (the §1.5 alignment button, stored under the block's `style`
  // key) overrides the strip's notarial default: bold caption flush-left, regular data justified.
  const signerBlockParagraph = (text, block, blankFields = false) => new Paragraph({
    alignment: block.align ? alignmentForBlock(block.align) : (block.bold ? AlignmentType.LEFT : AlignmentType.JUSTIFIED),
    spacing: { after: afterTwips, line: lineTwips, lineRule: 'auto' },
    children: formattedTextRuns(text, {
      size: block.fontSize !== undefined ? halfPoints(block.fontSize) : bodySize,
      baseBold: Boolean(block.bold),
      blankFields,
    }),
  });

  const signerBlockTable = (blocks, langKey, containerWidthTwips, offsetPercent, blankFields = false) => {
    const offsetTwips = Math.round(containerWidthTwips * (offsetPercent / 100));
    const blockWidthTwips = Math.max(1, Math.round(containerWidthTwips) - offsetTwips);
    const cellChildren = blocks.flatMap((block, index) => [
      ...(index > 0 ? [emptyLineParagraph()] : []),
      signerBlockParagraph(block[langKey], block, blankFields),
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
      paragraph.type && paragraph.type !== 'text' ? buildLogoBlock(paragraph.type, layoutCtx) : [cellParagraph(paragraph[lang], allowPageBreaks, paragraph, layoutCtx.blankFields)]
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
    // An official-form document (batch 22 §1) draws its logo in the page Header instead (see
    // buildHeader below) - never again here as a one-off body block - and its underscore blank
    // fields render underlined, not literal.
    const blankFields = isOfficialFormStyle(doc);
    const layoutCtx = {
      isTwoColumn, showUk, showEn, showColumnDivider, blankFields,
    };

    const children = [];

    // The template's letterhead logo (doc.logo) always renders before the title, whether it came
    // from the dedicated `logo` field or a legacy leading paragraph - see getTemplateLogoType.
    if (doc.logo && !blankFields) children.push(...buildLogoBlock(doc.logo, layoutCtx));

    // The addressee/signer block between the logo and the title (§3.2), never merged into the
    // body. One empty line separates the whole block from the title that follows (§3.4).
    const signerBlocks = (doc.beforeTitle || []).filter(block => !isBlankBlockText(block.uk) || !isBlankBlockText(block.en));
    if (signerBlocks.length) {
      const offsetPercent = normalizeSignerBlockOffsetPercent(doc.beforeTitleOffsetPercent);
      if (isBilingual) {
        children.push(twoColumnTable([[
          signerBlockTable(signerBlocks, 'uk', columnContentWidthTwips, offsetPercent, blankFields),
          signerBlockTable(signerBlocks, 'en', columnContentWidthTwips, offsetPercent, blankFields),
        ]], true, showColumnDivider));
      } else {
        children.push(signerBlockTable(signerBlocks, lang, contentWidthTwips, offsetPercent, blankFields));
      }
      children.push(emptyLineParagraph());
    }

    // A document whose title was deleted (both languages resolve blank) gets no title paragraph
    // at all - deleting the title must never crash or leave an empty centered line (§2).
    const title = doc.title || {};
    if (!isBlankBlockText(title.uk) || !isBlankBlockText(title.en)) {
      if (isBilingual) {
        children.push(twoColumnTable([[titleParagraph(title.uk, title, blankFields), titleParagraph(title.en, title, blankFields)]], true, showColumnDivider));
      } else {
        children.push(titleParagraph(title[lang], title, blankFields));
      }
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
          cellParagraph(paragraph.uk, doc.allowPageBreaks, paragraph, blankFields),
          cellParagraph(paragraph.en, doc.allowPageBreaks, paragraph, blankFields),
        ]], cantSplit, showColumnDivider));
      } else {
        children.push(cellParagraph(paragraph[lang], doc.allowPageBreaks, paragraph, blankFields));
      }
    });
    return children;
  };

  // --- layoutV2 (pixel-exact single-page forms, e.g. genetic-affinity-certificate) -------------
  // Reads exactly the normalized tree buildLayoutV2Document produces (doc.layoutV2) - the same
  // tree the PDF renderer reads (spec §8), just converted to twips/eighths-of-a-point instead of
  // react-pdf's pt. A layoutV2 document is fully self-describing (its own page/margins/styles) and
  // gets its own section below - no shared header/footer, no bilingual/column layout.
  const eighthsFromPt = pt => Math.round((pt || 0) * 8); // OOXML border size unit
  const halfPointsV2 = pt => Math.round((pt || 0) * 2);
  const applyTextTransform = (text, transform) => (
    transform === 'uppercase' ? String(text || '').toLocaleUpperCase('uk-UA') : String(text || '')
  );
  const lineTwipsFor = style => Math.round((style?.lineHeight || 1) * 240);
  const marginBeforeTwips = block => (block.marginTopMm !== undefined
    ? Math.round(block.marginTopMm * MM_TO_TWIP)
    : Math.round((block.style?.spaceBeforePt || 0) * 20));
  const marginAfterTwips = block => (block.marginBottomMm !== undefined
    ? Math.round(block.marginBottomMm * MM_TO_TWIP)
    : Math.round((block.style?.spaceAfterPt || 0) * 20));

  const layoutV2Alignment = align => {
    if (align === 'right') return AlignmentType.RIGHT;
    if (align === 'center') return AlignmentType.CENTER;
    if (align === 'justify') return AlignmentType.JUSTIFIED;
    return AlignmentType.LEFT;
  };

  // textTransform is applied to the run's text right here (spec §5.5: "лише візуально. Не
  // змінювати значення в context/Firebase") - the normalized tree itself, and everything upstream
  // of it, keeps the original case; only this TextRun's rendered characters are uppercased.
  // letterSpacingPt maps straight onto `characterSpacing`, which docx (like the reference docx's
  // own `<w:spacing>`) expects in twentieths of a point - the same unit fontSize halves into.
  const layoutV2TextRun = (text, style) => new TextRun({
    text: applyTextTransform(text, style?.textTransform),
    font: style?.fontFamily || 'Times New Roman',
    size: halfPointsV2(style?.fontSizePt) || bodySize,
    bold: (style?.fontWeight || 400) >= 600,
    italics: style?.fontStyle === 'italic',
    underline: style?.textDecoration === 'underline' ? {} : undefined,
    characterSpacing: style?.letterSpacingPt ? Math.round(style.letterSpacingPt * 20) : undefined,
  });

  const layoutV2Content = (content, clinicLogos) => {
    if (!content) return [new Paragraph({ children: [] })];
    if (content.type === 'image') {
      // `hidden` skips the image but still returns an empty paragraph - the column's own cell
      // keeps its declared width regardless, so a sibling column never shifts (spec: "решта
      // тексту ... не стрибала"). offsetXMm moves the image within its cell via a paragraph
      // indent; offsetYMm approximates a downward nudge via spacing before (DOCX has no negative
      // spacing, so a negative/"up" offset has no effect here - the PDF preview is authoritative
      // for that direction).
      if (content.hidden) return [new Paragraph({ children: [] })];
      const variant = content.logoToken ? getClinicLogo(clinicLogos, content.logoToken) : null;
      const dataUrl = variant?.dataUrl || content.source;
      const decoded = dataUrl ? decodeLogoDataUrl(dataUrl) : null;
      if (!decoded) return [new Paragraph({ children: [] })];
      const ratio = variant?.width && variant?.height
        ? variant.height / variant.width
        : ((content.heightMm && content.widthMm) ? content.heightMm / content.widthMm : 0.25);
      const widthPx = Math.round((content.widthMm || 0) * MM_TO_PX);
      const offsetXTwips = Math.round((content.offsetXMm || 0) * MM_TO_TWIP);
      const offsetYTwips = Math.max(0, Math.round((content.offsetYMm || 0) * MM_TO_TWIP));
      return [new Paragraph({
        spacing: { before: offsetYTwips, after: 0 },
        indent: offsetXTwips ? { left: offsetXTwips } : undefined,
        children: [logoImageRun(decoded, widthPx, ratio)],
      })];
    }
    if (content.type === 'stack') {
      const alignment = content.horizontalAlign === 'right'
        ? AlignmentType.RIGHT
        : (content.horizontalAlign === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT);
      return (content.lines || []).map(line => new Paragraph({
        alignment,
        spacing: { after: 0, line: lineTwipsFor(content.style), lineRule: 'auto' },
        children: [layoutV2TextRun(line, content.style)],
      }));
    }
    return [new Paragraph({ children: [] })];
  };

  // The bottom border draws as one continuous rule across the whole 180mm width (batch 2026-07-25):
  // each cell of the single row carries its own bottom border, but adjoining table cells share the
  // same edge in Word, so the two lines render as one - exactly how the reference docx's own
  // multi-paragraph pBdr achieves the same visual line.
  const layoutV2Letterhead = (block, clinicLogos) => {
    const gapTwips = Math.round((block.columnGapMm || 0) * MM_TO_TWIP);
    const colTwips = (block.columns || []).map(column => Math.round((column.widthMm || 0) * MM_TO_TWIP));
    const borderSize = eighthsFromPt(block.bottomBorder?.widthPt);
    const borderColor = (block.bottomBorder?.color || '#000000').replace('#', '');
    const bottomBorder = borderSize ? { style: BorderStyle.SINGLE, size: borderSize, color: borderColor } : noBorder;
    const cells = (block.columns || []).map((column, index) => {
      const isLast = index === block.columns.length - 1;
      return new TableCell({
        borders: { ...noBorders, bottom: bottomBorder },
        width: { size: colTwips[index] + (isLast ? 0 : gapTwips), type: WidthType.DXA },
        margins: {
          top: 0, bottom: 0, left: 0, right: isLast ? 0 : gapTwips,
        },
        children: layoutV2Content(column.content, clinicLogos),
      });
    });
    return new Table({
      width: { size: colTwips.reduce((sum, w) => sum + w, 0) + gapTwips * Math.max(0, cells.length - 1), type: WidthType.DXA },
      columnWidths: cells.map((_, index) => colTwips[index] + (index < cells.length - 1 ? gapTwips : 0)),
      borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
      rows: [new TableRow({ children: cells })],
    });
  };

  // A right-pushed, left-aligned block of text (spec §5.2, "Додаток 18") - simplest to reproduce
  // as an ordinary paragraph indented from the left by (content width - box width), rather than a
  // table: text still wraps within the box's own width and stays left-aligned inside it. A block
  // that omits widthMm (e.g. a title centered via alignedBox) falls back to the full content width
  // rather than collapsing to a 0-width box, which forced every word onto its own line.
  const layoutV2AlignedBox = (block, contentWidthTwips) => {
    const boxWidthTwips = block.widthMm ? Math.round(block.widthMm * MM_TO_TWIP) : contentWidthTwips;
    const pushTwips = block.horizontalAlign === 'right' ? Math.max(0, contentWidthTwips - boxWidthTwips) : 0;
    const lines = block.lines || [];
    return lines.map((line, index) => new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: pushTwips ? { left: pushTwips } : undefined,
      spacing: {
        before: index === 0 ? marginBeforeTwips(block) : 0,
        after: index === lines.length - 1 ? marginAfterTwips(block) : 0,
        line: lineTwipsFor(block.style),
        lineRule: 'auto',
      },
      children: [layoutV2TextRun(line, block.style)],
    }));
  };

  const layoutV2Paragraph = block => new Paragraph({
    alignment: layoutV2Alignment(block.style?.align),
    spacing: {
      before: marginBeforeTwips(block), after: marginAfterTwips(block), line: lineTwipsFor(block.style), lineRule: 'auto',
    },
    children: [layoutV2TextRun(block.text || '', block.style)],
  });

  const layoutV2RichParagraph = block => new Paragraph({
    alignment: layoutV2Alignment(block.style?.align),
    spacing: {
      before: marginBeforeTwips(block), after: marginAfterTwips(block), line: lineTwipsFor(block.style), lineRule: 'auto',
    },
    children: (block.runs || []).map(run => layoutV2TextRun(run.text, run.style)),
  });

  // The key element for matching the Word sample (spec §5.5): label + value cells in one borderless
  // row, the value cell's own bottom border drawing the fill-to-margin line the value sits on -
  // never a second underline mechanism (textDecoration) on the value style itself (spec batch
  // 2026-07-25, pre-delivery review §3). The caption is a second row so it can center under the
  // value column alone, matching `.field-caption { margin-left: var(--label-width) }`.
  const layoutV2FieldLine = (block, contentWidthTwips) => {
    const labelTwips = Math.max(1, Math.round((block.labelWidthMm || 0) * MM_TO_TWIP));
    const valueTwips = Math.max(1, contentWidthTwips - labelTwips);
    const lineSize = eighthsFromPt(block.line?.widthPt);
    const lineColor = (block.line?.color || '#000000').replace('#', '');
    const lineBorder = lineSize ? { style: BorderStyle.SINGLE, size: lineSize, color: lineColor } : noBorder;
    const labelParagraph = new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 0, line: lineTwipsFor(block.labelStyle), lineRule: 'auto' },
      children: block.labelRuns
        ? block.labelRuns.map(run => layoutV2TextRun(run.text, run.style))
        : [layoutV2TextRun(block.label || '', block.labelStyle)],
    });
    const valueParagraph = new Paragraph({
      alignment: layoutV2Alignment(block.valueStyle?.align),
      spacing: { after: 0, line: lineTwipsFor(block.valueStyle), lineRule: 'auto' },
      children: [layoutV2TextRun(block.value || '', block.valueStyle)],
    });
    const rows = [new TableRow({
      children: [
        new TableCell({ borders: noBorders, width: { size: labelTwips, type: WidthType.DXA }, children: block.labelWidthMm ? [labelParagraph] : [new Paragraph({ children: [] })] }),
        new TableCell({ borders: { ...noBorders, bottom: lineBorder }, width: { size: valueTwips, type: WidthType.DXA }, children: [valueParagraph] }),
      ],
    })];
    if (block.caption !== undefined) {
      const captionParagraph = new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 0, line: lineTwipsFor(block.captionStyle), lineRule: 'auto' },
        children: [layoutV2TextRun(block.caption, block.captionStyle)],
      });
      rows.push(new TableRow({
        children: [
          new TableCell({ borders: noBorders, width: { size: labelTwips, type: WidthType.DXA }, children: [new Paragraph({ children: [] })] }),
          new TableCell({ borders: noBorders, width: { size: valueTwips, type: WidthType.DXA }, children: [captionParagraph] }),
        ],
      }));
    }
    return new Table({
      width: { size: labelTwips + valueTwips, type: WidthType.DXA },
      columnWidths: [labelTwips, valueTwips],
      borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
      rows,
    });
  };

  const layoutV2SignatureTable = block => {
    const colTwips = (block.columnWidthsMm || []).map(width => Math.round(width * MM_TO_TWIP));
    const rows = (block.rows || []).map(row => {
      if (row?.type === 'spacerRow') {
        const heightTwips = Math.round((row.heightMm || 0) * MM_TO_TWIP);
        return new TableRow({
          children: colTwips.map(width => new TableCell({
            borders: noBorders,
            width: { size: width, type: WidthType.DXA },
            children: [new Paragraph({ spacing: { before: heightTwips, after: 0 }, children: [] })],
          })),
        });
      }
      return new TableRow({
        children: (row || []).map((cell, index) => new TableCell({
          borders: {
            ...noBorders,
            bottom: cell?.bottomBorder
              ? { style: BorderStyle.SINGLE, size: eighthsFromPt(cell.bottomBorder.widthPt), color: (cell.bottomBorder.color || '#000000').replace('#', '') }
              : noBorder,
          },
          width: { size: colTwips[index] || 0, type: WidthType.DXA },
          children: [new Paragraph({
            alignment: layoutV2Alignment(cell?.style?.align),
            spacing: { after: 0, line: lineTwipsFor(cell?.style), lineRule: 'auto' },
            children: [layoutV2TextRun(cell?.text || '', cell?.style)],
          })],
        })),
      });
    });
    return new Table({
      width: { size: colTwips.reduce((sum, w) => sum + w, 0), type: WidthType.DXA },
      columnWidths: colTwips,
      borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
      rows,
    });
  };

  const layoutV2BlockChildren = (block, contentWidthTwips, clinicLogos) => {
    switch (block.type) {
      case 'letterhead': return [layoutV2Letterhead(block, clinicLogos)];
      case 'alignedBox': return layoutV2AlignedBox(block, contentWidthTwips);
      case 'paragraph': return [layoutV2Paragraph(block)];
      case 'richParagraph': return [layoutV2RichParagraph(block)];
      case 'fieldLine': return [layoutV2FieldLine(block, contentWidthTwips)];
      case 'spacer': return [new Paragraph({ spacing: { before: Math.round((block.heightMm || 0) * MM_TO_TWIP), after: 0 }, children: [] })];
      case 'signatureTable': return [layoutV2SignatureTable(block)];
      default: return [];
    }
  };

  const DEFAULT_LAYOUT_V2_MARGINS_MM = {
    top: 5, right: 15, bottom: 10, left: 15,
  };

  const buildLayoutV2Children = doc => {
    const page = doc.layoutV2.page || {};
    const margins = page.marginsMm || DEFAULT_LAYOUT_V2_MARGINS_MM;
    const widthTwips = Math.round((page.widthMm || 210) * MM_TO_TWIP);
    const contentWidthTwips = widthTwips - Math.round(margins.left * MM_TO_TWIP) - Math.round(margins.right * MM_TO_TWIP);
    return doc.layoutV2.blocks.flatMap(block => layoutV2BlockChildren(block, contentWidthTwips, effectiveClinicLogos));
  };

  const layoutV2PageSetup = doc => {
    const page = doc.layoutV2.page || {};
    const margins = page.marginsMm || DEFAULT_LAYOUT_V2_MARGINS_MM;
    return {
      page: {
        size: { width: Math.round((page.widthMm || 210) * MM_TO_TWIP), height: Math.round((page.heightMm || 297) * MM_TO_TWIP) },
        margin: {
          top: Math.round(margins.top * MM_TO_TWIP),
          right: Math.round(margins.right * MM_TO_TWIP),
          bottom: Math.round(margins.bottom * MM_TO_TWIP),
          left: Math.round(margins.left * MM_TO_TWIP),
        },
      },
    };
  };

  // An official-form document's letterhead logo lives in the page Header (batch 22 §1) instead of
  // the one-off body block every branded document uses - Word repeats a Header on every page of
  // its section automatically and reflows the body to start after it, so (unlike the PDF renderer)
  // no manual space reservation is needed here. `formatting.headerText` still applies to every
  // document the same way it always did, stacked below the logo when both are present.
  const buildHeader = doc => {
    const children = [];
    if (isOfficialFormStyle(doc) && doc.logo) {
      const variant = getClinicLogo(effectiveClinicLogos, doc.logo);
      const decoded = variant?.dataUrl ? decodeLogoDataUrl(variant.dataUrl) : null;
      if (decoded) {
        const ratio = variant.width && variant.height ? variant.height / variant.width : 0.28;
        const widthPx = Math.round(formatting.logoWidthMm * MM_TO_PX);
        children.push(new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 80 },
          children: [logoImageRun(decoded, widthPx, ratio)],
        }));
      }
    }
    if (formatting.headerText) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: formatting.headerText, size: smallSize })],
      }));
    }
    return children.length ? { default: new Header({ children }) } : undefined;
  };

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
    sections: documents.map(generated => (generated.layoutV2 ? {
      // A layoutV2 document is fully self-describing (its own page/margins/styles, spec §8) - no
      // shared header/footer, no bilingual/column layout.
      properties: layoutV2PageSetup(generated),
      children: buildLayoutV2Children(generated),
    } : {
      properties: pageSetup,
      headers: buildHeader(generated),
      footers: buildFooter(generated),
      children: buildDocChildren(generated),
    })),
  });

  return Packer.toBlob(doc);
};
