// "Expected expenses" is a billing forecast for a whole surrogacy program: pick a budget/packages
// program once, and its payment schedule (budget/technical.paymentSchedules) is turned into a
// series of groups - one future invoice per scheduled payment, in the same order as the schedule.
// The package is only ever referenced by id (its own default payment schedule is already attached
// to it in the catalog, so no separate paymentScheduleId is stored here).
//
// Each group is nothing more than a list of service rows (the same catalog-item / custom /
// percent-of-package entries used everywhere else in the invoice builder - see
// invoiceCatalogUtils.js). There is no separate "scheduled amount" field: a group's total is
// simply the sum of its rows, and the row that carries the bulk of a payment is normally a
// percent-of-package entry (e.g. "20% of the package price"), so the euro amount recalculates
// automatically whenever the package price changes instead of going stale. Admins can freely add,
// edit, or remove any row - catalog-linked, custom, or percent - on any group.
//
// The whole plan is stored as invoiceBuilder/expectedExpenses - a single object, not a list of
// documents - so it lives right next to the rest of the invoice-builder JSON on the backend. A
// group's title/date/stage is never stored on the group itself - it's read from the package's
// payment schedule by index (mirrors the schedule 1:1) - but the plan does cache the resolved
// title on each milestone at build time (same "frozen snapshot" convention the rest of the
// invoice builder uses for a package entry's children), so rendering never depends on the
// schedule still existing unchanged in the catalog.

import {
  computeInvoiceSubtotal,
  computeInvoiceTotal,
  createEntryId,
  makeCatalogItemEntry,
  makeCustomEntry,
  makePercentOfPackageEntry,
  normalizeServiceEntries,
  resolveServiceRow,
  setEntryField,
} from './invoiceCatalogUtils';
import { resolveProgramPaymentSchedule, resolvePaymentAmount } from './budgetCatalogUtils';

// --- Building a plan from a chosen catalog package + its payment schedule ------------------------------------------------------

// The package overview only ever lists service names (its listed price already covers all of
// them) - no per-item prices are stored or shown.
export const buildPackageOverviewChildren = pkg => (Array.isArray(pkg?.children) ? pkg.children : [])
  .map(catalogId => makeCatalogItemEntry(catalogId));

// A schedule payment's euro amount is only ever used once, to seed a percent-of-package row (e.g.
// a 8772 EUR first payment on a 40000 EUR package becomes "21.9300% of the package") - from then on
// that row is a normal, independently editable service row like any other. Kept to 4 decimal places
// (not 2) so resolving the percent back to euros lands on the same cent the schedule specified,
// instead of drifting by tens of euros on packages whose payments aren't a round percentage.
const buildGroupFromSchedulePayment = (pkg, payment) => {
  const listedPrice = Number(pkg?.listedPrice) || 0;
  const amount = resolvePaymentAmount(payment, listedPrice) || 0;
  if (!listedPrice || !amount) return [];
  const percent = Math.round((amount / listedPrice) * 1e6) / 1e4;
  return [makePercentOfPackageEntry(pkg?.id, percent, { expectedExpenseRole: 'scheduled' })];
};

// A package needs a resolved, positive listed price before a plan can be built from it - otherwise
// every percent-of-package row would divide by zero. Throws instead of silently building an empty plan.
export const getExpectedExpensesPackagePrice = pkg => {
  const packagePrice = Number(pkg?.listedPrice);
  if (!Number.isFinite(packagePrice) || packagePrice <= 0) {
    throw new Error('Expected expenses require a resolved positive package price.');
  }
  return packagePrice;
};

// A package with no payment schedule of its own is billed in one go, so its plan is a single
// milestone for 100% of the package price. (A schedule-less package that opens a two-part offer -
// see resolveInitialPaymentOffer below - is handled there instead.) Завантаження сирих груп цього
// запасного графіка не бере навмисно: там групи вирівнюються по кроках справжнього графіка, і
// вигаданий крок мовчки злив би їх в одну.
export const resolveExpectedExpensesSchedule = (catalog, pkg) => {
  const schedule = resolveProgramPaymentSchedule(catalog, pkg);
  if (Array.isArray(schedule?.payments) && schedule.payments.length) return schedule;
  if (!pkg) return null;
  return { id: '', name: '', payments: [{ title: pkg.name || 'Payment', percent: 100 }] };
};

