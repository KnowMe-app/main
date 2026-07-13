// Shared visual language for every UKRCOM @react-pdf/renderer export (BudgetPdfDocument,
// InvoicePdfDocument, ExpectedExpensesPdfDocument). Each document keeps its own StyleSheet and
// content layout, but pulls its palette, type scale, embedded fonts, and the brand-row / brand-rule
// / bronze-motif / title-block / footer building blocks from here so every document reads as one
// product. Tokens below mirror the UKRCOM Invoice Builder design spec (ukrcom-invoice-fullset.html).
import React from 'react';
import { Font, StyleSheet, Svg, Defs, LinearGradient, Stop, Line, Text, View } from '@react-pdf/renderer';
import designTokens from '../data/designTokens.json';

// Colors and font families are never hardcoded here - they live in src/data/designTokens.json,
// the single shared source of truth for the UKRCOM document system's visual language (see that
// file's header comment). `renderTopBlock.js` (surrogate/donor ProfilePdfDocument) depends on the
// original key names below (ink/muted/soft/accent/accentStrong/line/lineSoft/headBg/rowAlt/cardBg/
// totalBg/watermark/white) and on PDF_FONT.base/bold — those keys are kept as-is in the token file
// so that file keeps rendering unchanged. The Budget/Invoice/Payment-Details/Expected-Expenses
// documents use the separately-named spec tokens (paper/card/docLine/docInk/... below) from the
// same file instead.
export const PDF_COLOR = designTokens.color;

export const PDF_FONT = designTokens.font;

let fontsRegistered = false;

// This app is hosted under a sub-path (see "homepage" in package.json), so asset URLs must go
// through PUBLIC_URL the same way public/index.html references %PUBLIC_URL% - a bare "/fonts/..."
// would 404 once deployed.
const fontUrl = file => `${process.env.PUBLIC_URL || ''}/fonts/${file}`;

// The built-in @react-pdf renderer needs every custom font registered once, up front, before any
// <Document> using it is rendered. Registration fetches the .ttf files bundled under public/fonts
// so the PDF embeds real Fraunces/Inter glyphs instead of falling back to a system font.
export const ensurePdfFontsRegistered = () => {
  if (fontsRegistered) return;
  fontsRegistered = true;
  Font.register({
    family: PDF_FONT.display,
    fonts: [
      { src: fontUrl('Fraunces-Regular.ttf'), fontWeight: 400 },
      { src: fontUrl('Fraunces-Medium.ttf'), fontWeight: 500 },
      { src: fontUrl('Fraunces-SemiBold.ttf'), fontWeight: 600 },
      { src: fontUrl('Fraunces-Bold.ttf'), fontWeight: 700 },
    ],
  });
  Font.register({
    family: PDF_FONT.body,
    fonts: [
      { src: fontUrl('Inter-Regular.ttf'), fontWeight: 400 },
      { src: fontUrl('Inter-Medium.ttf'), fontWeight: 500 },
      { src: fontUrl('Inter-SemiBold.ttf'), fontWeight: 600 },
      { src: fontUrl('Inter-Bold.ttf'), fontWeight: 700 },
    ],
  });
  // Neither typeface ships hyphenation-safe defaults for long catalog/service names; disable
  // @react-pdf's automatic word hyphenation so labels wrap on spaces instead of mid-word.
  Font.registerHyphenationCallback(word => [word]);
};

// The built-in fonts only cover a limited glyph set, so every document should run its text
// through this before rendering (swaps the handful of characters that would otherwise be blank).
export const sanitizePdfText = value => String(value ?? '')
  .replace(/№/g, 'No.')
  .replace(/[’‘]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/[✓✔]/g, 'x')
  .replace(/\s+/g, ' ')
  .trim();

