import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  BrandRow, BrandRule, BronzeMotif, ContinuedTag, Footer, PDF_COLOR, PDF_FONT,
  ensurePdfFontsRegistered, formatDisplayDate, pdfBaseStyles, sanitizePdfText, TitleBlock,
} from './pdfTheme';
import { formatMoney } from './budgetCatalogUtils';
import {
  buildCaseTitle,
  buildPayerLocation,
  buildPayerName,
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  resolveInvoiceDocType,
  resolveInvoiceServiceRows,
} from './invoiceCatalogUtils';

ensurePdfFontsRegistered();

// Type A vs Type B from the spec's document-type taxonomy - the eyebrow/running-header label
// depends on what's actually billed (see resolveInvoiceDocType), never a single hardcoded template.
const DOC_LABEL_BY_TYPE = {
  programme_milestone: 'Programme Milestone Invoice',
  service: 'Service Invoice',
};
const EYEBROW_BY_TYPE = {
  programme_milestone: 'Programme milestone invoice',
  service: 'Service invoice',
};

// A row may carry a free-text price label (e.g. "GIFT") instead of a euro amount.
const formatRowAmount = row => row?.priceLabel || formatMoney(row?.price);

const styles = StyleSheet.create({
  page: pdfBaseStyles.page,
  section: {
    marginTop: 26,
  },
  sectionTitle: pdfBaseStyles.sectionTitle,
  table: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.docLine,
    borderTopStyle: 'solid',
    paddingVertical: 8,
  },
  firstRow: {
    borderTopWidth: 0,
  },
  packageRow: {
    backgroundColor: PDF_COLOR.card,
    borderRadius: 5,
    paddingHorizontal: 8,
    marginBottom: 1,
  },
  indexCell: {
    width: 26,
  },
  indexText: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8.5,
    color: PDF_COLOR.bronze,
  },
  nameCell: {
    flex: 1,
    paddingRight: 10,
  },
  nameCellChild: {
    paddingLeft: 14,
  },
  nameText: {
    fontFamily: PDF_FONT.body,
    fontSize: 9.5,
    color: PDF_COLOR.docInk,
  },
  nameTextPackage: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 10.5,
    color: PDF_COLOR.docInk,
  },
  nameTextChild: {
    fontFamily: PDF_FONT.body,
    fontSize: 9,
    color: PDF_COLOR.inkSoft,
  },
  descriptionText: {
    fontFamily: PDF_FONT.body,
    fontSize: 8,
    color: PDF_COLOR.inkSoft,
    lineHeight: 1.4,
    marginTop: 2,
  },
  itemNote: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 7,
    letterSpacing: 0.6,
    color: PDF_COLOR.bronze,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  priceCell: {
    width: 96,
    textAlign: 'right',
  },
  priceText: {
    fontFamily: PDF_FONT.body,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 9.5,
    color: PDF_COLOR.docInk,
  },
  priceTextPackage: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 10.5,
    color: PDF_COLOR.bronzeDeep,
  },
  priceTextChild: {
    fontFamily: PDF_FONT.body,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 9,
    color: PDF_COLOR.inkSoft,
  },
  noteRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  noteMark: {
    width: 16,
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8.5,
    color: PDF_COLOR.bronze,
  },
  noteText: {
    flex: 1,
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    lineHeight: 1.45,
    color: PDF_COLOR.inkSoft,
  },
});

// Flattens resolved rows into a display list: a package becomes its own bold header row
// ("2.") followed by its children indented underneath ("2.1", "2.2", ...).
const buildDisplayRows = rows => {
  const display = [];
  rows.forEach((row, index) => {
    const number = String(index + 1);
    display.push({ ...row, number, depth: 0 });
    if (row.kind === 'package') {
      (row.children || []).forEach((child, childIndex) => {
        display.push({ ...child, number: `${number}.${childIndex + 1}`, depth: 1 });
      });
    }
  });
  return display;
};

