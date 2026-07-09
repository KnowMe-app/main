import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  BrandRow, BrandRule, BronzeMotif, DocSeries, Footer, PDF_COLOR, PDF_FONT,
  ensurePdfFontsRegistered, pdfBaseStyles, sanitizePdfText, TitleBlock,
} from './pdfTheme';
import { buildCaseTitle } from './invoiceCatalogUtils';
import {
  computeMilestoneSubtotal,
  resolveMilestoneServiceRows,
} from './expectedExpensesUtils';

ensurePdfFontsRegistered();

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

const formatRowAmount = row => row?.priceLabel || formatMoney(row?.price);

const formatPlanDate = date => {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return safeDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const styles = StyleSheet.create({
  page: pdfBaseStyles.page,
  dateText: {
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    color: PDF_COLOR.inkSoft,
    marginBottom: 4,
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: pdfBaseStyles.sectionTitle,
  sectionNote: pdfBaseStyles.sectionNote,
  contextNote: {
    fontFamily: PDF_FONT.body,
    fontSize: 9,
    color: PDF_COLOR.inkSoft,
    marginBottom: 4,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.docLine,
    borderTopStyle: 'solid',
    paddingVertical: 8,
  },
  expenseRowFirst: {
    borderTopWidth: 0,
  },
  expenseIndexCell: {
    width: 22,
  },
  expenseIndexText: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8.5,
    color: PDF_COLOR.bronze,
  },
  expenseNameCell: {
    flex: 1,
    paddingRight: 10,
  },
  expenseNameText: {
    fontFamily: PDF_FONT.body,
    fontSize: 9.5,
    color: PDF_COLOR.docInk,
  },
  expenseDescription: {
    fontFamily: PDF_FONT.body,
    fontSize: 8,
    color: PDF_COLOR.inkSoft,
    lineHeight: 1.4,
    marginTop: 2,
  },
  expensePriceCell: {
    width: 96,
    textAlign: 'right',
  },
  expensePriceText: {
    fontFamily: PDF_FONT.body,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 9.5,
    color: PDF_COLOR.docInk,
  },
  refundNote: {
    fontFamily: PDF_FONT.body,
    fontSize: 8,
    lineHeight: 1.45,
    color: PDF_COLOR.inkSoft,
    marginTop: 10,
  },
});

const renderExpensesRows = rows => (
  <View>
    {rows.map((row, index) => (
      <View
        key={row.key || index}
        style={[styles.expenseRow, index === 0 ? styles.expenseRowFirst : null]}
        wrap={false}
      >
        <View style={styles.expenseIndexCell}><Text style={styles.expenseIndexText}>{index + 1}</Text></View>
        <View style={styles.expenseNameCell}>
          <Text style={styles.expenseNameText}>{sanitizePdfText(row.name)}</Text>
          {row.description ? <Text style={styles.expenseDescription}>{sanitizePdfText(row.description)}</Text> : null}
        </View>
        <View style={styles.expensePriceCell}><Text style={styles.expensePriceText}>{formatRowAmount(row)}</Text></View>
      </View>
    ))}
  </View>
);

// Each milestone gets its own compact page: this payment's line items, the estimated total, and a
// one-line pointer back to the Budget document - never the full programme overview or payment
// schedule (those already live in the Budget PDF; repeating them here on every one of the plan's
// milestones was the source of a bloated, near-duplicate document).
const ExpectedExpensesPdfDocument = ({ plan, customers, catalogItemsById, priceContext, planDate }) => {
  const caseTitle = buildCaseTitle(customers);
  const dateLabel = formatPlanDate(planDate instanceof Date ? planDate : new Date(planDate || Date.now()));
  const programmeName = plan?.packageSnapshot?.name || 'Programme';
  const milestones = Array.isArray(plan?.milestones) ? plan.milestones : [];

  return (
    <Document title={`Expected expenses - ${caseTitle}`} subject="Expected expenses" creator="UKRCOM">
      {milestones.map((milestone, index) => {
        const serviceRows = resolveMilestoneServiceRows(milestone, catalogItemsById, priceContext);
        const subtotal = computeMilestoneSubtotal(serviceRows);

        return (
          <Page key={`${plan?.packageId || 'package'}-${index}`} size="A4" style={styles.page} wrap>
            <BronzeMotif />
            <DocSeries label="Expected Expenses" optional />
            <BrandRow metaLines={[`Invoice #${index + 1}`, dateLabel, caseTitle]} />
            <BrandRule />
            <TitleBlock
              eyebrow="Expected expenses"
              title={`Expected expenses of the invoice #${index + 1}`}
              subtitle={milestone.title}
            />
            <Text style={styles.contextNote}>
              {sanitizePdfText(`${programmeName} - full programme details are in your Budget document.`)}
            </Text>

            {serviceRows.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Expected expenses</Text>
                {renderExpensesRows(serviceRows)}
              </View>
            ) : null}

            <View style={pdfBaseStyles.totalCard}>
              <Text style={pdfBaseStyles.totalCardLabel}>Estimated total (pre-tax)</Text>
              <Text style={pdfBaseStyles.totalCardAmount}>{formatMoney(subtotal)}</Text>
            </View>
            <Text style={styles.refundNote}>
              {sanitizePdfText('Estimate only, not an invoice. Any unused portion of a deposit is refunded or carried forward at the next stage.')}
            </Text>

            <Footer />
          </Page>
        );
      })}
    </Document>
  );
};

export default ExpectedExpensesPdfDocument;