// --- Agency identity (backend-driven) ------------------------------------------------------
//
// Every branded document shows the same agency identity (wordmark + tagline in the brand row,
// name/address/contacts in the footer). The values are data, not layout: they live on the backend
// at budget/technical/agency and are pushed into this module (setPdfAgencyConfig) by whichever
// page loads that config - Budget, Invoice Builder, or the SM profile export. The constants below
// are only the offline fallback for when the backend record hasn't loaded (or lacks a field), so
// a document is never rendered with a blank identity.
const DEFAULT_AGENCY = {
  name: 'Reproductive Agency "UKRCOM"',
  name2: 'UKRCOM Reproductive Agency, Kyiv',
  address: '31/16 Reitarska Str., 1st floor, Kyiv, 01034, Ukraine',
  website: 'http://ukrcom.kyiv.ua/',
  email: 'sm.kiev.ukr@gmail.com',
  telegram: '@Contact_Us_Kyiv',
};

// The backend may store telegram as a full link (https://t.me/Contact_Us_Kyiv) - documents always
// display the compact @handle form.
const toTelegramHandle = value => {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = /t(?:elegram)?\.me\/([^/?#\s]+)/i.exec(text);
  const handle = match ? match[1] : text;
  return handle.startsWith('@') ? handle : `@${handle}`;
};

let pdfAgency = { ...DEFAULT_AGENCY };

export const setPdfAgencyConfig = raw => {
  const source = raw && typeof raw === 'object' ? raw : {};
  pdfAgency = Object.keys(DEFAULT_AGENCY).reduce((merged, key) => {
    const value = String(source[key] ?? '').trim();
    return { ...merged, [key]: value || DEFAULT_AGENCY[key] };
  }, {});
  pdfAgency.telegram = toTelegramHandle(pdfAgency.telegram);
};

export const getPdfAgencyConfig = () => pdfAgency;

// The full name/line ("UKRCOM Reproductive Agency, Kyiv") splits into the big wordmark (its first
// word) and the tagline underneath it - the brand row never hardcodes either.
const splitAgencyWordmark = () => {
  const [wordmark, ...rest] = String(getPdfAgencyConfig().name2 || '').trim().split(/\s+/);
  return {
    wordmark: wordmark || DEFAULT_AGENCY.name2.split(' ')[0],
    tagline: rest.join(' '),
  };
};

// The one date format every document displays to a client (spec §4): "9 July 2026" - never
// DD.MM.YYYY or DD/MM/YYYY. (The invoice number and the payment-purpose placeholder are a
// separate concern - they intentionally keep their own numeric formats, since those are
// identifiers/legal text, not a human-readable "as of" date.)
export const formatDisplayDate = date => {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return safeDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const PAGE_MARGIN = 56;
const MOTIF_INSET = 30;

// Common building blocks every redesigned document's own StyleSheet.create(...) can spread in.
// `eyebrow` is the one key here that predates this redesign and is still spread as-is by
// renderTopBlock.js's ProfilePdfDocument — its shape is kept byte-for-byte; the new eyebrow used
// by TitleBlock below lives under `docEyebrow` instead so the two never collide.
export const pdfBaseStyles = {
  eyebrow: {
    fontFamily: PDF_FONT.bold,
    fontSize: 7.5,
    letterSpacing: 1.8,
    color: PDF_COLOR.soft,
    textTransform: 'uppercase',
    marginBottom: 5,
  },

  page: {
    paddingTop: 48,
    paddingBottom: 68,
    paddingLeft: PAGE_MARGIN,
    paddingRight: PAGE_MARGIN,
    fontFamily: PDF_FONT.body,
    fontSize: 9.5,
    color: PDF_COLOR.docInk,
    backgroundColor: PDF_COLOR.paper,
  },
  docSeries: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 7.5,
    letterSpacing: 1.4,
    color: PDF_COLOR.footerSoft,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  wordmark: {
    fontFamily: PDF_FONT.display,
    fontWeight: 600,
    fontSize: 17,
    letterSpacing: 0.4,
    color: PDF_COLOR.docInk,
  },
  wordmarkTagline: {
    fontFamily: PDF_FONT.body,
    fontSize: 8,
    color: PDF_COLOR.inkSoft,
    marginTop: 2,
  },
  brandMeta: {
    alignItems: 'flex-end',
  },
  brandMetaText: {
    fontFamily: PDF_FONT.body,
    fontSize: 8,
    color: PDF_COLOR.inkSoft,
    textAlign: 'right',
    lineHeight: 1.5,
  },
  docEyebrow: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8,
    letterSpacing: 1.6,
    color: PDF_COLOR.bronze,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  docTitle: {
    fontFamily: PDF_FONT.display,
    fontWeight: 600,
    fontSize: 25,
    letterSpacing: -0.3,
    color: PDF_COLOR.docInk,
  },
  docSubtitle: {
    fontFamily: PDF_FONT.body,
    fontSize: 10,
    lineHeight: 1.5,
    color: PDF_COLOR.inkSoft,
    marginTop: 8,
    maxWidth: 460,
  },
  titleBlock: {
    marginBottom: 24,
  },
  preparedFor: {
    // No italic here: only Regular/Medium/SemiBold/Bold are embedded for Inter (see
    // ensurePdfFontsRegistered) - react-pdf can't fake-italicize a custom font without a matching
    // italic source file, so emphasis comes from color/weight/tracking instead.
    fontFamily: PDF_FONT.body,
    fontWeight: 500,
    letterSpacing: 0.2,
    fontSize: 9,
    color: PDF_COLOR.bronzeDeep,
    marginTop: 2,
    marginBottom: 3,
  },
  coordinatorLine: {
    fontFamily: PDF_FONT.body,
    fontSize: 9,
    color: PDF_COLOR.inkSoft,
    marginBottom: 24,
  },
  summaryCard: {
    backgroundColor: PDF_COLOR.card,
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 22,
  },
  summaryCardLabel: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: PDF_COLOR.bronzeDeep,
    marginBottom: 6,
  },
  summaryCardText: {
    fontFamily: PDF_FONT.body,
    fontSize: 9.5,
    lineHeight: 1.6,
    color: PDF_COLOR.docInk,
  },
  sectionTitle: {
    fontFamily: PDF_FONT.display,
    fontWeight: 600,
    fontSize: 13.5,
    letterSpacing: -0.1,
    color: PDF_COLOR.docInk,
    marginBottom: 4,
  },
  sectionNote: {
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    color: PDF_COLOR.inkSoft,
    marginBottom: 10,
  },
  totalCard: {
    backgroundColor: PDF_COLOR.totalCardBg,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginTop: 18,
  },
  totalCardLabel: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 7.5,
    letterSpacing: 1.4,
    color: PDF_COLOR.footerSoft,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  totalCardAmount: {
    fontFamily: PDF_FONT.display,
    fontWeight: 600,
    fontSize: 30,
    color: PDF_COLOR.totalCardAmount,
  },
  totalCardRule: {
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.bronze,
    borderTopStyle: 'solid',
    opacity: 0.5,
    marginTop: 12,
    marginBottom: 10,
  },
  totalCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  totalCardRowLabel: {
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    color: '#C9BC9E',
  },
  totalCardRowValue: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8.5,
    color: PDF_COLOR.card,
  },
  footer: {
    position: 'absolute',
    left: PAGE_MARGIN,
    right: PAGE_MARGIN,
    bottom: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.docLine,
    borderTopStyle: 'solid',
    paddingTop: 9,
  },
  footerColumn: {
    maxWidth: 280,
  },
  footerText: {
    fontFamily: PDF_FONT.body,
    fontSize: 7,
    color: PDF_COLOR.footerSoft,
    lineHeight: 1.5,
  },
  footerPage: {
    fontFamily: PDF_FONT.body,
    fontSize: 7,
    color: PDF_COLOR.footerSoft,
  },
  continuedTag: {
    position: 'absolute',
    top: 26,
    left: PAGE_MARGIN,
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 7.5,
    letterSpacing: 1.2,
    color: PDF_COLOR.footerSoft,
    textTransform: 'uppercase',
  },
};

export const pdfSharedStyles = StyleSheet.create(pdfBaseStyles);

// `Document {n} of {total} · {Document Type Name}` per spec §1.7. `total` is omitted for
// standalone/optional documents (Expected Expenses is never numbered into the main series).
export const DocSeries = ({ index, total, label, optional = false }) => (
  <Text style={pdfSharedStyles.docSeries}>
    {sanitizePdfText(optional
      ? `Optional document · ${label}`
      : `Document ${index} of ${total} · ${label}`)}
  </Text>
);

// wordmark + tagline on the left, document meta (number/date/client) on the right. Both come from
// the backend agency config (name2), never a per-document hardcoded string.
export const BrandRow = ({ metaLines = [] }) => {
  const { wordmark, tagline } = splitAgencyWordmark();
  return (
    <View style={pdfSharedStyles.brandRow}>
      <View>
        <Text style={pdfSharedStyles.wordmark}>{sanitizePdfText(wordmark)}</Text>
        {tagline ? <Text style={pdfSharedStyles.wordmarkTagline}>{sanitizePdfText(tagline)}</Text> : null}
      </View>
      <View style={pdfSharedStyles.brandMeta}>
        {metaLines.filter(Boolean).map((line, index) => (
          <Text key={`meta-${index}`} style={pdfSharedStyles.brandMetaText}>{sanitizePdfText(line)}</Text>
        ))}
      </View>
    </View>
  );
};

const ruleStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: PDF_COLOR.docLine,
  },
  diamond: {
    width: 5,
    height: 5,
    backgroundColor: PDF_COLOR.bronze,
    transform: 'rotate(45deg)',
    marginHorizontal: 8,
  },
});

