// PDF renderer for the Documents page's generated legal statements. Unlike the branded UKRCOM
// exports (Invoice/Budget/...), these documents reproduce the look of the reference statements
// docx: Times-style serif (Tinos - metric-compatible with Times New Roman and
// covering the full Ukrainian alphabet + №), justified paragraphs, and either a single-language
// column or the uk|en two-column layout.
// A clinic logo is never added automatically - it only appears where the template itself places
// one, via the dedicated `logo` field (or, for older templates, a leading {{logo}}/{{logo-long}}
// paragraph): {{logo}} draws one compact logo above each visible language column, {{logo-long}}
// draws one shared full-width logo. Either way it renders once, before the title - see
// getTemplateLogoType/getClinicLogo in documentsCatalogUtils.
// Every metric (font sizes, margins, spacing, indent, header/footer) comes from the formatting
// settings the user tunes on the page - nothing visual is hardcoded beyond the defaults.
import React from 'react';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import designTokens from '../data/designTokens.json';
import {
  DEFAULT_DOC_FORMATTING,
  allowsParagraphInternalBreak,
  estimateCharsPerLine,
  estimateColumnPageCapacity,
  getClinicLogo,
  getEffectiveDocLayout,
  getLayoutLang,
  groupJoinedParagraphs,
  isBilingualLayout,
  isOfficialFormStyle,
  isParagraphBold,
  isSingleLanguageTwoColumnLayout,
  normalizeSignerBlockOffsetPercent,
  parseFormattedRuns,
  splitBlankFieldRuns,
  paginateParagraphColumns,
  showsPageNumbers,
} from './documentsCatalogUtils';

const CM_TO_PT = 28.3465;
const MM_TO_PT = 2.83465;

const fontUrl = file => `${process.env.PUBLIC_URL || ''}/fonts/${file}`;

let fontsRegistered = false;

