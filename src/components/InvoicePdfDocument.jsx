import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  BrandRow, BrandRule, BronzeMotif, ContinuedTag, Footer, PDF_COLOR, PDF_FONT,
  ensurePdfFontsRegistered, formatDisplayDate, pdfBaseStyles, sanitizePdfText, TitleBlock,
} from './pdfTheme';
import { formatMoney, resolveProgramPaymentSchedule } from './budgetCatalogUtils';
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

const styles = StyleSheet.create({
  page: pdfBaseStyles.page,
  section: {
    marginTop: 26,
  },
  sectionTitle: pdfBaseStyles.sectionTitle,
  sectionNote: pdfBaseStyles.sectionNote,
  table: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  packageBlock: {
    marginTop: 26,
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

// One line of the "Invoice breakdown" - shared, byte-for-byte, between the plain flat table
// (Service Invoice / a single milestone share) and the "Additional services outside the package"
// section of a Package Invoice, so a service/custom row never renders two different ways.
const ServiceItemRow = ({ row, isFirst }) => {
  const isChild = row.depth > 0;
  const isPackageHeader = row.kind === 'package';
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
          {sanitizePdfText(row.name)}
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

// The "Package block" (spec §1.1): the same shared IncludedServicesTable used by the Program
// Budget/Expected Expenses documents, so the standard-package contents can never drift between
// documents - preceded by a compact name/fee header (this document has no spare TitleBlock to
// reuse for it, that one already carries the invoice's own title).
const PackageBlock = ({ row, schedule }) => {
  const includedRows = (row.children || []).map(child => ({
    id: child.key || child.id,
    name: child.name,
    includedByPackageId: new Set(['programme']),
  }));
  // A short, fixed column header - the package's own name/fee is already shown in full in the
  // header block above the table, and doesn't need repeating (and stretching every row) here.
  const packagesMeta = [{ id: 'programme', label: 'Price', priceLabel: '' }];
  const payments = Array.isArray(schedule?.payments) ? schedule.payments : [];
  const scheduleRawTotal = payments.reduce((sum, payment) => sum + (Number(payment?.amount) || 0), 0);
  // The catalog schedule's own amounts only add up to the invoice total when the package is billed
  // at its plain catalog listed price - scale them to the row's actual price (a manual override, or
  // a customized set of children) so this table's total never disagrees with what's actually billed.
  const scaleRatio = scheduleRawTotal > 0 ? row.price / scheduleRawTotal : 1;
  const scheduleRows = payments.map((payment, index) => ({
    title: payment?.title || `Payment ${index + 1}`,
    amounts: [Math.round((Number(payment?.amount) || 0) * scaleRatio * 100) / 100],
  }));
  const scheduleTotal = Math.round((Number(row.price) || 0) * 100) / 100;

  return (
    <View style={styles.packageBlock}>
      <Text style={styles.sectionTitle}>Programme package</Text>
      <View style={styles.packageBlockHeader} wrap={false}>
        <Text style={styles.packageBlockName}>{sanitizePdfText(row.name)}</Text>
        {row.description ? <Text style={styles.descriptionText}>{sanitizePdfText(row.description)}</Text> : null}
        <Text style={styles.packageBlockFee}>{`Total programme fee ${formatRowAmount(row)}`}</Text>
      </View>
      <IncludedServicesTable
        packages={packagesMeta}
        includedRows={includedRows}
        title="Included in this programme"
        note="Every item below is already covered by the programme fee."
      />
      <PaymentScheduleTable packages={packagesMeta} rows={scheduleRows} totals={[scheduleTotal]} />
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
}) => {
  const rows = resolveInvoiceServiceRows(invoiceServices, catalogItemsById, priceContext);
  const subtotal = computeInvoiceSubtotal(rows);
  const total = computeInvoiceTotal(subtotal, taxPercent);
  const amountDue = computeInvoiceAmountDue(total, debtOrDeposit);
  const payerName = buildPayerName(customers);
  const payerLocation = buildPayerLocation(customers);
  const caseTitle = buildCaseTitle(customers);
  const noteList = Array.isArray(notes) ? notes.filter(note => String(note || '').trim()) : [];
  const docType = invoiceType === 'service' || invoiceType === 'programme_milestone'
    ? invoiceType
    : resolveInvoiceDocType(rows);
  const docLabel = DOC_LABEL_BY_TYPE[docType];
  const eyebrow = EYEBROW_BY_TYPE[docType];

  // Package Invoice (spec §1): adding a whole standard package - as opposed to a single
  // percent-of-package milestone share, or a handful of one-off services - gets its own
  // three-block layout (package block, payment schedule, additional services) instead of the flat
  // itemized breakdown below. Any other top-level row alongside the package is, by definition, a
  // service confirmed for this case that sits outside the standard package.
  const packageRows = rows.filter(row => row.kind === 'package');
  const isPackageInvoice = packageRows.length > 0;
  const otherRows = isPackageInvoice ? rows.filter(row => row.kind !== 'package') : rows;
  const displayRows = buildDisplayRows(otherRows);
  // The package entry's own `children` are a frozen name-only snapshot (invoiceCatalogUtils.js) -
  // its payment schedule instead always comes live from the catalog package it was added from, the
  // same source Program Budget/Expected Expenses read it from, so a schedule edit in the catalog is
  // reflected here too.
  const resolvePackageSchedule = row => {
    const catalogPackage = priceContext?.packagesById?.get?.(String(row.catalogId));
    return catalogPackage ? resolveProgramPaymentSchedule({ technical: catalogTechnical }, catalogPackage) : null;
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
          <>
            {packageRows.map(row => (
              <PackageBlock key={row.key} row={row} schedule={resolvePackageSchedule(row)} />
            ))}
            {displayRows.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Additional services outside the package</Text>
                <Text style={styles.sectionNote}>Confirmed for this case, billed alongside the standard package.</Text>
                <View style={styles.table}>
                  {displayRows.map((row, rowIndex) => (
                    <ServiceItemRow key={`${row.key || rowIndex}-${row.number}`} row={row} isFirst={rowIndex === 0} />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.section}>
            <View style={styles.table}>
              {displayRows.map((row, rowIndex) => (
                <ServiceItemRow key={`${row.key || rowIndex}-${row.number}`} row={row} isFirst={rowIndex === 0} />
              ))}
            </View>
          </View>
        )}

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
