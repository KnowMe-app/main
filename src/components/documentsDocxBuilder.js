// Word (.docx) renderer for the Documents page, mirroring DocumentsPdfDocument: same formatting
// settings (Times New Roman, justified, tunable sizes/margins/spacing/header/footer), same
// one-column / two-column layouts. A clinic logo is never added automatically - it only appears
// where the template itself places one, via the dedicated `logo` field (or, for older templates,
// a leading {{logo}}/{{logo-long}} paragraph): {{logo}} is compact, once per visible language
// column; {{logo-long}} is one shared full-width logo. Either way it renders once, before the
// title; see getTemplateLogoType/getClinicLogo in documentsCatalogUtils. The `docx` package is
// imported dynamically by the caller-facing builder so the library only loads when a Word export
// is actually requested.
import { DEFAULT_DOC_FORMATTING, allowsParagraphInternalBreak, getClinicLogo, isSectionHeading } from './documentsCatalogUtils';

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

  const isTwoColumn = layout === 'two-column';
  const showUk = layout !== 'one-column-en';
  const showEn = layout !== 'one-column-uk';
  const lang = layout === 'one-column-en' ? 'en' : 'uk';
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

  const contentWidthTwips = 11906
    - Math.round(formatting.marginLeftCm * CM_TO_TWIP)
    - Math.round(formatting.marginRightCm * CM_TO_TWIP);

  const bodyParagraph = (text, { keepLines = true } = {}) => new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: afterTwips, line: lineTwips, lineRule: 'auto' },
    indent: firstLineTwips ? { firstLine: firstLineTwips } : undefined,
    keepLines,
    children: [new TextRun({ text, size: bodySize })],
  });

  // Short numbered section titles ("1. Предмет Договору") render bold, flush left, with extra
  // room above and kept with the paragraph that follows so a heading never ends a page alone.
  const headingParagraph = text => new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: afterTwips, after: afterTwips, line: lineTwips, lineRule: 'auto' },
    keepLines: true,
    keepNext: true,
    children: [new TextRun({ text, bold: true, size: bodySize })],
  });

  const cellParagraph = (text, allowPageBreaks, paragraph) => (isSectionHeading(text)
    ? headingParagraph(text)
    : bodyParagraph(text, { keepLines: !allowsParagraphInternalBreak(paragraph, allowPageBreaks) }));

  // Exactly the Format panel's paragraph spacing - no hidden minimum - so the Word output keeps
  // the same title-to-body rhythm as the PDF and the reference statements.
  const titleParagraph = text => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: afterTwips, line: lineTwips, lineRule: 'auto' },
    children: [new TextRun({ text, bold: true, size: titleSize })],
  });

  const twoColumnCellFromParagraph = (paragraph, marginSide) => new TableCell({
    borders: noBorders,
    width: { size: 50, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.TOP,
    margins: {
      top: 0,
      bottom: 0,
      left: marginSide === 'right' ? Math.round(gapTwips / 2) : 0,
      right: marginSide === 'left' ? Math.round(gapTwips / 2) : 0,
    },
    children: [paragraph],
  });

  const twoColumnTable = (rows, cantSplit) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: rows.map(([left, right]) => new TableRow({
      cantSplit,
      children: [
        twoColumnCellFromParagraph(left, 'left'),
        twoColumnCellFromParagraph(right, 'right'),
      ],
    })),
  });

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
  const buildLogoBlock = paragraphType => {
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

    const compactWidthPx = Math.round(formatting.logoWidthMm * MM_TO_PX);
    if (isTwoColumn && showUk && showEn) {
      return [twoColumnTable([[
        logoParagraph(decoded, compactWidthPx, ratio),
        logoParagraph(decoded, compactWidthPx, ratio),
      ]], true)];
    }
    return [logoParagraph(decoded, compactWidthPx, ratio)];
  };

  const buildDocChildren = doc => {
    const children = [];

    // The template's letterhead logo (doc.logo) always renders before the title, whether it came
    // from the dedicated `logo` field or a legacy leading paragraph - see getTemplateLogoType.
    if (doc.logo) children.push(...buildLogoBlock(doc.logo));

    if (isTwoColumn) {
      children.push(twoColumnTable([[titleParagraph(doc.title.uk), titleParagraph(doc.title.en)]], true));
    } else {
      children.push(titleParagraph(doc.title[lang]));
    }

    doc.paragraphs.forEach(paragraph => {
      // Already drawn as doc.logo above - a legacy leading logo paragraph must not also render a
      // second time in its old body position.
      if (paragraph.type === 'logo-consumed') return;
      if (paragraph.type !== 'text') {
        children.push(...buildLogoBlock(paragraph.type));
        return;
      }
      if (isTwoColumn) {
        const cantSplit = !allowsParagraphInternalBreak(paragraph, doc.allowPageBreaks);
        children.push(twoColumnTable([[
          cellParagraph(paragraph.uk, doc.allowPageBreaks, paragraph),
          cellParagraph(paragraph.en, doc.allowPageBreaks, paragraph),
        ]], cantSplit));
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
