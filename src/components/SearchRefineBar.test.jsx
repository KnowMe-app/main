import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchRefineBar from './SearchRefineBar';

const birthForAge = age => `01.01.${new Date().getFullYear() - age}`;

const users = [
  { userId: '1', birth: birthForAge(24), city: 'Київ' },
  { userId: '2', birth: birthForAge(32), city: 'Київ' },
  { userId: '3', birth: birthForAge(33), city: 'Львів' },
];

const setup = (props = {}) => {
  const onChangeKey = props.onChangeKey || jest.fn();
  const onSelectValue = props.onSelectValue || jest.fn();
  const utils = render(
    <SearchRefineBar
      users={props.users || users}
      activeKey={props.activeKey || 'age'}
      activeValue={props.activeValue ?? null}
      shownCount={props.shownCount}
      onChangeKey={onChangeKey}
      onSelectValue={onSelectValue}
      keysAvailableInFeedOnly={props.keysAvailableInFeedOnly || false}
      scanNote={props.scanNote || ''}
    />
  );
  return { ...utils, onChangeKey, onSelectValue };
};

describe('рядок дофільтрації', () => {
  it('показує значення з числами — тап наосліп не має сенсу', () => {
    setup();
    expect(screen.getByTitle('Вік: 31–33 — 2')).toBeInTheDocument();
    expect(screen.getByTitle('Вік: ≤25 — 1')).toBeInTheDocument();
  });

  it('нульове значення гасне, а не зникає', () => {
    // Чіп, що пропадає під пальцем, смикає ряд саме тоді, коли в нього цілять.
    setup();
    expect(screen.getByTitle('Вік: 26–30 — 0')).toBeDisabled();
    expect(screen.getByTitle('Вік: ≤25 — 1')).not.toBeDisabled();
  });

  it('тап по значенню віддає його сторінці', () => {
    const { onSelectValue } = setup();
    fireEvent.click(screen.getByTitle('Вік: 31–33 — 2'));
    expect(onSelectValue).toHaveBeenCalledWith('31_33');
  });

  it('після вибору ряд стає твердженням, а не лишається меню', () => {
    setup({ activeValue: '31_33', shownCount: 1 });

    expect(screen.getByText('Вік · 31–33')).toBeInTheDocument();
    expect(screen.getByText('показано 1 з 2')).toBeInTheDocument();
    // Меню значень на екрані більше немає — місце під картки потрібніше.
    expect(screen.queryByTitle('Вік: ≤25 — 1')).not.toBeInTheDocument();
  });

  it('коли показано вже все, рядок каже розмір видачі, а не «1 з 1»', () => {
    setup({ activeValue: '31_33', shownCount: 2 });
    expect(screen.getByText('2 у видачі')).toBeInTheDocument();
  });

  it('обране значення знімається одним тапом', () => {
    const { onSelectValue } = setup({ activeValue: '31_33' });
    fireEvent.click(screen.getByLabelText('Зняти уточнення Вік: 31–33'));
    expect(onSelectValue).toHaveBeenCalledWith(null);
  });

  it('ключ обирається зі списку, і другий ключ поруч не зʼявляється', () => {
    const { onChangeKey } = setup();
    fireEvent.click(screen.getByTitle('Обрати ключ уточнення'));

    fireEvent.click(screen.getByRole('radio', { name: /Місто/ }));
    expect(onChangeKey).toHaveBeenCalledWith('city');
    // Сторінка вирішує, що робити далі; рядок лише закриває список.
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('у стрічці ключ без індексу пропонується неактивним, а не ховається', () => {
    // Мовчки прибраний пункт читався б як «такого не буває»; неактивний з
    // підписом каже, чого саме бракує.
    setup({ keysAvailableInFeedOnly: true });
    fireEvent.click(screen.getByTitle('Обрати ключ уточнення'));

    expect(screen.getByRole('radio', { name: /Місто/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Група крові/ })).not.toBeDisabled();
  });

  it('підпис про джерело чисел показується там, де числа неповні', () => {
    setup({ scanNote: 'серед завантажених' });
    expect(screen.getByText('серед завантажених')).toBeInTheDocument();
  });
});
