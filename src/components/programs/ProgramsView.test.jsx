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

  it('прихованої програми не видно, а додаткова виплата — знятий перемикач, що міняє суму в заголовку', () => {
    const withBonus = {
      p1: { ...programs.p1, bonuses: [{ label: 'Вагітність з першої спроби', amount: 500, currency: 'USD' }] },
      p2: { ...programs.p2, hidden: true },
    };
    render(<ProgramsSummary card={{ programs: withBonus }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    expect(screen.getByTestId('programs-summary')).toHaveTextContent('Вам підходить 1 з 1 програми');
    const row = screen.getByTestId('program-list-item');
    // У заголовку — те, що отримує кожна; додаткове читачка додає сама.
    expect(within(row).getByTestId('program-title')).toHaveTextContent('Шукаємо донора ооцитів — 2 500 $');
    expect(within(row).getByTestId('program-pay-label')).toHaveTextContent('Сума може бути вищою: до 3 000 $ з додатковими виплатами');
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    expect(screen.getByText('Додаткові виплати')).toBeInTheDocument();
    const firstTry = screen.getByRole('checkbox', { name: /Вагітність з першої спроби/ });
    expect(firstTry).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(firstTry);
    expect(within(row).getByTestId('program-title')).toHaveTextContent('Шукаємо донора ооцитів — 3 000 $');
    // Відмічено все — обіцяти більше нема чого.
    expect(within(row).queryByTestId('program-pay-label')).not.toBeInTheDocument();
    expect(row).not.toHaveTextContent('Сценарій');
  });

  it('заголовок — пропозиція й сума через тире, без власної назви й `title`', () => {
    render(<ProgramsSummary card={{ programs: { p1: { ...programs.p1, name: 'Донорство в Грузії' } } }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" defaultOpenId="p1" />);
    expect(screen.getByTestId('program-title')).toHaveTextContent('Шукаємо донора ооцитів — 2 500 $');
    expect(screen.queryByText('Київ')).not.toBeInTheDocument();
    expect(screen.queryByText('Донорство в Грузії')).not.toBeInTheDocument();
    expect(screen.getByTestId('program-list-item')).not.toHaveTextContent('Винагорода донорці');
  });

  it('місце — окремим рядком з великої літери', () => {
    const placed = { p1: { id: 'p1', type: 'ed', location: 'київ', payments: { final: { amount: 2500, currency: 'USD' } } } };
    render(<ProgramsSummary card={{ programs: placed }} rates={rates} displayCurrency="USD" language="uk" />);
    expect(within(screen.getByTestId('program-list-item')).getByText('Київ')).toBeInTheDocument();
  });

  it('обрана валюта — сума в заголовку й у доплатах, оригінал поруч', () => {
    const uah = { p1: { id: 'p1', type: 'sm', payments: { final: { amount: 20000, currency: 'USD' }, monthly: { amount: 500, currency: 'USD', months: 9 } } } };
    render(<ProgramsSummary card={{ programs: uah }} rates={rates} displayCurrency="UAH" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    const row = screen.getByTestId('program-list-item');
    // 24 500 $ × 41 = 1 004 500 ₴, округлено до сотень.
    expect(row).toHaveTextContent('≈ 1 004 500 ₴');
    expect(row).toHaveTextContent('24 500 $');
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    expect(within(row).getByTestId('program-payments')).toHaveTextContent('≈ +184 500 ₴');
    // Курс і дата — один раз, під програмами.
    expect(screen.getAllByText(/курсом НБУ на 30\.09\.2026/)).toHaveLength(1);
  });

  it('згорнута програма показує вимоги, а покриття — лише в деталях', () => {
    const covered = { p1: { ...programs.p1, requirements: { ageFrom: 21, ageTo: 29, rh: '+', bmiMax: 28, heightFrom: 165 }, coverage: ['travel', 'housing', 'food', 'exams'] } };
    render(<ProgramsSummary card={{ programs: covered }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="USD" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    const requirements = within(row).getByTestId('program-requirements');
    expect(within(requirements).getAllByRole('listitem').map(item => item.textContent)).toEqual(['✓21–29 років', 'ІМТ до 28', 'зріст від 165 см', 'лише Rh+']);
    expect(row).not.toHaveTextContent('Покриває');
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    expect(within(row).getByText('Що покриває')).toBeInTheDocument();
  });

  it('коментар організатора видно вже в згорнутій програмі', () => {
    const noted = { p1: { ...programs.p1, note: 'Житло біля клініки на весь час програми' } };
    render(<ProgramsSummary card={{ programs: noted }} rates={rates} displayCurrency="USD" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    expect(within(row).getByTestId('program-organizer-note')).toHaveTextContent('Коментар організатора: Житло біля клініки на весь час програми');
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    expect(within(row).queryByTestId('program-organizer-note')).not.toBeInTheDocument();
    expect(within(row).getByText('Коментар організатора')).toBeInTheDocument();
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

  it('сума — основна плюс гарантовані, щомісячна — × місяці; додаткові окремо', () => {
    render(<ProgramsSummary card={{ programs: { p2: surrogate } }} rates={rates} displayCurrency="USD" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    // 23 000 + 4 500 + 200 + 100; КС, двійня й повторна програма — додаткові.
    expect(within(row).getByTestId('program-title')).toHaveTextContent('Шукаємо сурогатну маму — 27 800 $');
    expect(within(row).getByTestId('program-pay-label')).toHaveTextContent('до 32 800 $');
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    const paid = within(row).getByTestId('program-payments');
    expect(paid).toHaveTextContent('Основна виплата');
    expect(paid).toHaveTextContent('23 000 $');
    expect(paid).toHaveTextContent('500 $/міс × 9 міс');
    expect(paid).toHaveTextContent('+4 500 $');
    expect(within(paid).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(row).getByTestId('program-bonuses')).toHaveTextContent('Кесарів розтин');
    expect(row).not.toHaveTextContent('Разом за планом');
  });

  it('без кількості місяців сума приблизна, а доплата каже чому', () => {
    const { monthly, ...rest } = surrogate.payments;
    const program = { ...surrogate, payments: { ...rest, monthly: { amount: monthly.amount, currency: 'USD' } } };
    render(<ProgramCard program={program} rates={rates} language="uk" />);
    expect(screen.getByText(/скільки місяців — уточніть в агенції/)).toBeInTheDocument();
    expect(describeProgramOffer(program).money.approximate).toBe(true);
  });

  it('відмічені додаткові виплати йдуть у суму, і окремого сценарію немає', () => {
    render(<ProgramsSummary card={{ programs: { p2: surrogate } }} rates={rates} displayCurrency="USD" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Кесарів розтин/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Двійня/ }));
    expect(within(row).getByTestId('program-title')).toHaveTextContent('32 300 $');
    expect(screen.getByRole('checkbox', { name: /Кесарів розтин/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByTestId('program-bonus-total')).not.toBeInTheDocument();
  });

  it('повторна донація — додаткова виплата з перемикачем', () => {
    const program = { id: 'r', type: 'ed', payments: { final: { amount: 1500, currency: 'USD' }, repeat: { amount: 1200, currency: 'USD' } } };
    render(<ProgramCard program={program} rates={rates} language="uk" />);
    expect(screen.getByRole('checkbox', { name: /Повторна донація/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('program-separate')).not.toBeInTheDocument();
    expect(describeProgramOffer(program).money.amount).toBe(1500);
    expect(describeProgramOffer(program, { selectedBonusKeys: ['repeat'] }).money.amount).toBe(2700);
  });

  it('вимоги й покриття підписані окремо', () => {
    render(<ProgramCard program={{ ...surrogate, requirements: { ageTo: 35 }, coverage: ['travel'] }} rates={rates} language="uk" />);
    expect(screen.getByText('Вимоги')).toBeInTheDocument();
    expect(screen.getByText('Що покриває')).toBeInTheDocument();
  });

  it('читачеві без свого типу програми донорок і СМ — кожна своїм контейнером', () => {
    render(<ProgramsSummary card={{ programs: { p1: programs.p1, p2: surrogate } }} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    const [donor, sm] = screen.getAllByTestId('program-list-item');
    expect(donor).toHaveTextContent('Шукаємо донора ооцитів — 2 500 $');
    expect(sm).toHaveTextContent('Шукаємо сурогатну маму — 27 800 $');
  });
});

describe('програми з оголошень агенцій', () => {
  it('фіксована донорська: сума в заголовку, деталей сум немає', () => {
    const program = { id: 'a', type: 'ed', payKind: 'cycle', payments: { final: { amount: 40000, currency: 'UAH' } }, requirements: { ageFrom: 20, ageTo: 30 } };
    render(<ProgramsSummary card={{ programs: { a: program } }} rates={rates} displayCurrency="UAH" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    expect(row).toHaveTextContent('40 000 ₴');
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    expect(within(row).queryByTestId('program-bonuses')).not.toBeInTheDocument();
  });

  it('старий вид суми «гарантовано + до …» більше не показується: основна виплата одна', () => {
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
    expect(row).not.toHaveTextContent('70 000');
  });

  it('доплата з умовами й часом каже їх під назвою', () => {
    const program = {
      id: 'c',
      type: 'sm',
      payments: {
        final: { amount: 15000, currency: 'USD' },
        monthly: { amount: 900, currency: 'USD', months: 9 },
        transfer: { amount: 300, currency: 'USD', when: 'після переносу' },
      },
      otherPayments: [{ label: 'Підтвердження вагітності', amount: 500, currency: 'USD', when: 'на 6 тижні', condition: 'після УЗД' }],
    };
    render(<ProgramCard program={program} rates={rates} language="uk" />);
    // 15 000 + 900 × 9 + 300; дописана агенцією виплата типово додаткова.
    expect(describeProgramOffer(program).money.amount).toBe(23400);
    expect(screen.getByText('на 6 тижні · після УЗД')).toBeInTheDocument();
    expect(screen.getByText('після переносу')).toBeInTheDocument();
  });

  it('одяг у донорській програмі не показується', () => {
    const program = { id: 'o', type: 'ed', payments: { final: { amount: 1500, currency: 'USD' } }, coverage: ['travel', 'clothes'] };
    render(<ProgramsSummary card={{ programs: { o: program } }} rates={rates} displayCurrency="USD" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    fireEvent.click(within(row).getByRole('button', { name: 'Деталі програми' }));
    expect(row).toHaveTextContent('Проїзд');
    expect(row).not.toHaveTextContent('Одяг');
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

  it('головне в картці — те, що вибрала агенція, у її порядку; вимоги стоять окремо й усі', () => {
    const program = {
      id: 'g',
      type: 'sm',
      startNow: true,
      payments: { final: { amount: 20000, currency: 'USD' }, monthly: { amount: 500, currency: 'USD' } },
      requirements: { ageTo: 35, csectionMax: '1' },
      highlights: ['monthly', 'csection', 'startNow'],
    };
    render(<ProgramsSummary card={{ programs: { g: program } }} rates={rates} displayCurrency="USD" language="uk" />);
    const row = screen.getByTestId('program-list-item');
    const list = within(row).getByLabelText('Головне');
    expect(within(list).getAllByRole('listitem').map(item => item.textContent.replace(/\s/g, ' '))).toEqual(['500 $ щомісяця', 'старт одразу']);
    const requirements = within(row).getByTestId('program-requirements');
    expect(within(requirements).getAllByRole('listitem').map(item => item.textContent)).toEqual(['до 35 років', 'можна з 1 КР']);
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
