import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import LastDeliveryField, { composeLastDeliveryDate } from './LastDeliveryField';

// «Останні пологи» — місяць і рік зі списку. Текстове поле з маскою не
// приймало звичайного вводу: «1.5.2019» ставало «15.20.19», рік — «20.19», а
// майбутній рік ішов у базу мовчки. Із трьох СМ 23.10 правильної дати не
// лишила жодна.
describe('останні пологи — місяць і рік', () => {
  const now = new Date(2026, 9, 23);
  const renderField = value => {
    const onCommit = jest.fn();
    const view = render(<LastDeliveryField value={value} onCommit={onCommit} language="uk" now={now} />);
    return { onCommit, view };
  };
  const month = () => screen.getByTestId('last-delivery-month');
  const year = () => screen.getByTestId('last-delivery-year');

  it('записане показує вибраними місяцем і роком — і з бази, і з форми', () => {
    renderField('12.05.2019');
    expect(month().value).toBe('5');
    expect(year().value).toBe('2019');
    expect(screen.queryByTestId('last-delivery-issue')).toBeNull();
  });

  it('рік із двох цифр, який уже лежить в анкеті, читає як 20xx', () => {
    renderField('13.01.22');
    expect(month().value).toBe('1');
    expect(year().value).toBe('2022');
  });

  it('нову дату пише першим числом місяця й лише коли вибрано обидва', () => {
    const { onCommit } = renderField('');
    fireEvent.change(month(), { target: { value: '3' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(year(), { target: { value: '2021' } });
    expect(onCommit).toHaveBeenCalledWith('01.03.2021');
  });

  it('уточнюючи рік, день записаної дати не губить', () => {
    const { onCommit } = renderField('12.05.2019');
    fireEvent.change(year(), { target: { value: '2020' } });
    expect(onCommit).toHaveBeenCalledWith('12.05.2020');
  });

  it('майбутнього не пропонує: місяці після поточного в цьому році вимкнені', () => {
    renderField('');
    fireEvent.change(year(), { target: { value: '2026' } });
    const options = within(month()).getAllByRole('option').filter(option => option.value);
    expect(options.filter(option => option.disabled).map(option => option.value)).toEqual(['11', '12']);
    expect(within(year()).queryByRole('option', { name: '2027' })).toBeNull();
  });

  it('збережену майбутню дату називає й просить вибрати ще раз', () => {
    renderField('2027-10-01');
    expect(month().value).toBe('');
    expect(year().value).toBe('');
    expect(screen.getByTestId('last-delivery-issue').textContent)
      .toBe('Збережено 01.10.2027, а ця дата ще не настала. Оберіть місяць і рік ще раз.');
  });

  it('те, що лишила стара маска, називає не датою', () => {
    renderField('15.20.19');
    expect(screen.getByTestId('last-delivery-issue').textContent)
      .toBe('Збережено «15.20.19» — це не дата. Оберіть місяць і рік ще раз.');
  });

  it('хрестик стирає записане', () => {
    const { onCommit } = renderField('12.05.2019');
    fireEvent.click(screen.getByRole('button', { name: 'Очистити поле' }));
    expect(onCommit).toHaveBeenCalledWith('');
  });

  it('у поточному місяці день не виходить за сьогодні', () => {
    expect(composeLastDeliveryDate({ month: '10', year: '2026', day: '28' }, now)).toBe('23.10.2026');
    expect(composeLastDeliveryDate({ month: '2', year: '2023', day: '31' }, now)).toBe('28.02.2023');
  });
});
