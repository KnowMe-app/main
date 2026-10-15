import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ProgramsEditor } from './ProgramsEditor';
import { applyUkrainianInterface } from '../../testUtils/interfaceLanguage';

applyUkrainianInterface();

const program = {
  p1: {
    id: 'p1',
    type: 'ed',
    location: 'Київ',
    requirements: { ageFrom: 21, ageTo: 29 },
    payments: { final: { amount: 2500, currency: 'USD' } },
  },
};

describe('редактор програм', () => {
  it('не повторює тип програми у короткому описі', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    // Шапка називає, кого шукають, а не роль людини.
    expect(screen.getAllByText('Шукаємо донора ооцитів')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ })).toHaveTextContent('Київ · 2 500 $');
    expect(screen.getByTestId('program-status')).toHaveTextContent('Опублікована');
  });

  it('ховає другорядні команди в меню дій', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    expect(screen.queryByText('Створити копію')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Дії програми'));
    expect(screen.getByText('Створити копію')).toBeVisible();
    expect(screen.getByText('Видалити програму')).toBeVisible();
  });

  it('меню дій живе поза карткою програми, і її overflow його не ріже', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByLabelText('Дії програми'));
    const menu = screen.getByRole('menu');
    // Портал у body: жоден предок з overflow не обрізає список.
    expect(screen.getByTestId('program-editor')).not.toContainElement(menu);
    expect(document.body).toContainElement(menu);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('стрілки біля назви немає: програму розгортає сама назва', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    expect(screen.queryByText('▼')).not.toBeInTheDocument();
    const title = screen.getByRole('button', { name: /Шукаємо донора ооцитів/ });
    fireEvent.click(title);
    expect(title).toHaveAttribute('aria-expanded', 'true');
  });

  it('поруч із формою — та сама картка, яку побачать у стрічці', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    expect(screen.queryByTestId('program-card')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    expect(screen.getByTestId('program-card')).toHaveTextContent('2 500 $');
    expect(screen.getByRole('tab', { name: 'Перегляд' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Редагування' })).toHaveAttribute('aria-selected', 'true');
  });

  it('можливу доплату не показує порожнім полем, а додає кнопкою', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    expect(screen.queryByLabelText('Доплата за досвід')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Додати доплату: Доплата за досвід' }));
    expect(screen.getByLabelText('Доплата за досвід')).toBeInTheDocument();
  });

  it('каже про вимогу поза межами одразу, а не губить її при записі', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: /Вимоги до кандидатки/ }));
    fireEvent.change(screen.getByLabelText('Вік до'), { target: { value: '18' } });
    expect(screen.getByRole('alert')).toHaveTextContent('«До» менше за «від»');
    fireEvent.change(screen.getByLabelText('Вік до'), { target: { value: '70' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Від 16 до 60');
  });

  it('порожню програму називає чернеткою, якої в стрічці не видно', () => {
    render(<ProgramsEditor programs={{ p9: { id: 'p9', type: 'ed' } }} onSave={jest.fn()} language="uk" />);
    expect(screen.getByTestId('program-status')).toHaveTextContent('Чернетка');
  });

  it('загальну суму не питає, а рахує — зі щомісячними × місяці', () => {
    const onSave = jest.fn();
    const surrogate = {
      p2: {
        id: 'p2',
        type: 'sm',
        payments: { final: { amount: 20000, currency: 'USD' }, monthly: { amount: 500, currency: 'USD' } },
      },
    };
    render(<ProgramsEditor programs={surrogate} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо сурогатну маму/ }));
    expect(screen.queryByText('Загальна сума за програму')).not.toBeInTheDocument();
    // Без кількості місяців — дев'ять і «≈», з підказкою, чому сума приблизна.
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('≈ 24 500 $');
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('Вкажіть кількість місяців');
    fireEvent.click(screen.getByRole('button', { name: 'Змінити виплату: Щомісячно' }));
    fireEvent.change(screen.getByLabelText('Скільки місяців'), { target: { value: '10' } });
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('25 000 $');
  });

  it('не лишає нуль місяців, який розрахунок замінив би дев’ятьма', () => {
    const surrogate = {
      p2: {
        id: 'p2',
        type: 'sm',
        payments: { monthly: { amount: 500, currency: 'USD' } },
      },
    };
    render(<ProgramsEditor programs={surrogate} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо сурогатну маму/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Змінити виплату: Щомісячно' }));
    const months = screen.getByLabelText('Скільки місяців');
    fireEvent.change(months, { target: { value: '0' } });
    expect(months).toHaveValue('');
  });

  it('вид основної суми не питає й пояснень над виплатами не ставить', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    expect(screen.queryByText('Що означає головна сума?')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByText('Головна сума')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('payment-final')).getByText('Основна виплата')).toBeInTheDocument();
    // Згорнута виплата стоїть рядком, як у картці: назва й сума.
    expect(screen.getByTestId('payment-final')).toHaveTextContent('2 500 $');
  });

  it('коментар організатора стоїть в основному розділі й зберігається', () => {
    const onSave = jest.fn();
    const { unmount } = render(<ProgramsEditor programs={program} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.change(screen.getByLabelText(/Коментар організатора/), { target: { value: 'Квартира біля клініки на весь час' } });
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.note).toBe('Квартира біля клініки на весь час');
  });

  it('виплату понад основну можна позначити гарантованою — тоді вона в сумі', () => {
    const onSave = jest.fn();
    const surrogate = { p2: { id: 'p2', type: 'sm', payments: { final: { amount: 20000, currency: 'USD' }, cSection: { amount: 1500, currency: 'USD' } } } };
    const { unmount } = render(<ProgramsEditor programs={surrogate} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо сурогатну маму/ }));
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('20 000 $');
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('З додатковими виплатами — до 21 500 $');
    // Додаткова виплата згорнута стоїть із квадратиком перемикача, як у картці.
    expect(screen.getByTestId('payment-cSection')).toHaveTextContent('+1 500 $');
    fireEvent.click(screen.getByTestId('payment-cSection'));
    fireEvent.click(within(screen.getByTestId('payment-cSection')).getByLabelText('Сумується автоматично до загальної винагороди'));
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('21 500 $');
    expect(screen.getByTestId('program-editor-total')).not.toHaveTextContent('З додатковими');
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p2;
    expect(saved.payments.cSection).toEqual({ amount: 1500, currency: 'USD', guaranteed: true });
  });

  it('у виплати лише «Коли платять» — без «Умов виплати»; правка суми його не губить', () => {
    const onSave = jest.fn();
    const surrogate = { p2: { id: 'p2', type: 'sm', payments: { final: { amount: 20000, currency: 'USD' }, monthly: { amount: 900, currency: 'USD', months: 9 } } } };
    const { unmount } = render(<ProgramsEditor programs={surrogate} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо сурогатну маму/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Змінити виплату: Щомісячно' }));
    expect(screen.queryByLabelText('Як рахувати')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Коли платять' }));
    expect(screen.queryByLabelText(/Умови виплати/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Коли платять/), { target: { value: 'щомісяця до 5 числа' } });
    fireEvent.change(screen.getByLabelText('Щомісячно'), { target: { value: '950' } });
    fireEvent.blur(screen.getByLabelText('Щомісячно'));
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p2;
    expect(saved.payments.monthly).toEqual({ amount: 950, currency: 'USD', months: 9, when: 'щомісяця до 5 числа' });
  });

  it('відкрита одна виплата; щойно додана стає в кінець і відкривається', () => {
    const surrogate = { p2: { id: 'p2', type: 'sm', payments: { final: { amount: 20000, currency: 'USD' }, monthly: { amount: 600, currency: 'USD', months: 8 }, twins: { amount: 3000, currency: 'USD' } } } };
    render(<ProgramsEditor programs={surrogate} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо сурогатну маму/ }));
    expect(screen.queryByLabelText('Скільки місяців')).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-monthly')).toHaveTextContent('600 $/міс × 8');
    fireEvent.click(screen.getByRole('button', { name: 'Змінити виплату: Щомісячно' }));
    expect(screen.getByLabelText('Скільки місяців')).toBeInTheDocument();
    // «Перенос ембріона» в переліку типу стоїть вище за двійню, але додана
    // останньою — і стоїть останньою, відкрита, а щомісячна згортається.
    fireEvent.click(screen.getByRole('button', { name: 'Додати доплату: Перенос ембріона' }));
    expect(screen.queryByLabelText('Скільки місяців')).not.toBeInTheDocument();
    const rows = screen.getAllByTestId(/^payment-/).map(node => node.getAttribute('data-testid'));
    expect(rows).toEqual(['payment-final', 'payment-monthly', 'payment-twins', 'payment-transfer']);
    expect(within(screen.getByTestId('payment-transfer')).getByLabelText('Перенос ембріона')).toBeInTheDocument();
  });

  it('щомісячну можна прибрати й з нової програми СМ', () => {
    const onSave = jest.fn();
    const { unmount } = render(<ProgramsEditor programs={{ p2: { id: 'p2', type: 'sm', location: 'Київ', payments: { final: { amount: 20000, currency: 'USD' } } } }} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо сурогатну маму/ }));
    expect(screen.queryByTestId('payment-monthly')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Додати доплату: Щомісячно' }));
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати доплату: Щомісячно' }));
    expect(screen.queryByTestId('payment-monthly')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Додати доплату: Щомісячно' })).toBeInTheDocument();
    unmount();
  });

  it('прибирає «Старт одразу» й підказку під місцем', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    expect(screen.queryByText(/Старт одразу/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Якщо етапи проходять/)).not.toBeInTheDocument();
  });

  it('власну вимогу дописують самим текстом, без рівня', () => {
    const onSave = jest.fn();
    const { unmount } = render(<ProgramsEditor programs={program} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: /Вимоги до кандидатки/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Своя вимога' }));
    expect(screen.queryByRole('button', { name: '+ Своя вимога' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Своя вимога 1'), { target: { value: 'Без татуювань' } });
    expect(screen.queryByLabelText(/Рівень вимоги/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Своя вимога' })).toBeInTheDocument();
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.customRequirements).toEqual([{ text: 'Без татуювань' }]);
  });

  it('вимоги — без рівнів і без пояснень; старий рівень перший запис знімає', () => {
    const onSave = jest.fn();
    const withMeta = { p1: { ...program.p1, requirements: { ...program.p1.requirements, csectionMax: '1' }, requirementMeta: { csection: { level: 'individual', note: 'після 2 років' } } } };
    const { unmount } = render(<ProgramsEditor programs={withMeta} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: /Вимоги до кандидатки/ }));
    expect(screen.queryByLabelText(/Рівень вимоги/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Пояснення' })).not.toBeInTheDocument();
    expect(screen.queryByText(/«Бажано»/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Вік до'), { target: { value: '30' } });
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.requirements.ageTo).toBe(30);
    expect(saved.requirementMeta).toBeUndefined();
  });

  it('розділу «Як виглядає в картці» й етапів програми немає', () => {
    render(<ProgramsEditor programs={{ p1: { ...program.p1, startNow: true } }} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    expect(screen.queryByRole('button', { name: /Як виглядає в картці/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Додатково/ }));
    expect(screen.queryByText('Етапи програми')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Етап і місце' })).not.toBeInTheDocument();
  });

  it('у «Додатково» можна дописати своє — подарунки, аванс', () => {
    const onSave = jest.fn();
    const { unmount } = render(<ProgramsEditor programs={program} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: /Додатково/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Свій варіант: подарунок, аванс…' }));
    // Порожній свій пункт стоїть один.
    expect(screen.queryByRole('button', { name: '+ Свій варіант: подарунок, аванс…' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Свій варіант 1'), { target: { value: 'Подарунок\nпісля пункції' } });
    expect(screen.getByRole('button', { name: '+ Свій варіант: подарунок, аванс…' })).toBeInTheDocument();
    // Другий свій варіант додається, правиться й прибирається окремо від першого.
    fireEvent.click(screen.getByRole('button', { name: '+ Свій варіант: подарунок, аванс…' }));
    fireEvent.change(screen.getByLabelText('Свій варіант 2'), { target: { value: 'Телефон у подарунок' } });
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати: Телефон у подарунок' }));
    expect(screen.queryByLabelText('Свій варіант 2')).not.toBeInTheDocument();
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    // Поле росте під текст, але значення лишається одним рядком.
    expect(saved.customCoverage).toEqual(['Подарунок після пункції']);
  });

  it('«OK» записує набране, як blur, і згортає виплату', () => {
    const onSave = jest.fn();
    const surrogate = { p2: { id: 'p2', type: 'sm', payments: { final: { amount: 20000, currency: 'USD' }, cSection: { amount: 1500, currency: 'USD' } } } };
    const { unmount } = render(<ProgramsEditor programs={surrogate} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо сурогатну маму/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Змінити виплату: Кесарів розтин' }));
    const amount = screen.getByLabelText('Кесарів розтин');
    amount.focus();
    fireEvent.change(amount, { target: { value: '1700' } });
    fireEvent.click(screen.getByRole('button', { name: 'Готово: Кесарів розтин' }));
    expect(screen.queryByLabelText('Кесарів розтин')).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-cSection')).toHaveTextContent('+1 700 $');
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p2;
    expect(saved.payments.cSection).toEqual({ amount: 1700, currency: 'USD' });
  });

  it('згорнута виплата — без стрілки й без квадратика перед назвою', () => {
    const surrogate = { p2: { id: 'p2', type: 'sm', payments: { final: { amount: 20000, currency: 'USD' }, twins: { amount: 2000, currency: 'USD' } } } };
    render(<ProgramsEditor programs={surrogate} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо сурогатну маму/ }));
    const row = screen.getByTestId('payment-twins');
    // Рядок — сама назва й сума: «Двійня +2 000 $», нічого перед і після.
    expect(row).toHaveTextContent(/^Двійня\+2 000 \$$/);
  });

  it('умову старої доплати видно, а правка переносить її до решти доплат', () => {
    const onSave = jest.fn();
    const withBonus = { p1: { ...program.p1, bonuses: [{ label: 'Кесарів', amount: 500, currency: 'USD', condition: 'якщо кесаревим' }] } };
    const { unmount } = render(<ProgramsEditor programs={withBonus} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    // Старе значення видно вже в згорнутому рядку, а поле — у відкритому.
    expect(screen.getByTestId('bonus-block')).toHaveTextContent('якщо кесаревим');
    fireEvent.click(screen.getByTestId('bonus-block'));
    const condition = within(screen.getByTestId('bonus-block')).getByLabelText(/Умови виплати/);
    expect(condition).toHaveValue('якщо кесаревим');
    fireEvent.change(condition, { target: { value: '' } });
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.bonuses).toBeUndefined();
    expect(saved.otherPayments).toEqual([{ label: 'Кесарів', amount: 500, currency: 'USD' }]);
  });

  it('розділи згортаються окремо, згорнуті кажуть, що в них є, і набране не губиться', () => {
    const surrogate = {
      p2: {
        id: 'p2',
        type: 'sm',
        payments: { final: { amount: 23000, currency: 'USD' }, monthly: { amount: 600, currency: 'USD', months: 8 }, transfer: { amount: 300, currency: 'USD' }, twins: { amount: 3000, currency: 'USD' }, cSection: { amount: 1500, currency: 'USD' } },
      },
    };
    render(<ProgramsEditor programs={surrogate} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо сурогатну маму/ }));
    const payments = screen.getByRole('button', { name: /Виплати/ });
    expect(payments).toHaveAttribute('aria-expanded', 'true');
    // 23 000 + 600 × 8 + 300 — основна й гарантовані; КС і двійня — додаткові.
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('28 100 $');
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('23 000 $ + 600 $ × 8 + 300 $');
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('З додатковими виплатами — до 32 600 $');
    fireEvent.click(payments);
    expect(payments).toHaveTextContent('4 виплати · сума програми 28 100 $');
    expect(screen.queryByTestId('program-editor-total')).not.toBeInTheDocument();
    fireEvent.click(payments);
    fireEvent.click(screen.getByRole('button', { name: 'Змінити виплату: Щомісячно' }));
    expect(screen.getByLabelText('Скільки місяців')).toHaveValue('8');
  });

  it('порожньої «Іншої доплати» не стоїть двох, а дописана — додаткова, поза сумою', () => {
    const onSave = jest.fn();
    const { unmount } = render(<ProgramsEditor programs={program} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    expect(screen.queryByRole('button', { name: '+ Інша виплата' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Інша доплата' }));
    expect(screen.queryByRole('button', { name: '+ Інша доплата' })).not.toBeInTheDocument();
    const block = screen.getByTestId('bonus-block');
    fireEvent.change(within(block).getByLabelText('За що доплата'), { target: { value: 'За кількість клітин' } });
    fireEvent.change(within(block).getByLabelText('Сума'), { target: { value: '500' } });
    fireEvent.blur(within(block).getByLabelText('Сума'));
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('2 500 $');
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('З додатковими виплатами — до 3 000 $');
    expect(screen.getByRole('button', { name: '+ Інша доплата' })).toBeInTheDocument();
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.otherPayments).toEqual([{ label: 'За кількість клітин', amount: 500, currency: 'USD' }]);
  });

  it('підказує назви доплат пігулками й лише свого типу програми', () => {
    const suggestions = { bonus: ['Повторна пункція', 'Двійня', 'Додаткові щомісячні у разі двійні', 'За досвід', 'За кількість клітин'], payment: [] };
    render(<ProgramsEditor programs={program} suggestions={suggestions} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Інша доплата' }));
    const block = screen.getByTestId('bonus-block');
    const chips = within(screen.getByTestId('bonus-term-suggestions')).getAllByRole('button').map(node => node.title);
    expect(chips).toEqual(['Повторна пункція', 'За досвід', 'За кількість клітин']);
    const label = within(block).getByLabelText('За що доплата');
    expect(label).toHaveAttribute('rows', '1');
    fireEvent.change(label, { target: { value: 'досв' } });
    fireEvent.click(within(block).getByRole('button', { name: 'За досвід' }));
    expect(label).toHaveValue('За досвід');
    expect(screen.queryByTestId('bonus-term-suggestions')).not.toBeInTheDocument();
  });

  it('вжиту назву й обрізки з автозбереження не підказує, а прибрана доплата повертає назву', () => {
    const suggestions = { bonus: ['За стаж к', 'За стаж кожен рік', 'За вік', 'За вік і досвід', 'Тестова'], payment: [] };
    render(<ProgramsEditor programs={program} suggestions={suggestions} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Інша доплата' }));
    const chipTitles = () => within(screen.getByTestId('bonus-term-suggestions')).getAllByRole('button').map(node => node.title);
    expect(chipTitles()).toEqual(['За стаж кожен рік', 'За вік', 'За вік і досвід', 'Тестова']);
    fireEvent.click(within(screen.getByTestId('bonus-term-suggestions')).getByRole('button', { name: 'Тестова' }));
    fireEvent.change(within(screen.getByTestId('bonus-block')).getByLabelText('Сума'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Готово: Тестова' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Інша доплата' }));
    expect(chipTitles()).not.toContain('Тестова');
  });

  it('доплату без суми називає проблемою, а не мовчки губить', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Інша доплата' }));
    fireEvent.change(screen.getByLabelText('За що доплата'), { target: { value: 'За вік' } });
    expect(screen.getByText('Є що виправити')).toBeInTheDocument();
    expect(screen.getByLabelText('Що виправити')).toHaveTextContent('Доплата без суми не збережеться');
  });

  it('назви програми й одягу донорці не пропонує', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    expect(screen.queryByLabelText(/Назва програми/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Додатково/ }));
    expect(screen.queryByRole('button', { name: 'Одяг' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Проїзд' })).toBeInTheDocument();
  });

  it('«Опублікована» — лише коли анкету агенції опубліковано', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" profilePublished={false} />);
    expect(screen.getByTestId('program-status')).toHaveTextContent('Не опублікована');
  });

  it('стан програми один: прихована не каже ще й «не опублікована»', () => {
    render(<ProgramsEditor programs={{ p1: { ...program.p1, hidden: true } }} onSave={jest.fn()} language="uk" profilePublished={false} />);
    expect(screen.getAllByTestId('program-status')).toHaveLength(1);
    expect(screen.getByTestId('program-status')).toHaveTextContent('Прихована');
  });

  it('успішний запис не підписує «Збережено» — лише відмову', async () => {
    const { act } = require('@testing-library/react');
    jest.useFakeTimers();
    const onSave = jest.fn(() => Promise.resolve(true));
    render(<ProgramsEditor programs={program} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.change(screen.getByDisplayValue('Київ'), { target: { value: 'Львів' } });
    await act(async () => { jest.runOnlyPendingTimers(); });
    jest.useRealTimers();
    expect(onSave).toHaveBeenCalled();
    expect(screen.queryByText('Збережено')).not.toBeInTheDocument();
  });

  it('вкладки «Редагування» й «Перегляд» тримають кожна свою прокрутку', () => {
    const scrollTo = jest.fn();
    window.scrollTo = scrollTo;
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    window.scrollY = 640;
    fireEvent.click(screen.getByRole('tab', { name: 'Перегляд' }));
    window.scrollY = 120;
    fireEvent.click(screen.getByRole('tab', { name: 'Редагування' }));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });

  it('перемкнута на СМ програма пропонує щомісячну, як і заведена для СМ', () => {
    render(<ProgramsEditor programs={{ p3: { id: 'p3', type: 'ed', payments: {} } }} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    expect(screen.queryByTestId('payment-monthly')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Шукаємо сурогатну маму' }));
    expect(screen.getByTestId('payment-monthly')).toBeInTheDocument();
  });

  it('під відміченим покриттям — один чіп «Як саме», а не по чіпу на пункт', () => {
    const programs = { p4: { id: 'p4', type: 'sm', coverage: ['travel', 'housing', 'exams'], payments: { final: { amount: 20000, currency: 'USD' } } } };
    render(<ProgramsEditor programs={programs} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо сурогатну маму/ }));
    fireEvent.click(screen.getByRole('button', { name: /Додатково/ }));
    expect(screen.queryByRole('button', { name: /Як саме: житло/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Як саме покриваєте' }));
    fireEvent.click(screen.getByRole('button', { name: 'Уточнити: Житло' }));
    expect(screen.getByLabelText('Як покриваєте: Житло')).toBeInTheDocument();
    // «Переїзд із сімʼєю» питає лише блок переїзду.
    expect(screen.queryByRole('button', { name: 'Переїзд із сімʼєю' })).not.toBeInTheDocument();
  });

  it('подробиці покриття згортає «OK», підказка — про сам пункт, переїзд — чіп серед покриття', () => {
    const onSave = jest.fn();
    const programs = { p5: { id: 'p5', type: 'sm', coverage: ['housing'], payments: { final: { amount: 20000, currency: 'USD' } } } };
    render(<ProgramsEditor programs={programs} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо сурогатну маму/ }));
    fireEvent.click(screen.getByRole('button', { name: /Додатково/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Як саме покриваєте' }));
    fireEvent.click(screen.getByRole('button', { name: 'Уточнити: Житло' }));
    expect(screen.queryByPlaceholderText('Наприклад: крім таксі')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Наприклад: окрема квартира з 12 тижня'), { target: { value: 'двокімнатна' } });
    fireEvent.click(screen.getByRole('button', { name: 'Готово: Житло' }));
    expect(screen.queryByLabelText('Як покриваєте: Житло')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Змінити: Житло' })).toHaveTextContent('двокімнатна');

    expect(screen.queryByRole('button', { name: '+ Переїзд' })).not.toBeInTheDocument();
    const relocation = screen.getByRole('button', { name: 'Переїзд' });
    expect(relocation).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(relocation);
    expect(screen.getByLabelText('Коли переїзд')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Готово: Переїзд' }));
    expect(screen.queryByLabelText('Коли переїзд')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '✓ Переїзд' }));
    expect(screen.getByRole('button', { name: 'Переїзд' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('вибір пункту для уточнення підписаний і має вихід', () => {
    const programs = { p6: { id: 'p6', type: 'sm', coverage: ['travel', 'housing'], payments: { final: { amount: 20000, currency: 'USD' } } } };
    render(<ProgramsEditor programs={programs} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо сурогатну маму/ }));
    fireEvent.click(screen.getByRole('button', { name: /Додатково/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Як саме покриваєте' }));
    expect(screen.getByText('Уточніть, як саме покриваєте:')).toBeInTheDocument();
    // Чіпи вибору не повторюють «+ Житло» поруч із відміченим «✓ Житло».
    expect(screen.queryByRole('button', { name: '+ Житло' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Не уточнювати' }));
    expect(screen.queryByRole('button', { name: 'Уточнити: Житло' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Як саме покриваєте' })).toBeInTheDocument();
  });

  it('видалення програми питає словами й не видаляє з першого дотику', () => {
    const onSave = jest.fn();
    const programs = { p7: { id: 'p7', type: 'ed', location: 'Київ', payments: { final: { amount: 1500, currency: 'USD' } } } };
    render(<ProgramsEditor programs={programs} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: 'Дії програми' }));
    fireEvent.click(screen.getByRole('button', { name: 'Видалити програму' }));
    expect(screen.getByText('Видалити програму? Відновити її не вийде.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Не видаляти' }));
    expect(screen.queryByText('Видалити програму? Відновити її не вийде.')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('program-editor')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Дії програми' }));
    fireEvent.click(screen.getByRole('button', { name: 'Видалити програму' }));
    fireEvent.click(screen.getByRole('button', { name: 'Так, видалити' }));
    expect(screen.queryAllByTestId('program-editor')).toHaveLength(0);
  });

  it('відкриту програму згортає кнопка внизу форми', () => {
    const programs = { p8: { id: 'p8', type: 'ed', location: 'Київ', payments: { final: { amount: 1500, currency: 'USD' } } } };
    render(<ProgramsEditor programs={programs} onSave={jest.fn()} language="uk" />);
    const head = screen.getByRole('button', { name: /Шукаємо донора ооцитів/ });
    fireEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Готово — згорнути програму' }));
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Готово — згорнути програму' })).not.toBeInTheDocument();
  });

  it('додана вимога одразу бере фокус', () => {
    const programs = { p9: { id: 'p9', type: 'ed', location: 'Київ', payments: { final: { amount: 1500, currency: 'USD' } } } };
    render(<ProgramsEditor programs={programs} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: /Вимоги/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Своя вимога' }));
    expect(screen.getByPlaceholderText('Наприклад: без татуювань')).toHaveFocus();
  });

  it('під заведеною програмою кнопка каже «Додати ще одну програму»', () => {
    const { unmount } = render(<ProgramsEditor programs={{}} onSave={jest.fn()} language="uk" />);
    expect(screen.getByRole('button', { name: '+ Додати програму' })).toBeInTheDocument();
    unmount();
    render(<ProgramsEditor programs={{ p6: { id: 'p6', type: 'ed', payments: {} } }} onSave={jest.fn()} language="uk" />);
    expect(screen.getByRole('button', { name: '+ Додати ще одну програму' })).toBeInTheDocument();
  });

  it('групу крові відмічають чіпами, «звідки не беруть» — текстом із впізнаними областями', () => {
    const onSave = jest.fn();
    const { unmount } = render(<ProgramsEditor programs={program} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: /Вимоги до кандидатки/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Група крові' }));
    expect(screen.getByText('Нічого не відмічено — підходить будь-яка')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'III' }));
    fireEvent.click(screen.getByRole('button', { name: 'II' }));
    fireEvent.click(screen.getByRole('button', { name: '+ АМГ' }));
    fireEvent.change(screen.getByLabelText('АМГ, не менше'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Звідки не беруть' }));
    fireEvent.change(screen.getByLabelText('Звідки не беруть'), { target: { value: 'Дніпро, Суми, Харків' } });
    expect(screen.getByText('Відсіємо анкети з областей: Дніпропетровська, Сумська, Харківська')).toBeInTheDocument();
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.requirements).toMatchObject({ bloodGroups: '2,3', amhFrom: 4, regionsExcluded: 'Дніпро, Суми, Харків' });
  });

  it('АМГ сурогатній мамі не пропонує', () => {
    render(<ProgramsEditor programs={{ p5: { id: 'p5', type: 'sm', payments: { final: { amount: 20000, currency: 'USD' } } } }} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо сурогатну маму/ }));
    fireEvent.click(screen.getByRole('button', { name: /Вимоги до кандидатки/ }));
    expect(screen.queryByRole('button', { name: '+ АМГ' })).not.toBeInTheDocument();
  });

  it('довгий коментар не обрізає мовчки, а каже, що кінець не збережеться', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    const note = screen.getByLabelText(/Коментар організатора/);
    expect(note).not.toHaveAttribute('maxLength');
    fireEvent.change(note, { target: { value: 'x'.repeat(1100) } });
    expect(note).toHaveValue('x'.repeat(1100));
    expect(screen.getByText('1100 / 1000')).toBeInTheDocument();
    expect(screen.getByText('Коментар довший за 1000 знаків — кінець не збережеться')).toBeInTheDocument();
  });
});
