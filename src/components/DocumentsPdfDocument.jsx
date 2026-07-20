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
  isBilingualLayout,
  isParagraphBold,
  isSingleLanguageTwoColumnLayout,
  parseFormattedRuns,
  splitParagraphsIntoColumns,
  splitParagraphsIntoPages,
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

// Renders one piece of paragraph/title text as a run of nested <Text> spans so a bold/italic
// fragment (spec §1: selection-based, not whole-paragraph) keeps its exact boundaries in the PDF -
// react-pdf resolves each span's own font weight/style against the registered Tinos faces. A plain
// (unformatted) run renders as a bare string instead of a nested <Text> - react-pdf's fragment
// collector (@react-pdf/layout getFragments) reads paragraph-level attributes like textIndent only
// from the exact instance that owns the text, never inherited into a nested <Text> child, so
// wrapping every run - even a whole plain paragraph with no bold/italic at all - silently broke
// indentCm (spec batch 21 §8/per-paragraph indent): the parent's indent was set, but the text that
// actually needed it always lived one level too deep to see it.
const FormattedRuns = ({ text }) => parseFormattedRuns(text).map((run, index) => {
  if (!run.bold && !run.italic) {
    // eslint-disable-next-line react/no-array-index-key
    return <React.Fragment key={index}>{run.text}</React.Fragment>;
  }
  return (
    // eslint-disable-next-line react/no-array-index-key
    <Text key={index} style={{ fontWeight: run.bold ? 700 : undefined, fontStyle: run.italic ? 'italic' : undefined }}>
      {run.text}
    </Text>
  );
});

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
// reference notarial statement indents only its opening declaration, not every paragraph) works
// the same way - undefined leaves cellStyle's own document-wide firstLineIndentCm in place.
const TextParagraph = ({ paragraph, isBilingual, lang, cellStyles, allowPageBreaks }) => {
  const wrap = allowsParagraphInternalBreak(paragraph, allowPageBreaks);
  const cellStyle = isParagraphBold(paragraph) ? cellStyles.paragraphHeading : cellStyles.paragraph;
  const alignStyle = paragraph.align ? { textAlign: paragraph.align } : undefined;
  const indentStyle = paragraph.indentCm !== undefined ? { textIndent: paragraph.indentCm * CM_TO_PT } : undefined;
  if (isBilingual) {
    return (
      <View style={styles.row} wrap={wrap}>
        <Text style={[cellStyle, cellStyles.leftCell, alignStyle, indentStyle]}><FormattedRuns text={paragraph.uk} /></Text>
        <Text style={[cellStyle, cellStyles.rightCell, alignStyle, indentStyle]}><FormattedRuns text={paragraph.en} /></Text>
      </View>
    );
  }
  const text = paragraph[lang];
  return <Text style={[cellStyle, alignStyle, indentStyle]} wrap={wrap}><FormattedRuns text={text} /></Text>;
};

