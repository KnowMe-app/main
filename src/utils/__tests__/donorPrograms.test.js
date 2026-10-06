import {
  DEFAULT_MONTHLY_MONTHS,
  defaultProgramBonusKeys,
  evaluateProgram,
  isProgramPresentable,
  listProgramDifferences,
  extractViewerProgramFacts,
  listPaymentBuckets,
  listProgramBonuses,
  listProgramPayments,
  listPrograms,
  normalizeProgram,
  programBreakdown,
  programGuaranteedUsd,
  programsToRecord,
  resolveCardPrograms,
  setCardProgramsLookup,
  resolveViewerProgramType,
  sortCardsByMode,
  summarizeCardPrograms,
  HIGHLIGHTS_NONE,
  describeProgramRequirements,
  formatProgramPlace,
  programPayLabel,
  resolveProgramHighlights,
} from '../donorPrograms';
import {
  convertProgramAmount,
  describeProgramMoney,
  formatProgramMoneyIn,
  parseProgramAmount,
} from '../programCurrency';

// Курс НБУ: гривень за одиницю.
const rates = { usd: 41, eur: 48, rateDate: '2026-09-30' };

// «Шукаємо донорку яйцеклітин, 2 500 $: вік 21–29, мати власну дитину,
// зріст від 170, резус +» — зразок із чату агенцій.
const donorProgram = {
  id: 'p1',
  type: 'ed',
  title: 'Донорство в Києві',
  requirements: { ageFrom: '21', ageTo: '29', heightFrom: '170', rh: '+', ownKids: 'required' },
  payments: { final: { amount: '2 500', currency: 'USD' } },
  coverage: ['exams', 'legal', 'nonsense'],
};

// «Офіційно незаміжня до 35, можна з 1 КР: 20 000 $, 500 $ щомісяця,
// перенос 400 $, договір 100 $, КС +2 000 $».
const surrogateProgram = {
  id: 'p2',
  type: 'sm',
  requirements: { ageTo: 35, marital: 'unmarried', csectionMax: '1' },
  payments: {
    final: { amount: 20000, currency: 'USD' },
    monthly: { amount: 500, currency: 'USD' },
    transfer: { amount: 400, currency: 'USD' },
    contract: { amount: 100, currency: 'USD' },
    cSection: { amount: 2000, currency: 'USD' },
    twins: { amount: '', currency: 'USD' },
  },
};

