import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  BrandRow, BrandRule, BronzeMotif, ContinuedTag, Footer, PDF_COLOR, PDF_FONT,
  ensurePdfFontsRegistered, pdfBaseStyles, sanitizePdfText, TitleBlock,
} from './pdfTheme';
import {
  buildCaseTitle,
  buildPayerLocation,
  buildPayerName,
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  resolveInvoiceServiceRows,
} from './invoiceCatalogUtils';

ensurePdfFontsRegistered();

const DOC_LABEL = 'Programme Milestone Invoice';

// No copies past the decimal for round or four-figure sums; two decimals only when the
// amount genuinely carries cents (spec §1.8).
const formatMoney = (value, currency = 'EUR') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  const rounded = Math.round(amount * 100) / 100;
  const isInteger = Number.isInteger(rounded);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: isInteger ? 0 : 2,
    maximumFractionDigits: isInteger ? 0 : 2,
  }).format(rounded);
  return `${formatted} ${currency}`;
};

// A row may carry a free-text price label (e.g. "GIFT") instead of a euro amount.
const formatRowAmount = row => row?.priceLabel || formatMoney(row?.price);

const styles = StyleSheet.create({
  page: pdfBaseStyles.page,
  section: {
    marginTop: 26,
  },
  sectionTitle: pdfBaseStyles.sectionTitle,
  sectionNote: pdfBaseStyles.sectionNote,
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
  paymentCard: {
    backgroundColor: PDF_COLOR.neutralBg,
    borderWidth: 1,
    borderColor: PDF_COLOR.neutralLine,
    borderStyle: 'solid',
    borderRadius: 8,
    padding: 14,
  },
  paymentCardTitle: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 7.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: PDF_COLOR.neutralSoft,
    marginBottom: 8,
  },
  paymentRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.neutralLine,
    borderTopStyle: 'solid',
    paddingVertical: 6,
  },
  paymentRowFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  paymentLabelCell: {
    width: '32%',
  },
  paymentLabelText: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8.5,
    color: PDF_COLOR.neutralInk,
  },
  paymentValueCell: {
    flex: 1,
  },
  paymentValueText: {
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    lineHeight: 1.4,
    color: PDF_COLOR.neutralInk,
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
  beneficiary,
  customers,
  invoiceServices,
  catalogItemsById,
  notes,
  taxPercent,
  invoiceNumber,
  invoiceDate,
  purposeOfPayment,
  priceContext,
}) => {
  const rows = resolveInvoiceServiceRows(invoiceServices, catalogItemsById, priceContext);
  const displayRows = buildDisplayRows(rows);
  const subtotal = computeInvoiceSubtotal(rows);
  const total = computeInvoiceTotal(subtotal, taxPercent);
  const payerName = buildPayerName(customers);
  const payerLocation = buildPayerLocation(customers);
  const caseTitle = buildCaseTitle(customers);
  const noteList = Array.isArray(notes) ? notes.filter(note => String(note || '').trim()) : [];

  return (
    <Document title={`Invoice ${invoiceNumber || ''}`} subject="Invoice" creator="UKRCOM">
      <Page size="A4" style={styles.page} wrap>
        <BronzeMotif />
        <ContinuedTag label={DOC_LABEL} />
        <BrandRow metaLines={[`Invoice No. ${invoiceNumber || ''}`, invoiceDate, caseTitle]} />
        <BrandRule />
        <TitleBlock
          eyebrow="Programme milestone invoice"
          title={`Invoice No. ${invoiceNumber || ''}`}
          subtitle={`Prepared for ${payerName}${payerLocation ? ` · ${payerLocation}` : ''}.`}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Breakdown</Text>
          <Text style={styles.sectionNote}>{caseTitle}</Text>
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

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Payment details</Text>
          <View style={styles.paymentCard}>
            <Text style={styles.paymentCardTitle}>Beneficiary details</Text>
            <View style={[styles.paymentRow, styles.paymentRowFirst]}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>Beneficiary</Text></View>
              <View style={styles.paymentValueCell}>
                <Text style={styles.paymentValueText}>
                  {sanitizePdfText(`${beneficiary?.title || ''}, ${beneficiary?.address || ''}`)}
                </Text>
              </View>
            </View>
            <View style={styles.paymentRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>IBAN</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.paymentValueText}>{sanitizePdfText(beneficiary?.iban)}</Text></View>
            </View>
            <View style={styles.paymentRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>Bank</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.paymentValueText}>{sanitizePdfText(beneficiary?.bankName)}</Text></View>
            </View>
            <View style={styles.paymentRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>SWIFT/BIC</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.paymentValueText}>{sanitizePdfText(beneficiary?.swiftCode)}</Text></View>
            </View>
            <View style={styles.paymentRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>Payer</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.paymentValueText}>{sanitizePdfText(payerName)}</Text></View>
            </View>
            <View style={styles.paymentRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>Location</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.paymentValueText}>{sanitizePdfText(payerLocation)}</Text></View>
            </View>
            <View style={styles.paymentRow}>
              <View style={styles.paymentLabelCell}><Text style={styles.paymentLabelText}>Purpose of payment</Text></View>
              <View style={styles.paymentValueCell}><Text style={styles.paymentValueText}>{sanitizePdfText(purposeOfPayment)}</Text></View>
            </View>
          </View>
        </View>

        <Footer />
      </Page>
    </Document>
  );
};

export default InvoicePdfDocument;
