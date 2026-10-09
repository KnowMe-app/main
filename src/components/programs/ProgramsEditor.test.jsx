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
    expect(screen.getByText('Готова до показу')).toBeInTheDocument();
  });

  it('ховає другорядні команди в меню дій', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    expect(screen.queryByText('Створити копію')).not.toBeVisible();
    fireEvent.click(screen.getByLabelText('Дії програми'));
    expect(screen.getByText('Створити копію')).toBeVisible();
    expect(screen.getByText('Видалити програму')).toBeVisible();
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
    expect(screen.getByText('Чернетка — у стрічці не видно')).toBeInTheDocument();
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

  it('власну вимогу можна дописати з рівнем', () => {
    const onSave = jest.fn();
    const { unmount } = render(<ProgramsEditor programs={program} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: /Вимоги до кандидатки/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Своя вимога' }));
    expect(screen.queryByRole('button', { name: '+ Своя вимога' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Своя вимога 1'), { target: { value: 'Без татуювань' } });
    fireEvent.change(screen.getByLabelText('Рівень вимоги: Без татуювань'), { target: { value: 'preferred' } });
    expect(screen.getByRole('button', { name: '+ Своя вимога' })).toBeInTheDocument();
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.customRequirements).toEqual([{ text: 'Без татуювань', level: 'preferred' }]);
  });

  it('вимога має рівень і пояснення', () => {
    const onSave = jest.fn();
    const { unmount } = render(<ProgramsEditor programs={program} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: /Вимоги до кандидатки/ }));
    // Рівень стоїть словом поруч зі значенням, а не за «⋯».
    expect(screen.getByLabelText('Рівень вимоги: Вік')).toHaveDisplayValue('Обовʼязково');
    fireEvent.click(screen.getByRole('button', { name: '+ Кесарів розтин' }));
    fireEvent.change(screen.getByLabelText('Рівень вимоги: Кесарів розтин'), { target: { value: 'individual' } });
    fireEvent.click(screen.getAllByRole('button', { name: '+ Пояснення' })[1]);
    fireEvent.change(screen.getByLabelText('Пояснення: Кесарів розтин'), { target: { value: 'після 2 років' } });
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.requirementMeta).toEqual({ csection: { level: 'individual', note: 'після 2 років' } });
  });

  it('головне в картці вибирають з полів програми, і вибір зберігається', () => {
    const onSave = jest.fn();
    const { unmount } = render(<ProgramsEditor programs={{ p1: { ...program.p1, startNow: true } }} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Шукаємо донора ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: /Як виглядає в картці/ }));
    // Вимоги ознаками не пропонуються: згорнута картка показує їх усі сама.
    expect(screen.queryByRole('checkbox', { name: '21–29 років' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'старт одразу' })).toBeChecked();
    expect(screen.getByText('Вибрано 1 з 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'старт одразу' }));
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.startNow).toBe(true);
    expect(saved.highlights).toEqual(['none']);
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
    fireEvent.click(screen.getByRole('button', { name: /Покриття витрат/ }));
    expect(screen.queryByRole('button', { name: 'Одяг' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Проїзд' })).toBeInTheDocument();
  });

  it('«Готова до показу» — лише коли анкету агенції опубліковано', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" profilePublished={false} />);
    expect(screen.getByText('Готова — анкету ще не опубліковано')).toBeInTheDocument();
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
});