// Registered lazily (the Documents page dynamically imports this module right before rendering),
// same single-shot pattern as pdfTheme's ensurePdfFontsRegistered.
export const ensureDocumentsPdfFontsRegistered = () => {
  if (fontsRegistered) return;
  fontsRegistered = true;
  Font.register({
    family: 'Tinos',
    fonts: [
      { src: fontUrl('Tinos-Regular.ttf'), fontWeight: 400 },
      { src: fontUrl('Tinos-Bold.ttf'), fontWeight: 700 },
      { src: fontUrl('Tinos-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
      { src: fontUrl('Tinos-BoldItalic.ttf'), fontWeight: 700, fontStyle: 'italic' },
    ],
  });
  // Legal names and passport numbers must never hyphenate mid-word.
  Font.registerHyphenationCallback(word => [word]);
};

// Word/PDF parity: the gap under the clinic logo is the one fixed metric shared with the DOCX
// builder (10 pt = 200 twips); everything else comes from the Format panel values.
export const LOGO_BOTTOM_GAP_PT = 10;

// Word's "single" line spacing for Times New Roman / its metric clone Tinos is the font's own line
// height, 1.15 of the font size (hhea ascent + descent + lineGap = 2355/2048) - measured in the
// reference files too (9 pt text, 10.35 pt line pitch). react-pdf's lineHeight is a plain multiple
// of the font size, so `lineSpacing: 1` used to render tighter than the same document in Word.
export const WORD_SINGLE_LINE_HEIGHT = 1.15;

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

const styles = StyleSheet.create({
  headerText: {
    position: 'absolute',
    textAlign: 'center',
  },
  footerRow: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  logo: {
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
  },
});

// Render-time-only text massaging (batch 2026-07-23 C §1/§3, extended after a real-data
// regression report) - the stored template/override data is never rewritten:
// - Every tab character expands to 4 regular spaces first. Notarial templates are routinely
//   copy-pasted out of Word, where a signature gap is a tab stop, not typed spaces - a bare `\t`
//   has no width at all in this PDF engine (it isn't a real tab stop here), so left alone it
//   collapsed the gap to nothing at all, worse than the original space-collapsing bug.
// - Any run of 2+ spaces (including runs created by the tab expansion above) becomes that many
//   non-breaking spaces (U+00A0). The engine keeps interior space runs on an unbroken line, but a
//   run that lands on a line-wrap boundary is swallowed as trailing whitespace - and these runs
//   are deliberate (e.g. the physical gap for a notary's signature in
//   "Приватний нотаріус         Алексашина"), so they must survive wrapping as one unbreakable
//   block.
// - A trailing newline gets one NBSP appended after it, because the engine silently drops the
//   final empty line of a text block - a trailing blank line the admin typed must render as one
//   full blank line, exactly like the editor and the Word export show it.
export const toPdfRenderableText = text => {
  const withTabsExpanded = String(text ?? '').replace(/\t/g, '    ');
  const value = withTabsExpanded.replace(/ {2,}/g, spaces => '\u00A0'.repeat(spaces.length));
  return value.endsWith('\n') ? `${value}\u00A0` : value;
};

// Renders one piece of paragraph/title text as a run of nested <Text> spans so a bold/italic
// fragment (spec §1: selection-based, not whole-paragraph) keeps its exact boundaries in the PDF -
// react-pdf resolves each span's own font weight/style against the registered Tinos faces. A plain
// (unformatted) run renders as a bare string instead of a nested <Text> - react-pdf's fragment
// collector (@react-pdf/layout getFragments) reads paragraph-level attributes like textIndent only
// from the exact instance that owns the text, never inherited into a nested <Text> child, so
// wrapping every run - even a whole plain paragraph with no bold/italic at all - silently broke
// indentCm (spec batch 21 §8/per-paragraph indent): the parent's indent was set, but the text that
// actually needed it always lived one level too deep to see it. The same one-level-too-deep trap
// applies to a paragraph that *starts* with a formatted run (the notarial standard's bold
// date-in-words line, `**Підпис**...`): the leading nested <Text> ignored the parent's indent, so
// exactly the bolded lines lost their 1.5 cm first-line indent - `firstLineIndent` re-states the
// paragraph's own resolved indent on that leading run.
// `blankFields` (official-form documents only, batch 22 §1) additionally splits each run at its
// underscore stretches so a government form's typed "__________" fill-in line draws as an
// underlined run of non-breaking spaces instead of literal underscore glyphs - see
// splitBlankFieldRuns. Every other document leaves its underscores exactly as typed.
const FormattedRuns = ({ text, firstLineIndent, blankFields }) => {
  const runs = parseFormattedRuns(toPdfRenderableText(text));
  const renderRuns = blankFields ? splitBlankFieldRuns(runs) : runs;
  return renderRuns.map((run, index) => {
    if (!run.bold && !run.italic && !run.blank) {
      // eslint-disable-next-line react/no-array-index-key
      return <React.Fragment key={index}>{run.text}</React.Fragment>;
    }
    return (
      <Text
        // eslint-disable-next-line react/no-array-index-key
        key={index}
        style={{
          fontWeight: run.bold ? 700 : undefined,
          fontStyle: run.italic ? 'italic' : undefined,
          textDecoration: run.blank ? 'underline' : undefined,
          ...(index === 0 && firstLineIndent ? { textIndent: firstLineIndent } : {}),
        }}
      >
        {run.blank ? ' '.repeat(run.text.length) : run.text}
      </Text>
    );
  });
};

// A logo block draws graphics, not text - it never goes through the title/paragraph text styles
// and never picks up the template's paragraphSpacing/indent (spec §5). `type` is 'logo' or
// 'logo-long'; used both for the template's letterhead logo (rendered before the title) and for
// any additional logo token still embedded mid-document. `isBilingual` says whether the compact
// {{logo}} variant duplicates once per visible language column (bilingual) or renders once,
// centered (every single-language layout, 1 or 2 columns alike - a body logo token is never split
// across the newspaper-style columns).
const LogoBlock = ({ type, isBilingual, cellStyles, logoWidth, longLogoWidth, clinicLogos, showUk, showEn }) => {
  if (type === 'logo-long') {
    const variant = getClinicLogo(clinicLogos, 'logo-long');
    if (!variant?.dataUrl) return null;
    return (
      <View style={{ marginBottom: LOGO_BOTTOM_GAP_PT, alignItems: 'center' }}>
        <Image src={variant.dataUrl} style={[styles.logo, { width: longLogoWidth }]} />
      </View>
    );
  }

  // type === 'logo': one compact logo per visible column, same width, centered in each column.
  const variant = getClinicLogo(clinicLogos, 'logo');
  if (!variant?.dataUrl) return null;
  if (isBilingual) {
    return (
      <View style={[styles.row, { marginBottom: LOGO_BOTTOM_GAP_PT }]}>
        {showUk ? (
          <View style={[cellStyles.leftCell, { alignItems: 'center' }]}>
            <Image src={variant.dataUrl} style={[styles.logo, { width: logoWidth }]} />
          </View>
        ) : null}
        {showEn ? (
          <View style={[cellStyles.rightCell, { alignItems: 'center' }]}>
            <Image src={variant.dataUrl} style={[styles.logo, { width: logoWidth }]} />
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={{ marginBottom: LOGO_BOTTOM_GAP_PT, alignItems: 'center' }}>
      <Image src={variant.dataUrl} style={[styles.logo, { width: logoWidth }]} />
    </View>
  );
};

// batch 16 §17: an explicit `align` on a paragraph overrides the default alignment (justified
// body / flush-left heading) - never inferred from the text itself. `indentCm` (spec: the
// reference notarial statement indents only its opening declaration, not every paragraph) and
// `fontSize` (batch 2026-07-23 B §1.1: a per-paragraph pt override of the document's font size)
// work the same way - undefined leaves cellStyle's own document-wide value in place. All three
// arrive already resolved from the paragraph's consolidated `style` key (buildGeneratedDocument).
const TextParagraph = ({ paragraph, isBilingual, lang, cellStyles, allowPageBreaks, blankFields }) => {
  const wrap = allowsParagraphInternalBreak(paragraph, allowPageBreaks);
  const cellStyle = isParagraphBold(paragraph) ? cellStyles.paragraphHeading : cellStyles.paragraph;
  const alignStyle = paragraph.align ? { textAlign: paragraph.align } : undefined;
  const indentStyle = paragraph.indentCm !== undefined ? { textIndent: paragraph.indentCm * CM_TO_PT } : undefined;
  // lineHeight in the cell styles is a unitless multiplier, so it scales with this automatically.
  const sizeStyle = paragraph.fontSize !== undefined ? { fontSize: paragraph.fontSize } : undefined;
  // The indent this paragraph actually resolves to, re-applied to a leading bold/italic run
  // (see FormattedRuns) since react-pdf never inherits textIndent into a nested <Text>.
  const firstLineIndent = indentStyle ? indentStyle.textIndent : (cellStyle.textIndent || 0);
  // An empty template paragraph is an explicit empty line (the notarial standard separates its
  // blocks only with those) - it must keep one line's height, not collapse to nothing the way an
  // empty <Text> does. A plain breakable space doesn't survive that: the default body alignment is
  // justify, and a justified line whose only content is ordinary whitespace gets trimmed away to
  // zero width - and zero height along with it. A non-breaking space has real (if narrow) glyph
  // width, so justification has something to keep and the line renders at its full height.
  const lineOf = value => (String(value || '').trim()
    ? <FormattedRuns text={value} firstLineIndent={firstLineIndent} blankFields={blankFields} />
    : ' ');
  if (isBilingual) {
    return (
      <View style={styles.row} wrap={wrap}>
        <Text style={[cellStyle, cellStyles.leftCell, alignStyle, indentStyle, sizeStyle]}>{lineOf(paragraph.uk)}</Text>
        <Text style={[cellStyle, cellStyles.rightCell, alignStyle, indentStyle, sizeStyle]}>{lineOf(paragraph.en)}</Text>
      </View>
    );
  }
  return <Text style={[cellStyle, alignStyle, indentStyle, sizeStyle]} wrap={wrap}>{lineOf(paragraph[lang])}</Text>;
};

// The single-language 2-column layout (spec §4: newspaper-style, one language flowing across two
// columns) - unlike the bilingual layout, react-pdf has no native multi-column text flow, so the
// paragraphs are laid out up front (paginateParagraphColumns): whole paragraphs, the left column
// filled to its estimated height before the right one, each column stacked in its own cell. That is
// an approximation of true reflow (a single very long paragraph can't itself be split across the
// columns), the same atomic-paragraph limit the bilingual layout already lives with.
const SingleLanguageColumns = ({ columns, lang, cellStyles, allowPageBreaks, logoWidth, clinicLogos, blankFields }) => {
  const [leftParagraphs, rightParagraphs] = columns;
  const renderColumn = columnParagraphs => columnParagraphs.map((paragraph, index) => (
    // eslint-disable-next-line react/no-array-index-key
    <View key={index} wrap>
      {paragraph.type && paragraph.type !== 'text' ? (
        // A mid-body logo token confined to a single (already half-width) column - both the
        // compact and long variants are sized to fit the column, not the full page.
        <LogoBlock type={paragraph.type} isBilingual={false} cellStyles={cellStyles} logoWidth={logoWidth} longLogoWidth={logoWidth} clinicLogos={clinicLogos} showUk showEn />
      ) : (
        <TextParagraph paragraph={paragraph} isBilingual={false} lang={lang} cellStyles={cellStyles} allowPageBreaks={allowPageBreaks} blankFields={blankFields} />
      )}
    </View>
  ));
  return (
    <View style={styles.row}>
      <View style={cellStyles.leftCell}>{renderColumn(leftParagraphs)}</View>
      <View style={cellStyles.rightCell}>{renderColumn(rightParagraphs)}</View>
    </View>
  );
};

// A block whose text is blank in both languages (an empty template row, or - for the title - a
// deleted title) renders nothing.
const isBlankBlockText = value => !String(value || '').trim();

// The title is an ordinary centered paragraph (batch 2026-07-23 C §2): default alignment Center
// (cellStyles.title), its own sparse align/fontSize overrides applied like any paragraph's, and a
// document whose title was deleted (both languages resolve blank) renders no title block at all -
// never an empty centered line plus its titleGap.
const DocumentTitleBlock = ({ doc, isBilingual, lang, cellStyles, titleGap, blankFields }) => {
  const title = doc.title || {};
  if (isBlankBlockText(title.uk) && isBlankBlockText(title.en)) return null;
  const overrideStyles = [
    title.align ? { textAlign: title.align } : undefined,
    title.fontSize !== undefined ? { fontSize: title.fontSize } : undefined,
  ];
  return (
    <View style={{ marginBottom: titleGap }}>
      {isBilingual ? (
        <View style={styles.row}>
          <Text style={[cellStyles.title, cellStyles.leftCell, ...overrideStyles]}><FormattedRuns text={title.uk} blankFields={blankFields} /></Text>
          <Text style={[cellStyles.title, cellStyles.rightCell, ...overrideStyles]}><FormattedRuns text={title.en} blankFields={blankFields} /></Text>
        </View>
      ) : (
        <Text style={[cellStyles.title, ...overrideStyles]}><FormattedRuns text={title[lang]} blankFields={blankFields} /></Text>
      )}
    </View>
  );
};

// The addressee/signer block between the letterhead logo and the title (notarial layout standard
// §3.2, "ЗА МІСЦЕМ ВИМОГИ" + the signer data) - never merged into the paragraph list, so it always
// renders in this fixed position regardless of how the body is edited. The whole group occupies
// one strip from the document's stored left offset (beforeTitleOffsetPercent, default 8.5 cm of
// the 18 cm text width) to the right margin - the PDF equivalent of the borderless 2-column layout
// table the reference file uses. Inside the strip a bold block (the caption) sits flush with the
// strip's left edge; a regular block (the signer data) is justified; neither ever carries a
// first-line indent. Consecutive blocks are separated by exactly one empty line (empty blocks in
// the template collapse into that same separator), and one empty line follows the whole strip
// before the title (structure §3.4).

// An explicitly aligned block (the §1.5 alignment button, stored under the block's `style` key)
// overrides the strip's notarial default: bold caption flush-left, regular data justified.
const SignerBlockLine = ({ block, langKey, cellStyles, blankFields }) => (
  <Text
    style={[
      cellStyles.beforeTitle,
      block.bold ? { fontWeight: 700 } : undefined,
      { textAlign: block.align || (block.bold ? 'left' : 'justify') },
      block.fontSize !== undefined ? { fontSize: block.fontSize } : undefined,
    ]}
  >
    <FormattedRuns text={block[langKey]} blankFields={blankFields} />
  </Text>
);

const BlankLine = ({ cellStyles }) => <Text style={cellStyles.beforeTitle}> </Text>;

const SignerBlockStrip = ({ blocks, offsetPercent, langKey, cellStyles, blankFields }) => (
  <View style={styles.row}>
    <View style={{ width: `${offsetPercent}%` }} />
    <View style={{ flex: 1 }}>
      {blocks.map((block, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <React.Fragment key={index}>
          {index > 0 ? <BlankLine cellStyles={cellStyles} /> : null}
          <SignerBlockLine block={block} langKey={langKey} cellStyles={cellStyles} blankFields={blankFields} />
        </React.Fragment>
      ))}
    </View>
  </View>
);

const BeforeTitleBlocks = ({ doc, isBilingual, lang, cellStyles, blankFields }) => {
  const blocks = (doc.beforeTitle || []).filter(block => !isBlankBlockText(block.uk) || !isBlankBlockText(block.en));
  if (!blocks.length) return null;
  const offsetPercent = normalizeSignerBlockOffsetPercent(doc.beforeTitleOffsetPercent);
  return (
    <View>
      {isBilingual ? (
        <View style={styles.row}>
          <View style={cellStyles.leftCell}>
            <SignerBlockStrip blocks={blocks} offsetPercent={offsetPercent} langKey="uk" cellStyles={cellStyles} blankFields={blankFields} />
          </View>
          <View style={cellStyles.rightCell}>
            <SignerBlockStrip blocks={blocks} offsetPercent={offsetPercent} langKey="en" cellStyles={cellStyles} blankFields={blankFields} />
          </View>
        </View>
      ) : (
        <SignerBlockStrip blocks={blocks} offsetPercent={offsetPercent} langKey={lang} cellStyles={cellStyles} />
      )}
      <BlankLine cellStyles={cellStyles} />
    </View>
  );
};

// The bilingual and single-column (1-language) layouts: everything lives on one <Page> JSX
// element and react-pdf's own automatic wrap handles overflow onto further physical pages. The
// single-language 2-column layout does NOT use this - see SingleLanguagePages below.
const DocumentBlock = ({ doc, layout, cellStyles, titleGap, logoWidth, longLogoWidth, clinicLogos }) => {
  const isBilingual = isBilingualLayout(layout);
  const lang = getLayoutLang(layout);
  const showUk = isBilingual || lang === 'uk';
  const showEn = isBilingual || lang === 'en';
  const logoBlockProps = { isBilingual, cellStyles, logoWidth, longLogoWidth, clinicLogos, showUk, showEn };
  // An official-form document (batch 22 §1) draws its logo in the repeating page header instead
  // (see HeaderLogo/renderDocumentPage) - never again here as a one-off body block.
  const blankFields = isOfficialFormStyle(doc);
  const showBodyLogo = doc.logo && !blankFields;
  return (
    <View>
      {/* The template's letterhead logo (doc.logo) always renders before the title, whether it
          came from the dedicated `logo` field or a legacy leading paragraph - see
          getTemplateLogoType in documentsCatalogUtils. */}
      {showBodyLogo ? <LogoBlock type={doc.logo} {...logoBlockProps} /> : null}
      <BeforeTitleBlocks doc={doc} isBilingual={isBilingual} lang={lang} cellStyles={cellStyles} blankFields={blankFields} />
      <DocumentTitleBlock doc={doc} isBilingual={isBilingual} lang={lang} cellStyles={cellStyles} titleGap={titleGap} blankFields={blankFields} />
      {groupJoinedParagraphs(doc.paragraphs).map((paragraph, index) => (
        <View key={`p-${index}`} wrap>
          {paragraph.type && paragraph.type !== 'text' ? (
            <LogoBlock type={paragraph.type} {...logoBlockProps} />
          ) : (
            <TextParagraph
              paragraph={paragraph}
              isBilingual={isBilingual}
              lang={lang}
              cellStyles={cellStyles}
              allowPageBreaks={doc.allowPageBreaks}
              blankFields={blankFields}
            />
          )}
        </View>
      ))}
    </View>
  );
};

// batch 22 §1: an official-form document's letterhead logo repeats in a small page header instead
// of a one-off body block - meaningfully different from the branded doc.logo body block above once
// a form runs past one page (a government form's crest should stay identifiable on every page, not
// just the first). `fixed` redraws it at the same top-left position on every physical page; the
// caller reserves real space for it in the page's own top padding (see headerLogoReserve in
// renderDocumentPage/renderSingleLanguagePages) so body content never starts underneath it.
const resolveLogoAspectRatio = variant => (variant?.width && variant?.height ? variant.height / variant.width : 0.28);

const HeaderLogo = ({ doc, clinicLogos, widthPt, marginLeft, marginTop }) => {
  if (!doc.logo) return null;
  const variant = getClinicLogo(clinicLogos, doc.logo);
  if (!variant?.dataUrl) return null;
  return (
    <Image
      fixed
      src={variant.dataUrl}
      style={{
        position: 'absolute', top: marginTop, left: marginLeft, width: widthPt,
      }}
    />
  );
};

const OFFICIAL_FORM_HEADER_LOGO_GAP_PT = 6;

// How much extra top padding an official-form page needs to reserve so its repeating HeaderLogo
// never overlaps the body content that starts right after it - 0 for every branded document (its
// logo stays a normal one-off body block, drawn in flow) and for an official-form document with no
// logo token at all.
const resolveHeaderLogoReserve = (doc, clinicLogos, widthPt) => {
  if (!isOfficialFormStyle(doc) || !doc.logo) return 0;
  const variant = getClinicLogo(clinicLogos, doc.logo);
  if (!variant?.dataUrl) return 0;
  return widthPt * resolveLogoAspectRatio(variant) + OFFICIAL_FORM_HEADER_LOGO_GAP_PT;
};

// How tall the first page's header (body logo, addressee block, title) renders, estimated with the
// same character-width model as the columns below it - the single-language 2-column layout plans
// its pages before react-pdf lays anything out, so it has to know how much of page one is taken.
const estimateTextLines = (text, widthPt, fontSize) => {
  const charsPerLine = estimateCharsPerLine({ columnWidthPt: widthPt, fontSize });
  return String(text || '').replace(/\*/g, '').split('\n')
    .reduce((sum, segment) => sum + Math.max(1, Math.ceil(segment.length / charsPerLine)), 0);
};

export const estimateFirstPageHeaderPt = (doc, { lang, formatting, contentWidth, logoWidth, clinicLogos }) => {
  const lineHeight = fontSize => fontSize * formatting.lineSpacing * WORD_SINGLE_LINE_HEIGHT;
  let height = 0;
  if (doc.logo) {
    const variant = getClinicLogo(clinicLogos, doc.logo);
    if (variant?.dataUrl) {
      const width = doc.logo === 'logo-long' ? contentWidth : logoWidth;
      height += width * resolveLogoAspectRatio(variant) + LOGO_BOTTOM_GAP_PT;
    }
  }
  const blocks = (doc.beforeTitle || []).filter(block => !isBlankBlockText(block.uk) || !isBlankBlockText(block.en));
  if (blocks.length) {
    const stripWidth = contentWidth * (1 - normalizeSignerBlockOffsetPercent(doc.beforeTitleOffsetPercent) / 100);
    const blankLine = lineHeight(formatting.fontSize) + formatting.paragraphSpacing;
    blocks.forEach(block => {
      const fontSize = block.fontSize !== undefined ? block.fontSize : formatting.fontSize;
      height += estimateTextLines(block[lang], stripWidth, fontSize) * lineHeight(fontSize) + formatting.paragraphSpacing;
    });
    // One empty line between blocks and one after the whole strip (BeforeTitleBlocks).
    height += blocks.length * blankLine;
  }
  const title = doc.title || {};
  if (!isBlankBlockText(title[lang])) {
    const fontSize = title.fontSize !== undefined ? title.fontSize : formatting.titleFontSize;
    height += estimateTextLines(title[lang], contentWidth, fontSize) * lineHeight(fontSize) + formatting.paragraphSpacing;
  }
  return height;
};

const PageHeader = ({ formatting, marginTop, marginLeft, marginRight }) => (!formatting.headerText ? null : (
  <Text
    fixed
    style={[styles.headerText, {
      top: Math.max(6, marginTop * 0.35),
      left: marginLeft,
      right: marginRight,
      fontSize: Math.max(7, formatting.fontSize - 2),
    }]}
  >
    {formatting.headerText}
  </Text>
));

// Off by default (spec §3), a hairline rule between the two columns - `fixed` so it repeats at the
// same x position on every physical page, matching the header/footer pattern.
const PageDivider = ({ show, marginTop, marginBottom, left }) => (!show ? null : (
  <View
    fixed
    style={{
      position: 'absolute', top: marginTop, bottom: marginBottom, left, width: 1, backgroundColor: designTokens.color.docLine,
    }}
  />
));

// Every layout (including the single-language 2-column flow's manually pre-chunked page groups,
// see renderSingleLanguagePages) is exactly one <Page> JSX element per document, so
// subPageNumber/subPageTotalPages always reflects every actual physical page that document ends
// up spanning - including any accidental extra page from an imperfect capacity estimate - never a
// hardcoded number that can desync from what react-pdf actually laid out.
const PageFooter = ({ doc, formatting, marginBottom, marginLeft, marginRight }) => {
  const showPageNumbers = showsPageNumbers(doc, formatting);
  if (!formatting.footerText && !showPageNumbers) return null;
  const smallSize = Math.max(7, formatting.fontSize - 2);
  return (
    <View fixed style={[styles.footerRow, { bottom: Math.max(6, marginBottom * 0.35), left: marginLeft, right: marginRight }]}>
      <Text style={{ fontSize: smallSize }}>{formatting.footerText || ''}</Text>
      {showPageNumbers ? (
        <Text
          style={{ fontSize: smallSize }}
          render={({ subPageNumber, subPageTotalPages }) => (
            subPageTotalPages > 1 ? `Page ${subPageNumber} of ${subPageTotalPages}` : ''
          )}
        />
      ) : null}
    </View>
  );
};

// --- layoutV2 (pixel-exact single-page forms, e.g. genetic-affinity-certificate) ---------------
// Reads exactly the normalized tree buildLayoutV2Document produces (doc.layoutV2) - no formatting
// prop, no bilingual/column layout, no header/footer text: a layoutV2 document is fully
// self-describing (its own page/margins/styles), the same tree the DOCX builder reads too (spec
// §8 - one engine, two mm/pt-aware backends).
const layoutV2TextStyle = style => ({
  fontFamily: 'Tinos',
  fontSize: style?.fontSizePt,
  fontWeight: style?.fontWeight,
  fontStyle: style?.fontStyle,
  lineHeight: style?.lineHeight,
  color: style?.color,
  textAlign: style?.align,
  textDecoration: style?.textDecoration,
  textTransform: style?.textTransform,
  letterSpacing: style?.letterSpacingPt,
});

const LayoutV2Content = ({ content, clinicLogos }) => {
  if (!content) return null;
  if (content.type === 'image') {
    const variant = content.logoToken ? getClinicLogo(clinicLogos, content.logoToken) : null;
    const dataUrl = variant?.dataUrl || content.source;
    // The wrapper owns the logo's footprint. Hiding (or temporarily lacking) the bitmap must not
    // shorten the letterhead row, and absolute offsets must not enlarge or move its column.
    return (
      <View
        style={{
          width: (content.widthMm || 0) * MM_TO_PT,
          height: (content.heightMm || 0) * MM_TO_PT,
        }}
      >
        {!content.hidden && dataUrl ? (
          <Image
            src={dataUrl}
            style={{
              position: 'absolute',
              left: (content.offsetXMm || 0) * MM_TO_PT,
              top: (content.offsetYMm || 0) * MM_TO_PT,
              width: (content.widthMm || 0) * MM_TO_PT,
              height: (content.heightMm || 0) * MM_TO_PT,
              objectFit: content.fit || 'contain',
              objectPosition: `${content.horizontalAlign || 'left'} ${content.verticalAlign || 'top'}`,
            }}
          />
        ) : null}
      </View>
    );
  }
  if (content.type === 'stack') {
    const align = content.horizontalAlign === 'right' ? 'flex-end' : (content.horizontalAlign === 'center' ? 'center' : 'flex-start');
    return (
      <View style={{ alignItems: align }}>
        {content.lines.map((line, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Text key={index} style={layoutV2TextStyle(content.style)}>{line}</Text>
        ))}
      </View>
    );
  }
  return null;
};

const LayoutV2Letterhead = ({ block, clinicLogos }) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingBottom: (block.paddingBottomMm || 0) * MM_TO_PT,
      borderBottomWidth: block.bottomBorder?.widthPt || 0,
      borderBottomColor: block.bottomBorder?.color || '#000000',
      marginBottom: (block.marginBottomMm || 0) * MM_TO_PT,
    }}
  >
    {block.columns.map((column, index) => (
      <View
        // eslint-disable-next-line react/no-array-index-key
        key={index}
        style={{
          width: (column.widthMm || 0) * MM_TO_PT,
          marginRight: index < block.columns.length - 1 ? (block.columnGapMm || 0) * MM_TO_PT : 0,
        }}
      >
        <LayoutV2Content content={column.content} clinicLogos={clinicLogos} />
      </View>
    ))}
  </View>
);

// `widthMm` is normally explicit (e.g. the "Додаток 18" corner label needs its own width to compute
// the right-push offset), but a block that omits it must still span the full content width rather
// than collapse to 0 - a zero-width container forces every word onto its own line instead of
// wrapping normally (the layoutV2 title-wrapping bug: a title authored as an alignedBox with no
// widthMm rendered one word per line until this fallback was added).
const LayoutV2AlignedBox = ({ block, contentWidthMm }) => (
  <View
    style={{
      width: (block.widthMm || contentWidthMm || 0) * MM_TO_PT,
      alignSelf: block.horizontalAlign === 'right' ? 'flex-end' : (block.horizontalAlign === 'center' ? 'center' : 'flex-start'),
      marginTop: (block.marginTopMm || 0) * MM_TO_PT,
      marginBottom: (block.marginBottomMm || 0) * MM_TO_PT,
    }}
  >
    {block.lines.map((line, index) => (
      // eslint-disable-next-line react/no-array-index-key
      <Text key={index} style={[layoutV2TextStyle(block.style), { textAlign: 'left' }]}>{line}</Text>
    ))}
  </View>
);

// A plain paragraph/richParagraph block typed as just {{logo}}/{{logo-long}} (spec: same
// convention the legacy renderer already applies to a leading paragraph) - draws the actual
// clinic logo image instead of literal text, centered, sized from the page's configured logo
// width (the same default the letterhead/image block's own author-chosen widthMm otherwise
// covers). Renders nothing (not even its own margins) when no logo variant is uploaded yet -
// consistent with the legacy LogoBlock, which never leaves an empty placeholder box behind.
const LayoutV2LogoParagraph = ({ block, clinicLogos, logoWidthPt }) => {
  const variant = getClinicLogo(clinicLogos, block.logoToken);
  if (!variant?.dataUrl) return null;
  return (
    <View
      style={{
        alignItems: 'center',
        marginTop: (block.marginTopMm || 0) * MM_TO_PT,
        marginBottom: (block.marginBottomMm || 0) * MM_TO_PT,
      }}
    >
      <Image src={variant.dataUrl} style={{ width: logoWidthPt || 156 }} />
    </View>
  );
};

const LayoutV2Paragraph = ({ block }) => (
  <Text
    style={[
      layoutV2TextStyle(block.style),
      { marginTop: (block.marginTopMm || 0) * MM_TO_PT, marginBottom: (block.marginBottomMm || 0) * MM_TO_PT },
    ]}
  >
    {block.text || ' '}
  </Text>
);

const LayoutV2RichParagraph = ({ block }) => (
  <Text
    style={{
      ...layoutV2TextStyle(block.style),
      marginTop: (block.marginTopMm || 0) * MM_TO_PT,
      marginBottom: (block.marginBottomMm || 0) * MM_TO_PT,
    }}
  >
    {block.runs.map((run, index) => (
      // eslint-disable-next-line react/no-array-index-key
      <Text key={index} style={layoutV2TextStyle(run.style)}>{run.text}</Text>
    ))}
  </Text>
);

// The key element for matching the Word sample (spec §5.5): a label cell, then a flexible value
// area whose "fill" segments before/after the value are borderBottom lines - the value itself
// carries the same borderBottom, so the line reads as one continuous rule under label-to-margin
// with the value sitting on it. Never a second underline mechanism (textDecoration) on the value
// style itself - the border here is the only line (spec batch 2026-07-25, pre-delivery review §3).
const LayoutV2FieldLine = ({ block }) => {
  const lineWidthPt = block.line?.widthPt || 0;
  const lineColor = block.line?.color || '#000000';
  const lineStyle = { borderBottomWidth: lineWidthPt, borderBottomColor: lineColor };
  return (
    <View style={{ marginTop: (block.marginTopMm || 0) * MM_TO_PT, marginBottom: (block.marginBottomMm || 0) * MM_TO_PT }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        {block.labelWidthMm ? (
          <View style={{ width: block.labelWidthMm * MM_TO_PT }}>
            {block.labelRuns ? (
              <Text style={layoutV2TextStyle(block.labelStyle)}>
                {block.labelRuns.map((run, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <Text key={index} style={layoutV2TextStyle(run.style)}>{run.text}</Text>
                ))}
              </Text>
            ) : (
              <Text style={layoutV2TextStyle(block.labelStyle)}>{block.label}</Text>
            )}
          </View>
        ) : null}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end' }}>
          {block.line?.fillBeforeValue ? <View style={[{ flex: 1, minWidth: 4 * MM_TO_PT }, lineStyle]} /> : null}
          <Text style={[layoutV2TextStyle(block.valueStyle), lineStyle, { paddingHorizontal: 1 * MM_TO_PT }]}>
            {block.valueRuns
              ? block.valueRuns.map((run, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <Text key={index} style={layoutV2TextStyle(run.style)}>{run.text}</Text>
              ))
              : block.value}
          </Text>
          {block.line?.fillAfterValue ? <View style={[{ flex: 1, minWidth: 4 * MM_TO_PT }, lineStyle]} /> : null}
        </View>
      </View>
      {block.caption !== undefined ? (
        <View style={{ flexDirection: 'row' }}>
          {block.labelWidthMm ? <View style={{ width: block.labelWidthMm * MM_TO_PT }} /> : null}
          <Text style={[layoutV2TextStyle(block.captionStyle), { flex: 1 }]}>{block.caption}</Text>
        </View>
      ) : null}
    </View>
  );
};

const LayoutV2Spacer = ({ block }) => <View style={{ height: (block.heightMm || 0) * MM_TO_PT }} />;

const LayoutV2SignatureTable = ({ block }) => (
  <View
    style={{
      width: (block.widthMm || 0) * MM_TO_PT,
      alignSelf: block.horizontalAlign === 'right' ? 'flex-end' : (block.horizontalAlign === 'center' ? 'center' : 'flex-start'),
      marginTop: (block.marginTopMm || 0) * MM_TO_PT,
      marginBottom: (block.marginBottomMm || 0) * MM_TO_PT,
    }}
  >
    {block.rows.map((row, rowIndex) => (
      row.type === 'spacerRow' ? (
        // eslint-disable-next-line react/no-array-index-key
        <View key={rowIndex} style={{ height: (row.heightMm || 0) * MM_TO_PT }} />
      ) : (
        // eslint-disable-next-line react/no-array-index-key
        <View key={rowIndex} style={{ flexDirection: 'row' }}>
          {row.map((cell, cellIndex) => (
            <Text
              // eslint-disable-next-line react/no-array-index-key
              key={cellIndex}
              style={{
                ...layoutV2TextStyle(cell.style),
                width: (block.columnWidthsMm[cellIndex] || 0) * MM_TO_PT,
                borderBottomWidth: cell.bottomBorder?.widthPt || 0,
                borderBottomColor: cell.bottomBorder?.color || '#000000',
              }}
            >
              {cell.text || ' '}
            </Text>
          ))}
        </View>
      )
    ))}
  </View>
);

const LayoutV2Block = ({
  block, clinicLogos, contentWidthMm, logoWidthPt,
}) => {
  if (block.logoToken) return <LayoutV2LogoParagraph block={block} clinicLogos={clinicLogos} logoWidthPt={logoWidthPt} />;
  switch (block.type) {
    case 'letterhead': return <LayoutV2Letterhead block={block} clinicLogos={clinicLogos} />;
    case 'alignedBox': return <LayoutV2AlignedBox block={block} contentWidthMm={contentWidthMm} />;
    case 'paragraph': return <LayoutV2Paragraph block={block} />;
    case 'richParagraph': return <LayoutV2RichParagraph block={block} />;
    case 'fieldLine': return <LayoutV2FieldLine block={block} />;
    case 'spacer': return <LayoutV2Spacer block={block} />;
    case 'signatureTable': return <LayoutV2SignatureTable block={block} />;
    default: return null;
  }
};

const renderLayoutV2DocumentPage = (doc, clinicLogos, logoWidthPt) => {
  const page = doc.layoutV2.page || {};
  const margins = page.marginsMm || {
    top: 5, right: 15, bottom: 10, left: 15,
  };
  const widthPt = (page.widthMm || 210) * MM_TO_PT;
  const heightPt = (page.heightMm || 297) * MM_TO_PT;
  // The template's own declared content width when set, otherwise derived from the page/margins -
  // either way, the same "full width" an alignedBox with no widthMm of its own should fall back to.
  const contentWidthMm = doc.layoutV2.contentWidthMm || ((page.widthMm || 210) - margins.left - margins.right);
  return (
    <Page
      key={doc.id}
      size={{ width: widthPt, height: heightPt }}
      style={{
        paddingTop: margins.top * MM_TO_PT,
        paddingRight: margins.right * MM_TO_PT,
        paddingBottom: margins.bottom * MM_TO_PT,
        paddingLeft: margins.left * MM_TO_PT,
        fontFamily: 'Tinos',
      }}
    >
      {doc.layoutV2.blocks.map((block, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={index} wrap>
          <LayoutV2Block block={block} clinicLogos={clinicLogos} contentWidthMm={contentWidthMm} logoWidthPt={logoWidthPt} />
        </View>
      ))}
    </Page>
  );
};

// `documents` - output of buildGeneratedDocument (placeholders already filled, logo paragraphs
// tagged). Each document starts on its own page, like the separate statements in the reference
// file; templates with `allowPageBreaks` (the long agreement) are free to spill onto further
// pages - nothing here constrains a document to a single page.
// The paragraph/title/heading cell styles every legacy layout renders with - shared by the document
// itself and by planColumnLayouts' measuring pass, so both lay text out identically.
const buildCellStyles = (formatting, columnGap) => StyleSheet.create({
  title: {
    fontFamily: 'Tinos',
    fontWeight: 700,
    fontSize: formatting.titleFontSize,
    textAlign: 'center',
    lineHeight: formatting.lineSpacing * WORD_SINGLE_LINE_HEIGHT,
    letterSpacing: formatting.letterSpacingPt || undefined,
  },
  paragraph: {
    fontFamily: 'Tinos',
    fontSize: formatting.fontSize,
    textAlign: 'justify',
    lineHeight: formatting.lineSpacing * WORD_SINGLE_LINE_HEIGHT,
    letterSpacing: formatting.letterSpacingPt || undefined,
    textIndent: formatting.firstLineIndentCm * CM_TO_PT,
    marginBottom: formatting.paragraphSpacing,
  },
  paragraphHeading: {
    fontFamily: 'Tinos',
    fontWeight: 700,
    fontSize: formatting.fontSize,
    textAlign: 'left',
    lineHeight: formatting.lineSpacing * WORD_SINGLE_LINE_HEIGHT,
    letterSpacing: formatting.letterSpacingPt || undefined,
    textIndent: 0,
    marginTop: formatting.paragraphSpacing,
    marginBottom: formatting.paragraphSpacing,
  },
  beforeTitle: {
    fontFamily: 'Tinos',
    fontSize: formatting.fontSize,
    lineHeight: formatting.lineSpacing * WORD_SINGLE_LINE_HEIGHT,
    letterSpacing: formatting.letterSpacingPt || undefined,
    marginBottom: formatting.paragraphSpacing,
  },
  leftCell: {
    flex: 1,
    marginRight: columnGap / 2,
  },
  rightCell: {
    flex: 1,
    marginLeft: columnGap / 2,
  },
});

// Geometry of the single-language 2-column layout for one document - the same numbers for the
// rendered pages and for planColumnLayouts' measuring pass below.
const singleLanguageColumnGeometry = (doc, effectiveLayout, formatting, clinicLogos) => {
  const marginTop = formatting.marginTopCm * CM_TO_PT;
  const marginBottom = formatting.marginBottomCm * CM_TO_PT;
  const columnGap = formatting.columnGapCm * CM_TO_PT;
  const contentWidth = A4_WIDTH_PT - (formatting.marginLeftCm + formatting.marginRightCm) * CM_TO_PT;
  const columnContentWidth = (contentWidth - columnGap) / 2;
  const effectiveClinicLogos = formatting.showLogo !== false ? clinicLogos : [];
  const logoWidth = Math.min(formatting.logoWidthMm * MM_TO_PT, columnContentWidth);
  const headerLogoReserve = resolveHeaderLogoReserve(doc, effectiveClinicLogos, logoWidth);
  const pageContentHeightPt = A4_HEIGHT_PT - marginTop - headerLogoReserve - marginBottom;
  const firstPageHeaderPt = estimateFirstPageHeaderPt(doc, {
    lang: getLayoutLang(effectiveLayout),
    formatting,
    contentWidth,
    logoWidth,
    clinicLogos: headerLogoReserve ? [] : effectiveClinicLogos,
  });
  return { columnGap, contentWidth, columnContentWidth, logoWidth, headerLogoReserve, pageContentHeightPt, firstPageHeaderPt, effectiveClinicLogos };
};

// Which paragraphs go into which column of which page, measured by react-pdf itself rather than
// estimated. The character-count estimate (paginateParagraphColumns) can't know where react-pdf
// breaks a justified line, so to never overfill a column it plans with a wide margin - every
// column ended short of the page bottom, and the appendix came out a page longer than its
// reference Word file. Here each paragraph flows, whole (wrap off), through a hidden document
// whose page is exactly one column, so react-pdf's own pagination finds every column break; an
// absolutely positioned marker before each paragraph records the column it landed on without
// taking any height. Columns pair up into pages: 1-2 is page one, 3-4 page two.
// One extra layout pass per document (~0.5 s for an 8-page contract). `pdfFn` is react-pdf's
// `pdf`; the result is { [doc.id]: [[leftIndices, rightIndices], ...] } over the document's
// grouped body paragraphs, for DocumentsPdfDocument's `columnPlans`.
export const planColumnLayouts = async (pdfFn, {
  documents = [], layout = 'two-column', formatting = DEFAULT_DOC_FORMATTING, clinicLogos = [],
}) => {
  const plans = {};
  // eslint-disable-next-line no-restricted-syntax
  for (const doc of documents) {
    const effectiveLayout = getEffectiveDocLayout(doc, layout);
    if (doc.layoutV2 || !isSingleLanguageTwoColumnLayout(effectiveLayout)) continue; // eslint-disable-line no-continue
    const lang = getLayoutLang(effectiveLayout);
    const geometry = singleLanguageColumnGeometry(doc, effectiveLayout, formatting, clinicLogos);
    const cellStyles = buildCellStyles(formatting, geometry.columnGap);
    const paragraphs = groupJoinedParagraphs(doc.paragraphs);
    // The column a paragraph lands on when `items` flow through columns `heightPt` tall.
    const measure = async (items, heightPt) => {
      const landedOn = [];
      const element = (
        <Document>
          <Page size={[geometry.columnContentWidth, heightPt]} style={{ fontFamily: 'Tinos', fontSize: formatting.fontSize }}>
            {items.map((paragraph, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <View key={index} wrap={false}>
                <Text
                  style={{ position: 'absolute', top: 0, left: 0, fontSize: 1 }}
                  render={({ pageNumber }) => {
                    landedOn[index] = pageNumber;
                    return ' ';
                  }}
                />
                {paragraph.type && paragraph.type !== 'text' ? (
                  <LogoBlock type={paragraph.type} isBilingual={false} cellStyles={cellStyles} logoWidth={geometry.logoWidth} longLogoWidth={geometry.logoWidth} clinicLogos={geometry.effectiveClinicLogos} showUk showEn />
                ) : (
                  <TextParagraph paragraph={paragraph} isBilingual={false} lang={lang} cellStyles={cellStyles} allowPageBreaks={doc.allowPageBreaks} blankFields={isOfficialFormStyle(doc)} />
                )}
              </View>
            ))}
          </Page>
        </Document>
      );
      const instance = pdfFn(element);
      await (typeof window !== 'undefined' && instance.toBlob ? instance.toBlob() : instance.toBuffer());
      return landedOn.length === items.length && landedOn.every(Number.isInteger) ? landedOn : null;
    };
    // Page one's BOTH columns start under the full-width header (logo, addressee block, title), so
    // its two columns are measured at the reduced height first; whatever didn't fit flows on
    // through full-height columns from page two.
    // eslint-disable-next-line no-await-in-loop
    const firstPass = await measure(paragraphs, Math.max(1, geometry.pageContentHeightPt - geometry.firstPageHeaderPt));
    if (!firstPass) continue; // eslint-disable-line no-continue
    const firstPageCount = firstPass.filter(column => column <= 2).length;
    const pages = [[[], []]];
    firstPass.slice(0, firstPageCount).forEach((column, index) => pages[0][column - 1].push(index));
    if (firstPageCount < paragraphs.length) {
      // eslint-disable-next-line no-await-in-loop
      const rest = await measure(paragraphs.slice(firstPageCount), geometry.pageContentHeightPt);
      if (!rest) continue; // eslint-disable-line no-continue
      rest.forEach((column, offset) => {
        const pageIndex = 1 + Math.floor((column - 1) / 2);
        while (pages.length <= pageIndex) pages.push([[], []]);
        pages[pageIndex][(column - 1) % 2].push(firstPageCount + offset);
      });
    }
    plans[doc.id] = pages;
  }
  return plans;
};

// A measured plan applies only to the exact paragraph list it was measured on.
const columnsFromPlan = (plan, paragraphs) => {
  if (!Array.isArray(plan)) return null;
  const used = plan.flat(2);
  if (used.length !== paragraphs.length || used.some((index, position) => index !== position)) return null;
  return plan.map(([left, right]) => [left.map(index => paragraphs[index]), right.map(index => paragraphs[index])]);
};

const DocumentsPdfDocument = ({
  documents = [],
  layout = 'two-column',
  formatting = DEFAULT_DOC_FORMATTING,
  clinicLogos = [],
  // Measured column breaks per document id (planColumnLayouts); without them the single-language
  // 2-column layout falls back to the character-count estimate.
  columnPlans = null,
}) => {
  const marginTop = formatting.marginTopCm * CM_TO_PT;
  const marginBottom = formatting.marginBottomCm * CM_TO_PT;
  const marginLeft = formatting.marginLeftCm * CM_TO_PT;
  const marginRight = formatting.marginRightCm * CM_TO_PT;
  const columnGap = formatting.columnGapCm * CM_TO_PT;
  const contentWidth = A4_WIDTH_PT - marginLeft - marginRight;
  // Both column layouts (bilingual UA|EN and single-language newspaper-style, spec §4) share the
  // same left/right cell geometry and divider - only how the paragraphs are distributed between
  // the two cells differs (see DocumentBlock/SingleLanguageColumns). Geometry here is shared across
  // every document; which layout actually applies is resolved per document below (getEffectiveDocLayout),
  // since a template can pin its own languages/columns regardless of the page-wide selector.
  const columnContentWidth = (contentWidth - columnGap) / 2;
  const configuredLogoWidth = formatting.logoWidthMm * MM_TO_PT;
  // `showLogo` is only the global permission (spec §5: `canRenderLogo = formatting.showLogo !==
  // false`) - whether a logo actually renders still depends entirely on the template carrying a
  // {{logo}}/{{logo-long}} paragraph; clinicLogos being empty (or missing the matching variant)
  // simply renders no image, never a broken document.
  const canRenderLogo = formatting.showLogo !== false;
  const effectiveClinicLogos = canRenderLogo ? clinicLogos : [];

  const cellStyles = buildCellStyles(formatting, columnGap);

  const pageStyle = {
    paddingTop: marginTop,
    paddingBottom: marginBottom,
    paddingLeft: marginLeft,
    paddingRight: marginRight,
    fontFamily: 'Tinos',
    fontSize: formatting.fontSize,
  };
  const dividerLeft = marginLeft + columnContentWidth + columnGap / 2 - 0.5;

  // The single-language 2-column layout can't rely on react-pdf's automatic wrap the way every
  // other layout does (see paginateParagraphColumns for why): a flex row's two columns can't
  // continue onto a shared next page independently, so the paragraphs are pre-chunked into
  // page-sized groups up front, each meant to occupy exactly one physical page. That grouping used
  // to render as its own separate <Page> JSX element per group, with a hardcoded "Page X of Y"
  // footer - but the character-count capacity estimate is only ever approximate (it has no way to
  // know about e.g. a paragraph's embedded line breaks), so a page-group that's underestimated
  // still occasionally overflows past its one physical page. When that happened, react-pdf would
  // silently continue that SAME <Page> element onto an extra physical page to hold the overflow,
  // and since the footer was a hardcoded per-element constant, that phantom extra page repeated
  // the exact same "Page X of Y" as the page before it - a near-blank page with a duplicate number.
  // Rendering one <Page> for the WHOLE document instead, with a manual `break` before every group
  // after the first, keeps the same one-page-per-group layout in the normal case while letting
  // react-pdf's own dynamic subPageNumber/subPageTotalPages count every actual physical page -
  // including any accidental extra overflow page - so numbering can never desync from reality.
  const renderSingleLanguagePages = (doc, effectiveLayout) => {
    const lang = getLayoutLang(effectiveLayout);
    const showColumnDivider = Boolean(formatting.columnDivider);
    const logoWidth = Math.min(configuredLogoWidth, columnContentWidth);
    const blankFields = isOfficialFormStyle(doc);
    const headerLogoReserve = resolveHeaderLogoReserve(doc, effectiveClinicLogos, logoWidth);
    const pageStyleForDoc = headerLogoReserve ? { ...pageStyle, paddingTop: marginTop + headerLogoReserve } : pageStyle;
    const bodyParagraphs = groupJoinedParagraphs(doc.paragraphs);
    const pageContentHeightPt = A4_HEIGHT_PT - marginTop - headerLogoReserve - marginBottom;
    const charsPerLine = estimateCharsPerLine({ columnWidthPt: columnContentWidth, fontSize: formatting.fontSize, letterSpacingPt: formatting.letterSpacingPt });
    const capacity = estimateColumnPageCapacity({
      columnWidthPt: columnContentWidth,
      pageContentHeightPt,
      fontSize: formatting.fontSize,
      lineSpacing: formatting.lineSpacing * WORD_SINGLE_LINE_HEIGHT,
      letterSpacingPt: formatting.letterSpacingPt,
    });
    // The first page's columns start under the logo, the addressee block and the title, so they
    // hold less: without this the first page was planned as if the columns started at the top
    // margin, and its left column ran past the page bottom.
    const firstPageHeaderPt = estimateFirstPageHeaderPt(doc, {
      lang,
      formatting,
      contentWidth,
      logoWidth,
      clinicLogos: headerLogoReserve ? [] : effectiveClinicLogos,
    });
    const firstPageColumnCapacity = Math.floor(capacity * Math.max(0, pageContentHeightPt - firstPageHeaderPt) / pageContentHeightPt);
    const paragraphGapChars = formatting.paragraphSpacing
      ? Math.ceil((formatting.paragraphSpacing / (formatting.fontSize * formatting.lineSpacing * WORD_SINGLE_LINE_HEIGHT)) * charsPerLine)
      : 0;
    // First-line indent in character widths, per paragraph (its own indentCm, else the document's).
    const charWidthPt = columnContentWidth / charsPerLine;
    const indentChars = ownIndentCm => Math.ceil(
      ((ownIndentCm !== undefined ? ownIndentCm : formatting.firstLineIndentCm) * CM_TO_PT) / charWidthPt,
    );
    const pages = columnsFromPlan(columnPlans?.[doc.id], bodyParagraphs) || paginateParagraphColumns(bodyParagraphs, lang, {
      columnCapacity: capacity,
      firstPageColumnCapacity,
      charsPerLine,
      paragraphGapChars,
      indentChars,
    });
    return (
      <Page key={doc.id} size="A4" style={pageStyleForDoc}>
        <PageHeader formatting={formatting} marginTop={marginTop} marginLeft={marginLeft} marginRight={marginRight} />
        {headerLogoReserve ? (
          <HeaderLogo doc={doc} clinicLogos={effectiveClinicLogos} widthPt={logoWidth} marginLeft={marginLeft} marginTop={marginTop} />
        ) : null}
        <PageDivider show={showColumnDivider} marginTop={marginTop} marginBottom={marginBottom} left={dividerLeft} />
        {pages.map((pageColumns, pageIndex) => (
          // eslint-disable-next-line react/no-array-index-key
          <View key={pageIndex} break={pageIndex > 0}>
            {pageIndex === 0 ? (
              <>
                {doc.logo && !headerLogoReserve ? (
                  <LogoBlock type={doc.logo} isBilingual={false} cellStyles={cellStyles} logoWidth={logoWidth} longLogoWidth={contentWidth} clinicLogos={effectiveClinicLogos} showUk showEn />
                ) : null}
                <BeforeTitleBlocks doc={doc} isBilingual={false} lang={lang} cellStyles={cellStyles} blankFields={blankFields} />
                <DocumentTitleBlock doc={doc} isBilingual={false} lang={lang} cellStyles={cellStyles} titleGap={formatting.paragraphSpacing} blankFields={blankFields} />
              </>
            ) : null}
            <SingleLanguageColumns
              columns={pageColumns}
              lang={lang}
              cellStyles={cellStyles}
              allowPageBreaks={doc.allowPageBreaks}
              logoWidth={logoWidth}
              clinicLogos={effectiveClinicLogos}
              blankFields={blankFields}
            />
          </View>
        ))}
        <PageFooter doc={doc} formatting={formatting} marginBottom={marginBottom} marginLeft={marginLeft} marginRight={marginRight} />
      </Page>
    );
  };

  const renderDocumentPage = (doc, effectiveLayout) => {
    const isTwoColumn = isBilingualLayout(effectiveLayout) || isSingleLanguageTwoColumnLayout(effectiveLayout);
    const showColumnDivider = isTwoColumn && Boolean(formatting.columnDivider);
    const logoWidth = isTwoColumn ? Math.min(configuredLogoWidth, columnContentWidth) : configuredLogoWidth;
    const headerLogoReserve = resolveHeaderLogoReserve(doc, effectiveClinicLogos, logoWidth);
    const pageStyleForDoc = headerLogoReserve ? { ...pageStyle, paddingTop: marginTop + headerLogoReserve } : pageStyle;
    return (
      <Page key={doc.id} size="A4" style={pageStyleForDoc}>
        <PageHeader formatting={formatting} marginTop={marginTop} marginLeft={marginLeft} marginRight={marginRight} />
        {headerLogoReserve ? (
          <HeaderLogo doc={doc} clinicLogos={effectiveClinicLogos} widthPt={logoWidth} marginLeft={marginLeft} marginTop={marginTop} />
        ) : null}
        <PageDivider show={showColumnDivider} marginTop={marginTop} marginBottom={marginBottom} left={dividerLeft} />
        <DocumentBlock
          doc={doc}
          layout={effectiveLayout}
          cellStyles={cellStyles}
          titleGap={formatting.paragraphSpacing}
          logoWidth={logoWidth}
          longLogoWidth={contentWidth}
          clinicLogos={effectiveClinicLogos}
        />
        <PageFooter doc={doc} formatting={formatting} marginBottom={marginBottom} marginLeft={marginLeft} marginRight={marginRight} />
      </Page>
    );
  };

  return (
    <Document>
      {documents.flatMap(doc => {
        // A layoutV2 document is fully self-describing (its own page/margins/styles) and never
        // follows the page-wide bilingual/column layout selector - see buildLayoutV2Document.
        if (doc.layoutV2) return [renderLayoutV2DocumentPage(doc, effectiveClinicLogos, configuredLogoWidth)];
        const effectiveLayout = getEffectiveDocLayout(doc, layout);
        return isSingleLanguageTwoColumnLayout(effectiveLayout)
          ? renderSingleLanguagePages(doc, effectiveLayout)
          : [renderDocumentPage(doc, effectiveLayout)];
      })}
    </Document>
  );
};

export default DocumentsPdfDocument;