// Thin rule with a bronze diamond marker — the required brand motif under the wordmark
// on every branded document (all types except Payment Instructions, per spec §1.1/§1.5).
export const BrandRule = () => (
  <View style={ruleStyles.wrap}>
    <View style={ruleStyles.line} />
    <View style={ruleStyles.diamond} />
    <View style={ruleStyles.line} />
  </View>
);

// Thin bronze vertical line along the inner page margin, fading out top and bottom,
// rendered once per page as the required brand motif (spec §1.1). Implemented as an
// SVG line with a gradient stroke since @react-pdf has no CSS gradient support.
const A4_HEIGHT_PT = 842;

export const BronzeMotif = () => (
  <Svg
    style={{ position: 'absolute', top: 0, left: MOTIF_INSET, width: 1, height: A4_HEIGHT_PT }}
    viewBox={`0 0 1 ${A4_HEIGHT_PT}`}
    preserveAspectRatio="none"
    fixed
    wrap={false}
  >
    <Defs>
      <LinearGradient id="bronzeFade" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={PDF_COLOR.bronze} stopOpacity={0} />
        <Stop offset="0.12" stopColor={PDF_COLOR.bronze} stopOpacity={0.55} />
        <Stop offset="0.88" stopColor={PDF_COLOR.bronze} stopOpacity={0.55} />
        <Stop offset="1" stopColor={PDF_COLOR.bronze} stopOpacity={0} />
      </LinearGradient>
    </Defs>
    <Line x1="0" y1="0" x2="0" y2={A4_HEIGHT_PT} stroke="url(#bronzeFade)" strokeWidth={1} />
  </Svg>
);

