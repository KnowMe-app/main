import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { NestedObjectField } from './NestedObjectField';

const programs = {
  p1: { type: 'ed', title: 'Київ', payments: { final: { amount: 2500, currency: 'USD' } }, hidden: false },
  p2: { type: 'sm', title: 'Грузія' },
};

const Harness = ({ initial, onCommit, onDeleteField }) => {
  const [value, setValue] = useState(initial);
  return <NestedObjectField label="programs" value={value} onChange={setValue} onCommit={onCommit} onDeleteField={onDeleteField} />;
};

const open = label => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label} `) }));

describe('поле-обʼєкт у формі адміна', () => {
  it('розкладає вкладеність блоками замість «[object Object]»', () => {
    render(<Harness initial={programs} onCommit={jest.fn()} onDeleteField={jest.fn()} />);
    expect(screen.queryByText(/object Object/)).not.toBeInTheDocument();
    open('programs');
    expect(screen.getByText('Київ · 4 полів')).toBeInTheDocument();
    open('p1');
    expect(screen.getByLabelText('title')).toHaveValue('Київ');
  });

  it('правка числа лишає число, а запис іде на blur', () => {
    const onCommit = jest.fn();
    render(<Harness initial={programs} onCommit={onCommit} onDeleteField={jest.fn()} />);
    open('programs');
    open('p1');
    open('payments');
    open('final');
    const amount = screen.getByLabelText('amount');
    fireEvent.change(amount, { target: { value: '2600' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(amount);
    expect(onCommit).toHaveBeenLastCalledWith(expect.objectContaining({
      p1: expect.objectContaining({ payments: { final: { amount: 2600, currency: 'USD' } } }),
    }));
  });

  it('лишає заміну числом після тимчасового очищення', () => {
    const onCommit = jest.fn();
    render(<Harness initial={programs} onCommit={onCommit} onDeleteField={jest.fn()} />);
    open('programs');
    open('p1');
    open('payments');
    open('final');
    const amount = screen.getByLabelText('amount');
    fireEvent.change(amount, { target: { value: '' } });
    fireEvent.change(amount, { target: { value: '2700' } });
    fireEvent.blur(amount);
    expect(onCommit.mock.calls.at(-1)[0].p1.payments.final.amount).toBe(2700);
  });

  it('знімає окремий блок, а останній — разом із полем', () => {
    const onCommit = jest.fn();
    const onDeleteField = jest.fn();
    render(<Harness initial={programs} onCommit={onCommit} onDeleteField={onDeleteField} />);
    open('programs');
    fireEvent.click(screen.getByRole('button', { name: 'Видалити блок p2' }));
    expect(onCommit).toHaveBeenLastCalledWith({ p1: programs.p1 });
    fireEvent.click(screen.getByRole('button', { name: 'Видалити блок p1' }));
    expect(onDeleteField).toHaveBeenCalledTimes(1);
  });
});
