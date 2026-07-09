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
import {
  BrandRow, BrandRule, BronzeMotif, ContinuedTag, Footer, PDF_COLOR, PDF_FONT,
  ensurePdfFontsRegistered, pdfBaseStyles, sanitizePdfText, TitleBlock,
} from './pdfTheme';

ensurePdfFontsRegistered();

const DOC_LABEL = 'Program Budget';
const PROGRAM_COL_WIDTH = 56;

const formatAmount = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount);
};

const styles = StyleSheet.create({
  page: pdfBaseStyles.page,
  section: {
    marginTop: 26,
  },
  sectionTitle: pdfBaseStyles.sectionTitle,
  sectionNote: pdfBaseStyles.sectionNote,
  programRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.docLine,
    borderTopStyle: 'solid',
    paddingVertical: 9,
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
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.docLine,
    borderTopStyle: 'solid',
  },
  labelCell: {
    flex: 1,
    paddingVertical: 6,
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
  programCell: {
    width: PROGRAM_COL_WIDTH,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderLeftWidth: 1,
    borderLeftColor: PDF_COLOR.docLine,
    borderLeftStyle: 'solid',
    justifyContent: 'center',
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

        {includedRows.length ? (
          <View style={styles.section}>
            <View wrap={false} minPresenceAhead={70}>
              <Text style={styles.sectionTitle}>Included services by program</Text>
              <Text style={styles.sectionNote}>An "x" marks the services included in each program package.</Text>
            </View>
            <View style={styles.table}>
              {renderProgramColumnsHead()}
              {includedRows.map(item => (
                <View key={item.id} style={styles.tableRow} wrap={false}>
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

        {scheduleRowCount > 0 ? (
          <View style={styles.section}>
            <View wrap={false} minPresenceAhead={70}>
              <Text style={styles.sectionTitle}>Payment schedule</Text>
            </View>
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
                <View key={`schedule-row-${rowIndex}`} style={styles.tableRow} wrap={false}>
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

        {Object.keys(groupedExpenses).length ? (
          <View style={styles.section}>
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