// eyebrow -> H1 -> subrow with the key sum/context. Always left-aligned, never centered.
// `style` lets a space-constrained document (the one-page Invoice) tighten the trailing margin.
export const TitleBlock = ({ eyebrow, title, subtitle, style }) => (
  <View style={style ? [pdfSharedStyles.titleBlock, style] : pdfSharedStyles.titleBlock}>
    {eyebrow ? <Text style={pdfSharedStyles.docEyebrow}>{sanitizePdfText(eyebrow)}</Text> : null}
    <Text style={pdfSharedStyles.docTitle}>{sanitizePdfText(title)}</Text>
    {subtitle ? <Text style={pdfSharedStyles.docSubtitle}>{sanitizePdfText(subtitle)}</Text> : null}
  </View>
);

const COORDINATOR_NAME = 'Irina Koval';
const COORDINATOR_TITLE = 'Co-Founder, UKRCOM';

// "Your programme coordinator — {name}, {title}" - the one signature line every document with a
// coordinator's voice in it uses (spec: never a different formulation like "Reviewed by...").
// Exported standalone (not just via PreparedForBlock below) so a document can sign a piece of
// coordinator-written text - e.g. a summary-card - without repeating "Prepared exclusively for...".
export const CoordinatorLine = () => (
  <Text style={pdfSharedStyles.coordinatorLine}>
    {'Your programme coordinator — '}
    <Text style={{ fontWeight: 600, color: PDF_COLOR.docInk }}>{sanitizePdfText(COORDINATOR_NAME)}</Text>
    {sanitizePdfText(`, ${COORDINATOR_TITLE}`)}
  </Text>
);

