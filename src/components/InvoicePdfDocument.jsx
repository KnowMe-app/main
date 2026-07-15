import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  BrandRow, BrandRule, BronzeMotif, ContinuedTag, Footer, PDF_COLOR, PDF_FONT,
  ensurePdfFontsRegistered, formatDisplayDate, pdfBaseStyles, sanitizePdfText, TitleBlock,
} from './pdfTheme';
import { formatMoney } from './budgetCatalogUtils';
import { IncludedServicesTable, PaymentScheduleTable } from './BudgetPdfDocument';
import {
  buildCaseTitle,
  buildPayerLocation,
  buildPayerName,
  computeInvoiceAmountDue,
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

// These two wire-transfer caveats now live on the standalone Payment Details document, right next
// to the instructions they actually govern (see PaymentDetailsPdfDocument) - they no longer belong
// on the Invoice itself. Matched by keyword rather than exact string so pre-existing notes data
// (already carrying an older phrasing) is filtered out too, not just freshly authored ones.
const PAYMENT_CAVEAT_PATTERNS = [
  /purpose of the payment/i,
  /please make sure you pay the whole amount/i,
  /sha option/i,
];
const isPaymentCaveatNote = note => PAYMENT_CAVEAT_PATTERNS.some(pattern => pattern.test(note));

const styles = StyleSheet.create({
  // Slightly tighter top padding than the multi-page documents (design-tasks-4 §7): together with
  // the compact metrics below it buys the ~100pt that keeps a full package invoice on one page.
  page: {
    ...pdfBaseStyles.page,
    paddingTop: 38,
  },
  // Tighter than the 26pt rhythm the multi-page documents use: the Invoice's blocks (Programme
  // package, Included in this package, Payment schedule, Breakdown) are compacted so the whole
  // document fits a single page whenever the content allows (design-tasks §3).
  section: {
    marginTop: 6,
  },
  // The very first block under the title carries no preceding marginBottom of its own to offset -
  // TitleBlock's trailing margin already does that job, so stacking the full section rhythm
  // on top of it doubles the gap. Used only when that block is the first thing after TitleBlock.
  sectionAfterTitle: {
    marginTop: 2,
  },
  sectionTitle: pdfBaseStyles.sectionTitle,
  sectionNote: pdfBaseStyles.sectionNote,
  packageBlock: {
    marginTop: 2,
  },
  packageBlockHeader: {
    backgroundColor: PDF_COLOR.card,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginBottom: 3,
  },
  packageBlockName: {
    fontFamily: PDF_FONT.display,
    fontWeight: 600,
    fontSize: 13,
    color: PDF_COLOR.docInk,
  },
  packageBlockFee: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 9.5,
    color: PDF_COLOR.bronzeDeep,
    marginTop: 4,
  },
  descriptionText: {
    fontFamily: PDF_FONT.body,
    fontSize: 8,
    color: PDF_COLOR.inkSoft,
    lineHeight: 1.4,
    marginTop: 2,
  },
  // A compacted copy of the shared total-card (same tokens, tighter metrics): together with the
  // 14pt section rhythm above it keeps a full package invoice - package block, included services,
  // payment schedule, breakdown, total - on one physical page whenever possible (design-tasks §3).
  totalCard: {
    ...pdfBaseStyles.totalCard,
    marginTop: 6,
    paddingVertical: 7,
  },
  totalCardLabel: {
    ...pdfBaseStyles.totalCardLabel,
    marginBottom: 2,
  },
  totalCardAmount: {
    ...pdfBaseStyles.totalCardAmount,
    fontSize: 18,
  },
  totalCardRule: {
    ...pdfBaseStyles.totalCardRule,
    marginTop: 5,
    marginBottom: 4,
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

// One row of the "Breakdown" table. A "% of package" row reads as "Scheduled payment" - the same
// one-style breakdown line as every other row - without repeating the underlying percentage/
// package wording in the PDF (design-tasks §3). Amounts stay bare numbers (or a free-text label
// like "GIFT"): the table's own EUR column header already carries the currency.
const formatBareAmount = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  const rounded = Math.round(amount * 100) / 100;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
  }).format(rounded);
};

const buildBreakdownTableRow = row => ({
  title: row.kind === 'percent' ? 'Scheduled payment' : (row.name || ''),
  description: row.description || '',
  amounts: [row.priceLabel ? row.priceLabel : formatBareAmount(row.price)],
});