export const buildMilestonesFromSchedule = (pkg, schedule, { taxPercent = 0 } = {}) =>
  (Array.isArray(schedule?.payments) ? schedule.payments : []).map((payment, index) => ({
    id: createEntryId(),
    title: payment?.title || `Payment ${index + 1}`,
    taxPercent,
    // The first milestone doubles as the "introducing the program" invoice: it shows the full
    // package overview (included services + the whole schedule) instead of just its own line.
    showPackageOverview: index === 0,
    services: buildGroupFromSchedulePayment(pkg, payment),
  }));

const buildPackageSnapshot = pkg => ({
  name: pkg?.name || '',
  description: pkg?.description || '',
  listedPrice: Number(pkg?.listedPrice) || 0,
  currency: pkg?.currency || 'EUR',
  children: buildPackageOverviewChildren(pkg),
});

export const buildExpectedExpensesPlan = (pkg, schedule, { taxPercent = 0 } = {}) => ({
  packageId: String(pkg?.id ?? ''),
  packageSnapshot: buildPackageSnapshot(pkg),
  milestones: buildMilestonesFromSchedule(pkg, schedule, { taxPercent }),
});

// --- Two-part offers: an initial payment billed first, then the programme fee on its own schedule --------------------------------
//
// «Special Offer - Initial Payment» (без графіка, сплачується першим і окремо) і «Special Offer -
// Programme Fee» (графік ps-6: 4 × 25%) — це одна програма, розкладена на два пакети каталогу. План
// на будь-який із них мусить мати 5 етапів: спершу весь Initial Payment, далі графік Programme Fee.
// Явного звʼязку між пакетами в каталозі немає, тож пару впізнає спільна назва до « - »: рівно один
// пакет без графіка (initial) і рівно один із графіком (programme).
const OFFER_NAME_SEPARATOR = /\s+[-–—]\s+/;

const splitOfferName = name => {
  const parts = String(name || '').split(OFFER_NAME_SEPARATOR);
  if (parts.length < 2) return null;
  const suffix = parts.pop().trim();
  const prefix = parts.join(' - ').trim();
  return prefix && suffix ? { prefix, suffix } : null;
};

const hasOwnSchedule = (catalog, pkg) => {
  const schedule = resolveProgramPaymentSchedule(catalog, pkg);
  return Array.isArray(schedule?.payments) && schedule.payments.length > 0;
};

export const resolveInitialPaymentOffer = (catalog, pkg) => {
  const own = splitOfferName(pkg?.name);
  if (!own) return null;
  const prefixKey = own.prefix.toLowerCase();
  const siblings = (Array.isArray(catalog?.packages) ? catalog.packages : [])
    .filter(candidate => splitOfferName(candidate?.name)?.prefix.toLowerCase() === prefixKey);
  const initials = siblings.filter(candidate => !hasOwnSchedule(catalog, candidate));
  const programmes = siblings.filter(candidate => hasOwnSchedule(catalog, candidate));
  if (initials.length !== 1 || programmes.length !== 1) return null;
  const [initialPackage] = initials;
  const [programmePackage] = programmes;
  if (String(initialPackage.id) === String(programmePackage.id)) return null;
  return {
    name: own.prefix,
    initialTitle: splitOfferName(initialPackage.name).suffix,
    initialPackage,
    programmePackage,
    programmeSchedule: resolveProgramPaymentSchedule(catalog, programmePackage),
  };
};

// `initialPackage`/`programmePackage` must already carry resolved numeric prices. `schedule`
// overrides the programme's own schedule (the "apply schedule from catalog" picker).
export const buildInitialPaymentOfferMilestones = (offer, { taxPercent = 0, schedule } = {}) => [
  {
    id: createEntryId(),
    title: offer.initialTitle || offer.initialPackage?.name || 'Initial payment',
    taxPercent,
    showPackageOverview: true,
    services: [makePercentOfPackageEntry(offer.initialPackage?.id, 100, { expectedExpenseRole: 'scheduled' })],
  },
  ...buildMilestonesFromSchedule(offer.programmePackage, schedule || offer.programmeSchedule, { taxPercent })
    .map(milestone => ({ ...milestone, showPackageOverview: false })),
];

