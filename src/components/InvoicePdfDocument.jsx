import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
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

const INK = '#33291f';
const MUTED = '#6f6359';
const ACCENT = '#7a4c2f';
const HEAD_BG = '#f3e6d2';
const TOTAL_BG = '#cfe0f5';

// The built-in Helvetica font only covers WinAnsi glyphs, so swap the few
// characters that would otherwise render blank.
const sanitizePdfText = value => String(value ?? '')
  .replace(/№/g, 'No.')
  .replace(/[’‘]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

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
  page: {
    paddingTop: 44,
    paddingBottom: 62,
    paddingHorizontal: 44,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: INK,
    backgroundColor: '#ffffff',
  },
  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 20,
    letterSpacing: -0.2,
    textAlign: 'center',
    marginBottom: 26,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 20,
    letterSpacing: -0.2,
    textAlign: 'center',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    color: MUTED,
    marginBottom: 20,
  },
  table: {
    borderWidth: 1,
    borderColor: '#111111',
    borderStyle: 'solid',
    marginBottom: 18,
  },
  row: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#111111',
    borderTopStyle: 'solid',
  },
  firstRow: {
    borderTopWidth: 0,
  },
  labelCell: {
    width: '38%',
    backgroundColor: HEAD_BG,
    borderRightWidth: 1,
    borderRightColor: '#111111',
    borderRightStyle: 'solid',
    paddingVertical: 6,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  labelText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
  },
  valueCell: {
    width: '62%',
    paddingVertical: 6,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 9.5,
    lineHeight: 1.4,
  },
  noteRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  noteMark: {
    width: 20,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: ACCENT,
  },
  noteText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.45,
  },
  expensesTable: {
    borderWidth: 1,
    borderColor: '#111111',
    borderStyle: 'solid',
    marginBottom: 4,
  },
  expensesHeadRow: {
    flexDirection: 'row',
    backgroundColor: HEAD_BG,
  },
  expensesRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#111111',
    borderTopStyle: 'solid',
  },
  expenseIndexCell: {
    width: 26,
    borderRightWidth: 1,
    borderRightColor: '#111111',
    borderRightStyle: 'solid',
    paddingVertical: 5,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expenseNameCell: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#111111',
    borderRightStyle: 'solid',
    paddingVertical: 5,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  expenseAmountCell: {
    width: 84,
    paddingVertical: 5,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  expenseHeadText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
  },
  expenseText: {
    fontSize: 9.5,
  },
  summaryRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#111111',
    borderStyle: 'solid',
    borderTopWidth: 0,
  },
  summaryLabelCell: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  summaryAmountCell: {
    width: 110,
    paddingVertical: 6,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'flex-end',
    borderLeftWidth: 1,
    borderLeftColor: '#111111',
    borderLeftStyle: 'solid',
  },
  summaryLabelText: {
    fontSize: 9.5,
  },
  summaryAmountText: {
    fontSize: 9.5,
  },
  totalAmountCell: {
    backgroundColor: TOTAL_BG,
  },
  totalAmountText: {
    fontFamily: 'Helvetica-Bold',
  },
  footer: {
    position: 'absolute',
    left: 44,
    right: 44,
    bottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerColumn: {
    maxWidth: 260,
  },
  footerText: {
    fontSize: 8,
    color: MUTED,
    lineHeight: 1.4,
  },
  footerPage: {
    position: 'absolute',
    right: 44,
    bottom: 24,
    fontSize: 8,
    color: MUTED,
  },
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
}) => {
  const rows = resolveInvoiceServiceRows(invoiceServices, catalogItemsById);
  const subtotal = computeInvoiceSubtotal(rows);
  const total = computeInvoiceTotal(subtotal, taxPercent);
  const payerName = buildPayerName(customers);
  const payerLocation = buildPayerLocation(customers);
  const caseTitle = buildCaseTitle(customers);
  const noteList = Array.isArray(notes) ? notes.filter(note => String(note || '').trim()) : [];

  return (
    <Document title={`Invoice ${invoiceNumber || ''}`} subject="Invoice" creator="UKRCOM">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>{sanitizePdfText(`INVOICE # ${invoiceNumber || ''}`)}</Text>

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
            <View style={styles.valueCell}><Text style={styles.valueText}>{formatEuroTotal(total)}</Text></View>
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
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.sectionSubtitle}>{sanitizePdfText(caseTitle)}</Text>

        <View style={styles.expensesTable}>
          <View style={styles.expensesHeadRow} wrap={false}>
            <View style={styles.expenseIndexCell}><Text style={styles.expenseHeadText}>#</Text></View>
            <View style={styles.expenseNameCell}><Text style={styles.expenseHeadText}>Expenses</Text></View>
            <View style={styles.expenseAmountCell}><Text style={styles.expenseHeadText}>EUR</Text></View>
          </View>
          {rows.map((row, index) => (
            <View key={row.key || index} style={styles.expensesRow} wrap={false}>
              <View style={styles.expenseIndexCell}><Text style={styles.expenseText}>{index + 1}</Text></View>
              <View style={styles.expenseNameCell}><Text style={styles.expenseText}>{sanitizePdfText(row.name)}</Text></View>
              <View style={styles.expenseAmountCell}><Text style={styles.expenseText}>{formatPlainAmount(row.price)}</Text></View>
            </View>
          ))}
        </View>

        <View style={styles.summaryRow} wrap={false}>
          <View style={styles.summaryLabelCell}><Text style={[styles.summaryLabelText, { fontFamily: 'Helvetica-Bold' }]}>Total:</Text></View>
          <View style={styles.summaryAmountCell}><Text style={[styles.summaryAmountText, { fontFamily: 'Helvetica-Bold' }]}>{formatEuroTotal(subtotal)}</Text></View>
        </View>

        <View style={{ marginTop: 16 }}>
          <View style={styles.summaryRow} wrap={false}>
            <View style={styles.summaryLabelCell}><Text style={styles.summaryLabelText}>Taxes (%)</Text></View>
            <View style={styles.summaryAmountCell}><Text style={styles.summaryAmountText}>{formatPlainAmount(taxPercent)}</Text></View>
          </View>
          <View style={styles.summaryRow} wrap={false}>
            <View style={styles.summaryLabelCell}><Text style={[styles.summaryLabelText, { fontFamily: 'Helvetica-Bold' }]}>Amount need to be paid (EUR)</Text></View>
            <View style={[styles.summaryAmountCell, styles.totalAmountCell]}><Text style={[styles.summaryAmountText, styles.totalAmountText]}>{formatEuroTotal(total)}</Text></View>
          </View>
        </View>

        {renderFooter('2/2')}
      </Page>
    </Document>
  );
};

export default InvoicePdfDocument;
