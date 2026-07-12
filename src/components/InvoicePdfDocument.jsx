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
const PAYMENT_CAVEAT_PATTERNS = [/purpose of the payment/i, /sha option/i];
const isPaymentCaveatNote = note => PAYMENT_CAVEAT_PATTERNS.some(pattern => pattern.test(note));

const styles = StyleSheet.create({
  page: pdfBaseStyles.page,
  section: {
    marginTop: 26,
  },
  // The very first block under the title carries no preceding marginBottom of its own to offset -
  // TitleBlock's trailing margin already does that job, so stacking the full 26pt section rhythm
  // on top of it doubles the gap. Used only when that block is the first thing after TitleBlock.
  sectionAfterTitle: {
    marginTop: 2,
  },
  sectionTitle: pdfBaseStyles.sectionTitle,
  sectionNote: pdfBaseStyles.sectionNote,
  table: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  packageBlock: {
    marginTop: 2,
  },
  packageBlockHeader: {
    backgroundColor: PDF_COLOR.card,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
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

// One line of the "Breakdown" list - shared, byte-for-byte, across Service Invoice, milestone-share,
// and Package Invoice layouts, so a service/custom/percent row never renders two different ways.
const ServiceItemRow = ({ row, isFirst }) => {
  const isChild = row.depth > 0;
  const isPackageHeader = row.kind === 'package';
  // A "% of package" row reads as "Scheduled payment" here - the same one-style breakdown line as
  // every other row - without repeating the underlying percentage/package wording in the PDF.
  const isPercent = row.kind === 'percent';
  const displayName = isPercent ? 'Scheduled payment' : row.name;
  return (
    <View
      style={[
        isPackageHeader ? styles.packageRow : styles.row,
        !isPackageHeader && !isChild && isFirst ? styles.firstRow : null,
      ]}
      wrap={false}
    >
      <View style={styles.indexCell}>
        <Text style={styles.indexText}>{row.number}</Text>
      </View>
      <View style={[styles.nameCell, isChild ? styles.nameCellChild : null]}>
        <Text style={isPackageHeader ? styles.nameTextPackage : (isChild ? styles.nameTextChild : styles.nameText)}>
          {sanitizePdfText(displayName)}
        </Text>
        {row.description ? <Text style={styles.descriptionText}>{sanitizePdfText(row.description)}</Text> : null}
      </View>
      <View style={styles.priceCell}>
        <Text style={isPackageHeader ? styles.priceTextPackage : (isChild ? styles.priceTextChild : styles.priceText)}>
          {formatRowAmount(row)}
        </Text>
      </View>
    </View>
  );
};

// The "Package block" (round7 spec C): a compact name/fee header, then the package's full
// composition - always shown, since the Builder's own "Package" checkbox already gates whether
// this block is rendered at all (InvoiceBuilderPage) - and an optional payment schedule table,
// gated separately by the Builder's "Payment schedule" checkbox (`showSchedule`).
const PackageBlock = ({ row, showSchedule }) => {
  const totalLabel = formatRowAmount(row);
  // The package's own name and total fee are already shown just above, in packageBlockHeader -
  // repeating them as this single column's header (round8 spec A) would just say the same thing
  // twice, so the column here carries only the currency.
  const packageMeta = [{ id: row.id || row.key || 'package', label: '', priceLabel: 'EUR' }];
  const includedRows = (row.children || []).map((child, index) => ({
    id: child.id || child.key || `child-${index}`,
    name: child.name || '',
    includedByPackageId: new Set([String(packageMeta[0].id)]),
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
        <Text style={styles.packageBlockFee}>{`Total programme fee ${totalLabel}`}</Text>
      </View>
      {fullDetailNote ? <Text style={styles.sectionNote}>{sanitizePdfText(fullDetailNote)}</Text> : null}
      <IncludedServicesTable
        packages={packageMeta}
        includedRows={includedRows}
        title="Included in this package"
        note="These services reflect the customisation made to this package."
      />
      {showSchedule ? (
        <PaymentScheduleTable
          packages={packageMeta}
          rows={scheduleRows}
          title="Payment schedule for this package"
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
      .filter(note => !generatePaymentDetails || !isPaymentCaveatNote(note))
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
  const packageRows = includePackageInPdf ? rows.filter(row => row.kind === 'package') : [];
  const isPackageInvoice = packageRows.length > 0;
  // A "% of package" row (a programme milestone share) and any custom/catalog service row share one
  // "Breakdown" list, one row style, one running numbering - splitting them into two headed
  // sections was the second-biggest source of clutter on this document (declutter spec §2).
  const breakdownRows = rows.filter(row => row.kind !== 'package');
  const breakdownDisplayRows = buildDisplayRows(breakdownRows);
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
        <BrandRule />
        <TitleBlock
          eyebrow={eyebrow}
          title={`Invoice No. ${invoiceNumber || ''}`}
          subtitle={`Prepared exclusively for ${payerName}${payerLocation ? ` · ${payerLocation}` : ''}.`}
        />

        {isPackageInvoice ? (
          packageRows.map(row => (
            <PackageBlock key={row.key} row={row} showSchedule={includeScheduleInPdf} />
          ))
        ) : null}

        {breakdownDisplayRows.length ? (
          <View style={[styles.section, !isPackageInvoice ? styles.sectionAfterTitle : null]}>
            <Text style={styles.sectionTitle}>Breakdown</Text>
            <View style={styles.table}>
              {breakdownDisplayRows.map((row, rowIndex) => (
                <ServiceItemRow key={`${row.key || rowIndex}-${row.number}`} row={row} isFirst={rowIndex === 0} />
              ))}
            </View>
          </View>
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

          <View style={pdfBaseStyles.totalCard}>
            <Text style={pdfBaseStyles.totalCardLabel}>Amount due</Text>
            <Text style={pdfBaseStyles.totalCardAmount}>{formatMoney(amountDue)}</Text>
            <View style={pdfBaseStyles.totalCardRule} />
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