// Опис схеми оплати в PDF складається з чисел, а не з описів пакетів каталогу: «initial lump-sum
// payment, then the programme fee in 4 equal instalments» читалось як «внесок, а потім ще 38 000
// чотирма платежами», хоча 38 000 уже включають початковий платіж (зауваження до PDF, 06.11).
const formatEuroText = amount => `EUR ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount)}`;
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numberWord = count => NUMBER_WORDS[count] || String(count);

export const describeInitialPaymentOffer = offer => {
  const initialPrice = Number(offer?.initialPackage?.listedPrice) || 0;
  const programmePrice = Number(offer?.programmePackage?.listedPrice) || 0;
  const payments = Array.isArray(offer?.programmeSchedule?.payments) ? offer.programmeSchedule.payments : [];
  const amounts = payments.map(payment => resolvePaymentAmount(payment, programmePrice) || 0);
  if (!initialPrice || !amounts.length) return offer?.programmePackage?.description || offer?.initialPackage?.description || '';
  const equal = amounts.every(amount => amount === amounts[0]);
  const instalments = equal
    ? `${numberWord(amounts.length)} equal instalments of ${formatEuroText(amounts[0])}`
    : `${numberWord(amounts.length)} instalments (${amounts.map(formatEuroText).join(', ')})`;
  return `The programme fee of ${formatEuroText(initialPrice + programmePrice)} is payable in ${numberWord(amounts.length + 1)} stages: `
    + `an initial payment of ${formatEuroText(initialPrice)}, followed by ${instalments}.`;
};

// Перший рахунок клієнта за пропозицією з Initial Payment мусить описувати ту саму програму, що й
// прогноз витрат: опис етапів, загальну суму й графік із пʼяти платежів (Initial Payment, далі
// графік Programme Fee). Лише для пакета Initial Payment — рахунки Programme Fee несуть власний
// графік. `offer` — з розвʼязаними числовими цінами обох пакетів.
export const buildInitialPaymentOfferOverview = (offer, pkg) => {
  if (!offer || String(pkg?.id) !== String(offer.initialPackage?.id)) return null;
  const initialPrice = Number(offer.initialPackage?.listedPrice) || 0;
  const programmePrice = Number(offer.programmePackage?.listedPrice) || 0;
  if (!initialPrice || !programmePrice) return null;
  const payments = Array.isArray(offer.programmeSchedule?.payments) ? offer.programmeSchedule.payments : [];
  return {
    description: describeInitialPaymentOffer(offer),
    total: initialPrice + programmePrice,
    paymentTitle: offer.initialTitle || 'Initial payment',
    scheduleRows: [
      { title: offer.initialTitle || 'Initial payment', amount: initialPrice },
      ...payments.map((payment, index) => {
        const amount = resolvePaymentAmount(payment, programmePrice);
        return { title: payment?.title || `Payment ${index + 2}`, amount: amount == null ? null : amount };
      }),
    ],
  };
};