describe('модель програми', () => {
  it('зберігає вимоги числами, а порожні виплати не пише зовсім', () => {
    const program = normalizeProgram(surrogateProgram);
    expect(program.requirements).toMatchObject({ ageTo: 35, marital: 'unmarried', csectionMax: '1' });
    expect(program.payments.twins).toBeUndefined();
    expect(program.payments.final).toEqual({ amount: 20000, currency: 'USD' });
  });

  it('лишає тільки відомі пункти покриття', () => {
    expect(normalizeProgram(donorProgram).coverage).toEqual(['exams', 'legal']);
  });

  it('розбирає суми так, як їх пишуть у чатах', () => {
    expect(parseProgramAmount('2 500')).toBe(2500);
    expect(parseProgramAmount('20k')).toBe(20000);
    expect(parseProgramAmount('19.000')).toBe(19000);
    expect(parseProgramAmount('1,600')).toBe(1600);
    expect(parseProgramAmount('18.5k')).toBe(18500);
    expect(parseProgramAmount('')).toBeNull();
  });

  it('можливі доплати окремо від гарантованих', () => {
    const program = normalizeProgram({
      ...surrogateProgram,
      payments: { ...surrogateProgram.payments, firstTry: { amount: 1000, currency: 'USD' } },
      bonuses: [{ label: 'За досвід СМ', amount: 1500, currency: 'USD' }],
      otherPayments: [{ label: 'Компенсація дороги', amount: 200, currency: 'USD' }],
    });
    expect(listProgramPayments(program).map(item => item.key)).toEqual(['final', 'monthly', 'transfer', 'contract', 'other-0']);
    expect(listProgramBonuses(program).map(item => item.label)).toEqual(['Кесарів розтин', 'Вагітність з першої спроби', 'За досвід СМ']);
  });

  // Програма зі скріншота: 23 000 фінальна, 500 щомісяця, 200 перенос, 100
  // договір, 500 «за повторну програму», а КС і двійня — можливі доплати.
  // «Загальна сума» показувала 23 800 — без жодного щомісячного платежу.
  const screenshotProgram = {
    type: 'sm',
    payments: {
      final: { amount: 23000, currency: 'USD' },
      monthly: { amount: 500, currency: 'USD' },
      transfer: { amount: 200, currency: 'USD' },
      contract: { amount: 100, currency: 'USD' },
      cSection: { amount: 1500, currency: 'USD' },
      twins: { amount: 3000, currency: 'USD' },
    },
    otherPayments: [{ label: 'Доплата за повторну програму', amount: 500, currency: 'USD' }],
  };

  it('разом за програму — усі гарантовані виплати, зокрема щомісячні × місяці', () => {
    const breakdown = programBreakdown(normalizeProgram(screenshotProgram, 'p2'));
    const monthly = breakdown.lines.find(line => line.key === 'monthly');
    expect(monthly).toMatchObject({ months: DEFAULT_MONTHLY_MONTHS, monthsEstimated: true, subtotal: { amount: 4500, currency: 'USD' } });
    expect(breakdown.guaranteed).toMatchObject({ amount: 28300, currency: 'USD', approximate: false });
    expect(breakdown.max.amount).toBe(32800);
  });

  it('кількість місяців задає агенція, і вона переживає нормалізацію', () => {
    const program = normalizeProgram({
      ...screenshotProgram,
      payments: { ...screenshotProgram.payments, monthly: { amount: 500, currency: 'USD', months: '10' } },
    }, 'p2');
    expect(program.payments.monthly).toEqual({ amount: 500, currency: 'USD', months: 10 });
    expect(programBreakdown(program).guaranteed.amount).toBe(28800);
    expect(normalizeProgram({ ...screenshotProgram, payments: { monthly: { amount: 500, currency: 'USD', months: 99 } } }, 'x').payments.monthly.months).toBeUndefined();
  });

  it('відмічені доплати додаються до «разом», невідмічені — ні', () => {
    const program = normalizeProgram(screenshotProgram, 'p2');
    expect(programBreakdown(program, { selectedBonusKeys: ['cSection'] }).total.amount).toBe(29800);
    expect(programBreakdown(program, { selectedBonusKeys: ['cSection', 'twins'] }).total.amount).toBe(32800);
  });

  it('виплата в іншій валюті йде в суму за курсом, а без курсу — окремою частиною', () => {
    const program = normalizeProgram({
      ...donorProgram,
      payments: { final: { amount: 1600, currency: 'USD' } },
      otherPayments: [{ label: 'Компенсація дороги', amount: 4100, currency: 'UAH' }],
    }, 'p1');
    const withRates = programBreakdown(program, { rates });
    expect(withRates.guaranteed).toMatchObject({ amount: 1700, currency: 'USD', approximate: true });
    const withoutRates = programBreakdown(program, { rates: { usd: null, eur: null } });
    expect(withoutRates.guaranteed.parts).toEqual([{ currency: 'USD', amount: 1600 }, { currency: 'UAH', amount: 4100 }]);
  });

  it('стара програма з самою загальною сумою показує її, а зі складовими — рахує сама', () => {
    expect(programBreakdown(normalizeProgram({ type: 'sm', payments: { total: { amount: 21000, currency: 'USD' } } }, 'x')).guaranteed.amount).toBe(21000);
    const both = normalizeProgram({ ...screenshotProgram, payments: { ...screenshotProgram.payments, total: { amount: 21000, currency: 'USD' } } }, 'p2');
    expect(programBreakdown(both).guaranteed.amount).toBe(28300);
  });

  it('фільтр і сортування рахують ту саму гарантовану суму', () => {
    expect(programGuaranteedUsd(normalizeProgram(screenshotProgram, 'p2'), rates)).toBe(28300);
    expect(listPaymentBuckets({ role: 'ag', programs: { p2: screenshotProgram } }, rates, ['sm'])).toEqual(['sm_26k']);
  });

  it('без повного курсу не фільтрує змішану гарантовану суму як одну виплату', () => {
    const mixed = normalizeProgram({
      ...donorProgram,
      payments: { final: { amount: 20000, currency: 'USD' } },
      otherPayments: [{ label: 'Компенсація', amount: 5000, currency: 'EUR' }],
    }, 'mixed');
    expect(programGuaranteedUsd(mixed, { usd: null, eur: null })).toBeNull();
    expect(programGuaranteedUsd(mixed, rates)).toBeCloseTo(20000 + (5000 * 48 / 41));
  });

  it('досвід відмічено одразу, а кесарів і двійню читачка відмічає сама', () => {
    const program = normalizeProgram({
      ...screenshotProgram,
      payments: { ...screenshotProgram.payments, experience: { amount: 1500, currency: 'USD' } },
    }, 'p2');
    expect(defaultProgramBonusKeys(program, { births: 2, csections: 1, experience: 1 })).toEqual(['experience']);
    expect(defaultProgramBonusKeys(program, { births: 2, csections: 1, experience: 0 })).toEqual([]);
  });

  it('тривалість стала приміткою, а не зникла', () => {
    const program = normalizeProgram({ ...donorProgram, duration: '3–4 тижні', note: 'Житло поруч із клінікою' });
    expect(program.duration).toBeUndefined();
    expect(program.note).toBe('3–4 тижні\nЖитло поруч із клінікою');
  });

  it('приховану програму бачить лише редактор, а порядок задає агенція', () => {
    const record = programsToRecord([
      { ...surrogateProgram, id: 'p2' },
      { ...donorProgram, id: 'p1', hidden: true },
    ]);
    expect(record.p2.order).toBe(0);
    expect(record.p1.order).toBe(1);
    expect(listPrograms(record).map(program => program.id)).toEqual(['p2']);
    expect(listPrograms(record, { includeHidden: true }).map(program => program.id)).toEqual(['p2', 'p1']);
  });

  it('картка без власних програм бере їх зі сховища, а без сховища — «ще не прочитано»', () => {
    setCardProgramsLookup(null);
    expect(resolveCardPrograms({ userId: 'AG1', programsAt: 5 })).toEqual({ programs: [], loaded: false });
    setCardProgramsLookup(card => (card.userId === 'AG1' ? { p1: donorProgram } : {}));
    const resolved = resolveCardPrograms({ userId: 'AG1', programsAt: 5 });
    expect(resolved.loaded).toBe(true);
    expect(resolved.programs[0].payments.final.amount).toBe(2500);
    setCardProgramsLookup(null);
  });
});

