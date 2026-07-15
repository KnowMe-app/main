// PDF renderer for the Documents page's generated legal statements. Unlike the branded UKRCOM
// exports (Invoice/Budget/...), these documents reproduce the look of the reference clinic docx
// (Kyogoku statements): Times-style serif (Tinos - metric-compatible with Times New Roman and
// covering the full Ukrainian alphabet + №), justified paragraphs, an optional clinic logo
// centered above the title, and either a single-language column or the uk|en two-column layout.
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
  titleWrap: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
  },
});

const DocumentBlock = ({ doc, layout, cellStyles }) => {
  const isTwoColumn = layout === 'two-column';
  const lang = layout === 'one-column-en' ? 'en' : 'uk';
  return (
    <View>
      <View style={styles.titleWrap}>
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
            <Image
              src={logoDataUrl}
              style={[styles.logo, {
                width: formatting.logoWidthMm * MM_TO_PT,
                marginBottom: 10,
              }]}
            />
          ) : null}
          <DocumentBlock doc={doc} layout={layout} cellStyles={cellStyles} />
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
                  render={({ pageNumber }) => `${pageNumber}`}
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