export const buildInitialPaymentOfferSnapshot = offer => {
  const seen = new Set();
  const childIds = [offer.initialPackage, offer.programmePackage]
    .flatMap(pkg => (Array.isArray(pkg?.children) ? pkg.children : []))
    .filter(catalogId => {
      const key = String(catalogId);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return {
    name: offer.name,
    description: describeInitialPaymentOffer(offer),
    listedPrice: (Number(offer.initialPackage?.listedPrice) || 0) + (Number(offer.programmePackage?.listedPrice) || 0),
    currency: offer.programmePackage?.currency || offer.initialPackage?.currency || 'EUR',
    children: buildPackageOverviewChildren({ children: childIds }),
  };
};

// The plan keeps the package the admin picked as its packageId: the "package share" check then sums
// that package's own rows, which is 100% for either half of the offer.
export const buildInitialPaymentOfferPlan = (offer, { packageId, taxPercent = 0 } = {}) => ({
  packageId: String(packageId ?? offer.initialPackage?.id ?? ''),
  packageSnapshot: buildInitialPaymentOfferSnapshot(offer),
  milestones: buildInitialPaymentOfferMilestones(offer, { taxPercent }),
});

// --- Building a plan from a raw "expectedExpenses" upload -----------------------------------------------------------------------
//
// The lean upload shape (see the invoice-builder JSON upload) is just an array of groups, each
// group an array of legacy-style service strings ("id32", "Custom name || 300", "id1 || 20%"),
// lined up 1:1 with the chosen package's default payment schedule. There is no packageId field in
// that shape - the package is implied by the "idX || Y%" rows inside the groups, since every such
// row already names the package it's a share of.

export const isRawExpectedExpensesGroups = raw => Array.isArray(raw) && raw.every(group => Array.isArray(group));

// A freshly uploaded array-of-groups plan has no way to mark which row is "the" auto-generated
// schedule row - by convention it's always the first percent-of-package row of each group (see the
// module docstring), so it's safe to tag unconditionally here. This is only ever run once, at
// upload time - an already-saved plan's milestones are never re-guessed like this on load, since by
// then a user may have deliberately removed the scheduled row and kept only a manual one; that
// ambiguous case is resolved by recalculateExpectedExpensesSchedule (InvoiceBuilderPage.jsx) instead.
export const markLegacyScheduledRow = (services, packageId) => {
  const rows = Array.isArray(services) ? services : [];
  if (!rows.length || rows.some(entry => entry?.expectedExpenseRole)) return rows;
  const [first, ...rest] = rows;
  if (first?.kind !== 'percent' || String(first.packageId) !== String(packageId)) return rows;
  return [{ ...first, expectedExpenseRole: 'scheduled' }, ...rest];
};

// Finds the package id referenced by the first percent-of-package row across all groups.
export const inferPackageIdFromRawGroups = rawGroups => {
  for (const group of (Array.isArray(rawGroups) ? rawGroups : [])) {
    for (const row of (Array.isArray(group) ? group : [])) {
      if (typeof row !== 'string') continue;
      const match = /^\s*id(.+?)\s*\|\|\s*\d+(?:[.,]\d+)?\s*%\s*$/i.exec(row);
      if (match) return match[1];
    }
    for (const entry of (Array.isArray(group) ? group : [])) {
      if (entry && typeof entry === 'object' && entry.kind === 'percent' && entry.packageId) return String(entry.packageId);
    }
  }
  return '';
};

// Builds a full plan from raw groups + the loaded budget catalog. Returns `missingPackage: true`
// when no package could be resolved, `missingSchedule: true` when the resolved package has no
// payment schedule of its own - either way nothing is built, the same "no payment schedule" failure
// a manually-created plan gets, instead of silently persisting a plan with zero milestones. Also
// returns `droppedGroupsCount` for any groups beyond the schedule's own step count (they're dropped
// rather than silently merged).
export const buildExpectedExpensesPlanFromRawGroups = (rawGroups, { catalog, taxPercent = 0, packageId: explicitPackageId } = {}) => {
  const groups = (Array.isArray(rawGroups) ? rawGroups : []).map(normalizeServiceEntries);
  const packageId = String(explicitPackageId || inferPackageIdFromRawGroups(rawGroups) || '');
  const packages = Array.isArray(catalog?.packages) ? catalog.packages : [];
  const pkg = packages.find(candidate => String(candidate.id) === packageId) || null;
  const schedule = pkg ? resolveProgramPaymentSchedule(catalog, pkg) : null;
  const payments = Array.isArray(schedule?.payments) ? schedule.payments : [];
  const missingSchedule = Boolean(pkg) && payments.length === 0;

  const milestones = payments.map((payment, index) => ({
    id: createEntryId(),
    title: payment?.title || `Payment ${index + 1}`,
    taxPercent,
    showPackageOverview: index === 0,
    services: markLegacyScheduledRow(groups[index] || [], packageId),
  }));

  return {
    plan: (pkg && !missingSchedule) ? { packageId, packageSnapshot: buildPackageSnapshot(pkg), milestones } : null,
    missingPackage: !pkg,
    missingSchedule,
    droppedGroupsCount: Math.max(0, groups.length - payments.length),
  };
};

// --- Normalization (defensive parsing of whatever's stored on the backend) ------------------------------------------------------

// Old persisted milestones may still carry a frozen `scheduledAmount` number (and/or the old
// `additionalServices` field name) from before groups became plain row lists - migrate it into a
// fixed custom row carrying that exact euro amount, so the total is preserved even if the plan's
// package has since been removed from the catalog. A percent-of-package row would be nicer (it'd
// track the package price live), but resolveServiceRow only ever prices one against the *current*
// live catalog package, never the frozen packageSnapshot - so for a package that's gone missing,
// seeding a percent row here would silently price this migrated row at 0 instead of preserving it.
export const normalizeExpectedExpensesMilestone = raw => {
  const hasOwnServices = Array.isArray(raw?.services);
  const services = normalizeServiceEntries(raw?.services ?? raw?.additionalServices);
  const legacyAmount = Number(raw?.scheduledAmount);
  const migratedServices = !hasOwnServices && Number.isFinite(legacyAmount) && legacyAmount !== 0
    ? [
      makeCustomEntry({ name: raw?.title ? `Scheduled payment (${raw.title})` : 'Scheduled payment', price: legacyAmount }),
      ...services,
    ]
    : services;

  return {
    id: raw?.id || createEntryId(),
    title: raw?.title || '',
    taxPercent: Number.isFinite(Number(raw?.taxPercent)) ? Number(raw.taxPercent) : 0,
    showPackageOverview: Boolean(raw?.showPackageOverview),
    services: migratedServices,
  };
};

export const normalizeExpectedExpensesData = raw => {
  if (!raw || typeof raw !== 'object') return null;
  return {
    packageId: String(raw.packageId ?? ''),
    packageSnapshot: {
      name: raw.packageSnapshot?.name || '',
      description: raw.packageSnapshot?.description || '',
      listedPrice: Number(raw.packageSnapshot?.listedPrice) || 0,
      currency: raw.packageSnapshot?.currency || 'EUR',
      children: normalizeServiceEntries(raw.packageSnapshot?.children),
    },
    milestones: Array.isArray(raw.milestones)
      ? raw.milestones.map(normalizeExpectedExpensesMilestone)
      : [],
  };
};

// Loose validation for an uploaded, already-normalized expected-expenses JSON, before
// normalizeExpectedExpensesData fills in any missing pieces - mirrors isInvoiceDataShape's role
// for the main invoice JSON. A raw array-of-groups upload is validated separately, with
// isRawExpectedExpensesGroups, since it has no packageSnapshot/milestones wrapper of its own.
export const isExpectedExpensesShape = raw => Boolean(
  raw
  && typeof raw === 'object'
  && !Array.isArray(raw)
  && raw.packageId !== undefined
  && Array.isArray(raw.milestones)
);

// The compact form persisted to invoiceBuilder/expectedExpenses: every editable field a milestone
// can carry (title/tax/overview/services), with no resolved amounts - the inverse of
// normalizeExpectedExpensesData, so persistExpectedExpenses can round-trip through it.
export const serializeExpectedExpensesData = plan => (plan ? {
  packageId: String(plan.packageId ?? ''),
  packageSnapshot: {
    name: plan.packageSnapshot?.name || '',
    description: plan.packageSnapshot?.description || '',
    listedPrice: Number(plan.packageSnapshot?.listedPrice) || 0,
    currency: plan.packageSnapshot?.currency || 'EUR',
    children: normalizeServiceEntries(plan.packageSnapshot?.children),
  },
  milestones: (Array.isArray(plan.milestones) ? plan.milestones : []).map(milestone => ({
    id: milestone.id || createEntryId(),
    title: milestone.title || '',
    taxPercent: Number(milestone.taxPercent) || 0,
    showPackageOverview: Boolean(milestone.showPackageOverview),
    services: normalizeServiceEntries(milestone.services),
  })),
} : null);

// --- Editing ------------------------------------------------------------

export const setMilestoneField = (milestone, field, value) => {
  if (field === 'taxPercent') {
    const numeric = Number(String(value).replace(',', '.'));
    return { ...milestone, taxPercent: Number.isFinite(numeric) ? numeric : 0 };
  }
  return { ...milestone, [field]: value };
};

export const addMilestoneService = (milestone, entry) => ({
  ...milestone,
  services: [...(milestone.services || []), entry],
});

export const removeMilestoneService = (milestone, entryId) => ({
  ...milestone,
  services: (milestone.services || []).filter(entry => entry.id !== entryId),
});

export const updateMilestoneServiceField = (milestone, entryId, field, value) => ({
  ...milestone,
  services: (milestone.services || [])
    .map(entry => (entry.id === entryId ? setEntryField(entry, field, value) : entry)),
});

// --- Resolving for display/PDF ------------------------------------------------------

export const resolvePackageOverviewRows = (children, catalogItemsById, priceContext = {}) =>
  (Array.isArray(children) ? children : []).map(entry => resolveServiceRow(entry, catalogItemsById, priceContext));

export const resolveMilestoneServiceRows = (milestone, catalogItemsById, priceContext = {}) =>
  (Array.isArray(milestone?.services) ? milestone.services : [])
    .map(entry => resolveServiceRow(entry, catalogItemsById, priceContext));

export const computeMilestoneSubtotal = rows => computeInvoiceSubtotal(rows);

export const computeMilestoneAmountDue = (subtotal, taxPercent) => computeInvoiceTotal(subtotal, taxPercent);

export const resolveExpectedExpenseRows = (group, catalogItemsById, priceContext = {}) =>
  (Array.isArray(group) ? group : []).map(entry => resolveServiceRow(entry, catalogItemsById, priceContext));

// Splits a milestone's resolved rows into the one auto-generated "share of the programme fee" row
// (expectedExpenseRole === 'scheduled') and every other row (SM deposits, catalog add-ons, gifts,
// ...) - the Expected Expenses PDF shows the scheduled share as "N% of programme fee" and every
// other row as a plain compact line (spec §1.2).
export const splitScheduledRows = rows => {
  const list = Array.isArray(rows) ? rows : [];
  return {
    scheduledRows: list.filter(row => row.expectedExpenseRole === 'scheduled'),
    additionalRows: list.filter(row => row.expectedExpenseRole !== 'scheduled'),
  };
};

// Sum of every milestone's resolved total (percent-of-package rows resolved to euros, plus every
// catalog/custom extra) - the actual amount the whole plan bills for.
export const computeMilestonesTotal = (milestones, catalogItemsById, priceContext = {}) =>
  (Array.isArray(milestones) ? milestones : []).reduce((sum, milestone) => sum
    + computeMilestoneSubtotal(resolveMilestoneServiceRows(milestone, catalogItemsById, priceContext)), 0);

// Sum of only the percent-of-package rows that share the plan's own package id, in percent (not
// euros) - the sanity check for "does the schedule breakdown still cover the whole package price".
// Kept separate from computeMilestonesTotal because that one also includes one-off extras (SM
// deposits, gifts, ...), which are expected to push the real bill above the package price.
// A row carrying a fixed euro `amount` (typed instead of a percent - design-tasks §1) contributes
// its equivalent share of `packagePrice` when one is given; without a resolvable package price its
// share is unknowable, so it contributes nothing rather than a made-up figure.
export const computeMilestonesPackageSharePercent = (milestones, packageId, packagePrice) =>
  (Array.isArray(milestones) ? milestones : []).reduce((sum, milestone) => sum
    + (Array.isArray(milestone.services) ? milestone.services : [])
      .filter(entry => entry?.kind === 'percent' && String(entry.packageId) === String(packageId))
      .reduce((entrySum, entry) => {
        const fixedAmount = Number(entry.amount);
        if (entry.amount != null && Number.isFinite(fixedAmount)) {
          const price = Number(packagePrice);
          return entrySum + (Number.isFinite(price) && price > 0 ? Math.round((fixedAmount / price) * 1e4) / 100 : 0);
        }
        return entrySum + (Number(entry.percent) || 0);
      }, 0), 0);

// --- Package templates: the typical extras of every milestone ----------------------------------------------------------------------
//
// План будується з графіка пакета, а графік знає лише частку ціни програми — депозити на транспорт
// і ліки СМ, квартиру, кесарів, речі для немовляти адмін щоразу дописував руками. Шаблон пакета
// тримає ці «інші витрати» по етапах: `invoiceBuilder/expectedExpensesTemplates/{ключ}` =
// `{ name, milestones: [{ title, services }] }`, де services — лише нерозкладові рядки (частку ціни
// програми план щоразу рахує з графіка сам). Етапи зіставляються за порядком: шаблон — це «що
// типово доплачують на N-му платежі», а не на платежі з певною назвою.

const stripEntryIds = entry => {
  if (!entry || typeof entry !== 'object') return entry;
  const { id, ...rest } = entry;
  return Array.isArray(rest.children) ? { ...rest, children: rest.children.map(stripEntryIds) } : rest;
};

const isScheduledEntry = entry => entry?.expectedExpenseRole === 'scheduled';

// Ключ шаблону: у пропозиції з Initial Payment обидва пакети дають той самий план, тож і шаблон
// один — під пакетом Initial Payment.
export const resolveExpectedExpensesTemplateKey = (catalog, pkg) => {
  const offer = resolveInitialPaymentOffer(catalog, pkg);
  const id = offer ? offer.initialPackage?.id : pkg?.id;
  return id == null || id === '' ? '' : String(id);
};

export const normalizeExpectedExpensesTemplate = raw => {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.milestones)) return null;
  return {
    name: String(raw.name || ''),
    milestones: raw.milestones.map(milestone => ({
      title: String(milestone?.title || ''),
      services: normalizeServiceEntries(Array.isArray(milestone?.services) ? milestone.services : [])
        .filter(entry => !isScheduledEntry(entry))
        .map(stripEntryIds),
    })),
  };
};

