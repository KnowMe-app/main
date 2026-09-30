import {
  buildProgramsBrief,
  evaluateProgram,
  extractViewerProgramFacts,
  listPaymentBuckets,
  listPrograms,
  normalizeProgram,
  resolveCardPrograms,
  resolveViewerProgramType,
  sortCardsByMode,
  summarizeCardPrograms,
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

  it('стисла програма несе вимоги й головну виплату, без доплат', () => {
    const brief = buildProgramsBrief({ p1: donorProgram, p2: surrogateProgram });
    expect(brief.p2).toEqual({ type: 'sm', ageTo: 35, marital: 'unmarried', csectionMax: '1', pay: 20000, currency: 'USD' });
    expect(brief.p1.title).toBe('Донорство в Києві');
  });

  it('картка без дочитаної анкети показує програми зі стислих', () => {
    const card = { programsBrief: buildProgramsBrief({ p1: donorProgram }) };
    const resolved = resolveCardPrograms(card);
    expect(resolved.brief).toBe(true);
    expect(resolved.programs[0].payments.final.amount).toBe(2500);
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
    expect(resolveViewerProgramType('ag')).toBe('');
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

  it('список програм сталий і обмежений', () => {
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`p${String(i).padStart(2, '0')}`, donorProgram]));
    expect(listPrograms(many)).toHaveLength(12);
  });
});