// "Prepared exclusively for {client}" + the coordinator line - the two lines every case-specific
// document (Invoice, Payment Details, Expected Expenses) shows under its title block, right above
// any programme summary (spec §1.2/§4). Never shown on the catalog-wide Program Budget document,
// which has no client to prepare it for.
export const PreparedForBlock = ({ clientName }) => (
  <>
    {clientName ? <Text style={pdfSharedStyles.preparedFor}>{sanitizePdfText(`Prepared exclusively for ${clientName}`)}</Text> : null}
    <CoordinatorLine />
  </>
);

// The highlighted "what this programme includes" card (spec §1.2's "program-summary").
export const SummaryCard = ({ label, text }) => (text ? (
  <View style={pdfSharedStyles.summaryCard} wrap={false}>
    {label ? <Text style={pdfSharedStyles.summaryCardLabel}>{sanitizePdfText(label)}</Text> : null}
    <Text style={pdfSharedStyles.summaryCardText}>{sanitizePdfText(text)}</Text>
  </View>
) : null);

// Identical agency footer on every page of every branded document (spec §1.2). `variant="neutral"`
// drops the UKRCOM agency block entirely - required on the Payment Details page/document, whose
// beneficiary (a sole proprietorship) is a legally separate party from the agency (spec §1.5).
// The identity lines themselves come from the backend agency config (see setPdfAgencyConfig above).
export const Footer = ({ variant = 'branded' } = {}) => {
  const agency = getPdfAgencyConfig();
  const contactLine = [agency.website, agency.email, agency.telegram].filter(Boolean).join(' · ');
  return (
    <View style={pdfSharedStyles.footer} fixed>
      {variant === 'neutral' ? <View style={pdfSharedStyles.footerColumn} /> : (
        <View style={pdfSharedStyles.footerColumn}>
          <Text style={pdfSharedStyles.footerText}>{sanitizePdfText(agency.name)}</Text>
          <Text style={pdfSharedStyles.footerText}>{sanitizePdfText(agency.address)}</Text>
          <Text style={pdfSharedStyles.footerText}>{sanitizePdfText(contactLine)}</Text>
        </View>
      )}
      <Text
        style={pdfSharedStyles.footerPage}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
};

// Short colophon shown at the top of overflow pages instead of repeating brand-row/title-block
// (spec §1.10: "перехід на другу сторінку без повторення brand-row/title-block"). `fixed` makes
// it render on every page, but the render-prop only returns text from page 2 onward so page 1
// (which already has the full brand-row/title-block) stays clean.
export const ContinuedTag = ({ label }) => (
  <Text
    style={pdfSharedStyles.continuedTag}
    fixed
    render={({ pageNumber }) => (pageNumber > 1 ? sanitizePdfText(`${label} · continued`) : '')}
  />
);
