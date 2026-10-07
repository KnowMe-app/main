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
    // Шапка називає пропозицію, а не роль людини: «Донорство ооцитів».
    expect(screen.getAllByText('Донорство ооцитів')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Донорство ооцитів/ })).toHaveTextContent('Київ · 2 500 $');
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
    fireEvent.click(screen.getByRole('button', { name: /Донорство ооцитів/ }));
    expect(screen.getByTestId('program-card')).toHaveTextContent('2 500 $');
    expect(screen.getByRole('tab', { name: 'Перегляд' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Редагування' })).toHaveAttribute('aria-selected', 'true');
  });

  it('можливу доплату не показує порожнім полем, а додає кнопкою', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Донорство ооцитів/ }));
    expect(screen.queryByLabelText('Доплата за досвід')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Додати доплату: Доплата за досвід' }));
    expect(screen.getByLabelText('Доплата за досвід')).toBeInTheDocument();
  });

  it('каже про вимогу поза межами одразу, а не губить її при записі', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Донорство ооцитів/ }));
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
    fireEvent.click(screen.getByRole('button', { name: /Сурогатне материнство/ }));
    expect(screen.queryByText('Загальна сума за програму')).not.toBeInTheDocument();
    // Без кількості місяців разом не обіцяється — лише орієнтовно в підказці.
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('—');
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('Вкажіть кількість місяців');
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
    fireEvent.click(screen.getByRole('button', { name: /Сурогатне материнство/ }));
    const months = screen.getByLabelText('Скільки місяців');
    fireEvent.change(months, { target: { value: '0' } });
    expect(months).toHaveValue('');
  });

  it('гарантований мінімум питає максимум і його умову, і зберігає обидва', () => {
    const onSave = jest.fn();
    const { unmount } = render(<ProgramsEditor programs={program} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Донорство ооцитів/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Гарантований мінімум/ }));
    fireEvent.change(screen.getByLabelText('Максимальна сума'), { target: { value: '3000' } });
    fireEvent.blur(screen.getByLabelText('Максимальна сума'));
    fireEvent.change(screen.getByLabelText('Від чого залежить максимум'), { target: { value: 'залежно від результату' } });
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.payKind).toBe('guaranteed');
    expect(saved.payMax).toEqual({ amount: 3000, currency: 'USD', condition: 'залежно від результату' });
  });

  it('у виплати графіка — коли, умова й вкладена сума; правка суми їх не губить', () => {
    const onSave = jest.fn();
    const surrogate = { p2: { id: 'p2', type: 'sm', payments: { final: { amount: 20000, currency: 'USD' }, monthly: { amount: 900, currency: 'USD', months: 9 } } } };
    const { unmount } = render(<ProgramsEditor programs={surrogate} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Сурогатне материнство/ }));
    // Подробиці головної виплати й щомісячної — дві кнопки; беремо другу.
    fireEvent.click(screen.getAllByRole('button', { name: '+ Деталі: коли, умови, у тому числі' })[1]);
    fireEvent.change(screen.getByLabelText(/У тому числі на/), { target: { value: 'одяг' } });
    fireEvent.change(screen.getByLabelText('Сума всередині виплати'), { target: { value: '400' } });
    fireEvent.blur(screen.getByLabelText('Сума всередині виплати'));
    fireEvent.change(screen.getByLabelText('Щомісячно'), { target: { value: '950' } });
    fireEvent.blur(screen.getByLabelText('Щомісячно'));
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p2;
    expect(saved.payments.monthly).toEqual({ amount: 950, currency: 'USD', months: 9, includes: { label: 'одяг', amount: 400, currency: 'USD' } });
  });

  it('вимога має рівень і пояснення', () => {
    const onSave = jest.fn();
    const { unmount } = render(<ProgramsEditor programs={program} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Донорство ооцитів/ }));
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
    const { unmount } = render(<ProgramsEditor programs={program} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Донорство ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: /Як виглядає в картці/ }));
    const age = screen.getByRole('checkbox', { name: '21–29 років' });
    expect(age).toBeChecked();
    expect(screen.getByText('Вибрано 1 з 4')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Старт одразу/));
    // Нова ознака стає типовою сама; агенція знімає вік — і це вже її вибір.
    expect(screen.getByRole('checkbox', { name: 'старт одразу' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: '21–29 років' }));
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.startNow).toBe(true);
    expect(saved.highlights).toEqual(['startNow']);
  });

  it('умову дописаної доплати видно й можна правити', () => {
    const onSave = jest.fn();
    const withBonus = { p1: { ...program.p1, bonuses: [{ label: 'Кесарів', amount: 500, currency: 'USD', condition: 'якщо кесаревим' }] } };
    const { unmount } = render(<ProgramsEditor programs={withBonus} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Донорство ооцитів/ }));
    const condition = screen.getByLabelText('Умова доплати');
    expect(condition).toHaveValue('якщо кесаревим');
    fireEvent.change(condition, { target: { value: '' } });
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.bonuses[0].condition).toBeUndefined();
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
    fireEvent.click(screen.getByRole('button', { name: /Сурогатне материнство/ }));
    const payments = screen.getByRole('button', { name: /Виплати/ });
    expect(payments).toHaveAttribute('aria-expanded', 'true');
    // 23 000 + 600 × 8 + 300 = 28 100; двійня й КС — окремо, за умовою.
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('28 100 $');
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('23 000 $ + 600 $ × 8 + 300 $');
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('Доплати за умовою сюди не входять');
    fireEvent.click(payments);
    expect(payments).toHaveTextContent('3 виплати · 2 доплати за умовою · разом за планом 28 100 $');
    expect(screen.queryByTestId('program-editor-total')).not.toBeInTheDocument();
    fireEvent.click(payments);
    expect(screen.getByLabelText('Скільки місяців')).toHaveValue('8');
  });

  it('порожньої «Іншої виплати» не стоїть двох, і кожна каже, як рахується', () => {
    const onSave = jest.fn();
    const { unmount } = render(<ProgramsEditor programs={program} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Донорство ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Інша виплата' }));
    expect(screen.queryByRole('button', { name: '+ Інша виплата' })).not.toBeInTheDocument();
    const block = screen.getByTestId('payment-block');
    fireEvent.change(within(block).getByLabelText('Назва виплати'), { target: { value: 'Після обстеження' } });
    fireEvent.change(within(block).getByLabelText('Сума'), { target: { value: '500' } });
    fireEvent.blur(within(block).getByLabelText('Сума'));
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('3 000 $');
    fireEvent.change(within(block).getByLabelText('Як рахувати'), { target: { value: 'included' } });
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('Уже входять у головну суму: Після обстеження 500 $');
    expect(screen.getByRole('button', { name: '+ Інша виплата' })).toBeInTheDocument();
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.otherPayments).toEqual([{ label: 'Після обстеження', amount: 500, currency: 'USD', counting: 'included' }]);
  });

  it('виплату без суми називає проблемою, а не мовчки губить', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Донорство ооцитів/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Інша виплата' }));
    fireEvent.change(screen.getByLabelText('Назва виплати'), { target: { value: 'Перенос' } });
    expect(screen.getByText('Є що виправити')).toBeInTheDocument();
    expect(screen.getByLabelText('Що виправити')).toHaveTextContent('Виплата без суми не збережеться');
  });

  it('«Готова до показу» — лише коли анкету агенції опубліковано', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" profilePublished={false} />);
    expect(screen.getByText('Готова — анкету ще не опубліковано')).toBeInTheDocument();
  });

  it('агенція вибирає головну суму картки', () => {
    const onSave = jest.fn();
    const surrogate = { p2: { id: 'p2', type: 'sm', payments: { final: { amount: 23000, currency: 'USD' }, monthly: { amount: 600, currency: 'USD', months: 8 } } } };
    const { unmount } = render(<ProgramsEditor programs={surrogate} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Сурогатне материнство/ }));
    fireEvent.click(screen.getByRole('button', { name: /Як виглядає в картці/ }));
    expect(screen.getByRole('radio', { name: /27\s800\s\$/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /600\s\$\/міс/ }));
    expect(screen.getByTestId('program-card')).toHaveTextContent('600 $/міс');
    unmount();
    expect(onSave.mock.calls[onSave.mock.calls.length - 1][0].p2.featured).toBe('monthly');
  });

  it('вкладки «Редагування» й «Перегляд» тримають кожна свою прокрутку', () => {
    const scrollTo = jest.fn();
    window.scrollTo = scrollTo;
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Донорство ооцитів/ }));
    window.scrollY = 640;
    fireEvent.click(screen.getByRole('tab', { name: 'Перегляд' }));
    window.scrollY = 120;
    fireEvent.click(screen.getByRole('tab', { name: 'Редагування' }));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });
});