describe('гроші в трьох валютах', () => {
  it('показує оригінал без «≈», а еквіваленти — з ним', () => {
    const money = describeProgramMoney({ amount: 1600, currency: 'USD' }, rates);
    expect(money.text).toBe('1 600 $');
    expect(money.equivalents.map(item => item.currency)).toEqual(['EUR', 'UAH']);
    expect(money.equivalents[0].text.startsWith('≈')).toBe(true);
    expect(money.rateDate).toBe('2026-09-30');
  });

  it('без курсу не вигадує еквівалентів', () => {
    const money = describeProgramMoney({ amount: 1600, currency: 'USD' }, null);
    expect(money.equivalents).toEqual([]);
    expect(formatProgramMoneyIn({ amount: 1600, currency: 'USD' }, 'EUR', null)).toBe('1 600 $');
  });

  it('рахує через гривню', () => {
    expect(convertProgramAmount(48, 'EUR', 'USD', rates)).toBeCloseTo(48 * 48 / 41);
    expect(convertProgramAmount(1000, 'UAH', 'UAH', null)).toBe(1000);
  });
});

describe('чи підходить програма читачеві', () => {
  const helpers = {
    age: profile => (profile.birth === '1998-01-01' ? 28 : 37),
    height: value => Number(value) || null,
    bmi: () => 22,
    rh: value => (String(value).includes('-') ? '-' : '+'),
  };

  it('читає анкету донорки', () => {
    const facts = extractViewerProgramFacts({
      birth: '1998-01-01', height: '172', weight: '63', blood: '2+', ownKids: '1', csection: '0', maritalStatus: 'Ні',
    }, helpers);
    expect(facts).toMatchObject({ age: 28, heightCm: 172, bmi: 22, rh: '+', births: 1, csections: 0, marital: 'unmarried' });
  });

  it('підходить, коли жодна вимога не каже «ні»', () => {
    const facts = { age: 28, heightCm: 172, bmi: 22, rh: '+', births: 1 };
    expect(evaluateProgram(normalizeProgram(donorProgram), facts).matches).toBe(true);
  });

  it('не підходить за віком і каже, за чим саме', () => {
    const result = evaluateProgram(normalizeProgram(donorProgram), { age: 31, heightCm: 172, rh: '+', births: 1 });
    expect(result.matches).toBe(false);
    expect(result.checks.find(check => check.key === 'age').ok).toBe(false);
  });

  it('невідоме в анкеті не ховає програму, а позначає її непевною', () => {
    const result = evaluateProgram(normalizeProgram(donorProgram), { age: 25 });
    expect(result.matches).toBe(true);
    expect(result.uncertain).toBe(true);
  });

  it('рахує «вам підходить N з M» лише серед програм свого типу', () => {
    const card = { programs: { p1: donorProgram, p2: surrogateProgram, p3: { ...donorProgram, id: 'p3', requirements: { ageTo: 25 } } } };
    const summary = summarizeCardPrograms(card, { viewerType: 'ed', facts: { age: 28, heightCm: 172, rh: '+', births: 1 } });
    expect(summary.total).toBe(2);
    expect(summary.allTotal).toBe(3);
    expect(summary.matched).toBe(1);
  });

  it('роль читача — остання в історії', () => {
    expect(resolveViewerProgramType(['ag', 'ed'])).toBe('ed');
    expect(resolveViewerProgramType('ag,ed')).toBe('ed');
    expect(resolveViewerProgramType('egg donor')).toBe('ed');
    expect(resolveViewerProgramType('surrogate mother')).toBe('sm');
    expect(resolveViewerProgramType('ag')).toBe('');
  });

  it('не підміняє порожній список програмами іншої аудиторії', () => {
    const summary = summarizeCardPrograms({ programs: { p2: surrogateProgram } }, { viewerType: 'ed', facts: {} });
    expect(summary).toMatchObject({ total: 0, allTotal: 1, matched: 0, evaluated: [], finals: [] });
  });
});

