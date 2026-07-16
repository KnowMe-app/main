import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  collectFormulaReferencedItemIds,
  formatMoney,
  getCategoryLabel,
  getClientNoteGroupLabel,
  getExpensePriceLabel,
  getVisibleSortedPackages,
  normalizeClientNotes,
  resolveBudgetPriceAmount,
  resolvePaymentAmount,
  resolveProgramPaymentSchedule,
  KNOWN_CLIENT_NOTE_GROUPS,
} from './budgetCatalogUtils';
import {
  BrandRow, BrandRule, BronzeMotif, ContinuedTag, Footer, PDF_COLOR, PDF_FONT,
  ensurePdfFontsRegistered, formatDisplayDate, pdfBaseStyles, sanitizePdfText, TitleBlock,
} from './pdfTheme';

ensurePdfFontsRegistered();

const DOC_LABEL = 'Program Budget';
const PROGRAM_COL_WIDTH = 56;

// Bare (no-currency) number for a table cell, as opposed to formatMoney (budgetCatalogUtils),
// the one currency-labeled money format shared by every UKRCOM document (spec §4).
export const formatAmount = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount);
};

// Two-decimal variant (design-tasks-8 §9) for the single-programme documents (Invoice, Expected
// Expenses): "3,000.00" next to "431.03" keeps every decimal point on the same vertical line
// down an amount column.
export const formatAmountTwoDecimals = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
};