export const extractExpectedExpensesTemplate = plan => normalizeExpectedExpensesTemplate({
  name: plan?.packageSnapshot?.name || '',
  milestones: (Array.isArray(plan?.milestones) ? plan.milestones : []).map(milestone => ({
    title: milestone.title,
    services: milestone.services,
  })),
});

// Власний рядок, названий так само, як позиція прайсу, стає посиланням на неї: інакше шаблон,
// збережений із плану, де позицію вписали руками, ніс би свою ціну замість прайсової.
const normalizeName = name => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const linkEntryToCatalog = (entry, catalogItems) => {
  if (entry?.kind !== 'custom' || !Array.isArray(catalogItems)) return entry;
  const key = normalizeName(entry.name);
  const item = key ? catalogItems.find(candidate => normalizeName(candidate?.name) === key) : null;
  return item ? { ...catalogRow(item.id), id: entry.id } : entry;
};

export const applyExpectedExpensesTemplate = (milestones, template, { catalogItems } = {}) => {
  const templateMilestones = Array.isArray(template?.milestones) ? template.milestones : [];
  return (Array.isArray(milestones) ? milestones : []).map((milestone, index) => {
    const extras = templateMilestones[index]?.services || [];
    if (!extras.length) return milestone;
    return {
      ...milestone,
      services: [
        ...milestone.services,
        ...normalizeServiceEntries(extras.map(entry => linkEntryToCatalog({ ...entry, id: createEntryId() }, catalogItems))),
      ],
    };
  });
};

