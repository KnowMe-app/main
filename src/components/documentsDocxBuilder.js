// Word (.docx) renderer for the Documents page, mirroring DocumentsPdfDocument: same formatting
// settings (Times New Roman, justified, tunable sizes/margins/spacing/header/footer), same
// one-column / two-column layouts, same optional clinic logo above the title. The `docx` package
// is imported dynamically by the caller-facing builder so the library only loads when a Word
// export is actually requested.
import { DEFAULT_DOC_FORMATTING } from './documentsCatalogUtils';

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
  logo = null,
}) => {
  const docx = await import('docx');
  const {
    AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageNumber,
    Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
  } = docx;

  const isTwoColumn = layout === 'two-column';
  const lang = layout === 'one-column-en' ? 'en' : 'uk';
  const bodySize = halfPoints(formatting.fontSize);
  const titleSize = halfPoints(formatting.titleFontSize);
  const smallSize = halfPoints(Math.max(7, formatting.fontSize - 2));
  const lineTwips = Math.round(formatting.lineSpacing * 240);
  const afterTwips = Math.round(formatting.paragraphSpacing * 20);
  const firstLineTwips = Math.round(formatting.firstLineIndentCm * CM_TO_TWIP);
  const gapTwips = Math.round(formatting.columnGapCm * CM_TO_TWIP);

  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  const paragraphSpacing = { after: afterTwips, line: lineTwips, lineRule: 'auto' };

  const bodyParagraph = text => new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: paragraphSpacing,
    indent: firstLineTwips ? { firstLine: firstLineTwips } : undefined,
    children: [new TextRun({ text, size: bodySize })],
  });

  const titleParagraph = text => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: Math.max(afterTwips, 120), line: lineTwips, lineRule: 'auto' },
    children: [new TextRun({ text, bold: true, size: titleSize })],
  });

  const twoColumnCell = (text, paragraphBuilder, marginSide) => new TableCell({
    borders: noBorders,
    width: { size: 50, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.TOP,
    margins: {
      top: 0,
      bottom: 0,
      left: marginSide === 'right' ? Math.round(gapTwips / 2) : 0,
      right: marginSide === 'left' ? Math.round(gapTwips / 2) : 0,
    },
    children: [paragraphBuilder(text)],
  });

  const twoColumnRow = (uk, en, paragraphBuilder) => new TableRow({
    children: [
      twoColumnCell(uk, paragraphBuilder, 'left'),
      twoColumnCell(en, paragraphBuilder, 'right'),
    ],
  });

  const buildDocChildren = doc => {
    const children = [];

    if (formatting.showLogo && logo?.dataUrl) {
      const decoded = decodeLogoDataUrl(logo.dataUrl);
      if (decoded) {
        const widthPx = Math.round(formatting.logoWidthMm * MM_TO_PX);
        const ratio = logo.width && logo.height ? logo.height / logo.width : 0.25;
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
          children: [new ImageRun({
            data: decoded.bytes,
            type: decoded.type,
            transformation: { width: widthPx, height: Math.round(widthPx * ratio) },
          })],
        }));
      }
    }

    if (isTwoColumn) {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
        rows: [
          twoColumnRow(doc.title.uk, doc.title.en, titleParagraph),
          ...doc.paragraphs.map(paragraph => twoColumnRow(paragraph.uk, paragraph.en, bodyParagraph)),
        ],
      }));
    } else {
      children.push(titleParagraph(doc.title[lang]));
      doc.paragraphs.forEach(paragraph => children.push(bodyParagraph(paragraph[lang])));
    }
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

  const footerChildren = [];
  if (formatting.footerText || formatting.showPageNumbers) {
    const runs = [];
    if (formatting.footerText) runs.push(new TextRun({ text: formatting.footerText, size: smallSize }));
    if (formatting.showPageNumbers) {
      if (formatting.footerText) runs.push(new TextRun({ text: '   ', size: smallSize }));
      runs.push(new TextRun({ children: [PageNumber.CURRENT], size: smallSize }));
    }
    footerChildren.push(new Paragraph({
      alignment: formatting.footerText ? AlignmentType.LEFT : AlignmentType.CENTER,
      children: runs,
    }));
  }
  const footers = footerChildren.length ? { default: new Footer({ children: footerChildren }) } : undefined;

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
    },
  };

  // One section per document so every statement starts on a fresh page with its own header/footer.
  const doc = new Document({
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
      footers,
      children: buildDocChildren(generated),
    })),
  });

  return Packer.toBlob(doc);
};