const styles = StyleSheet.create({
  page: pdfBaseStyles.page,
  section: {
    marginTop: 26,
  },
  // Extra breathing room above Payment schedule so Programs and Payment schedule don't sit flush
  // against each other on page 1 (spec §2).
  scheduleSection: {
    marginTop: 23,
  },
  sectionTitle: pdfBaseStyles.sectionTitle,
  sectionNote: pdfBaseStyles.sectionNote,
  programRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.docLine,
    borderTopStyle: 'solid',
    paddingVertical: 6.5,
  },
  programRowFirst: {
    borderTopWidth: 0,
  },
  programIndexCell: {
    width: 28,
  },
  programIndexText: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 9,
    color: PDF_COLOR.bronze,
  },
  programBody: {
    flex: 1,
    paddingRight: 12,
  },
  programName: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 10.5,
    color: PDF_COLOR.docInk,
    marginBottom: 2,
  },
  programDescription: {
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    color: PDF_COLOR.inkSoft,
    lineHeight: 1.45,
  },
  programPrice: {
    width: 92,
    textAlign: 'right',
    fontFamily: PDF_FONT.display,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 12,
    color: PDF_COLOR.bronzeDeep,
  },
  table: {
    borderWidth: 1,
    borderColor: PDF_COLOR.docLine,
    borderStyle: 'solid',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeadRow: {
    flexDirection: 'row',
    backgroundColor: PDF_COLOR.card,
  },
  // Row hairlines sit a step lighter/thinner than the table frame (design-tasks-8 §1) so the
  // grid recedes behind the content instead of reading like a spreadsheet.
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 0.75,
    borderTopColor: PDF_COLOR.docLineSoft,
    borderTopStyle: 'solid',
  },
  labelCell: {
    flex: 1,
    paddingVertical: 3.5,
    paddingHorizontal: 9,
    justifyContent: 'center',
  },
  labelCellHeadText: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8.5,
    color: PDF_COLOR.docInk,
  },
  labelCellText: {
    fontFamily: PDF_FONT.body,
    fontSize: 8.5,
    color: PDF_COLOR.docInk,
    lineHeight: 1.4,
  },
  labelCellDescription: {
    fontFamily: PDF_FONT.body,
    fontSize: 7.5,
    color: PDF_COLOR.inkSoft,
    lineHeight: 1.4,
    marginTop: 1.5,
  },
  // Dense variant: tighter row padding + slightly smaller cell text for the single-page Invoice
  // (design-tasks §3, tightened further in design-tasks-4 §7 so a package invoice fits one page;
  // relaxed a step in design-tasks-8 §1 - the rows needed breathing room more than the page
  // needed those few points back).
  denseCell: {
    paddingVertical: 3,
  },
  denseCellText: {
    fontSize: 8,
    lineHeight: 1.35,
  },
  // Column divider between the two service cells of a compact included-services row - the same
  // hairline the program columns use, so the compact table still reads as part of one table family.
  compactSecondCell: {
    borderLeftWidth: 0.75,
    borderLeftColor: PDF_COLOR.docLineSoft,
    borderLeftStyle: 'solid',
  },
  programCell: {
    width: PROGRAM_COL_WIDTH,
    paddingVertical: 3.5,
    paddingHorizontal: 4,
    borderLeftWidth: 1,
    borderLeftColor: PDF_COLOR.docLine,
    borderLeftStyle: 'solid',
    justifyContent: 'center',
  },
  // `light` tables (the single-amount-column Invoice/Expected-Expenses ones, design-tasks-8 §1)
  // drop the vertical divider before the amount column entirely - with one column of numbers the
  // hairline only added grid noise.
  lightProgramCell: {
    borderLeftWidth: 0,
  },
  programCellHead: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8.5,
    textAlign: 'center',
    color: PDF_COLOR.docInk,
  },
  programCellHeadPrice: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 7.5,
    textAlign: 'center',
    color: PDF_COLOR.bronzeDeep,
    marginTop: 2,
  },
  amountCellText: {
    fontFamily: PDF_FONT.body,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 8.5,
    textAlign: 'center',
    color: PDF_COLOR.docInk,
  },
  // Credits/adjustments (design-tasks-8 §5): negative amounts step out of the ink color into the
  // subdued bronze accent, so a credit reads as a different kind of line than a charge.
  creditAmountCellText: {
    color: PDF_COLOR.bronze,
  },
  markCellText: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8.5,
    textAlign: 'center',
    color: PDF_COLOR.bronze,
  },
  totalRow: {
    backgroundColor: PDF_COLOR.card,
  },
  categoryBlock: {
    marginBottom: 14,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: PDF_COLOR.card,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 9,
    marginBottom: 2,
  },
  categoryTitle: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 9.5,
    color: PDF_COLOR.docInk,
  },
  categoryMeta: {
    fontFamily: PDF_FONT.body,
    fontSize: 8,
    color: PDF_COLOR.bronze,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLOR.docLine,
    borderBottomStyle: 'solid',
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  expenseBody: {
    flex: 1,
    paddingRight: 10,
  },
  expenseName: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 8.8,
    color: PDF_COLOR.docInk,
    marginBottom: 1.5,
  },
  expenseDescription: {
    fontFamily: PDF_FONT.body,
    fontSize: 8,
    color: PDF_COLOR.inkSoft,
    lineHeight: 1.4,
  },
  expensePrice: {
    width: 84,
    textAlign: 'right',
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 8.8,
    color: PDF_COLOR.bronzeDeep,
  },
  noteCard: {
    backgroundColor: PDF_COLOR.card,
    borderRadius: 8,
    padding: 13,
    marginBottom: 10,
  },
  noteGroupTitle: {
    fontFamily: PDF_FONT.body,
    fontWeight: 600,
    fontSize: 9.5,
    marginBottom: 6,
    color: PDF_COLOR.docInk,
  },
  noteRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  noteBullet: {
    width: 12,
    fontFamily: PDF_FONT.body,
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

const ProgramColumnsHead = ({ packages, leadLabel, dense = false, light = false }) => (
  <View style={styles.tableHeadRow} wrap={false}>
    <View style={[styles.labelCell, dense ? styles.denseCell : null]}>
      <Text style={styles.labelCellHeadText}>{leadLabel}</Text>
    </View>
    {packages.map(program => (
      <View key={program.id} style={[styles.programCell, dense ? styles.denseCell : null, light ? styles.lightProgramCell : null]}>
        {program.label ? <Text style={styles.programCellHead}>{program.label}</Text> : null}
        <Text style={styles.programCellHeadPrice}>{program.priceLabel}</Text>
      </View>
    ))}
  </View>
);

// A schedule/breakdown cell amount is null (no value), a number (formatted bare), a pass-through
// string (e.g. "GIFT" or a pre-formatted two-decimal amount), or - for the invoice's credit rows
// (design-tasks-8 §5) - an object `{ label, tone: 'credit' }` whose label renders in the subdued
// credit color.
const renderAmountCell = amount => {
  if (amount == null) return { label: '-', credit: false };
  if (typeof amount === 'object') {
    return { label: sanitizePdfText(amount.label), credit: amount.tone === 'credit' };
  }
  return { label: typeof amount === 'string' ? sanitizePdfText(amount) : formatAmount(amount), credit: false };
};

// The "Included in this programme" table (spec §1.2/§2). Shared, byte-for-byte, between the
// catalog-wide Program Budget (one column per programme) and the case-specific single-programme
// documents (the package Invoice and Expected Expenses) - so the documents can never drift apart
// on how included services are listed.
// packages: [{ id, label, priceLabel }] · includedRows: [{ id, name, includedByPackageId: Set<id> }]
//
// `compact` (design-tasks-4 §7) is the single-programme layout the Invoice and Expected Expenses
// share: every listed service is included by definition, so the inclusion-mark column would be a
// column of identical "x" marks against a mostly-empty right edge. Instead the services flow two
// per row - same table frame, header, hairlines, and type as everywhere else - roughly halving
// the table's height so a package invoice can fit one page.
export const IncludedServicesTable = ({
  packages = [],
  includedRows,
  title = 'Included services by program',
  note = 'An "x" marks the services included in each program package.',
  sectionStyle,
  dense = false,
  compact = false,
}) => {
  if (!includedRows.length) return null;
  if (compact) {
    const pairedRows = [];
    for (let index = 0; index < includedRows.length; index += 2) {
      pairedRows.push(includedRows.slice(index, index + 2));
    }
    return (
      <View style={sectionStyle || styles.section}>
        <View wrap={false} minPresenceAhead={70}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
        </View>
        <View style={styles.table}>
          <View style={styles.tableHeadRow} wrap={false}>
            <View style={[styles.labelCell, styles.denseCell]}>
              <Text style={styles.labelCellHeadText}>Provided service</Text>
            </View>
          </View>
          {pairedRows.map((pair, rowIndex) => (
            <View key={pair[0].id} style={styles.tableRow} wrap={false}>
              <View style={[styles.labelCell, styles.denseCell]}>
                <Text style={[styles.labelCellText, styles.denseCellText]}>{sanitizePdfText(pair[0].name)}</Text>
              </View>
              <View style={[styles.labelCell, styles.denseCell, styles.compactSecondCell]}>
                {pair[1] ? <Text style={[styles.labelCellText, styles.denseCellText]}>{sanitizePdfText(pair[1].name)}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }
  return (
    <View style={sectionStyle || styles.section}>
      <View wrap={false} minPresenceAhead={70}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
      </View>
      <View style={styles.table}>
        <ProgramColumnsHead packages={packages} leadLabel="Provided service" dense={dense} />
        {includedRows.map(item => (
          <View key={item.id} style={styles.tableRow} wrap={false}>
            <View style={[styles.labelCell, dense ? styles.denseCell : null]}>
              <Text style={styles.labelCellText}>{sanitizePdfText(item.name)}</Text>
            </View>
            {packages.map(program => (
              <View key={`${item.id}-${program.id}`} style={[styles.programCell, dense ? styles.denseCell : null]}>
                <Text style={styles.markCellText}>{item.includedByPackageId.has(String(program.id)) ? 'x' : ''}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

// The "Payment schedule" table (spec §1.2/§2) - same sharing rationale as IncludedServicesTable
// above. rows: [{ title, amounts: [amountOrNull, ...] }] · totals: optional [amountOrNull, ...]
// (one per package column, same order as `packages`) - omit it when a column's total is already
// shown once in that program's own header cell (ProgramColumnsHead), so the table doesn't just
// repeat the same numbers at its foot (round7 spec A.1).
// A cell amount may also be a free-text label (e.g. "GIFT") when the table renders invoice
// breakdown rows - a string passes through as-is instead of being coerced to a number.
// `light` (design-tasks-8 §1) drops the vertical divider before the amount column(s);
// `titleStyle` lets a document promote one table's heading (the invoice's "Breakdown",
// design-tasks-8 §2) without a second table component.
export const PaymentScheduleTable = ({ packages, rows, totals, title = 'Payment schedule', leadLabel = 'Milestone', sectionStyle, dense = false, light = false, titleStyle }) => (rows.length ? (
  <View style={sectionStyle || styles.scheduleSection}>
    <View wrap={false} minPresenceAhead={70}>
      <Text style={titleStyle ? [styles.sectionTitle, titleStyle] : styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.table}>
      <ProgramColumnsHead packages={packages} leadLabel={leadLabel} dense={dense} light={light} />
      {rows.map((row, rowIndex) => (
        <View key={`schedule-row-${rowIndex}`} style={styles.tableRow} wrap={false}>
          <View style={[styles.labelCell, dense ? styles.denseCell : null]}>
            <Text style={dense ? [styles.labelCellText, styles.denseCellText] : styles.labelCellText}>
              {`${rowIndex + 1}. ${sanitizePdfText(row.title)}`}
            </Text>
            {row.description ? <Text style={styles.labelCellDescription}>{sanitizePdfText(row.description)}</Text> : null}
          </View>
          {row.amounts.map((amount, columnIndex) => {
            const cell = renderAmountCell(amount);
            return (
              <View key={`schedule-cell-${rowIndex}-${columnIndex}`} style={[styles.programCell, dense ? styles.denseCell : null, light ? styles.lightProgramCell : null]}>
                <Text
                  style={[
                    styles.amountCellText,
                    dense ? styles.denseCellText : null,
                    cell.credit ? styles.creditAmountCellText : null,
                  ]}
                >
                  {cell.label}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
      {Array.isArray(totals) ? (
        <View style={[styles.tableRow, styles.totalRow]} wrap={false}>
          <View style={styles.labelCell}>
            <Text style={styles.labelCellHeadText}>Total</Text>
          </View>
          {totals.map((total, columnIndex) => (
            <View key={`schedule-total-${columnIndex}`} style={styles.programCell}>
              <Text style={styles.programCellHead}>{total == null ? '-' : formatAmount(total)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  </View>
) : null);

const BudgetPdfDocument = ({ catalog, rates = null }) => {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  const visibleItems = items.filter(item => !item.hidden);
  const itemsById = new Map(visibleItems.map(item => [String(item.id), item]));
  const priceContext = { itemsById: new Map(items.map(item => [String(item.id), item])), rates };
  const packages = getVisibleSortedPackages(catalog, priceContext);
  const formulaReferencedIds = collectFormulaReferencedItemIds(catalog);
  const resolveListedPrice = program =>
    resolveBudgetPriceAmount(program?.listedPrice, priceContext) ?? program?.listedPrice;

  const programSchedules = packages.map(program => resolveProgramPaymentSchedule(catalog, program));
  const scheduleRowCount = programSchedules.reduce(
    (count, schedule) => Math.max(count, Array.isArray(schedule?.payments) ? schedule.payments.length : 0),
    0,
  );
  const scheduleRows = Array.from({ length: scheduleRowCount }, (_, index) => {
    const titleSource = programSchedules.find(schedule => schedule?.payments?.[index]?.title);
    return {
      title: titleSource?.payments[index].title || `Payment ${index + 1}`,
      amounts: programSchedules.map((schedule, programIndex) => {
        const payment = schedule?.payments?.[index];
        if (!payment) return undefined;
        return resolvePaymentAmount(payment, resolveListedPrice(packages[programIndex]));
      }),
    };
  });

  const includedIds = [];
  packages.forEach(program => {
    (Array.isArray(program.children) ? program.children : []).forEach(id => {
      const key = String(id);
      if (!includedIds.includes(key)) includedIds.push(key);
    });
  });
  const includedIdSet = new Set(includedIds);
  // Row order follows each service's position within the packages (first package
  // that includes it wins), so reordering services in a package reorders this table.
  const includedRows = includedIds
    .map(id => itemsById.get(id))
    .filter(Boolean)
    .map(item => ({
      id: item.id,
      name: item.name,
      includedByPackageId: new Set(
        packages.filter(program => Array.isArray(program.children)
          && program.children.some(childId => String(childId) === String(item.id))).map(program => String(program.id)),
      ),
    }));

  const packagesMeta = packages.map((program, index) => ({
    id: program.id,
    label: `#${index + 1}`,
    priceLabel: formatAmount(resolveListedPrice(program)),
  }));

  const groupedExpenses = visibleItems.reduce((groups, item) => {
    if (includedIdSet.has(String(item.id))) return groups;
    // Sub-services referenced from price formulas are already included in
    // another service/package price, so they are not listed separately.
    if (formulaReferencedIds.has(String(item.id))) return groups;
    const category = item.category || 'Other';
    if (!groups[category]) groups[category] = [];
    groups[category].push(item);
    return groups;
  }, {});

  const clientNotes = normalizeClientNotes(catalog?.clientNotes);
  const noteGroups = [
    ...KNOWN_CLIENT_NOTE_GROUPS,
    ...Object.keys(clientNotes).filter(key => !KNOWN_CLIENT_NOTE_GROUPS.includes(key)),
  ]
    .map(key => [key, clientNotes[key] || []])
    .filter(([, notes]) => notes.length);

  const dateLabel = formatDisplayDate(new Date());

  return (
    <Document title="UKRCOM - Program Budget" subject="Surrogacy program budget" creator="UKRCOM">
      <Page size="A4" style={styles.page} wrap>
        <BronzeMotif />
        <ContinuedTag label={DOC_LABEL} />
        <BrandRow metaLines={[dateLabel, `${packages.length} programmes`]} />
        <BrandRule />
        <TitleBlock
          eyebrow="Programme catalog"
          title="Program Budget"
          subtitle="Every programme UKRCOM offers, what it includes, and how the payment schedule breaks down."
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Programs</Text>
          {packages.map((program, index) => (
            <View
              key={program.id}
              style={[styles.programRow, index === 0 ? styles.programRowFirst : null]}
              wrap={false}
            >
              <View style={styles.programIndexCell}>
                <Text style={styles.programIndexText}>{`#${index + 1}`}</Text>
              </View>
              <View style={styles.programBody}>
                <Text style={styles.programName}>{sanitizePdfText(program.name)}</Text>
                {program.description ? (
                  <Text style={styles.programDescription}>{sanitizePdfText(program.description)}</Text>
                ) : null}
              </View>
              <Text style={styles.programPrice}>{formatMoney(resolveListedPrice(program), program.currency || 'EUR')}</Text>
            </View>
          ))}
        </View>

        {/* Client-facing reading order is Programs -> Payment schedule -> Included services ->
            Other expenses (round7 spec A.2): the payment schedule stays on page 1, right after
            Programs, since its numbers are the direct continuation of what's shown there. Included
            services (and Other expenses) each start on their own fresh page (`break`) regardless
            of how much room is left on the previous one, so a large table is never forced to split
            mid-page. */}
        <PaymentScheduleTable packages={packagesMeta} rows={scheduleRows} />

        <View break={includedRows.length > 0}>
          <IncludedServicesTable packages={packagesMeta} includedRows={includedRows} />
        </View>

        {Object.keys(groupedExpenses).length ? (
          // `break` starts Other expenses on a fresh page so it never trails onto the
          // last line of the Included services table above (only the section start is forced;
          // page breaks between categories inside this section remain natural).
          <View style={styles.section} break>
            <View wrap={false} minPresenceAhead={70}>
              <Text style={styles.sectionTitle}>Other expenses</Text>
              <Text style={styles.sectionNote}>"From" prices are lower bounds of a range.</Text>
            </View>
            {Object.entries(groupedExpenses).map(([category, categoryItems]) => (
              <View key={category} style={styles.categoryBlock}>
                <View style={styles.categoryHeader} wrap={false} minPresenceAhead={40}>
                  <Text style={styles.categoryTitle}>{sanitizePdfText(getCategoryLabel(category))}</Text>
                  <Text style={styles.categoryMeta}>
                    {`${categoryItems.length} ${categoryItems.length === 1 ? 'service' : 'services'}`}
                  </Text>
                </View>
                {categoryItems.map(item => (
                  <View key={item.id} style={styles.expenseRow} wrap={false}>
                    <View style={styles.expenseBody}>
                      <Text style={styles.expenseName}>{sanitizePdfText(item.name)}</Text>
                      {item.description ? (
                        <Text style={styles.expenseDescription}>{sanitizePdfText(item.description)}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.expensePrice}>{getExpensePriceLabel(item, priceContext)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {noteGroups.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Good to know</Text>
            {noteGroups.map(([groupKey, notes]) => (
              <View key={groupKey} style={styles.noteCard} wrap={false}>
                <Text style={styles.noteGroupTitle}>{sanitizePdfText(getClientNoteGroupLabel(groupKey))}</Text>
                {notes.map((note, index) => (
                  <View key={`${groupKey}-${index}`} style={styles.noteRow}>
                    <Text style={styles.noteBullet}>•</Text>
                    <Text style={styles.noteText}>{sanitizePdfText(note)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <Footer />
      </Page>
    </Document>
  );
};

export default BudgetPdfDocument;