const InvoicePdfDocument = ({
  customers,
  invoiceServices,
  catalogItemsById,
  notes,
  taxPercent,
  invoiceNumber,
  invoiceDisplayDate,
  priceContext,
  invoiceType,
}) => {
  const rows = resolveInvoiceServiceRows(invoiceServices, catalogItemsById, priceContext);
  const displayRows = buildDisplayRows(rows);
  const subtotal = computeInvoiceSubtotal(rows);
  const total = computeInvoiceTotal(subtotal, taxPercent);
  const payerName = buildPayerName(customers);
  const payerLocation = buildPayerLocation(customers);
  const caseTitle = buildCaseTitle(customers);
  const noteList = Array.isArray(notes) ? notes.filter(note => String(note || '').trim()) : [];
  const docType = invoiceType === 'service' || invoiceType === 'programme_milestone'
    ? invoiceType
    : resolveInvoiceDocType(rows);
  const docLabel = DOC_LABEL_BY_TYPE[docType];
  const eyebrow = EYEBROW_BY_TYPE[docType];
  // The DD.MM.YYYY `invoiceDate` string (invoiceCatalogUtils.generateInvoiceIdentifiers) is the
  // legal-text date used inside the payment-purpose placeholder only - the human-readable date
  // shown here always uses the one shared display format (spec §4), never that dotted form or the
  // invoice number's own slash format.
  const dateLabel = formatDisplayDate(invoiceDisplayDate);

  return (
    <Document title={`Invoice ${invoiceNumber || ''}`} subject="Invoice" creator="UKRCOM">
      <Page size="A4" style={styles.page} wrap>
        <BronzeMotif />
        <ContinuedTag label={docLabel} />
        <BrandRow metaLines={[`Invoice No. ${invoiceNumber || ''}`, dateLabel, caseTitle]} />
        <BrandRule />
        <TitleBlock
          eyebrow={eyebrow}
          title={`Invoice No. ${invoiceNumber || ''}`}
          subtitle={`Prepared exclusively for ${payerName}${payerLocation ? ` · ${payerLocation}` : ''}.`}
        />

        <View style={styles.section}>
          <View style={styles.table}>
            {displayRows.map((row, rowIndex) => {
              const isChild = row.depth > 0;
              const isPackageHeader = row.kind === 'package';
              return (
                <View
                  key={`${row.key || rowIndex}-${row.number}`}
                  style={[
                    isPackageHeader ? styles.packageRow : styles.row,
                    !isPackageHeader && !isChild && rowIndex === 0 ? styles.firstRow : null,
                  ]}
                  wrap={false}
                >
                  <View style={styles.indexCell}>
                    <Text style={styles.indexText}>{row.number}</Text>
                  </View>
                  <View style={[styles.nameCell, isChild ? styles.nameCellChild : null]}>
                    <Text style={isPackageHeader ? styles.nameTextPackage : (isChild ? styles.nameTextChild : styles.nameText)}>
                      {sanitizePdfText(row.name)}
                    </Text>
                    {row.description ? <Text style={styles.descriptionText}>{sanitizePdfText(row.description)}</Text> : null}
                    {row.isCustomized ? <Text style={styles.itemNote}>Confirmed for this case</Text> : null}
                  </View>
                  <View style={styles.priceCell}>
                    <Text style={isPackageHeader ? styles.priceTextPackage : (isChild ? styles.priceTextChild : styles.priceText)}>
                      {formatRowAmount(row)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {noteList.map((note, index) => (
            <View key={`note-${index}`} style={styles.noteRow}>
              <Text style={styles.noteMark}>{'*'.repeat(index + 1)}</Text>
              <Text style={styles.noteText}>{sanitizePdfText(note)}</Text>
            </View>
          ))}

          <View style={pdfBaseStyles.totalCard}>
            <Text style={pdfBaseStyles.totalCardLabel}>Amount due</Text>
            <Text style={pdfBaseStyles.totalCardAmount}>{formatMoney(total)}</Text>
            <View style={pdfBaseStyles.totalCardRule} />
            <View style={pdfBaseStyles.totalCardRow}>
              <Text style={pdfBaseStyles.totalCardRowLabel}>Subtotal</Text>
              <Text style={pdfBaseStyles.totalCardRowValue}>{formatMoney(subtotal)}</Text>
            </View>
            <View style={pdfBaseStyles.totalCardRow}>
              <Text style={pdfBaseStyles.totalCardRowLabel}>Tax</Text>
              <Text style={pdfBaseStyles.totalCardRowValue}>{`${sanitizePdfText(String(taxPercent ?? 0))}%`}</Text>
            </View>
          </View>
        </View>

        <Footer variant="branded" />
      </Page>
    </Document>
  );
};

export default InvoicePdfDocument;