describe('фільтр і сортування за виплатою', () => {
  it('кладе картку в бакети кожної програми', () => {
    const card = { programs: { p1: donorProgram, p4: { ...donorProgram, id: 'p4', payments: { final: { amount: 1400, currency: 'USD' } } } } };
    expect(listPaymentBuckets(card, rates).sort()).toEqual(['ed_2000', 'ed_lt1500']);
    expect(listPaymentBuckets({}, rates)).toEqual(['none']);
  });

  it('валютна програма без курсу бакета не має', () => {
    const card = { programs: { p1: { ...donorProgram, payments: { final: { amount: 1500, currency: 'EUR' } } } } };
    expect(listPaymentBuckets(card, null)).toEqual(['none']);
  });

  it('за релевантністю піднімає ту, що підходить, і не чіпає решти порядку', () => {
    const cards = [
      { userId: 'a' },
      { userId: 'b', programs: { p1: { ...donorProgram, requirements: { ageTo: 20 } } } },
      { userId: 'c', programs: { p1: donorProgram } },
      { userId: 'd' },
    ];
    const sorted = sortCardsByMode(cards, 'relevance', { viewerType: 'ed', facts: { age: 25, heightCm: 172, rh: '+', births: 1 } });
    expect(sorted.map(card => card.userId)).toEqual(['c', 'a', 'd', 'b']);
  });

  it('для читача без типу програм релевантність порядку не змінює', () => {
    const cards = [{ userId: 'a' }, { userId: 'c', programs: { p1: donorProgram } }];
    expect(sortCardsByMode(cards, 'relevance', {})).toBe(cards);
  });

  it('за виплатою — від найбільшої, у доларовому еквіваленті', () => {
    const cards = [
      { userId: 'usd', programs: { p1: donorProgram } },
      { userId: 'eur', programs: { p1: { ...donorProgram, payments: { final: { amount: 2400, currency: 'EUR' } } } } },
      { userId: 'none' },
    ];
    expect(sortCardsByMode(cards, 'payment', { rates }).map(card => card.userId)).toEqual(['eur', 'usd', 'none']);
  });

  it('не сортує за виплатою іншої ролі або схованої агенції', () => {
    const opposite = { userId: 'opposite', role: 'ag', programs: { p2: surrogateProgram } };
    const applicable = { userId: 'applicable', role: 'ag', programs: { p1: donorProgram } };
    expect(sortCardsByMode([opposite, applicable], 'payment', { viewerType: 'ed', rates }).map(card => card.userId))
      .toEqual(['applicable', 'opposite']);
    expect(listPaymentBuckets({ role: 'ed', programs: { p1: donorProgram } }, rates)).toEqual(['none']);
  });

  it('список програм сталий і обмежений', () => {
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`p${String(i).padStart(2, '0')}`, donorProgram]));
    expect(listPrograms(many)).toHaveLength(12);
  });
});

