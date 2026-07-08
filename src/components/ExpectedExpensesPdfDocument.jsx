import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { PDF_COLOR, PDF_FONT, pdfBaseStyles, sanitizePdfText } from './pdfTheme';
import { buildCaseTitle } from './invoiceCatalogUtils';
import {
  computeExpectedExpenseAmountDue,
  computeExpectedExpenseSubtotal,
  resolveExpectedExpenseRows,
} from './expectedExpensesUtils';

const AGENCY_NAME = 'REPRODUCTIVE AGENCY "UKRCOM"';
const AGENCY_ADDRESS_LINE_1 = '31/16 Reitarska Str., 1st floor,';
const AGENCY_ADDRESS_LINE_2 = 'Kyiv, 01034, Ukraine';
const AGENCY_WEBSITE = 'Website: http://ukrcom.kyiv.ua/';
const AGENCY_EMAIL = 'E-mail: sm.kiev.ukr@gmail.com';
const AGENCY_TELEGRAM = 'Telegram: @Contact_Us_Kyiv';

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

const formatPlanDate = date => {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return safeDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
};

const styles = StyleSheet.create({
  page: pdfBaseStyles.page,
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
  },
  dateText: {
    fontSize: 9,
    textAlign: 'center',
    color: PDF_COLOR.muted,
    marginBottom: 20,
  },
  overviewTable: {
    borderWidth: 1,
    borderColor: PDF_COLOR.line,
    borderStyle: 'solid',
    borderRadius: 6,
    marginBottom: 4,
  },
  overviewHeadRow: {
    flexDirection: 'row',
    backgroundColor: PDF_COLOR.headBg,
  },
  overviewHeadCell: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  overviewHeadText: {
    fontFamily: PDF_FONT.bold,
    fontSize: 10,
    textAlign: 'center',
    color: '#4d3a26',
  },
  overviewRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.line,
    borderTopStyle: 'solid',
  },
  overviewRowAlt: {
    backgroundColor: PDF_COLOR.rowAlt,
  },
  overviewIndexCell: {
    width: 26,
    borderRightWidth: 1,
    borderRightColor: PDF_COLOR.line,
    borderRightStyle: 'solid',
    paddingVertical: 5,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overviewNameCell: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 9,
    justifyContent: 'center',
  },
  overviewIndexText: {
    fontSize: 8.5,
    color: PDF_COLOR.soft,
    fontFamily: PDF_FONT.bold,
  },
  overviewText: {
    fontSize: 9.5,
  },
  overviewTotalRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.line,
    borderTopStyle: 'solid',
    backgroundColor: PDF_COLOR.headBg,
  },
  overviewTotalLabelCell: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  overviewTotalLabelText: {
    fontFamily: PDF_FONT.bold,
    fontSize: 10,
  },
  overviewTotalAmountCell: {
    width: 100,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderLeftWidth: 1,
    borderLeftColor: PDF_COLOR.line,
    borderLeftStyle: 'solid',
  },
  overviewTotalAmountText: {
    fontFamily: PDF_FONT.bold,
    fontSize: 10,
  },
  scheduleHeading: {
    fontFamily: PDF_FONT.bold,
    fontSize: 11,
    marginTop: 18,
    marginBottom: 8,
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  scheduleRowCurrent: {
    backgroundColor: PDF_COLOR.headBg,
  },
  scheduleLabelText: {
    fontSize: 9.5,
  },
  scheduleLabelTextCurrent: {
    fontFamily: PDF_FONT.bold,
  },
  scheduleAmountText: {
    fontSize: 9.5,
  },
  expensesTable: {
    borderWidth: 1,
    borderColor: PDF_COLOR.line,
    borderStyle: 'solid',
    borderRadius: 6,
    marginTop: 16,
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
  expenseIndexCell: {
    width: 26,
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
  expenseDescription: {
    fontSize: 8,
    color: PDF_COLOR.muted,
    lineHeight: 1.4,
    marginTop: 1.5,
  },
  expensePriceText: {
    fontSize: 9.5,
  },
  summaryRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: PDF_COLOR.line,
    borderStyle: 'solid',
    borderTopWidth: 0,
  },
  summaryRowLast: {
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

const renderExpensesTable = (rows, { includeScheduledRow, scheduledAmount }) => {
  const allRows = includeScheduledRow
    ? [{ key: 'scheduled', name: 'Scheduled payment', price: scheduledAmount }, ...rows]
    : rows;
  return (
    <View style={styles.expensesTable}>
      <View style={styles.expensesHeadRow} wrap={false}>
        <View style={styles.expenseIndexCell}><Text style={styles.expenseHeadText}>#</Text></View>
        <View style={styles.expenseNameCell}><Text style={styles.expenseHeadText}>Expenses</Text></View>
        <View style={styles.expenseAmountCell}><Text style={styles.expenseHeadText}>EUR</Text></View>
      </View>
      {allRows.map((row, index) => (
        <View
          key={row.key || index}
          style={[styles.expensesRow, index % 2 ? styles.expensesRowAlt : null]}
          wrap={false}
        >
          <View style={styles.expenseIndexCell}><Text style={styles.expenseIndexText}>{index + 1}</Text></View>
          <View style={styles.expenseNameCell}>
            <Text style={styles.expenseText}>{sanitizePdfText(row.name)}</Text>
            {row.description ? <Text style={styles.expenseDescription}>{sanitizePdfText(row.description)}</Text> : null}
          </View>
          <View style={styles.expenseAmountCell}><Text style={styles.expensePriceText}>{formatPlainAmount(row.price)}</Text></View>
        </View>
      ))}
    </View>
  );
};

const ExpectedExpensesPdfDocument = ({ plan, customers, catalogItemsById, priceContext, planDate, schedule, taxPercent = 0 }) => {
  const caseTitle = buildCaseTitle(customers);
  const dateLabel = formatPlanDate(planDate instanceof Date ? planDate : new Date(planDate || Date.now()));
  const payments = Array.isArray(schedule?.payments) ? schedule.payments : [];

  return (
    <Document title={`Expected expenses - ${caseTitle}`} subject="Expected expenses" creator="UKRCOM">
      {payments.map((payment, index) => {
        const group = plan?.expectedExpenses?.[index] || [];
        const rows = resolveExpectedExpenseRows(group, catalogItemsById, priceContext);
        const subtotal = computeExpectedExpenseSubtotal(rows);
        const amountDue = computeExpectedExpenseAmountDue(subtotal, taxPercent);
        const pageLabel = `${index + 1}/${payments.length}`;

        return (
          <Page key={`${plan?.packageId || 'package'}-${index}`} size="A4" style={styles.page} wrap>
            <Text style={styles.sectionTitle}>{sanitizePdfText(`Expected expenses of the invoice #${index + 1}`)}</Text>
            <Text style={styles.sectionSubtitle}>{sanitizePdfText(`${index + 1}. ${payment?.title || `Payment ${index + 1}`}`)}</Text>
            <Text style={styles.dateText}>{dateLabel}</Text>

            {renderExpensesTable(rows, { includeScheduledRow: false })}

            <View style={[styles.summaryRow, styles.summaryRowLast]} wrap={false}>
              <View style={styles.summaryLabelCell}><Text style={[styles.summaryLabelText, { fontFamily: PDF_FONT.bold }]}>Total:</Text></View>
              <View style={styles.summaryAmountCell}><Text style={[styles.summaryAmountText, { fontFamily: PDF_FONT.bold }]}>{formatEuroTotal(subtotal)}</Text></View>
            </View>

            <View style={{ marginTop: 16 }}>
              <View style={styles.summaryRow} wrap={false}>
                <View style={styles.summaryLabelCell}><Text style={styles.summaryLabelText}>Taxes (%)</Text></View>
                <View style={styles.summaryAmountCell}><Text style={styles.summaryAmountText}>{formatPlainAmount(taxPercent)}</Text></View>
              </View>
              <View style={[styles.summaryRow, styles.summaryRowLast]} wrap={false}>
                <View style={styles.summaryLabelCell}><Text style={[styles.summaryLabelText, { fontFamily: PDF_FONT.bold }]}>Amount need to be paid (EUR)</Text></View>
                <View style={[styles.summaryAmountCell, styles.totalAmountCell]}><Text style={[styles.summaryAmountText, styles.totalAmountText]}>{formatEuroTotal(amountDue)}</Text></View>
              </View>
            </View>

            {renderFooter(pageLabel)}
          </Page>
        );
      })}
    </Document>
  );
};

export default ExpectedExpensesPdfDocument;