// The single-language 2-column layout (spec §4: newspaper-style, one language flowing across two
// columns) - unlike the bilingual layout, react-pdf has no native multi-column text flow, so the
// paragraphs are split once, up front, into two roughly equal (by character count) whole-paragraph
// groups, each stacked in its own column. That is an approximation of true reflow (a single very
// long paragraph can't itself be split across the columns), the same atomic-paragraph limit the
// bilingual layout already lives with.
const SingleLanguageColumns = ({ paragraphs, lang, cellStyles, allowPageBreaks, logoWidth, clinicLogos, charsPerLine }) => {
  const [leftParagraphs, rightParagraphs] = splitParagraphsIntoColumns(paragraphs, lang, charsPerLine);
  const renderColumn = columnParagraphs => columnParagraphs.map((paragraph, index) => (
    // eslint-disable-next-line react/no-array-index-key
    <View key={index} wrap>
      {paragraph.type && paragraph.type !== 'text' ? (
        // A mid-body logo token confined to a single (already half-width) column - both the
        // compact and long variants are sized to fit the column, not the full page.
        <LogoBlock type={paragraph.type} isBilingual={false} cellStyles={cellStyles} logoWidth={logoWidth} longLogoWidth={logoWidth} clinicLogos={clinicLogos} showUk showEn />
      ) : (
        <TextParagraph paragraph={paragraph} isBilingual={false} lang={lang} cellStyles={cellStyles} allowPageBreaks={allowPageBreaks} />
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

const DocumentTitleBlock = ({ doc, isBilingual, lang, cellStyles, titleGap }) => (
  <View style={{ marginBottom: titleGap }}>
    {isBilingual ? (
      <View style={styles.row}>
        <Text style={[cellStyles.title, cellStyles.leftCell]}><FormattedRuns text={doc.title.uk} /></Text>
        <Text style={[cellStyles.title, cellStyles.rightCell]}><FormattedRuns text={doc.title.en} /></Text>
      </View>
    ) : (
      <Text style={cellStyles.title}><FormattedRuns text={doc.title[lang]} /></Text>
    )}
  </View>
);

// Free-standing text between the letterhead logo and the title (spec §14: "ЗА МІСЦЕМ ВИМОГИ" etc.)
// - never merged into the paragraph list, so it always renders in this fixed position regardless of
// how the body is edited. `align`/`bold` (spec §17) are resolved per block, not inferred from text.
// `width` (spec batch 21 §8: the applicant/signatory data block is a *half-page-right* layout rule,
// not just right-aligned text) constrains the block to that percentage of its column's width, still
// pushed against whichever margin `align` names - a wide block wraps inside that strip instead of
// spanning the full page width the way plain text-align would.
const BeforeTitleBlock = ({ block, isBilingual, lang, cellStyles }) => {
  const runStyle = { textAlign: block.align, fontWeight: block.bold ? 700 : 400 };
  const widthStyle = { width: `${block.width}%` };
  const rowJustify = block.align === 'right' ? 'flex-end' : (block.align === 'center' ? 'center' : 'flex-start');
  if (isBilingual) {
    return (
      <View style={styles.row}>
        <View style={[cellStyles.leftCell, { flexDirection: 'row', justifyContent: rowJustify }]}>
          <Text style={[cellStyles.beforeTitle, widthStyle, runStyle]}><FormattedRuns text={block.uk} /></Text>
        </View>
        <View style={[cellStyles.rightCell, { flexDirection: 'row', justifyContent: rowJustify }]}>
          <Text style={[cellStyles.beforeTitle, widthStyle, runStyle]}><FormattedRuns text={block.en} /></Text>
        </View>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', justifyContent: rowJustify }}>
      <Text style={[cellStyles.beforeTitle, widthStyle, runStyle]}><FormattedRuns text={block[lang]} /></Text>
    </View>
  );
};

const BeforeTitleBlocks = ({ blocks, isBilingual, lang, cellStyles }) => (blocks || []).map((block, index) => (
  // eslint-disable-next-line react/no-array-index-key
  <BeforeTitleBlock key={index} block={block} isBilingual={isBilingual} lang={lang} cellStyles={cellStyles} />
));

// The bilingual and single-column (1-language) layouts: everything lives on one <Page> JSX
// element and react-pdf's own automatic wrap handles overflow onto further physical pages. The
// single-language 2-column layout does NOT use this - see SingleLanguagePages below.
const DocumentBlock = ({ doc, layout, cellStyles, titleGap, logoWidth, longLogoWidth, clinicLogos }) => {
  const isBilingual = isBilingualLayout(layout);
  const lang = getLayoutLang(layout);
  const showUk = isBilingual || lang === 'uk';
  const showEn = isBilingual || lang === 'en';
  const logoBlockProps = { isBilingual, cellStyles, logoWidth, longLogoWidth, clinicLogos, showUk, showEn };
  return (
    <View>
      {/* The template's letterhead logo (doc.logo) always renders before the title, whether it
          came from the dedicated `logo` field or a legacy leading paragraph - see
          getTemplateLogoType in documentsCatalogUtils. */}
      {doc.logo ? <LogoBlock type={doc.logo} {...logoBlockProps} /> : null}
      <BeforeTitleBlocks blocks={doc.beforeTitle} isBilingual={isBilingual} lang={lang} cellStyles={cellStyles} />
      <DocumentTitleBlock doc={doc} isBilingual={isBilingual} lang={lang} cellStyles={cellStyles} titleGap={titleGap} />
      {doc.paragraphs.map((paragraph, index) => {
        // Already drawn as doc.logo above - a legacy leading logo paragraph must not also render
        // a second time in its old body position.
        if (paragraph.type === 'logo-consumed') return null;
        return (
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
              />
            )}
          </View>
        );
      })}
    </View>
  );
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
const PageFooter = ({ formatting, marginBottom, marginLeft, marginRight }) => {
  if (!formatting.footerText && !formatting.showPageNumbers) return null;
  const smallSize = Math.max(7, formatting.fontSize - 2);
  return (
    <View fixed style={[styles.footerRow, { bottom: Math.max(6, marginBottom * 0.35), left: marginLeft, right: marginRight }]}>
      <Text style={{ fontSize: smallSize }}>{formatting.footerText || ''}</Text>
      {formatting.showPageNumbers ? (
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

// `documents` - output of buildGeneratedDocument (placeholders already filled, logo paragraphs
// tagged). Each document starts on its own page, like the separate statements in the reference
// file; templates with `allowPageBreaks` (the long agreement) are free to spill onto further
// pages - nothing here constrains a document to a single page.
const DocumentsPdfDocument = ({
  documents = [],
  layout = 'two-column',
  formatting = DEFAULT_DOC_FORMATTING,
  clinicLogos = [],
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

  const cellStyles = StyleSheet.create({
    title: {
      fontFamily: 'Tinos',
      fontWeight: 700,
      fontSize: formatting.titleFontSize,
      textAlign: 'center',
      lineHeight: formatting.lineSpacing,
    },
    paragraph: {
      fontFamily: 'Tinos',
      fontSize: formatting.fontSize,
      textAlign: 'justify',
      lineHeight: formatting.lineSpacing,
      textIndent: formatting.firstLineIndentCm * CM_TO_PT,
      marginBottom: formatting.paragraphSpacing,
    },
    paragraphHeading: {
      fontFamily: 'Tinos',
      fontWeight: 700,
      fontSize: formatting.fontSize,
      textAlign: 'left',
      lineHeight: formatting.lineSpacing,
      textIndent: 0,
      marginTop: formatting.paragraphSpacing,
      marginBottom: formatting.paragraphSpacing,
    },
    beforeTitle: {
      fontFamily: 'Tinos',
      fontSize: formatting.fontSize,
      lineHeight: formatting.lineSpacing,
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
  // other layout does (see splitParagraphsIntoPages for why): a flex row's two columns can't
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
    const bodyParagraphs = doc.paragraphs.filter(paragraph => paragraph.type !== 'logo-consumed');
    const pageContentHeightPt = A4_HEIGHT_PT - marginTop - marginBottom;
    const charsPerLine = estimateCharsPerLine({ columnWidthPt: columnContentWidth, fontSize: formatting.fontSize });
    const capacity = estimateColumnPageCapacity({
      columnWidthPt: columnContentWidth,
      pageContentHeightPt,
      fontSize: formatting.fontSize,
      lineSpacing: formatting.lineSpacing,
    });
    const pageGroups = splitParagraphsIntoPages(bodyParagraphs, lang, capacity, charsPerLine);
    return (
      <Page key={doc.id} size="A4" style={pageStyle}>
        <PageHeader formatting={formatting} marginTop={marginTop} marginLeft={marginLeft} marginRight={marginRight} />
        <PageDivider show={showColumnDivider} marginTop={marginTop} marginBottom={marginBottom} left={dividerLeft} />
        {pageGroups.map((pageParagraphs, pageIndex) => (
          // eslint-disable-next-line react/no-array-index-key
          <View key={pageIndex} break={pageIndex > 0}>
            {pageIndex === 0 ? (
              <>
                {doc.logo ? (
                  <LogoBlock type={doc.logo} isBilingual={false} cellStyles={cellStyles} logoWidth={logoWidth} longLogoWidth={contentWidth} clinicLogos={effectiveClinicLogos} showUk showEn />
                ) : null}
                <BeforeTitleBlocks blocks={doc.beforeTitle} isBilingual={false} lang={lang} cellStyles={cellStyles} />
                <DocumentTitleBlock doc={doc} isBilingual={false} lang={lang} cellStyles={cellStyles} titleGap={formatting.paragraphSpacing} />
              </>
            ) : null}
            <SingleLanguageColumns
              paragraphs={pageParagraphs}
              lang={lang}
              cellStyles={cellStyles}
              allowPageBreaks={doc.allowPageBreaks}
              logoWidth={logoWidth}
              clinicLogos={effectiveClinicLogos}
              charsPerLine={charsPerLine}
            />
          </View>
        ))}
        <PageFooter formatting={formatting} marginBottom={marginBottom} marginLeft={marginLeft} marginRight={marginRight} />
      </Page>
    );
  };

  const renderDocumentPage = (doc, effectiveLayout) => {
    const isTwoColumn = isBilingualLayout(effectiveLayout) || isSingleLanguageTwoColumnLayout(effectiveLayout);
    const showColumnDivider = isTwoColumn && Boolean(formatting.columnDivider);
    const logoWidth = isTwoColumn ? Math.min(configuredLogoWidth, columnContentWidth) : configuredLogoWidth;
    return (
      <Page key={doc.id} size="A4" style={pageStyle}>
        <PageHeader formatting={formatting} marginTop={marginTop} marginLeft={marginLeft} marginRight={marginRight} />
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
        <PageFooter formatting={formatting} marginBottom={marginBottom} marginLeft={marginLeft} marginRight={marginRight} />
      </Page>
    );
  };

  return (
    <Document>
      {documents.flatMap(doc => {
        const effectiveLayout = getEffectiveDocLayout(doc, layout);
        return isSingleLanguageTwoColumnLayout(effectiveLayout)
          ? renderSingleLanguagePages(doc, effectiveLayout)
          : [renderDocumentPage(doc, effectiveLayout)];
      })}
    </Document>
  );
};

export default DocumentsPdfDocument;