describe('чернетки й порівняння програм', () => {
  it('порожня програма — чернетка: редактор її бачить, читачі ні', () => {
    const record = { a: { id: 'a', type: 'ed', requirements: { rh: 'any', marital: 'any' } }, b: { id: 'b', type: 'ed', note: 'Візити до клініки' } };
    expect(isProgramPresentable(normalizeProgram(record.a, 'a'))).toBe(false);
    expect(listPrograms(record).map(program => program.id)).toEqual(['b']);
    expect(listPrograms(record, { includeHidden: true }).map(program => program.id)).toEqual(['a', 'b']);
  });

  it('відмінності рахує лише між програмами одного типу', () => {
    const list = listPrograms({
      a: { id: 'a', type: 'ed', location: 'Київ', requirements: { ageTo: 30 }, payments: { final: { amount: 1500, currency: 'USD' } } },
      b: { id: 'b', type: 'ed', location: 'Грузія', requirements: { ageTo: 30 }, payments: { final: { amount: 1800, currency: 'USD' } } },
      c: { id: 'c', type: 'sm', location: 'Київ', payments: { final: { amount: 20000, currency: 'USD' } } },
    });
    const differences = listProgramDifferences(list);
    expect([...differences.get('a')].sort()).toEqual(['location', 'pay']);
    expect(differences.has('c')).toBe(false);
  });
});

