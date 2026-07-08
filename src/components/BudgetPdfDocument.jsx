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
  resolveProgramPaymentSchedule,
  KNOWN_CLIENT_NOTE_GROUPS,
} from './budgetCatalogUtils';

const UKRCOM_MARKER = 'REPRODUCTIVE AGENCY "UKRCOM"';

const INK = '#33291f';
const MUTED = '#6f6359';
const ACCENT = '#7a4c2f';
const SOFT = '#9a6b48';
const LINE = '#e6d7c4';
const HEAD_BG = '#f3e6d2';
const ROW_ALT = '#faf3e8';
const CARD_BG = '#fdf8f0';

const PROGRAM_COL_WIDTH = 52;

// The built-in Helvetica font only covers WinAnsi glyphs, so swap the few
// characters from the catalog data that would otherwise render blank.
const sanitizePdfText = value => String(value ?? '')
  .replace(/№/g, 'No.')
  .replace(/[’‘]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/[✓✔]/g, 'x')
  .replace(/\s+/g, ' ')
  .trim();

const formatAmount = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount);
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 62,
    paddingHorizontal: 44,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: INK,
    backgroundColor: '#ffffff',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  eyebrow: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    letterSpacing: 1.8,
    color: SOFT,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 24,
    letterSpacing: -0.5,
    color: INK,
  },
  headerDate: {
    fontSize: 9,
    color: MUTED,
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 9.5,
    lineHeight: 1.5,
    color: MUTED,
    marginTop: 7,
    maxWidth: 420,
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12.5,
    letterSpacing: -0.2,
    marginBottom: 3,
    color: INK,
  },
  sectionNote: {
    fontSize: 8.5,
    color: MUTED,
    marginBottom: 9,
  },
  programRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: 1,
    borderTopColor: LINE,
    borderTopStyle: 'solid',
    paddingVertical: 8,
  },
  programIndexCell: {
    width: 28,
  },
  programIndexText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: SOFT,
  },
  programBody: {
    flex: 1,
    paddingRight: 12,
  },
  programName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10.5,
    marginBottom: 2,
  },
  programDescription: {
    fontSize: 8.5,
    color: MUTED,
    lineHeight: 1.45,
  },
  programPrice: {
    width: 88,
    textAlign: 'right',
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: ACCENT,
  },
  table: {
    borderWidth: 1,
    borderColor: LINE,
    borderStyle: 'solid',
    borderRadius: 6,
  },
  tableHeadRow: {
    flexDirection: 'row',
    backgroundColor: HEAD_BG,
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: LINE,
    borderTopStyle: 'solid',
  },
  tableRowAlt: {
    backgroundColor: ROW_ALT,
  },
  labelCell: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  labelCellHeadText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    color: '#4d392b',
  },
  labelCellText: {
    fontSize: 8.5,
    lineHeight: 1.4,
  },
  programCell: {
    width: PROGRAM_COL_WIDTH,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderLeftWidth: 1,
    borderLeftColor: LINE,
    borderLeftStyle: 'solid',
    justifyContent: 'center',
  },
  programCellHead: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textAlign: 'center',
    color: '#4d392b',
  },
  programCellHeadPrice: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    textAlign: 'center',
    color: ACCENT,
    marginTop: 2,
  },
  amountCellText: {
    fontSize: 8.5,
    textAlign: 'center',
  },
  markCellText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textAlign: 'center',
    color: ACCENT,
  },
  totalRow: {
    borderTopColor: '#d8c3a8',
    backgroundColor: HEAD_BG,
  },
  categoryBlock: {
    marginBottom: 12,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: HEAD_BG,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  categoryTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    color: '#4d392b',
  },
  categoryMeta: {
    fontSize: 8,
    color: SOFT,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#efe3d1',
    borderBottomStyle: 'solid',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  expenseBody: {
    flex: 1,
    paddingRight: 10,
  },
  expenseName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.8,
    marginBottom: 1.5,
  },
  expenseDescription: {
    fontSize: 8,
    color: MUTED,
    lineHeight: 1.4,
  },
  expensePrice: {
    width: 80,
    textAlign: 'right',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.8,
    color: ACCENT,
  },
  noteCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: LINE,
    borderStyle: 'solid',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  noteGroupTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    marginBottom: 6,
    color: '#4d392b',
  },
  noteRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  noteBullet: {
    width: 12,
    fontSize: 8.5,
    color: ACCENT,
  },
  noteText: {
    flex: 1,
    fontSize: 8.5,
    lineHeight: 1.45,
    color: '#5a4d42',
  },
  footer: {
    position: 'absolute',
    left: 44,
    right: 44,
    bottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: LINE,
    borderTopStyle: 'solid',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7.5,
    color: MUTED,
  },
});

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
      amounts: programSchedules.map(schedule => schedule?.payments?.[index]?.amount),
    };
  });
  const scheduleTotals = programSchedules.map(schedule => (Array.isArray(schedule?.payments)
    ? schedule.payments.reduce((sum, payment) => sum + (Number(payment?.amount) || 0), 0)
    : null));

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
    .filter(Boolean);

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

  const dateLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const renderProgramColumnsHead = () => (
    <View style={styles.tableHeadRow} wrap={false}>
      <View style={styles.labelCell}>
        <Text style={styles.labelCellHeadText}>Provided service</Text>
      </View>
      {packages.map((program, index) => (
        <View key={program.id} style={styles.programCell}>
          <Text style={styles.programCellHead}>{`#${index + 1}`}</Text>
          <Text style={styles.programCellHeadPrice}>{formatAmount(resolveListedPrice(program))}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <Document title="UKRCOM - Program Budget" subject="Surrogacy program budget" creator="UKRCOM">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>{UKRCOM_MARKER}</Text>
            <Text style={styles.title}>Program Budget</Text>
          </View>
          <Text style={styles.headerDate}>{dateLabel}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Programs</Text>
          {packages.map((program, index) => (
            <View key={program.id} style={styles.programRow} wrap={false}>
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

        {scheduleRowCount > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment schedule</Text>
            <View style={styles.table}>
              <View style={styles.tableHeadRow} wrap={false}>
                <View style={styles.labelCell}>
                  <Text style={styles.labelCellHeadText}>Milestone</Text>
                </View>
                {packages.map((program, index) => (
                  <View key={program.id} style={styles.programCell}>
                    <Text style={styles.programCellHead}>{`#${index + 1}`}</Text>
                    <Text style={styles.programCellHeadPrice}>{formatAmount(resolveListedPrice(program))}</Text>
                  </View>
                ))}
              </View>
              {scheduleRows.map((row, rowIndex) => (
                <View
                  key={`schedule-row-${rowIndex}`}
                  style={rowIndex % 2 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}
                  wrap={false}
                >
                  <View style={styles.labelCell}>
                    <Text style={styles.labelCellText}>{`${rowIndex + 1}. ${sanitizePdfText(row.title)}`}</Text>
                  </View>
                  {row.amounts.map((amount, columnIndex) => (
                    <View key={`schedule-cell-${rowIndex}-${columnIndex}`} style={styles.programCell}>
                      <Text style={styles.amountCellText}>{amount == null ? '-' : formatAmount(amount)}</Text>
                    </View>
                  ))}
                </View>
              ))}
              <View style={[styles.tableRow, styles.totalRow]} wrap={false}>
                <View style={styles.labelCell}>
                  <Text style={styles.labelCellHeadText}>Total</Text>
                </View>
                {scheduleTotals.map((total, columnIndex) => (
                  <View key={`schedule-total-${columnIndex}`} style={styles.programCell}>
                    <Text style={styles.programCellHead}>{total == null ? '-' : formatAmount(total)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {includedRows.length ? (
          <View style={styles.section} break>
            <Text style={styles.sectionTitle}>Included services by program</Text>
            <Text style={styles.sectionNote}>An “x” marks the services included in each program package.</Text>
            <View style={styles.table}>
              {renderProgramColumnsHead()}
              {includedRows.map((item, rowIndex) => (
                <View
                  key={item.id}
                  style={rowIndex % 2 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}
                  wrap={false}
                >
                  <View style={styles.labelCell}>
                    <Text style={styles.labelCellText}>{sanitizePdfText(item.name)}</Text>
                  </View>
                  {packages.map(program => {
                    const included = Array.isArray(program.children)
                      && program.children.some(id => String(id) === String(item.id));
                    return (
                      <View key={`${item.id}-${program.id}`} style={styles.programCell}>
                        <Text style={styles.markCellText}>{included ? 'x' : ''}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {Object.keys(groupedExpenses).length ? (
          <View style={styles.section} break>
            <Text style={styles.sectionTitle}>Other expenses</Text>
            <Text style={styles.sectionNote}>“From” prices are lower bounds of a range.</Text>
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

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{sanitizePdfText(`${UKRCOM_MARKER} · Program Budget · generated ${dateLabel}`)}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
};

export default BudgetPdfDocument;