const depositRows = amount => [
  { kind: 'custom', name: 'Deposit for transportation of SM', price: amount },
  { kind: 'custom', name: 'Deposit for medications of SM', price: amount },
];

const catalogRow = catalogId => ({ kind: 'item', catalogId: String(catalogId) });

// Вшиті зразки на випадок, коли в базі шаблону ще немає: перше створення плану адміном кладе його
// в базу, і далі правиться вже той. Special Offer — за інвойсами справи Kikawa (2025–2026): Initial
// Payment без доплат (його послуги — сам пакет), далі депозити СМ на кожному платежі й витрати
// пологів на останньому. Борги за ліки й пошту в конкретну країну зразок не несе — це справа
// конкретних батьків, а не програми. Позиція, яка є в прайсі (`budget/items`), стоїть посиланням
// на прайс, а не власним рядком: ціна в плані мусить бути та сама, що в прайсі (в інвойсах справи
// стояло 1650 за обстеження — прайс каже 1700). Депозити СМ, кесарів, непередбачене, реєстрація
// й квартира на 3 місяці (1800; у прайсі #20 за 600 — інша позиція) — не ті самі позиції, що в
// прайсі (там помісячні «from 100», компенсація СМ за кесарів, реєстрація в ціні програми), тож
// лишаються власними рядками.
export const DEFAULT_EXPECTED_EXPENSES_TEMPLATES = {
  'special offer': {
    name: 'Special Offer',
    milestones: [
      { title: 'Initial payment', services: [] },
      { title: 'Upon ultrasound confirmation of pregnancy', services: depositRows(300) },
      {
        title: 'At 12 weeks of pregnancy',
        services: [
          ...depositRows(300),
          catalogRow(40), // Comprehensive prenatal examination
        ],
      },
      {
        title: 'At 18 weeks of pregnancy',
        services: [
          ...depositRows(400),
          { kind: 'custom', name: 'Accommodation for the surrogate mother until delivery (3 months)', price: 1800 },
          { kind: 'custom', name: 'Documents for prenatal recognition and postage', price: 75 },
        ],
      },
      {
        title: 'At 36 weeks of pregnancy',
        services: [
          { kind: 'custom', name: 'Deposit for medications during and after delivery (standard protocol)', price: 500 },
          { kind: 'custom', name: 'Deposit for unexpected expenses (e.g. extended hospital stay, nanny services, etc.)', price: 3000 },
          { kind: 'custom', name: 'Deposit for a caesarean section', price: 2700 },
          catalogRow(66), // Newborn baby items
          { kind: 'custom', name: 'Extra expenses for the registration process', price: 250 },
        ],
      },
    ],
  },
};

