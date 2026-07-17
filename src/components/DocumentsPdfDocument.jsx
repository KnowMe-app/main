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
import { DEFAULT_DOC_FORMATTING, allowsParagraphInternalBreak, getClinicLogo, isSectionHeading } from './documentsCatalogUtils';

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
    ],
  });
  // Legal names and passport numbers must never hyphenate mid-word.
  Font.registerHyphenationCallback(word => [word]);
};

// Word/PDF parity: the gap under the clinic logo is the one fixed metric shared with the DOCX
// builder (10 pt = 200 twips); everything else comes from the Format panel values.
export const LOGO_BOTTOM_GAP_PT = 10;

const A4_WIDTH_PT = 595.28;

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

// A logo block draws graphics, not text - it never goes through the title/paragraph text styles
// and never picks up the template's paragraphSpacing/indent (spec §5). `type` is 'logo' or
// 'logo-long'; used both for the template's letterhead logo (rendered before the title) and for
// any additional logo token still embedded mid-document.
const LogoBlock = ({ type, isTwoColumn, cellStyles, logoWidth, longLogoWidth, clinicLogos, showUk, showEn }) => {
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
  if (isTwoColumn) {
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

const TextParagraph = ({ paragraph, isTwoColumn, lang, cellStyles, allowPageBreaks }) => {
  const wrap = allowsParagraphInternalBreak(paragraph, allowPageBreaks);
  const ukHeading = isSectionHeading(paragraph.uk);
  const enHeading = isSectionHeading(paragraph.en);
  const cellStyle = heading => (heading ? cellStyles.paragraphHeading : cellStyles.paragraph);
  if (isTwoColumn) {
    return (
      <View style={styles.row} wrap={wrap}>
        <Text style={[cellStyle(ukHeading), cellStyles.leftCell]}>{paragraph.uk}</Text>
        <Text style={[cellStyle(enHeading), cellStyles.rightCell]}>{paragraph.en}</Text>
      </View>
    );
  }
  const text = paragraph[lang];
  const heading = lang === 'en' ? enHeading : ukHeading;
  return <Text style={cellStyle(heading)} wrap={wrap}>{text}</Text>;
};

const DocumentBlock = ({ doc, layout, cellStyles, titleGap, logoWidth, longLogoWidth, clinicLogos }) => {
  const isTwoColumn = layout === 'two-column';
  const lang = layout === 'one-column-en' ? 'en' : 'uk';
  const showUk = layout !== 'one-column-en';
  const showEn = layout !== 'one-column-uk';
  const logoBlockProps = { isTwoColumn, cellStyles, logoWidth, longLogoWidth, clinicLogos, showUk, showEn };
  return (
    <View>
      {/* The template's letterhead logo (doc.logo) always renders before the title, whether it
          came from the dedicated `logo` field or a legacy leading paragraph - see
          getTemplateLogoType in documentsCatalogUtils. */}
      {doc.logo ? <LogoBlock type={doc.logo} {...logoBlockProps} /> : null}
      <View style={{ marginBottom: titleGap }}>
        {isTwoColumn ? (
          <View style={styles.row}>
            <Text style={[cellStyles.title, cellStyles.leftCell]}>{doc.title.uk}</Text>
            <Text style={[cellStyles.title, cellStyles.rightCell]}>{doc.title.en}</Text>
          </View>
        ) : (
          <Text style={cellStyles.title}>{doc.title[lang]}</Text>
        )}
      </View>
      {doc.paragraphs.map((paragraph, index) => {
        // Already drawn as doc.logo above - a legacy leading logo paragraph must not also render
        // a second time in its old body position.
        if (paragraph.type === 'logo-consumed') return null;
        return (
          <View key={`p-${index}`} wrap>
            {paragraph.type !== 'text' ? (
              <LogoBlock type={paragraph.type} {...logoBlockProps} />
            ) : (
              <TextParagraph
                paragraph={paragraph}
                isTwoColumn={isTwoColumn}
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
  const hasHeader = Boolean(formatting.headerText);
  const hasFooter = Boolean(formatting.footerText) || formatting.showPageNumbers;
  const contentWidth = A4_WIDTH_PT - marginLeft - marginRight;
  const logoWidth = formatting.logoWidthMm * MM_TO_PT;
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
    leftCell: {
      flex: 1,
      marginRight: columnGap / 2,
    },
    rightCell: {
      flex: 1,
      marginLeft: columnGap / 2,
    },
  });

  return (
    <Document>
      {documents.map(doc => (
        <Page
          key={doc.id}
          size="A4"
          style={{
            paddingTop: marginTop,
            paddingBottom: marginBottom,
            paddingLeft: marginLeft,
            paddingRight: marginRight,
            fontFamily: 'Tinos',
            fontSize: formatting.fontSize,
          }}
        >
          {hasHeader ? (
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
          ) : null}
          <DocumentBlock
            doc={doc}
            layout={layout}
            cellStyles={cellStyles}
            titleGap={formatting.paragraphSpacing}
            logoWidth={logoWidth}
            longLogoWidth={contentWidth}
            clinicLogos={effectiveClinicLogos}
          />
          {hasFooter ? (
            <View
              fixed
              style={[styles.footerRow, {
                bottom: Math.max(6, marginBottom * 0.35),
                left: marginLeft,
                right: marginRight,
              }]}
            >
              <Text style={{ fontSize: Math.max(7, formatting.fontSize - 2) }}>{formatting.footerText || ''}</Text>
              {formatting.showPageNumbers ? (
                <Text
                  style={{ fontSize: Math.max(7, formatting.fontSize - 2) }}
                  // subPageNumber/subPageTotalPages count only the physical pages that came from
                  // THIS document's own <Page> element - each selected document gets its own 1-based
                  // count (never the combined total across every selected document), and nothing
                  // worth showing when this particular document fits on a single page.
                  render={({ subPageNumber, subPageTotalPages }) => (
                    subPageTotalPages > 1 ? `Page ${subPageNumber} of ${subPageTotalPages}` : ''
                  )}
                />
              ) : null}
            </View>
          ) : null}
        </Page>
      ))}
    </Document>
  );
};

export default DocumentsPdfDocument;
