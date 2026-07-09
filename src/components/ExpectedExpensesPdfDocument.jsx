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
  paymentTotal: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 11,
    color: PDF_COLOR.bronzeDeep,
  },
  scheduledLine: {
    fontFamily: PDF_FONT.body,
    fontSize: 9,
    fontVariantNumeric: 'tabular-nums',
    color: PDF_COLOR.docInk,
    marginBottom: 2,
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
});

// One compact block per payment (spec §1.2): "Payment #N - {milestone title}" - a header line, the
// scheduled share of the programme fee expressed as a percent (never a bare number with no
// context), then every other row (SM deposits, catalog add-ons, gifts) as a plain line, and the
// milestone's own total. Never repeats the package name, included services, or payment schedule -
// those render exactly once, above, in the shared programme-overview block.
const PaymentBlock = ({ index, milestone, rows, currency }) => {
  const { scheduledRows, additionalRows } = splitScheduledRows(rows);
  const subtotal = computeMilestoneSubtotal(rows);
  return (
    <View style={styles.paymentBlock} wrap={false}>
      <View style={styles.paymentHeaderRow}>
        <Text style={styles.paymentTitle}>{sanitizePdfText(`Payment #${index + 1} — ${milestone.title}`)}</Text>
        <Text style={styles.paymentTotal}>{formatMoney(subtotal, currency)}</Text>
      </View>
      {scheduledRows.map(row => (
        <Text key={row.key} style={styles.scheduledLine}>
          {sanitizePdfText(`${formatPercentValue(row.percent)}% of programme fee — ${formatMoney(row.price, currency)}`)}
        </Text>
      ))}
      {additionalRows.map(row => (
        <View key={row.key} style={styles.additionalRow}>
          <Text style={styles.additionalName}>{sanitizePdfText(row.name)}</Text>
          <Text style={styles.additionalPrice}>{row.priceLabel || formatMoney(row.price, currency)}</Text>
        </View>
      ))}
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
  const milestoneSubtotals = milestoneRows.map(rows => computeMilestoneSubtotal(rows));
  const scheduleRows = milestones.map((milestone, index) => ({
    title: milestone.title || `Payment ${index + 1}`,
    amounts: [milestoneSubtotals[index]],
  }));
  const scheduleTotal = milestoneSubtotals.reduce((sum, amount) => sum + (Number(amount) || 0), 0);

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

        <PaymentScheduleTable packages={packagesMeta} rows={scheduleRows} totals={[scheduleTotal]} />

        {/* `break` starts Included services on a fresh page, matching the Program Budget layout
            (spec §2) - so the schedule above stays with the title block/summary on page 1. */}
        <View break={includedRows.length > 0}>
          <IncludedServicesTable
            packages={packagesMeta}
            includedRows={includedRows}
            title="Included in this programme"
            note="Every item below is already covered by the programme fee."
          />
        </View>

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
