import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ProgramCard, ProgramsSummary, describeProgramOffer } from './ProgramsView';
import { CardRoleBlock, isCounterpartyCard } from './CardRoleBlock';
import {
  loadOwnPrograms,
  peekOwnPrograms,
  PROGRAMS_CACHE_PREFIX,
  resetProgramsStoreForTests,
  saveCardPrograms,
  setProgramsTransport,
} from '../../utils/programsStore';
import { applyUkrainianInterface } from '../../testUtils/interfaceLanguage';

applyUkrainianInterface();

const rates = { usd: 41, eur: 48, rateDate: '2026-09-30' };

const programs = {
  p1: { id: 'p1', type: 'ed', title: 'Київ', requirements: { ageFrom: 21, ageTo: 29 }, payments: { final: { amount: 2500, currency: 'USD' } } },
  p2: { id: 'p2', type: 'ed', title: 'Кріобанк', requirements: { ageTo: 25 }, payments: { final: { amount: 1600, currency: 'USD' } } },
  p3: { id: 'p3', type: 'sm', payments: { final: { amount: 20000, currency: 'USD' } } },
};

const donorFacts = { age: 27 };

describe('програми в рядку стрічки', () => {
  it('каже донорці, скільки програм їй підходить, у заголовку «Програми · N»', () => {
    render(<ProgramsSummary card={{ programs }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    const summary = screen.getByTestId('programs-summary');
    expect(summary).toHaveTextContent('Програми · 2');
    expect(summary).toHaveTextContent('Вам підходить 1 з 2 програм');
    // Видимі контейнери самі називають кожну суму — діапазону над ними немає.
    expect(summary).not.toHaveTextContent('1 600–2 500 $');
    expect(summary).toHaveTextContent('ще 1 — для сурогатних мам');
  });

  it('кожна програма — контейнер зі збігом, а «Деталі програми» розгортає саме її', () => {
    render(<ProgramsSummary card={{ programs }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    const rows = screen.getAllByTestId('program-list-item');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByLabelText('Вам підходить')).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText('Не підходить')).toBeInTheDocument();
    expect(screen.queryByTestId('program-card')).not.toBeInTheDocument();
    const toggle = within(rows[0]).getByRole('button', { name: 'Деталі програми' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(within(rows[0]).getByTestId('program-card')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Вам підходить')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: 'Згорнути деталі' })).toHaveAttribute('aria-expanded', 'true');
    // Друга програма розгортається незалежно від першої.
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Деталі програми' }));
    expect(screen.getAllByTestId('program-card')).toHaveLength(2);
  });

  it('прихованої програми не видно, а можливі доплати стоять окремим блоком', () => {
    const withBonus = {
      p1: { ...programs.p1, bonuses: [{ label: 'Вагітність з першої спроби', amount: 500, currency: 'USD' }] },
      p2: { ...programs.p2, hidden: true },
    };
    render(<ProgramsSummary card={{ programs: withBonus }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    expect(screen.getByTestId('programs-summary')).toHaveTextContent('Вам підходить 1 з 1 програми');
    fireEvent.click(within(screen.getByTestId('program-list-item')).getByRole('button', { name: 'Деталі програми' }));
    expect(screen.getByText('Можливі доплати')).toBeInTheDocument();
    const firstTry = screen.getByRole('checkbox', { name: /Вагітність з першої спроби/ });
    expect(firstTry).not.toBeChecked();
    fireEvent.click(firstTry);
    // Доплата йде в головну суму згорнутої частини, а не в окремий рядок під доплатами.
    const row = screen.getByTestId('program-list-item');
    expect(row).toHaveTextContent('3 000 $');
    expect(row).toHaveTextContent('з обраними доплатами, гарантовано 2 500 $');
    expect(screen.queryByTestId('program-bonus-total')).not.toBeInTheDocument();
  });

  it('заголовок — пропозиція, а не роль, і застарілої назви `title` не показує', () => {
    render(<ProgramsSummary card={{ programs: { p1: programs.p1 } }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" defaultOpenId="p1" />);
    expect(screen.getByText('Донорство ооцитів')).toBeInTheDocument();
    expect(screen.queryByText('Київ')).not.toBeInTheDocument();
  });

  it('власна назва — окремо від типу, місце — окремим рядком з великої літери', () => {
    const named = { p1: { id: 'p1', type: 'ed', name: 'Донорство в Грузії', location: 'київ', payments: { final: { amount: 2500, currency: 'USD' } } } };
    render(<ProgramsSummary card={{ programs: named }} rates={rates} displayCurrency="USD" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    expect(within(row).getByText('Донорство в Грузії')).toBeInTheDocument();
    expect(within(row).getByText('Донорство ооцитів')).toBeInTheDocument();
    expect(within(row).getByText('Київ')).toBeInTheDocument();
  });

  it('обрана валюта — головна сума і в згорнутій, і в деталях, оригінал поруч', () => {
    const uah = { p1: { id: 'p1', type: 'sm', payments: { final: { amount: 20000, currency: 'USD' }, monthly: { amount: 500, currency: 'USD', months: 9 } } } };
    render(<ProgramsSummary card={{ programs: uah }} rates={rates} displayCurrency="UAH" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    const row = screen.getByTestId('program-list-item');
    // 24 500 $ × 41 = 1 004 500 ₴, округлено до сотень.
    expect(row).toHaveTextContent('≈ 1 004 500 ₴');
    expect(row).toHaveTextContent('24 500 $');
    expect(row).toHaveTextContent('Разом сурогатній мамі за програму');
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    expect(within(row).getByTestId('program-total')).toHaveTextContent('≈ 820 000 ₴');
    // Курс і дата — один раз, під програмами.
    expect(screen.getAllByText(/курсом НБУ на 30\.09\.2026/)).toHaveLength(1);
  });

  it('покриття згорнуто називає, що саме покривають, а не число', () => {
    const covered = { p1: { ...programs.p1, coverage: ['travel', 'housing', 'food', 'exams'] } };
    render(<ProgramsSummary card={{ programs: covered }} rates={rates} displayCurrency="USD" language="uk" />);
    expect(screen.getByTestId('program-list-item')).toHaveTextContent('Покриває: Проїзд, житло +2');
    expect(screen.queryByText(/покриття: 4/)).not.toBeInTheDocument();
  });

  it('читачеві, якому програми не адресовані, — лише кількість у заголовку', () => {
    render(<ProgramsSummary card={{ programs }} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    expect(screen.getByTestId('programs-summary')).toHaveTextContent('Програми · 3');
    expect(screen.getByTestId('programs-summary')).not.toHaveTextContent('Вам підходить');
  });
});

describe('картка програми — калькулятор заробітку', () => {
  // Програма зі скріншота користувачки: «загальна сума» там була 23 800 $ —
  // без жодного з девʼяти щомісячних платежів.
  const surrogate = {
    id: 'p2',
    type: 'sm',
    location: 'Київ',
    payments: {
      final: { amount: 23000, currency: 'USD' },
      monthly: { amount: 500, currency: 'USD', months: 9 },
      transfer: { amount: 200, currency: 'USD' },
      contract: { amount: 100, currency: 'USD' },
      cSection: { amount: 1500, currency: 'USD' },
      twins: { amount: 3000, currency: 'USD' },
    },
    otherPayments: [{ label: 'Доплата за повторну програму', amount: 500, currency: 'USD' }],
  };

  it('разом — усі гарантовані виплати, зі щомісячними × місяці', () => {
    render(<ProgramsSummary card={{ programs: { p2: surrogate } }} rates={rates} displayCurrency="USD" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    expect(row).toHaveTextContent('28 300 $');
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    // Деталі «разом» не повторюють: воно вже стоїть угорі.
    expect(within(row).getByTestId('program-total')).not.toHaveTextContent('28 300 $');
    expect(screen.getByText(/500 \$ × 9 міс/)).toBeInTheDocument();
  });

  it('без кількості місяців разом не обіцяє, а каже чому', () => {
    const { monthly, ...rest } = surrogate.payments;
    render(<ProgramCard program={{ ...surrogate, payments: { ...rest, monthly: { amount: monthly.amount, currency: 'USD' } } }} rates={rates} language="uk" />);
    expect(screen.queryByText('Разом за програму')).not.toBeInTheDocument();
    expect(screen.getByText(/Разом не рахуємо/)).toBeInTheDocument();
  });

  it('відмічена можлива доплата додається до «разом» угорі, а не другим рядком', () => {
    render(<ProgramsSummary card={{ programs: { p2: surrogate } }} rates={rates} displayCurrency="USD" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Кесарів розтин/ }));
    expect(row).toHaveTextContent('29 800 $');
    expect(row).toHaveTextContent('з обраними доплатами, гарантовано 28 300 $');
    expect(row).not.toHaveTextContent('Разом з обраними доплатами');
    expect(screen.getByRole('checkbox', { name: /Кесарів розтин/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('вимоги й покриття підписані окремо', () => {
    render(<ProgramCard program={{ ...surrogate, requirements: { ageTo: 35 }, coverage: ['travel'] }} rates={rates} language="uk" />);
    expect(screen.getByText('Вимоги')).toBeInTheDocument();
    expect(screen.getByText('Що покриває')).toBeInTheDocument();
  });

  it('читачеві без свого типу програми донорок і СМ — кожна своїм контейнером і своїм підписом', () => {
    render(<ProgramsSummary card={{ programs: { p1: programs.p1, p2: surrogate } }} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    const [donor, sm] = screen.getAllByTestId('program-list-item');
    expect(donor).toHaveTextContent('2 500 $');
    expect(donor).toHaveTextContent('Винагорода донорці за цикл');
    expect(sm).toHaveTextContent('28 300 $');
    expect(sm).toHaveTextContent('Разом сурогатній мамі за програму');
  });
});

describe('програми з оголошень агенцій', () => {
  it('фіксована донорська: сума за цикл, без розбивки, що повторювала б її', () => {
    const program = { id: 'a', type: 'ed', payKind: 'cycle', payments: { final: { amount: 40000, currency: 'UAH' } }, requirements: { ageFrom: 20, ageTo: 30 } };
    render(<ProgramsSummary card={{ programs: { a: program } }} rates={rates} displayCurrency="UAH" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    expect(row).toHaveTextContent('40 000 ₴');
    expect(row).toHaveTextContent('Винагорода донорці за цикл');
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    expect(within(row).queryByTestId('program-total')).not.toBeInTheDocument();
  });

  it('донорська з умовною сумою: гарантоване й «до …» з умовою разом', () => {
    const program = {
      id: 'b',
      type: 'ed',
      payKind: 'guaranteed',
      payments: { final: { amount: 55000, currency: 'UAH' } },
      payMax: { amount: 70000, currency: 'UAH', condition: 'залежно від результату' },
    };
    render(<ProgramsSummary card={{ programs: { b: program } }} rates={rates} displayCurrency="UAH" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    expect(row).toHaveTextContent('55 000 ₴');
    expect(row).toHaveTextContent('Гарантовано донорці');
    expect(row).toHaveTextContent('до 70 000 ₴ — залежно від результату');
  });

  it('СМ із графіком: вкладена сума не рахується двічі, КС — окремо', () => {
    const program = {
      id: 'c',
      type: 'sm',
      payments: {
        final: { amount: 15000, currency: 'USD' },
        monthly: { amount: 900, currency: 'USD', months: 9, includes: { label: 'одяг', amount: 400, currency: 'USD' } },
        transfer: { amount: 300, currency: 'USD', when: 'після переносу' },
        cSection: { amount: 1000, currency: 'USD' },
      },
      otherPayments: [{ label: 'Підтвердження вагітності', amount: 500, currency: 'USD', when: 'на 6 тижні', condition: 'після УЗД' }],
    };
    render(<ProgramCard program={program} rates={rates} language="uk" />);
    // 15 000 + 900 × 9 + 300 + 500 = 23 900; 400 на одяг усередині щомісячних.
    expect(describeProgramOffer(program).money.amount).toBe(23900);
    expect(screen.getByText(/у тому числі 400 \$ — одяг/)).toBeInTheDocument();
    expect(screen.getByText('на 6 тижні · після УЗД')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Кесарів розтин/ })).not.toBeChecked();
  });

  it('загальна винагорода містить графік, а не додає його', () => {
    const program = { id: 'd', type: 'sm', payKind: 'total', payments: { final: { amount: 20000, currency: 'USD' }, monthly: { amount: 500, currency: 'USD', months: 9 } } };
    render(<ProgramsSummary card={{ programs: { d: program } }} rates={rates} displayCurrency="USD" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    expect(row).toHaveTextContent('20 000 $');
    expect(row).toHaveTextContent('Винагорода сурогатній мамі за програму');
    expect(row).not.toHaveTextContent('24 500');
  });

  it('кілька етапів: місце кожного й переїзд із сімʼєю', () => {
    const program = {
      id: 'e',
      type: 'ed',
      payments: { final: { amount: 1500, currency: 'USD' } },
      stages: [{ stage: 'stimulation', place: 'Київ' }, { stage: 'retrieval', place: 'Грузія, Тбілісі' }],
      relocation: { when: 'на 5 днів', family: 'yes' },
    };
    render(<ProgramsSummary card={{ programs: { e: program } }} rates={rates} displayCurrency="USD" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    expect(row).toHaveTextContent('Київ · 2 етапи');
    expect(row).toHaveTextContent('переїзд із сімʼєю');
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    expect(within(row).getByText('Пункція')).toBeInTheDocument();
    expect(within(row).getByText('Грузія, Тбілісі')).toBeInTheDocument();
    expect(within(row).getByText('Можна з сімʼєю')).toBeInTheDocument();
  });

  it('вимога з поясненням і рівнем; «бажано» не відмовляє', () => {
    const program = {
      id: 'f',
      type: 'sm',
      payments: { final: { amount: 20000, currency: 'USD' } },
      requirements: { csectionMax: '1', ageTo: 35 },
      requirementMeta: { csection: { note: 'через 2 роки після операції' }, age: { level: 'preferred' }, marital: { level: 'free' } },
    };
    render(<ProgramsSummary card={{ programs: { f: program } }} viewerType="sm" facts={{ age: 38, csections: 1 }} rates={rates} displayCurrency="USD" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    expect(within(row).getByLabelText('Може підходити')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    expect(row).toHaveTextContent('через 2 роки після операції');
    expect(row).toHaveTextContent('Сімейний стан — без обмежень');
    expect(row).toHaveTextContent('бажано');
  });

  it('головне в картці — те, що вибрала агенція, у її порядку', () => {
    const program = {
      id: 'g',
      type: 'sm',
      startNow: true,
      payments: { final: { amount: 20000, currency: 'USD' }, monthly: { amount: 500, currency: 'USD' } },
      requirements: { ageTo: 35, csectionMax: '1' },
      highlights: ['csection', 'startNow'],
    };
    render(<ProgramsSummary card={{ programs: { g: program } }} rates={rates} displayCurrency="USD" language="uk" />);
    const list = within(screen.getByTestId('program-list-item')).getByLabelText('Головне');
    expect(within(list).getAllByRole('listitem').map(item => item.textContent)).toEqual(['можна з 1 КР', 'старт одразу']);
  });
});

describe('картка агенції й батьків', () => {
  const context = { viewerType: 'ed', facts: donorFacts, rates, displayCurrency: 'USD', onDisplayCurrencyChange: jest.fn() };

  beforeEach(() => {
    resetProgramsStoreForTests();
    window.localStorage.clear();
  });

  afterEach(() => setProgramsTransport(null));

  it('порожню програму читачам не показує — це чернетка', () => {
    const withDraft = { ...programs, p4: { id: 'p4', type: 'ed', requirements: { rh: 'any' } } };
    render(<CardRoleBlock card={{ userId: 'AG1', role: 'ag', programs: withDraft }} programsContext={context} language="uk" />);
    expect(screen.getAllByTestId('program-list-item')).toHaveLength(2);
  });

  it('у програм одного типу підсвічує саме те, чим вони різняться', () => {
    const pair = {
      a: { id: 'a', type: 'ed', location: 'Київ', requirements: { ageTo: 30, rh: '+' }, payments: { final: { amount: 1500, currency: 'USD' } } },
      b: { id: 'b', type: 'ed', location: 'Київ', requirements: { ageTo: 35, rh: '+' }, payments: { final: { amount: 1500, currency: 'USD' } } },
    };
    render(<CardRoleBlock card={{ userId: 'AG3', role: 'ag', programs: pair }} programsContext={{ ...context, viewerType: '' }} language="uk" />);
    const [first] = screen.getAllByTestId('program-list-item');
    expect(within(first).getByText('до 30 років')).toHaveClass('differs');
    expect(within(first).getByText('лише Rh+')).not.toHaveClass('differs');
  });

  it('показує перші три програми, решту — на прохання', () => {
    const many = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(id => [id, { ...programs.p1, id }]));
    render(<CardRoleBlock card={{ userId: 'AG4', role: 'ag', programs: many }} programsContext={{ ...context, viewerType: '' }} language="uk" />);
    expect(screen.getAllByTestId('program-list-item')).toHaveLength(3);
    fireEvent.click(screen.getByText('Показати ще 2'));
    expect(screen.getAllByTestId('program-list-item')).toHaveLength(5);
  });

  it('програми картки бере спершу з браузера — без запиту', () => {
    const read = jest.fn();
    setProgramsTransport({ read });
    window.localStorage.setItem(`${PROGRAMS_CACHE_PREFIX}AG1`, JSON.stringify({ at: 10, items: programs }));
    render(<CardRoleBlock card={{ userId: 'AG1', role: 'ag', programsAt: 10 }} programsContext={context} language="uk" />);
    expect(screen.getByTestId('programs-summary')).toHaveTextContent('Вам підходить 1 з 2 програм');
    expect(read).not.toHaveBeenCalled();
  });

  it('застарілу копію перечитує один раз, коли картка вже в списку', async () => {
    const read = jest.fn().mockResolvedValue({ updatedAt: 20, items: { p1: programs.p1 } });
    setProgramsTransport({ read });
    window.localStorage.setItem(`${PROGRAMS_CACHE_PREFIX}AG1`, JSON.stringify({ at: 10, items: programs }));
    render(<CardRoleBlock card={{ userId: 'AG1', role: 'ag', programsAt: 20 }} programsContext={context} language="uk" />);
    expect(await screen.findByText('Вам підходить 1 з 1 програми')).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(`${PROGRAMS_CACHE_PREFIX}AG1`)).at).toBe(20);
  });

  it('картка без версії програм не питає нічого', () => {
    const read = jest.fn();
    setProgramsTransport({ read });
    const { container } = render(<CardRoleBlock card={{ userId: 'AG2', role: 'ag' }} programsContext={context} language="uk" />);
    expect(container).toBeEmptyDOMElement();
    expect(read).not.toHaveBeenCalled();
  });

  it('дві ролі — друга анкета підписана роллю', () => {
    window.localStorage.setItem(`${PROGRAMS_CACHE_PREFIX}ED1`, JSON.stringify({ at: 10, items: programs }));
    render(<CardRoleBlock card={{ userId: 'ED1', role: ['ed', 'ag'], programsAt: 10 }} programsContext={context} language="uk" />);
    expect(screen.getByText('Агенція')).toBeInTheDocument();
  });

  it('батьки кажуть, кого шукають', () => {
    render(<CardRoleBlock card={{ role: 'ip', seeking: 'both' }} language="uk" />);
    expect(screen.getByText(/донорку й сурогатну маму/)).toBeInTheDocument();
  });

  it('рядок організації зберігає зміст анкети батьків', () => {
    // Назву організації в такому рядку несе шапка (`ProfileRow`), тож блок її
    // не повторює — але «кого шукають» батьків лишається.
    render(<CardRoleBlock card={{ role: ['ag', 'ip'], agencyName: 'Мрія', seeking: 'sm' }} language="uk" />);
    expect(screen.queryByText(/Мрія/)).not.toBeInTheDocument();
    expect(screen.getByText(/сурогатну маму/)).toBeInTheDocument();
  });

  it('донорку блок не чіпає', () => {
    expect(isCounterpartyCard({ role: 'ed' })).toBe(false);
    expect(isCounterpartyCard({ role: ['ag', 'ed'] })).toBe(false);
    const { container } = render(<CardRoleBlock card={{ role: 'ed' }} language="uk" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('конкурентне читання власних програм', () => {
  beforeEach(() => {
    resetProgramsStoreForTests();
    window.localStorage.clear();
  });

  afterEach(() => setProgramsTransport(null));

  it('порожня стара відповідь не стирає нові pending-програми', async () => {
    let finishRead;
    const read = jest.fn(() => new Promise(resolve => { finishRead = resolve; }));
    const writeError = new Error('offline');
    setProgramsTransport({ read, write: jest.fn().mockRejectedValue(writeError) });

    const loading = loadOwnPrograms('OWNER1');
    const saving = saveCardPrograms('OWNER1', { p1: programs.p1 }).catch(error => error);
    finishRead(null);

    await expect(loading).resolves.toEqual(expect.objectContaining({ pending: true }));
    await expect(saving).resolves.toBe(writeError);
    const pending = peekOwnPrograms('OWNER1');
    expect(pending?.pending).toBe(true);
    expect(pending?.items?.p1).toEqual(expect.objectContaining({
      id: programs.p1.id,
      type: programs.p1.type,
    }));
    expect(pending?.items?.p1.title).toBeUndefined();
  });
});
