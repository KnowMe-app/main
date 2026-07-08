import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { PDF_COLOR, PDF_FONT, pdfBaseStyles, sanitizePdfText } from './pdfTheme';
import {
  buildCaseTitle,
  buildPayerLocation,
  buildPayerName,
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  resolveInvoiceServiceRows,
} from './invoiceCatalogUtils';

const AGENCY_NAME = 'REPRODUCTIVE AGENCY "UKRCOM"';
const AGENCY_ADDRESS_LINE_1 = '31/16 Reitarska Str., 1st floor,';
const AGENCY_ADDRESS_LINE_2 = 'Kyiv, 01034, Ukraine';
const AGENCY_WEBSITE = 'Website: http://ukrcom.kyiv.ua/';
const AGENCY_EMAIL = 'E-mail: sm.kiev.ukr@gmail.com';
const AGENCY_TELEGRAM = 'Telegram: @Contact_Us_Kyiv';

// Row-level amounts show as plain numbers ("3000", "300"); only the
// tax-adjusted totals use the space-grouped, comma-decimal EUR format.
const formatPlainAmount = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace('.', ',');
};

const formatEuroTotal = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  const [whole, decimals] = amount.toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped},${decimals} EUR`;
};

const styles = StyleSheet.create({
  page: pdfBaseStyles.page,
  eyebrow: pdfBaseStyles.eyebrow,
  title: {
    ...pdfBaseStyles.docTitle,
    fontSize: 21,
    textAlign: 'center',
    marginBottom: 4,
  },
  titleRule: {
    alignSelf: 'center',
    width: 64,
    height: 2,
    borderRadius: 1,
    backgroundColor: PDF_COLOR.accent,
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: PDF_FONT.bold,
    fontSize: 19,
    letterSpacing: -0.2,
    textAlign: 'center',
    marginBottom: 4,
    color: PDF_COLOR.ink,
  },
  sectionSubtitle: {
    fontSize: 10.5,
    fontFamily: PDF_FONT.bold,
    textAlign: 'center',
    color: PDF_COLOR.soft,
    marginBottom: 22,
  },
  table: {
    borderWidth: 1,
    borderColor: PDF_COLOR.line,
    borderStyle: 'solid',
    borderRadius: 6,
    marginBottom: 18,
  },
  row: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.line,
    borderTopStyle: 'solid',
  },
  firstRow: {
    borderTopWidth: 0,
  },
  labelCell: {
    width: '38%',
    backgroundColor: PDF_COLOR.headBg,
    borderRightWidth: 1,
    borderRightColor: PDF_COLOR.line,
    borderRightStyle: 'solid',
    paddingVertical: 7,
    paddingHorizontal: 9,
    justifyContent: 'center',
  },
  labelText: {
    fontFamily: PDF_FONT.bold,
    fontSize: 9.5,
    color: '#4d3a26',
  },
  valueCell: {
    width: '62%',
    paddingVertical: 7,
    paddingHorizontal: 9,
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 9.5,
    lineHeight: 1.4,
  },
  totalValueText: {
    fontFamily: PDF_FONT.bold,
    fontSize: 11,
    color: PDF_COLOR.accent,
  },
  noteRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  noteMark: {
    width: 20,
    fontSize: 9,
    fontFamily: PDF_FONT.bold,
    color: PDF_COLOR.accent,
  },
  noteText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.45,
    color: PDF_COLOR.muted,
  },
  expensesTable: {
    borderWidth: 1,
    borderColor: PDF_COLOR.line,
    borderStyle: 'solid',
    borderRadius: 6,
    marginBottom: 4,
  },
  expensesHeadRow: {
    flexDirection: 'row',
    backgroundColor: PDF_COLOR.headBg,
  },
  expensesRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.line,
    borderTopStyle: 'solid',
  },
  expensesRowAlt: {
    backgroundColor: PDF_COLOR.rowAlt,
  },
  packageHeadRow: {
    backgroundColor: PDF_COLOR.headBg,
  },
  expenseIndexCell: {
    width: 30,
    borderRightWidth: 1,
    borderRightColor: PDF_COLOR.line,
    borderRightStyle: 'solid',
    paddingVertical: 6,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expenseNameCell: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: PDF_COLOR.line,
    borderRightStyle: 'solid',
    paddingVertical: 6,
    paddingHorizontal: 9,
    justifyContent: 'center',
  },
  expenseNameCellChild: {
    paddingLeft: 20,
  },
  expenseAmountCell: {
    width: 88,
    paddingVertical: 6,
    paddingHorizontal: 9,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  expenseHeadText: {
    fontFamily: PDF_FONT.bold,
    fontSize: 9.5,
    color: '#4d3a26',
  },
  expenseIndexText: {
    fontSize: 8.5,
    color: PDF_COLOR.soft,
    fontFamily: PDF_FONT.bold,
  },
  expenseText: {
    fontSize: 9.5,
  },
  expenseTextChild: {
    fontSize: 9,
    color: PDF_COLOR.ink,
  },
  expenseTextPackage: {
    fontFamily: PDF_FONT.bold,
    fontSize: 10,
  },
  expenseDescription: {
    fontSize: 8,
    color: PDF_COLOR.muted,
    lineHeight: 1.4,
    marginTop: 1.5,
  },
  expensePriceText: {
    fontSize: 9.5,
  },
  expensePriceTextChild: {
    fontSize: 9,
    color: PDF_COLOR.muted,
  },
  expensePriceTextPackage: {
    fontFamily: PDF_FONT.bold,
    fontSize: 10,
    color: PDF_COLOR.accent,
  },
  summaryRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: PDF_COLOR.line,
    borderStyle: 'solid',
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  summaryLabelCell: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 9,
    justifyContent: 'center',
  },
  summaryAmountCell: {
    width: 118,
    paddingVertical: 7,
    paddingHorizontal: 9,
    justifyContent: 'center',
    alignItems: 'flex-end',
    borderLeftWidth: 1,
    borderLeftColor: PDF_COLOR.line,
    borderLeftStyle: 'solid',
  },
  summaryLabelText: {
    fontSize: 9.5,
  },
  summaryAmountText: {
    fontSize: 9.5,
  },
  totalAmountCell: {
    backgroundColor: PDF_COLOR.totalBg,
  },
  totalAmountText: {
    fontFamily: PDF_FONT.bold,
  },
  footer: pdfBaseStyles.footer,
  footerColumn: pdfBaseStyles.footerColumn,
  footerText: pdfBaseStyles.footerText,
  footerPage: pdfBaseStyles.footerPage,
});

const renderFooter = pageLabel => (
  <View style={styles.footer} fixed>
    <View style={styles.footerColumn}>
      <Text style={styles.footerText}>{sanitizePdfText(AGENCY_NAME)}</Text>
      <Text style={styles.footerText}>{sanitizePdfText(AGENCY_ADDRESS_LINE_1)}</Text>
      <Text style={styles.footerText}>{sanitizePdfText(AGENCY_ADDRESS_LINE_2)}</Text>
    </View>
    <View style={styles.footerColumn}>
      <Text style={[styles.footerText, { textAlign: 'right' }]}>{sanitizePdfText(AGENCY_WEBSITE)}</Text>
      <Text style={[styles.footerText, { textAlign: 'right' }]}>{sanitizePdfText(AGENCY_EMAIL)}</Text>
      <Text style={[styles.footerText, { textAlign: 'right' }]}>{sanitizePdfText(AGENCY_TELEGRAM)}</Text>
    </View>
    <Text style={styles.footerPage}>{pageLabel}</Text>
  </View>
);

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
        <Text style={styles.eyebrow}>{sanitizePdfText(AGENCY_NAME)}</Text>
        <Text style={styles.title}>{sanitizePdfText(`INVOICE No. ${invoiceNumber || ''}`)}</Text>
        <View style={styles.titleRule} />

        <View style={styles.table}>
          <View style={[styles.row, styles.firstRow]} wrap={false}>
            <View style={styles.labelCell}><Text style={styles.labelText}>Beneficiary:</Text></View>
            <View style={styles.valueCell}>
              <Text style={styles.valueText}>
                {sanitizePdfText(`${beneficiary?.title || ''}, ${beneficiary?.address || ''}`)}
              </Text>
            </View>
          </View>
          <View style={styles.row} wrap={false}>
            <View style={styles.labelCell}><Text style={styles.labelText}>International bank account number</Text></View>
            <View style={styles.valueCell}><Text style={styles.valueText}>{sanitizePdfText(beneficiary?.iban)}</Text></View>
          </View>
          <View style={styles.row} wrap={false}>
            <View style={styles.labelCell}><Text style={styles.labelText}>Name of the bank</Text></View>
            <View style={styles.valueCell}><Text style={styles.valueText}>{sanitizePdfText(beneficiary?.bankName)}</Text></View>
          </View>
          <View style={styles.row} wrap={false}>
            <View style={styles.labelCell}><Text style={styles.labelText}>Bank SWIFT Code</Text></View>
            <View style={styles.valueCell}><Text style={styles.valueText}>{sanitizePdfText(beneficiary?.swiftCode)}</Text></View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.row, styles.firstRow]} wrap={false}>
            <View style={styles.labelCell}><Text style={styles.labelText}>Payer:</Text></View>
            <View style={styles.valueCell}><Text style={styles.valueText}>{sanitizePdfText(payerName)}</Text></View>
          </View>
          <View style={styles.row} wrap={false}>
            <View style={styles.labelCell}><Text style={styles.labelText}>Location:</Text></View>
            <View style={styles.valueCell}><Text style={styles.valueText}>{sanitizePdfText(payerLocation)}</Text></View>
          </View>
          <View style={styles.row} wrap={false}>
            <View style={styles.labelCell}><Text style={styles.labelText}>Purpose of the payment:</Text></View>
            <View style={styles.valueCell}><Text style={styles.valueText}>{sanitizePdfText(purposeOfPayment)}</Text></View>
          </View>
          <View style={styles.row} wrap={false}>
            <View style={styles.labelCell}><Text style={styles.labelText}>Total:</Text></View>
            <View style={styles.valueCell}><Text style={styles.totalValueText}>{formatEuroTotal(total)}</Text></View>
          </View>
        </View>

        {noteList.map((note, index) => (
          <View key={`note-${index}`} style={styles.noteRow}>
            <Text style={styles.noteMark}>{'*'.repeat(index + 1)}</Text>
            <Text style={styles.noteText}>{sanitizePdfText(note)}</Text>
          </View>
        ))}

        {renderFooter('1/2')}
      </Page>

      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.eyebrow}>{sanitizePdfText(AGENCY_NAME)}</Text>
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.sectionSubtitle}>{sanitizePdfText(caseTitle)}</Text>

        <View style={styles.expensesTable}>
          <View style={styles.expensesHeadRow} wrap={false}>
            <View style={styles.expenseIndexCell}><Text style={styles.expenseHeadText}>#</Text></View>
            <View style={styles.expenseNameCell}><Text style={styles.expenseHeadText}>Expenses</Text></View>
            <View style={styles.expenseAmountCell}><Text style={styles.expenseHeadText}>EUR</Text></View>
          </View>
          {displayRows.map((row, rowIndex) => {
            const isChild = row.depth > 0;
            const isPackageHeader = row.kind === 'package';
            return (
              <View
                key={`${row.key || rowIndex}-${row.number}`}
                style={[
                  styles.expensesRow,
                  isPackageHeader ? styles.packageHeadRow : null,
                  !isPackageHeader && rowIndex % 2 ? styles.expensesRowAlt : null,
                ]}
                wrap={false}
              >
                <View style={styles.expenseIndexCell}><Text style={styles.expenseIndexText}>{row.number}</Text></View>
                <View style={[styles.expenseNameCell, isChild ? styles.expenseNameCellChild : null]}>
                  <Text style={isPackageHeader ? styles.expenseTextPackage : (isChild ? styles.expenseTextChild : styles.expenseText)}>
                    {sanitizePdfText(row.name)}
                  </Text>
                  {row.description ? <Text style={styles.expenseDescription}>{sanitizePdfText(row.description)}</Text> : null}
                </View>
                <View style={styles.expenseAmountCell}>
                  <Text style={isPackageHeader ? styles.expensePriceTextPackage : (isChild ? styles.expensePriceTextChild : styles.expensePriceText)}>
                    {formatPlainAmount(row.price)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.summaryRow} wrap={false}>
          <View style={styles.summaryLabelCell}><Text style={[styles.summaryLabelText, { fontFamily: PDF_FONT.bold }]}>Total:</Text></View>
          <View style={styles.summaryAmountCell}><Text style={[styles.summaryAmountText, { fontFamily: PDF_FONT.bold }]}>{formatEuroTotal(subtotal)}</Text></View>
        </View>

        <View style={{ marginTop: 16 }}>
          <View style={styles.summaryRow} wrap={false}>
            <View style={styles.summaryLabelCell}><Text style={styles.summaryLabelText}>Taxes (%)</Text></View>
            <View style={styles.summaryAmountCell}><Text style={styles.summaryAmountText}>{formatPlainAmount(taxPercent)}</Text></View>
          </View>
          <View style={styles.summaryRow} wrap={false}>
            <View style={styles.summaryLabelCell}><Text style={[styles.summaryLabelText, { fontFamily: PDF_FONT.bold }]}>Amount need to be paid (EUR)</Text></View>
            <View style={[styles.summaryAmountCell, styles.totalAmountCell]}><Text style={[styles.summaryAmountText, styles.totalAmountText]}>{formatEuroTotal(total)}</Text></View>
          </View>
        </View>

        {renderFooter('2/2')}
      </Page>
    </Document>
  );
};

export default InvoicePdfDocument;
