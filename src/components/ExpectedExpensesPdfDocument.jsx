import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  BrandRow, BrandRule, BronzeMotif, ContinuedTag, Footer, PDF_COLOR, PDF_FONT, PreparedForBlock,
  SummaryCard, ensurePdfFontsRegistered, formatDisplayDate, pdfBaseStyles, sanitizePdfText, TitleBlock,
} from './pdfTheme';
import { formatMoney } from './budgetCatalogUtils';
import { formatAmount, IncludedServicesTable, PaymentScheduleTable } from './BudgetPdfDocument';
import { buildCaseTitle, buildPayerName } from './invoiceCatalogUtils';
import {
  computeMilestoneAmountDue,
  computeMilestoneSubtotal,
  resolveMilestoneServiceRows,
  resolvePackageOverviewRows,
  splitScheduledRows,
} from './expectedExpensesUtils';

ensurePdfFontsRegistered();

const formatPercentValue = percent => (Number.isInteger(percent) ? String(percent) : String(Math.round(percent * 100) / 100));

const styles = StyleSheet.create({
  page: pdfBaseStyles.page,
  section: {
    marginTop: 26,
  },
  sectionTitle: pdfBaseStyles.sectionTitle,
  sectionNote: pdfBaseStyles.sectionNote,
  forecastNotice: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 10,
    color: PDF_COLOR.bronzeDeep,
    marginBottom: 22,
  },
  paymentsHeading: {
    ...pdfBaseStyles.sectionTitle,
    marginTop: 40,
    marginBottom: 12,
  },
  paymentBlock: {
    borderWidth: 1,
    borderColor: PDF_COLOR.docLine,
    borderStyle: 'solid',
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  paymentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  paymentTitle: {
    fontFamily: PDF_FONT.display,
    fontWeight: 600,
    fontSize: 11.5,
    color: PDF_COLOR.docInk,
  },
  additionalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  additionalName: {
    flex: 1,
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    color: PDF_COLOR.inkSoft,
    paddingRight: 10,
  },
  additionalPrice: {
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    fontVariantNumeric: 'tabular-nums',
    color: PDF_COLOR.inkSoft,
  },
  refundNote: {
    fontFamily: PDF_FONT.body,
    fontSize: 8,
    lineHeight: 1.45,
    color: PDF_COLOR.inkSoft,
    marginTop: 14,
  },
  // Same background/rule/row tokens as pdfBaseStyles.totalCard (the Invoice's total-card), just
  // scaled down to fit inside a compact, repeated-per-milestone card instead of a whole-document one.
  paymentTotalCard: {
    backgroundColor: PDF_COLOR.totalCardBg,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  paymentTotalAmount: {
    fontFamily: PDF_FONT.display,
    fontWeight: 600,
    fontSize: 16,
    color: PDF_COLOR.totalCardAmount,
  },
});

// One compact block per payment (spec §1.2): "Payment #N - {milestone title}" - a header line, the
// scheduled share of the programme fee as a "Scheduled payment" line with the amount right-aligned
// (design-tasks §3/§4: same style as every other service line, never "N% of programme fee"), then
// every other row (SM deposits, catalog add-ons, gifts) as the same plain line, and the milestone's
// own total. Never repeats the package name, included services, or payment schedule - those render
// exactly once, above, in the shared programme-overview block.
const PaymentBlock = ({ index, milestone, rows, currency }) => {
  const { scheduledRows, additionalRows } = splitScheduledRows(rows);
  const subtotal = computeMilestoneSubtotal(rows);
  const taxPercent = Number(milestone.taxPercent) || 0;
  const amountDue = computeMilestoneAmountDue(subtotal, taxPercent);
  return (
    <View style={styles.paymentBlock} wrap={false}>
      <View style={styles.paymentHeaderRow}>
        <Text style={styles.paymentTitle}>{sanitizePdfText(`Payment #${index + 1} — ${milestone.title}`)}</Text>
      </View>
      {scheduledRows.map(row => (
        <View key={row.key} style={styles.additionalRow}>
          <Text style={styles.additionalName}>{sanitizePdfText('Scheduled payment')}</Text>
          <Text style={styles.additionalPrice}>{formatMoney(row.price, currency)}</Text>
        </View>
      ))}
      {additionalRows.map(row => (
        <View key={row.key} style={styles.additionalRow}>
          <Text style={styles.additionalName}>{sanitizePdfText(row.name)}</Text>
          <Text style={styles.additionalPrice}>{row.priceLabel || formatMoney(row.price, currency)}</Text>
        </View>
      ))}
      {/* Spec §3 fix: this used to show only the pre-tax subtotal, silently dropping the milestone's
          own tax rate - reuse the exact same total-card (label/amount/rule/rows) the Invoice uses so
          the figure a client sees here already matches the amount they'll later be billed. */}
      <View style={styles.paymentTotalCard}>
        <Text style={pdfBaseStyles.totalCardLabel}>Estimated total</Text>
        <Text style={styles.paymentTotalAmount}>{formatMoney(amountDue, currency)}</Text>
        <View style={pdfBaseStyles.totalCardRule} />
        <View style={pdfBaseStyles.totalCardRow}>
          <Text style={pdfBaseStyles.totalCardRowLabel}>Subtotal</Text>
          <Text style={pdfBaseStyles.totalCardRowValue}>{formatMoney(subtotal, currency)}</Text>
        </View>
        <View style={pdfBaseStyles.totalCardRow}>
          <Text style={pdfBaseStyles.totalCardRowLabel}>Tax</Text>
          <Text style={pdfBaseStyles.totalCardRowValue}>{`${formatPercentValue(taxPercent)}%`}</Text>
        </View>
      </View>
    </View>
  );
};

// One combined PDF for the whole case (spec §1.1): the full programme block - title block,
// "prepared exclusively for", coordinator line, programme summary, included services, payment
// schedule - rendered exactly once via the same table components BudgetPdfDocument uses (so the
// two documents can never drift apart), followed by a compact "Payment #N" block per milestone.
// Everything lives on one flowing, auto-paginating <Page>, so several compact payment blocks land
// on the same physical page instead of each getting its own.
const ExpectedExpensesPdfDocument = ({ plan, customers, catalogItemsById, priceContext, planDate }) => {
  const caseTitle = buildCaseTitle(customers);
  const payerName = buildPayerName(customers);
  const dateLabel = formatDisplayDate(planDate instanceof Date ? planDate : new Date(planDate || Date.now()));
  const programmeName = plan?.packageSnapshot?.name || 'Programme';
  const listedPrice = Number(plan?.packageSnapshot?.listedPrice) || 0;
  const currency = plan?.packageSnapshot?.currency || 'EUR';
  const milestones = Array.isArray(plan?.milestones) ? plan.milestones : [];

  const overviewRows = resolvePackageOverviewRows(plan?.packageSnapshot?.children, catalogItemsById, priceContext);
  const includedRows = overviewRows.map(row => ({ id: row.id, name: row.name, includedByPackageId: new Set(['programme']) }));
  const packagesMeta = [{ id: 'programme', label: 'Programme', priceLabel: formatAmount(listedPrice) }];

  const milestoneRows = milestones.map(milestone => resolveMilestoneServiceRows(milestone, catalogItemsById, priceContext));
  // Only the auto-generated "share of the programme fee" row belongs in this schedule - it mirrors
  // the package's own payment schedule, whose column already sums to the whole programme fee
  // (Programme 46,000 above). Any other row (SM deposits, catalog add-ons, gifts, ...) is a one-off
  // extra that belongs solely in that milestone's own Payments block below, never folded into this
  // total - otherwise a milestone with an extra would show more than its actual scheduled share here.
  const milestoneScheduledAmounts = milestoneRows.map(rows => computeMilestoneSubtotal(splitScheduledRows(rows).scheduledRows));
  const scheduleRows = milestones.map((milestone, index) => ({
    title: milestone.title || `Payment ${index + 1}`,
    amounts: [milestoneScheduledAmounts[index]],
  }));

  return (
    <Document title={`Expected expenses - ${caseTitle}`} subject="Expected expenses" creator="UKRCOM">
      <Page size="A4" style={styles.page} wrap>
        <BronzeMotif />
        <ContinuedTag label="Expected Expenses" />
        <BrandRow metaLines={[dateLabel, caseTitle]} />
        <BrandRule />
        <TitleBlock
          eyebrow="Programme schedule"
          title={programmeName}
          subtitle={`Total programme fee ${formatMoney(listedPrice, currency)}.`}
        />
        <PreparedForBlock clientName={payerName} />
        {/* Spec §1.4: a short, visible disclaimer under the title on every page of this document -
            in addition to, not instead of, the existing small-print note at the very end. */}
        <Text style={styles.forecastNotice}>
          {sanitizePdfText('This is a forecast, not an invoice — actual amounts are confirmed separately.')}
        </Text>

        <SummaryCard label="What this programme includes" text={plan?.packageSnapshot?.description} />

        {/* Included services first, then the payment schedule (design-tasks §4) - the schedule's
            own Total row is dropped too: the programme fee is already stated once in the title
            block and each column's header. */}
        <IncludedServicesTable
          packages={packagesMeta}
          includedRows={includedRows}
          title="Included in this programme"
          note="Every item below is already covered by the programme fee."
        />

        <PaymentScheduleTable packages={packagesMeta} rows={scheduleRows} />

        {milestones.length ? (
          <View>
            <Text style={styles.paymentsHeading}>Payments</Text>
            {milestones.map((milestone, index) => (
              <PaymentBlock key={milestone.id || index} index={index} milestone={milestone} rows={milestoneRows[index]} currency={currency} />
            ))}
          </View>
        ) : null}

        <Text style={styles.refundNote}>
          {sanitizePdfText('Estimate only, not an invoice. Any unused portion of a deposit is refunded or carried forward at the next stage.')}
        </Text>

        <Footer />
      </Page>
    </Document>
  );
};

export default ExpectedExpensesPdfDocument;
