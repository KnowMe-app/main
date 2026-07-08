// Shared visual language for every @react-pdf/renderer export in the app (BudgetPdfDocument,
// InvoicePdfDocument, and the surrogate/donor ProfilePdfDocument in smallCard/renderTopBlock.js).
// Each document keeps its own StyleSheet and layout, but pulls its palette, type scale and the
// header/footer/watermark building blocks from here so the three read as one product.

export const PDF_COLOR = {
  ink: '#2b2118',
  muted: '#786a5c',
  soft: '#9a6b48',
  accent: '#8a5527',
  accentStrong: '#6b3f18',
  line: '#e6d7c0',
  lineSoft: '#efe3d1',
  headBg: '#f3e6d1',
  rowAlt: '#faf3e6',
  cardBg: '#fdf8ef',
  totalBg: '#ead9b8',
  watermark: '#f1e2c6',
  white: '#ffffff',
};

export const PDF_FONT = {
  base: 'Helvetica',
  bold: 'Helvetica-Bold',
};

// The built-in Helvetica font only covers WinAnsi glyphs, so every document should run its text
// through this before rendering (swaps the handful of characters that would otherwise be blank).
export const sanitizePdfText = value => String(value ?? '')
  .replace(/№/g, 'No.')
  .replace(/[’‘]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/[✓✔]/g, 'x')
  .replace(/\s+/g, ' ')
  .trim();

// Common building blocks every document's own StyleSheet.create(...) can spread in.
export const pdfBaseStyles = {
  page: {
    paddingTop: 44,
    paddingBottom: 62,
    paddingHorizontal: 44,
    fontFamily: PDF_FONT.base,
    fontSize: 10,
    color: PDF_COLOR.ink,
    backgroundColor: PDF_COLOR.white,
  },
  eyebrow: {
    fontFamily: PDF_FONT.bold,
    fontSize: 7.5,
    letterSpacing: 1.8,
    color: PDF_COLOR.soft,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  docTitle: {
    fontFamily: PDF_FONT.bold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: PDF_COLOR.ink,
  },
  footer: {
    position: 'absolute',
    left: 44,
    right: 44,
    bottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.line,
    borderTopStyle: 'solid',
    paddingTop: 8,
  },
  footerColumn: {
    maxWidth: 260,
  },
  footerText: {
    fontSize: 7.5,
    color: PDF_COLOR.muted,
    lineHeight: 1.4,
  },
  footerPage: {
    fontSize: 7.5,
    color: PDF_COLOR.muted,
  },
  watermarkText: {
    position: 'absolute',
    fontFamily: PDF_FONT.bold,
    color: PDF_COLOR.watermark,
    opacity: 0.9,
  },
};