// The "Package block" (round7 spec C): a compact name/fee header, then the package's full
// composition - always shown, since the Builder's own "Package" checkbox already gates whether
// this block is rendered at all (InvoiceBuilderPage) - and an optional payment schedule table,
// gated separately by the Builder's "Payment schedule" checkbox (`showSchedule`).
const PackageBlock = ({ row, showSchedule }) => {
  const totalLabel = formatRowAmount(row);
  const packageId = row.id || row.key || 'package';
  // The package's own name and total fee are already shown just above, in packageBlockHeader -
  // repeating them as this single column's header (round8 spec A) would just say the same thing
  // twice, so the schedule column here carries only the currency. The included-services table's
  // column has no amount at all (its cells are inclusion marks, not money), so it gets a blank
  // header instead of reusing the schedule's "EUR" one.
  const scheduleMeta = [{ id: packageId, label: '', priceLabel: 'EUR' }];
  const includedRows = (row.children || []).map((child, index) => ({
    id: child.id || child.key || `child-${index}`,
    name: child.name || '',
  }));
  const scheduleRows = (row.scheduleRows || []).map(payment => ({
    title: payment.title || 'Payment',
    amounts: [payment.amount],
  }));
  // Only a customised package gets an explanatory note above its breakdown - a stock catalog
  // package just shows its detail below with no note at all (round7 spec B.1: it no longer claims
  // "no separate Budget document exists").
  const fullDetailNote = row.isCustomized
    ? 'This invoice includes customised programme details shown below.'
    : null;

  return (
    <View style={styles.packageBlock}>
      <Text style={styles.sectionTitle}>Programme package</Text>
      <View style={styles.packageBlockHeader} wrap={false}>
        <Text style={styles.packageBlockName}>{sanitizePdfText(row.name)}</Text>
        {row.description ? <Text style={styles.descriptionText}>{sanitizePdfText(row.description)}</Text> : null}
        <Text style={styles.packageBlockFee}>{`Cost of the package ${totalLabel}`}</Text>
      </View>
      {fullDetailNote ? <Text style={styles.sectionNote}>{sanitizePdfText(fullDetailNote)}</Text> : null}
      {/* Compact two-per-row layout (design-tasks-4 §7) - shared with Expected Expenses'
          "Included in this programme" so the single-programme documents stay identical. */}
      <IncludedServicesTable
        compact
        includedRows={includedRows}
        title="Included in this package"
        note={null}
        sectionStyle={styles.section}
      />
      {showSchedule ? (
        <PaymentScheduleTable
          packages={scheduleMeta}
          rows={scheduleRows}
          title="Payment schedule for this package"
          sectionStyle={styles.section}
          dense
        />
      ) : null}
    </View>
  );
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
  debtOrDeposit,
  generatePaymentDetails = true,
  includePackageInPdf = true,
  includeScheduleInPdf = true,
}) => {
  const rows = resolveInvoiceServiceRows(invoiceServices, catalogItemsById, priceContext);
  const subtotal = computeInvoiceSubtotal(rows);
  const total = computeInvoiceTotal(subtotal, taxPercent);
  const amountDue = computeInvoiceAmountDue(total, debtOrDeposit);
  const payerName = buildPayerName(customers);
  const payerLocation = buildPayerLocation(customers);
  const caseTitle = buildCaseTitle(customers);
  const noteList = Array.isArray(notes)
    ? notes
      .filter(note => String(note || '').trim())
      .filter(note => !isPaymentCaveatNote(note))
    : [];
  const docType = invoiceType === 'service' || invoiceType === 'programme_milestone'
    ? invoiceType
    : resolveInvoiceDocType(rows);
  const docLabel = DOC_LABEL_BY_TYPE[docType];
  const eyebrow = EYEBROW_BY_TYPE[docType];

  // Package Invoice (round7 spec C): a package now lives outside Invoice Services structurally -
  // whether its block renders here at all is decided solely by the Builder's own "Package"
  // checkbox (includePackageInPdf), never implicitly by whether one happens to be on the invoice.
  // Any other top-level row is, by definition, a service confirmed for this case that sits outside
  // the standard package.
  // A custom package (no catalogId) has no catalog "% of package" row to bill alongside it - its
  // own resolved price is a real, always-billed invoice line (computeInvoiceSubtotal). Unlike a
  // catalog-backed package (a reference-only block the checkbox may freely hide), hiding it would
  // leave the Amount due including a charge with no visible line item explaining it, so every
  // custom package always renders regardless of the checkbox. A catalog-backed package is capped
  // at one: the Builder itself only ever surfaces/edits the first package row it finds (spec C),
  // so an invoice saved before that restructure with several catalog packages would otherwise
  // still render every extra one here with no way for the admin to see, edit, or remove it.
  const packageRows = rows.reduce((acc, row) => {
    if (row.kind !== 'package') return acc;
    if (!row.catalogId) return [...acc, row];
    if (!includePackageInPdf || acc.some(existing => existing.catalogId)) return acc;
    return [...acc, row];
  }, []);
  const isPackageInvoice = packageRows.length > 0;
  // A "% of package" row (a programme milestone share) and any custom/catalog service row share one
  // "Breakdown" table, one row style, one running numbering - splitting them into two headed
  // sections was the second-biggest source of clutter on this document (declutter spec §2).
  const breakdownRows = rows.filter(row => row.kind !== 'package');
  const breakdownTableRows = breakdownRows.map(buildBreakdownTableRow);
  // Single amount column, same visual style as the Payment Schedule table (design-tasks §3) - the
  // column header carries the currency once, so cells stay bare numbers.
  const breakdownMeta = [{ id: 'amount', label: '', priceLabel: 'EUR' }];
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
        <BrandRule style={{ marginBottom: 10 }} />
        <TitleBlock
          eyebrow={eyebrow}
          title={`Invoice No. ${invoiceNumber || ''}`}
          subtitle={`Prepared exclusively for ${payerName}${payerLocation ? ` · ${payerLocation}` : ''}.`}
          style={{ marginBottom: 4 }}
        />

        {isPackageInvoice ? (
          packageRows.map(row => (
            <PackageBlock key={row.key} row={row} showSchedule={includeScheduleInPdf} />
          ))
        ) : null}

        {breakdownTableRows.length ? (
          <PaymentScheduleTable
            packages={breakdownMeta}
            rows={breakdownTableRows}
            title="Breakdown"
            leadLabel="Provided service"
            sectionStyle={!isPackageInvoice ? styles.sectionAfterTitle : styles.section}
            dense
          />
        ) : null}

        {/* No extra top margin here - noteRow/totalCard already carry their own spacing (spec §1.4),
            same as the flat layout above where they sit directly under the table with no gap of
            their own. */}
        <View>
          {noteList.map((note, index) => (
            <View key={`note-${index}`} style={styles.noteRow}>
              <Text style={styles.noteMark}>{'*'.repeat(index + 1)}</Text>
              <Text style={styles.noteText}>{sanitizePdfText(note)}</Text>
            </View>
          ))}

          {/* wrap={false}: the card either fits under the breakdown or moves to the next page
              whole - it must never split its amount from its subtotal/tax rows. */}
          <View style={styles.totalCard} wrap={false}>
            <Text style={styles.totalCardLabel}>Amount due</Text>
            <Text style={styles.totalCardAmount}>{formatMoney(amountDue)}</Text>
            <View style={styles.totalCardRule} />
            <View style={pdfBaseStyles.totalCardRow}>
              <Text style={pdfBaseStyles.totalCardRowLabel}>Subtotal</Text>
              <Text style={pdfBaseStyles.totalCardRowValue}>{formatMoney(subtotal)}</Text>
            </View>
            <View style={pdfBaseStyles.totalCardRow}>
              <Text style={pdfBaseStyles.totalCardRowLabel}>Tax</Text>
              <Text style={pdfBaseStyles.totalCardRowValue}>{`${sanitizePdfText(String(taxPercent ?? 0))}%`}</Text>
            </View>
            {/* Applied after tax, never folded into the taxable subtotal above it (spec follow-up):
                a carried-over debt/deposit is settled money, not a billable service - zero (the
                default) renders nothing. */}
            {debtOrDeposit ? (
              <View style={pdfBaseStyles.totalCardRow}>
                <Text style={pdfBaseStyles.totalCardRowLabel}>
                  {debtOrDeposit > 0 ? 'Debt of the previous payment' : 'Deposit of the previous payment'}
                </Text>
                <Text style={pdfBaseStyles.totalCardRowValue}>
                  {`${debtOrDeposit > 0 ? '+' : '-'}${formatMoney(Math.abs(debtOrDeposit))}`}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Footer variant="branded" />
      </Page>
    </Document>
  );
};

export default InvoicePdfDocument;
