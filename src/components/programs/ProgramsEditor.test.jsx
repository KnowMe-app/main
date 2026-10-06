import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByRole('button', { name: 'Як побачать' })).toBeInTheDocument();
  });

  it('можливу доплату не показує порожнім полем, а додає кнопкою', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Донорство ооцитів/ }));
    expect(screen.queryByLabelText('Доплата за досвід')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Доплата за досвід' }));
    expect(screen.getByLabelText('Доплата за досвід')).toBeInTheDocument();
  });

  it('каже про вимогу поза межами одразу, а не губить її при записі', () => {
    render(<ProgramsEditor programs={program} onSave={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Донорство ооцитів/ }));
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
    expect(screen.getByTestId('program-editor-total')).toHaveTextContent('≈ 24 500 $ за 9 міс');
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
    fireEvent.click(screen.getByRole('button', { name: 'Гарантовано + до …' }));
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
    fireEvent.click(screen.getAllByRole('button', { name: '+ коли, умова, що входить' })[1]);
    fireEvent.change(screen.getByLabelText('На що саме'), { target: { value: 'одяг' } });
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
    fireEvent.change(screen.getByLabelText('Рівень вимоги: Кесарів розтин'), { target: { value: 'individual' } });
    fireEvent.change(screen.getByLabelText('Пояснення: Кесарів розтин'), { target: { value: 'після 2 років' } });
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.requirementMeta).toEqual({ csection: { level: 'individual', note: 'після 2 років' } });
  });

  it('головне в картці вибирають з полів програми, і вибір зберігається', () => {
    const onSave = jest.fn();
    const { unmount } = render(<ProgramsEditor programs={program} onSave={onSave} language="uk" />);
    fireEvent.click(screen.getByRole('button', { name: /Донорство ооцитів/ }));
    const age = screen.getByRole('checkbox', { name: '21–29 років' });
    expect(age).toBeChecked();
    fireEvent.click(screen.getByLabelText('Старт одразу — набір відкритий зараз'));
    // Нова ознака стає типовою сама; агенція знімає вік — і це вже її вибір.
    expect(screen.getByRole('checkbox', { name: 'старт одразу' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: '21–29 років' }));
    unmount();
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0].p1;
    expect(saved.startNow).toBe(true);
    expect(saved.highlights).toEqual(['startNow']);
  });
});