export const resolveDefaultExpectedExpensesTemplate = planName => {
  const raw = DEFAULT_EXPECTED_EXPENSES_TEMPLATES[String(planName || '').trim().toLowerCase()];
  return raw ? normalizeExpectedExpensesTemplate(raw) : null;
};

// Етап, що оплачує пакет цілком (Initial Payment спецпропозиції: 100% пакета), — це не частка
// програми, а окрема покупка, і клієнт мусить бачити, за що платить. У PDF під «Scheduled payment»
// такого етапу стоїть перелік послуг пакета з прайсу (назви, без цін: ціна пакета — його власна).
// Частки програми (25%…) переліку не несуть: склад програми PDF показує раз, угорі.
export const listScheduledRowIncludedServices = (row, catalogItemsById, priceContext = {}) => {
  if (row?.kind !== 'percent' || row.expectedExpenseRole !== 'scheduled' || !(Number(row.percent) >= 100)) return [];
  const pkg = priceContext.packagesById?.get?.(String(row.packageId));
  const children = Array.isArray(pkg?.children) ? pkg.children : [];
  return children
    .map(catalogId => catalogItemsById?.get?.(String(catalogId))?.name)
    .filter(name => typeof name === 'string' && name.trim());
};

// Підсумок усього плану (зауваження до PDF, 06.11: «відсутня фінальна зведена таблиця із загальною
// прогнозованою сумою»): по етапу — частка програми, інші витрати, податок і разом, плюс підсумок.
const toCents = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const summarizeMilestones = (milestones, catalogItemsById, priceContext = {}) => {
  const rows = (Array.isArray(milestones) ? milestones : []).map(milestone => {
    const serviceRows = resolveMilestoneServiceRows(milestone, catalogItemsById, priceContext);
    const { scheduledRows, additionalRows } = splitScheduledRows(serviceRows);
    const programme = computeMilestoneSubtotal(scheduledRows);
    const additional = computeMilestoneSubtotal(additionalRows);
    const subtotal = computeMilestoneSubtotal(serviceRows);
    // До центів так само, як картка етапу показує «Estimated total»: підсумок мусить бути сумою
    // тих чисел, які клієнт бачить вище, а не сумою неокруглених.
    const total = toCents(computeMilestoneAmountDue(subtotal, milestone.taxPercent));
    return { title: milestone.title, programme, additional, tax: toCents(total - subtotal), total };
  });
  const sum = field => toCents(rows.reduce((acc, row) => acc + (Number(row[field]) || 0), 0));
  return { rows, totals: { programme: sum('programme'), additional: sum('additional'), tax: sum('tax'), total: sum('total') } };
};
