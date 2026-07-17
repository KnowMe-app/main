import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  BrandRow, BrandRule, BronzeMotif, ContinuedTag, Footer, PDF_COLOR, PDF_FONT,
  ensurePdfFontsRegistered, formatDisplayDate, pdfBaseStyles, sanitizePdfText, TitleBlock,
} from './pdfTheme';
import { formatMoney } from './budgetCatalogUtils';
import { formatAmountTwoDecimals, IncludedServicesTable, PaymentScheduleTable, SERVICE_TABLE_LEAD_LABEL } from './BudgetPdfDocument';
import {
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
  // The Breakdown heading renders in the shared promoted sectionTitle (design-tasks-8 §2, unified
  // across every document's headings in design-tasks-11 §2 - no more per-document size override)
  // - what stays invoice-specific is the extra air above it, opened up further in design-tasks-9
  // §2 so it clearly separates from whatever precedes it: the "Prepared exclusively for..." title
  // subrow on a plain-services invoice, the package's payment schedule on a package invoice.
  breakdownSection: {
    marginTop: 20,
  },
  breakdownSectionAfterTitle: {
    marginTop: 14,
  },
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
  // design-tasks-8 §4 pushes the page's focal point further: a larger amount figure and more
  // internal padding, with the label kept subdued relative to the figure. The gap above it is
  // plain whitespace, not a rule (design-tasks-12 §1 dropped the hairline seam that used to sit
  // here) - marginTop alone now carries the separation from the Breakdown table/notes above.
  totalCard: {
    ...pdfBaseStyles.totalCard,
    marginTop: 20,
    paddingVertical: 12,
  },
  totalCardLabel: {
    ...pdfBaseStyles.totalCardLabel,
    marginBottom: 3,
  },
  totalCardAmount: {
    ...pdfBaseStyles.totalCardAmount,
    fontSize: 21,
  },
  // The due-date line (design-tasks-8 §7) sits right under the figure, quiet but readable.
  totalCardDueDate: {
    fontFamily: PDF_FONT.body,
    fontWeight: 500,
    fontSize: 8,
    color: PDF_COLOR.footerSoft,
    marginTop: 4,
  },
  totalCardRule: {
    ...pdfBaseStyles.totalCardRule,
    marginTop: 7,
    marginBottom: 5,
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
// Always two decimals (design-tasks-8 §9) via the shared table formatter, so decimal points line
// up down the amount column here and in Expected Expenses alike.
const formatBareAmount = formatAmountTwoDecimals;

// A proper typographic minus for credits (design-tasks-8 §5) - a hyphen reads as a dash, U+2212
// has the digit-matched width/height. sanitizePdfText leaves it alone (it only folds en/em
// dashes) and both embedded body fonts carry the glyph.
const TYPOGRAPHIC_MINUS = '−';

// Two-decimal money for the Amount Due card's arithmetic rows (design-tasks-8 §6/§9) - same
// EUR suffix as budgetCatalogUtils.formatMoney, but never dropping ".00", so the card's column
// of figures lines up on the decimal.
const formatMoneyTwoDecimals = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '- EUR';
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} EUR`;
};

const buildBreakdownTableRow = row => {
  const price = Number(row.price);
  // Credits/adjustments (design-tasks-8 §5): a negative amount renders with the typographic
  // minus in the subdued credit tone, so charges and credits read as two kinds of line.
  const isCredit = !row.priceLabel && Number.isFinite(price) && price < 0;
  return {
    title: row.kind === 'percent' ? 'Scheduled payment' : (row.name || ''),
    description: row.description || '',
    amounts: [row.priceLabel
      ? row.priceLabel
      : (isCredit
        ? { label: `${TYPOGRAPHIC_MINUS}${formatBareAmount(Math.abs(price))}`, tone: 'credit' }
        : formatBareAmount(price))],
  };
};

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
  // Numbers are pre-formatted to two decimals here (design-tasks-8 §9) so this table's amounts
  // line up on the decimal exactly like the Breakdown's, instead of the shared table's bare
  // integer format.
  const scheduleRows = (row.scheduleRows || []).map(payment => ({
    title: payment.title || 'Payment',
    amounts: [typeof payment.amount === 'number' ? formatBareAmount(payment.amount) : payment.amount],
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
          light
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
  dueDate = null,
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
  // Transparent arithmetic for the Amount Due card (design-tasks-8 §6): the same rows the
  // subtotal is computed from (computeInvoiceSubtotal's filter), split into positive charges and
  // negative credits so the card can show how the line items add up to the figure billed.
  const chargeableRows = rows.filter(row => row?.kind !== 'package' || !row.catalogId || row.billDirectly);
  const creditsTotal = chargeableRows.reduce((sum, row) => {
    const price = Number(row.price) || 0;
    return price < 0 ? sum + price : sum;
  }, 0);
  const servicesTotal = subtotal - creditsTotal;
  const taxAmount = total - subtotal;
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
        {/* Invoice No. + date only (design-tasks-8 §8): the case/client identity already lives in
            the "Prepared exclusively for" subtitle right below, so repeating it up here just
            crowded the wordmark. */}
        <BrandRow metaLines={[`Invoice No. ${invoiceNumber || ''}`, dateLabel]} />
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
            leadLabel={SERVICE_TABLE_LEAD_LABEL}
            sectionStyle={!isPackageInvoice ? styles.breakdownSectionAfterTitle : styles.breakdownSection}
            dense
            light
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
            <Text style={styles.totalCardAmount}>{formatMoneyTwoDecimals(amountDue)}</Text>
            {/* When how much is stated, so is when (design-tasks-8 §7): a concrete due date when
                the builder sets one, the payable-on-receipt default otherwise. */}
            <Text style={styles.totalCardDueDate}>
              {dueDate ? sanitizePdfText(`Due date · ${formatDisplayDate(dueDate)}`) : 'Payable upon receipt'}
            </Text>
            <View style={styles.totalCardRule} />
            {/* Transparent arithmetic (design-tasks-8 §6): the Services/Credits split renders only
                when a credit exists - without one, Services would just repeat the Subtotal. */}
            {creditsTotal < 0 ? (
              <>
                <View style={pdfBaseStyles.totalCardRow}>
                  <Text style={pdfBaseStyles.totalCardRowLabel}>Services</Text>
                  <Text style={pdfBaseStyles.totalCardRowValue}>{formatMoneyTwoDecimals(servicesTotal)}</Text>
                </View>
                <View style={pdfBaseStyles.totalCardRow}>
                  <Text style={pdfBaseStyles.totalCardRowLabel}>Credits</Text>
                  <Text style={pdfBaseStyles.totalCardRowValue}>
                    {`${TYPOGRAPHIC_MINUS}${formatMoneyTwoDecimals(Math.abs(creditsTotal))}`}
                  </Text>
                </View>
              </>
            ) : null}
            <View style={pdfBaseStyles.totalCardRow}>
              <Text style={pdfBaseStyles.totalCardRowLabel}>Subtotal</Text>
              <Text style={pdfBaseStyles.totalCardRowValue}>{formatMoneyTwoDecimals(subtotal)}</Text>
            </View>
            <View style={pdfBaseStyles.totalCardRow}>
              <Text style={pdfBaseStyles.totalCardRowLabel}>{`Tax (${sanitizePdfText(String(taxPercent ?? 0))}%)`}</Text>
              <Text style={pdfBaseStyles.totalCardRowValue}>{formatMoneyTwoDecimals(taxAmount)}</Text>
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
                  {`${debtOrDeposit > 0 ? '+' : TYPOGRAPHIC_MINUS}${formatMoneyTwoDecimals(Math.abs(debtOrDeposit))}`}
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
