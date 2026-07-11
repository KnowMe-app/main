import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  BrandRow, BrandRule, BronzeMotif, ContinuedTag, Footer, PDF_COLOR, PDF_FONT,
  ensurePdfFontsRegistered, formatDisplayDate, pdfBaseStyles, sanitizePdfText, TitleBlock,
} from './pdfTheme';
import { formatMoney, resolveBudgetPriceAmount, resolveProgramPaymentSchedule } from './budgetCatalogUtils';
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
  // every other row - with the percent/package it prices kept as a small caption underneath rather
  // than a standalone section heading (spec: declutter §2).
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
        {isPercent ? <Text style={styles.descriptionText}>{sanitizePdfText(row.name)}</Text> : null}
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

// The "Package block" (spec §1.1): a compact name/fee header, plus a single reference sentence
// pointing at the Budget instead of repeating its "Included in this programme" and "Payment
// schedule" tables verbatim - that full breakdown already lives in the Budget, and duplicating it
// here was the single biggest source of clutter on this document.
const PackageBlock = ({ row, schedule, scheduleTotal }) => {
  const payments = Array.isArray(schedule?.payments) ? schedule.payments : [];
  const totalLabel = formatRowAmount(row);
  const isCustomized = Boolean(row.isCustomized);
  const packageMeta = [{ id: row.id || row.key || 'package', label: row.name, priceLabel: totalLabel }];
  const includedRows = isCustomized
    ? (row.children || []).map((child, index) => ({
      id: child.id || child.key || `child-${index}`,
      name: child.name || '',
      includedByPackageId: new Set([String(packageMeta[0].id)]),
    }))
    : [];
  const scheduleRows = isCustomized
    ? payments.map(payment => ({
      title: payment.title || 'Payment',
      amounts: [Number.isFinite(Number(payment.amount)) ? Number(payment.amount) : null],
    }))
    : [];
  const budgetReferenceNote = payments.length
    ? `Part of a ${payments.length}-instalment programme totalling ${totalLabel}. Full programme details and the complete payment schedule are set out in your Budget.`
    : `Full programme details and the complete payment schedule are set out in your Budget.`;

  return (
    <View style={styles.packageBlock}>
      <Text style={styles.sectionTitle}>Programme package</Text>
      <View style={styles.packageBlockHeader} wrap={false}>
        <Text style={styles.packageBlockName}>{sanitizePdfText(row.name)}</Text>
        {row.description ? <Text style={styles.descriptionText}>{sanitizePdfText(row.description)}</Text> : null}
        <Text style={styles.packageBlockFee}>{`Total programme fee ${totalLabel}`}</Text>
      </View>
      {isCustomized ? (
        <>
          <Text style={styles.sectionNote}>
            {sanitizePdfText('This invoice includes customised programme details shown below.')}
          </Text>
          <IncludedServicesTable
            packages={packageMeta}
            includedRows={includedRows}
            title="Included in this invoice"
            note="These services reflect the customised package configured for this invoice."
          />
          <PaymentScheduleTable
            packages={packageMeta}
            rows={scheduleRows}
            totals={[scheduleTotal]}
            title="Payment schedule for this invoice"
          />
        </>
      ) : (
        <Text style={styles.sectionNote}>{sanitizePdfText(budgetReferenceNote)}</Text>
      )}
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
  catalogTechnical,
  debtOrDeposit,
  generatePaymentDetails = true,
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

  // Package Invoice (spec §1): adding a whole standard package - as opposed to a single
  // percent-of-package milestone share, or a handful of one-off services - gets its own package
  // block (name/fee header + a reference sentence to the Budget) above the flat itemized breakdown
  // below. Any other top-level row alongside the package is, by definition, a service confirmed
  // for this case that sits outside the standard package.
  const packageRows = rows.filter(row => row.kind === 'package');
  const isPackageInvoice = packageRows.length > 0;
  // A "% of package" row (a programme milestone share) and any custom/catalog service row share one
  // "Breakdown" list, one row style, one running numbering - splitting them into two headed
  // sections was the second-biggest source of clutter on this document (declutter spec §2).
  const breakdownRows = rows.filter(row => row.kind !== 'package');
  const breakdownDisplayRows = buildDisplayRows(breakdownRows);
  // The package entry's own `children` are a frozen name-only snapshot (invoiceCatalogUtils.js) -
  // its payment schedule instead always comes live from the catalog package it was added from, the
  // same source Program Budget/Expected Expenses read it from, so a schedule edit in the catalog is
  // reflected here too.
  const resolvePackageSchedule = row => {
    const catalogPackage = priceContext?.packagesById?.get?.(String(row.catalogId));
    const schedule = catalogPackage ? resolveProgramPaymentSchedule({ technical: catalogTechnical }, catalogPackage) : null;
    if (!row.isCustomized || !schedule?.payments?.length || !catalogPackage) return schedule;
    const catalogTotal = resolveBudgetPriceAmount(catalogPackage.listedPrice, { ...priceContext, itemsById: catalogItemsById });
    const rowTotal = Number(row.price);
    if (!catalogTotal || !Number.isFinite(rowTotal)) return schedule;
    const scale = rowTotal / catalogTotal;
    return {
      ...schedule,
      payments: schedule.payments.map(payment => ({
        ...payment,
        amount: Number.isFinite(Number(payment.amount)) ? Math.round(Number(payment.amount) * scale * 100) / 100 : payment.amount,
      })),
    };
  };
  const getPackageScheduleTotal = schedule => {
    const payments = Array.isArray(schedule?.payments) ? schedule.payments : [];
    return payments.length ? payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0) : null;
  };
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
          packageRows.map(row => {
            const schedule = resolvePackageSchedule(row);
            return (
              <PackageBlock
                key={row.key}
                row={row}
                schedule={schedule}
                scheduleTotal={getPackageScheduleTotal(schedule)}
              />
            );
          })
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
