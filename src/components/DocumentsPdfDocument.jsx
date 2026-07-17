// PDF renderer for the Documents page's generated legal statements. Unlike the branded UKRCOM
// exports (Invoice/Budget/...), these documents reproduce the look of the reference statements
// docx: Times-style serif (Tinos - metric-compatible with Times New Roman and
// covering the full Ukrainian alphabet + №), justified paragraphs, an optional clinic logo
// above the title (once, centered, in one-column mode; once per column in two-column mode),
// and either a single-language column or the uk|en two-column layout.
// Every metric (font sizes, margins, spacing, indent, header/footer) comes from the formatting
// settings the user tunes on the page - nothing visual is hardcoded beyond the defaults.
import React from 'react';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { DEFAULT_DOC_FORMATTING } from './documentsCatalogUtils';

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

// Word/PDF parity (spec §6): the gap under the clinic logo is the one fixed metric shared with
// the DOCX builder (10 pt = 200 twips); everything else comes from the Format panel values.
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

const DocumentBlock = ({ doc, layout, cellStyles, titleGap }) => {
  const isTwoColumn = layout === 'two-column';
  const lang = layout === 'one-column-en' ? 'en' : 'uk';
  return (
    <View>
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
      {doc.paragraphs.map((paragraph, index) => (isTwoColumn ? (
        <View key={`p-${index}`} style={styles.row} wrap={false}>
          <Text style={[cellStyles.paragraph, cellStyles.leftCell]}>{paragraph.uk}</Text>
          <Text style={[cellStyles.paragraph, cellStyles.rightCell]}>{paragraph.en}</Text>
        </View>
      ) : (
        <Text key={`p-${index}`} style={cellStyles.paragraph}>{paragraph[lang]}</Text>
      )))}
    </View>
  );
};

// `documents` - output of buildGeneratedDocument (placeholders already filled). Each document
// starts on its own page, like the separate statements in the reference file.
const DocumentsPdfDocument = ({
  documents = [],
  layout = 'two-column',
  formatting = DEFAULT_DOC_FORMATTING,
  logoDataUrl = null,
}) => {
  const marginTop = formatting.marginTopCm * CM_TO_PT;
  const marginBottom = formatting.marginBottomCm * CM_TO_PT;
  const marginLeft = formatting.marginLeftCm * CM_TO_PT;
  const marginRight = formatting.marginRightCm * CM_TO_PT;
  const columnGap = formatting.columnGapCm * CM_TO_PT;
  const hasHeader = Boolean(formatting.headerText);
  const hasFooter = Boolean(formatting.footerText) || formatting.showPageNumbers;
  const isTwoColumn = layout === 'two-column';
  // Batch 12 §2: two-column pages get the compact logo rendered twice, once above each column
  // (superseding the earlier single shared logo); one-column pages keep the long variant
  // stretched across the full text width.
  const contentWidth = A4_WIDTH_PT - marginLeft - marginRight;
  const logoWidth = isTwoColumn ? formatting.logoWidthMm * MM_TO_PT : contentWidth;

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
          {formatting.showLogo && logoDataUrl ? (
            isTwoColumn ? (
              <View style={[styles.row, { marginBottom: LOGO_BOTTOM_GAP_PT }]}>
                <View style={cellStyles.leftCell}>
                  <Image src={logoDataUrl} style={[styles.logo, { width: logoWidth }]} />
                </View>
                <View style={cellStyles.rightCell}>
                  <Image src={logoDataUrl} style={[styles.logo, { width: logoWidth }]} />
                </View>
              </View>
            ) : (
              <Image
                src={logoDataUrl}
                style={[styles.logo, {
                  width: logoWidth,
                  marginBottom: LOGO_BOTTOM_GAP_PT,
                }]}
              />
            )
          ) : null}
          <DocumentBlock doc={doc} layout={layout} cellStyles={cellStyles} titleGap={formatting.paragraphSpacing} />
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
                  // Batch 12 §3: nothing worth counting on a one-page export - shown only once the
                  // export actually runs to two or more pages, then on every page including the
                  // first (same rule as the branded PDFs' shared Footer in pdfTheme.js).
                  render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : '')}
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
