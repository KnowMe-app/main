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
  resolvePackageOverviewRows,
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

// A row's technical source reference, e.g. "catalog.pregnancy_diagnostics.comprehensive_exam" or
// "schedule.milestone.percent_of_package" - makes it transparent that nothing here is a hand-typed
// guess (spec §1.6: every line must trace back to a catalog id or the payment schedule).
const rowSourceRef = (row, catalogItemsById) => {
  if (row?.kind === 'percent') return 'schedule.milestone.percent_of_package';
  if (row?.kind === 'item' && row.catalogId) {
    const item = catalogItemsById?.get?.(String(row.catalogId));
    const category = item?.category || 'item';
    return `catalog.${category}.${row.catalogId}`;
  }
  if (row?.kind === 'package' && row.catalogId) return `catalog.package.${row.catalogId}`;
  return 'manual entry';
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
  overviewCard: {
    backgroundColor: PDF_COLOR.card,
    borderRadius: 8,
    padding: 12,
  },
  overviewHeadText: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 9.5,
    color: PDF_COLOR.docInk,
    marginBottom: 6,
  },
  overviewRow: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  overviewIndexText: {
    width: 20,
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8,
    color: PDF_COLOR.bronze,
  },
  overviewText: {
    flex: 1,
    fontFamily: PDF_FONT.body,
    fontSize: 9,
    color: PDF_COLOR.docInk,
  },
  overviewTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.bronze,
    borderTopStyle: 'solid',
  },
  overviewTotalLabel: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 9,
    color: PDF_COLOR.docInk,
  },
  overviewTotalAmount: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 9,
    color: PDF_COLOR.bronzeDeep,
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  scheduleRowCurrent: {
    backgroundColor: PDF_COLOR.card,
  },
  scheduleLabelText: {
    fontFamily: PDF_FONT.body,
    fontSize: 9,
    color: PDF_COLOR.docInk,
  },
  scheduleLabelTextCurrent: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
  },
  scheduleAmountText: {
    fontFamily: PDF_FONT.body,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 9,
    color: PDF_COLOR.docInk,
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
  itemRef: {
    fontFamily: PDF_FONT.body,
    fontSize: 6.5,
    letterSpacing: 0.2,
    color: PDF_COLOR.footerSoft,
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

const renderExpensesRows = (rows, catalogItemsById) => (
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
          <Text style={styles.itemRef}>{sanitizePdfText(rowSourceRef(row, catalogItemsById))}</Text>
        </View>
        <View style={styles.expensePriceCell}><Text style={styles.expensePriceText}>{formatRowAmount(row)}</Text></View>
      </View>
    ))}
  </View>
);

const ExpectedExpensesPdfDocument = ({ plan, customers, catalogItemsById, priceContext, planDate }) => {
  const caseTitle = buildCaseTitle(customers);
  const dateLabel = formatPlanDate(planDate instanceof Date ? planDate : new Date(planDate || Date.now()));
  const overviewRows = resolvePackageOverviewRows(plan?.packageSnapshot?.children, catalogItemsById, priceContext);
  const milestones = Array.isArray(plan?.milestones) ? plan.milestones : [];
  const milestoneServiceRows = milestones.map(milestone => resolveMilestoneServiceRows(milestone, catalogItemsById, priceContext));
  const milestoneSubtotals = milestoneServiceRows.map(computeMilestoneSubtotal);

  return (
    <Document title={`Expected expenses - ${caseTitle}`} subject="Expected expenses" creator="UKRCOM">
      {milestones.map((milestone, index) => {
        const serviceRows = milestoneServiceRows[index];
        const subtotal = milestoneSubtotals[index];

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

            {milestone.showPackageOverview ? (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{sanitizePdfText(plan.packageSnapshot?.name || 'Programme')}</Text>
                  <View style={styles.overviewCard}>
                    <Text style={styles.overviewHeadText}>Included in this programme</Text>
                    {overviewRows.map((row, rowIndex) => (
                      <View key={row.key || rowIndex} style={styles.overviewRow}>
                        <Text style={styles.overviewIndexText}>{rowIndex + 1}</Text>
                        <Text style={styles.overviewText}>{sanitizePdfText(row.name)}</Text>
                      </View>
                    ))}
                    <View style={styles.overviewTotalRow}>
                      <Text style={styles.overviewTotalLabel}>Total programme fee</Text>
                      <Text style={styles.overviewTotalAmount}>{formatMoney(plan.packageSnapshot.listedPrice)}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Payment schedule</Text>
                  {milestones.map((scheduleMilestone, scheduleIndex) => (
                    <View
                      key={scheduleMilestone.id || scheduleIndex}
                      style={[styles.scheduleRow, scheduleIndex === index ? styles.scheduleRowCurrent : null]}
                      wrap={false}
                    >
                      <Text style={[styles.scheduleLabelText, scheduleIndex === index ? styles.scheduleLabelTextCurrent : null]}>
                        {sanitizePdfText(`${scheduleIndex + 1}. ${scheduleMilestone.title}`)}
                      </Text>
                      <Text style={styles.scheduleAmountText}>{formatMoney(milestoneSubtotals[scheduleIndex])}</Text>
                    </View>
                  ))}
                </View>

                {serviceRows.length ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Expected expenses</Text>
                    {renderExpensesRows(serviceRows, catalogItemsById)}
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Expected expenses</Text>
                {renderExpensesRows(serviceRows, catalogItemsById)}
              </View>
            )}

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