describe('програми з оголошень: що зберігається', () => {
  const surrogacy = {
    id: 's1',
    type: 'sm',
    name: 'Програма в Києві',
    payKind: 'final',
    startNow: true,
    payments: {
      final: { amount: '15 000', currency: 'USD' },
      monthly: { amount: 900, currency: 'USD', months: 9, includes: { label: 'одяг', amount: 400, currency: 'USD' } },
      transfer: { amount: 300, currency: 'USD', when: 'після переносу', condition: '' },
    },
    otherPayments: [{ label: '20 тиждень', amount: 500, currency: 'USD', when: 'на 20 тижні', condition: 'якщо вагітність триває' }],
    bonuses: [{ label: 'Кесарів', amount: 1000, currency: 'USD', condition: 'якщо пологи кесаревим' }],
    requirements: { csectionMax: '1', ageTo: 37 },
    requirementMeta: { csection: { level: 'individual', note: 'через 2 роки після КР' }, rh: { level: 'free' }, bogus: { level: 'free' } },
    stages: [{ stage: 'screening', place: 'Київ' }, { stage: 'delivery', place: 'Львів' }, { stage: 'nope', place: 'Одеса' }, { stage: 'transfer', place: '' }],
    relocation: { when: 'з 12 тижня', family: 'yes', note: 'квартира' },
    coverage: ['housing', 'food'],
    coverageDetails: { housing: { mode: 'paid' }, food: { mode: 'allowance', limit: { amount: 10, currency: 'USD' }, per: 'day', note: 'готівкою' }, travel: { mode: 'paid' } },
    highlights: ['startNow', 'csection'],
  };

  it('нормалізація зберігає вид суми, графік з умовами, рівні вимог, етапи, переїзд, покриття й головне', () => {
    const program = normalizeProgram(surrogacy);
    expect(program.name).toBe('Програма в Києві');
    // Типовий вид суми не пишеться: «final» для СМ і так за замовчуванням.
    expect(program.payKind).toBeUndefined();
    expect(program.startNow).toBe(true);
    expect(program.payments.monthly).toEqual({ amount: 900, currency: 'USD', months: 9, includes: { label: 'одяг', amount: 400, currency: 'USD' } });
    expect(program.payments.transfer).toEqual({ amount: 300, currency: 'USD', when: 'після переносу' });
    expect(program.otherPayments[0]).toEqual(expect.objectContaining({ when: 'на 20 тижні', condition: 'якщо вагітність триває' }));
    expect(program.bonuses[0]).toEqual(expect.objectContaining({ condition: 'якщо пологи кесаревим' }));
    expect(program.requirementMeta).toEqual({ csection: { level: 'individual', note: 'через 2 роки після КР' }, rh: { level: 'free' } });
    expect(program.stages).toEqual([{ stage: 'screening', place: 'Київ' }, { stage: 'delivery', place: 'Львів' }, { stage: 'other', place: 'Одеса' }]);
    expect(program.relocation).toEqual({ when: 'з 12 тижня', family: 'yes', note: 'квартира' });
    // Подробиці лише для відміченого покриття.
    expect(program.coverageDetails).toEqual({ housing: { mode: 'paid' }, food: { mode: 'allowance', limit: { amount: 10, currency: 'USD' }, per: 'day', note: 'готівкою' } });
    expect(program.highlights).toEqual(['startNow', 'csection']);
    // Друга нормалізація — та сама програма: збереження й повторне редагування нічого не губить.
    expect(normalizeProgram(program)).toEqual(program);
  });

  it('вкладена сума не додається, а графік рахується повністю', () => {
    const breakdown = programBreakdown(normalizeProgram(surrogacy));
    // 15 000 + 900 × 9 + 300 + 500
    expect(breakdown.guaranteed.amount).toBe(23900);
    expect(breakdown.reliable).toBe(true);
  });

  it('гарантований мінімум тримає максимум з умовою; іншому виду суми максимум не лишається', () => {
    const guaranteed = normalizeProgram({ id: 'g', type: 'ed', payKind: 'guaranteed', payments: { final: { amount: 55000, currency: 'UAH' } }, payMax: { amount: 70000, currency: 'UAH', condition: 'залежно від результату' } });
    expect(guaranteed.payMax).toEqual({ amount: 70000, currency: 'UAH', condition: 'залежно від результату' });
    expect(programBreakdown(guaranteed).upTo.amount).toBe(70000);
    expect(programPayLabel(guaranteed)).toEqual({ text: 'Гарантовано донорці' });
    const cycle = normalizeProgram({ ...guaranteed, payKind: 'cycle' });
    expect(cycle.payMax).toBeUndefined();
  });

  it('«бажано» й «індивідуально» не відмовляють, «без обмежень» — окремий пункт', () => {
    const program = normalizeProgram({ id: 'r', type: 'ed', requirements: { ageTo: 30 }, requirementMeta: { age: { level: 'preferred' }, marital: { level: 'free' } } });
    expect(evaluateProgram(program, { age: 33 })).toEqual(expect.objectContaining({ matches: true, uncertain: true }));
    expect(describeProgramRequirements(program).map(item => item.key)).toEqual(['age', 'marital']);
    const strict = normalizeProgram({ id: 'r', type: 'ed', requirements: { ageTo: 30 } });
    expect(evaluateProgram(strict, { age: 33 }).matches).toBe(false);
  });

  it('головне без вибору агенції — типові ознаки; зняте все — порожньо', () => {
    const base = normalizeProgram({ ...surrogacy, highlights: undefined });
    expect(resolveProgramHighlights(base).map(item => item.key)).toEqual(['startNow', 'monthly', 'age', 'csection']);
    expect(resolveProgramHighlights({ ...base, highlights: [HIGHLIGHTS_NONE] })).toEqual([]);
  });

  it('місце показується з великої літери', () => {
    expect(formatProgramPlace('київ; пологи в грузії')).toBe('Київ; Пологи в грузії');
  });
});

describe('запис програм, поки правила не викочені', () => {
  // eslint-disable-next-line global-require
  const { stripExtendedProgramFields } = require('../../components/programs/programsRemote');

  it('прибирає лише нові поля й лишає те, що правила вже приймають', () => {
    const items = {
      p1: {
        id: 'p1', type: 'sm', name: 'X', payKind: 'total', startNow: true, location: 'Київ',
        payments: { final: { amount: 1, currency: 'USD', when: 'потім' }, monthly: { amount: 2, currency: 'USD', months: 9, includes: { label: 'одяг', amount: 1, currency: 'USD' } } },
        otherPayments: [{ label: 'a', amount: 3, currency: 'USD', condition: 'c' }],
        bonuses: [{ label: 'b', amount: 4, currency: 'USD', condition: 'c' }],
        stages: [{ stage: 'other', place: 'Львів' }], highlights: ['startNow'], requirementMeta: { age: { level: 'free' } },
      },
    };
    expect(stripExtendedProgramFields(items)).toEqual({
      p1: {
        id: 'p1', type: 'sm', location: 'Київ',
        payments: { final: { amount: 1, currency: 'USD' }, monthly: { amount: 2, currency: 'USD', months: 9 } },
        otherPayments: [{ label: 'a', amount: 3, currency: 'USD' }],
        bonuses: [{ label: 'b', amount: 4, currency: 'USD' }],
      },
    });
  });
});
