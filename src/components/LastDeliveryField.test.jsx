import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LastDeliveryField from './LastDeliveryField';

// «Останні пологи» — текстове поле, яке не переписує набране під пальцем, а
// під собою каже, що розпізнало: перевірка очима, чи вірно вписано.
describe('останні пологи — текст із перевіркою', () => {
  const now = new Date(2026, 9, 23);
  const renderField = value => {
    const onCommit = jest.fn();
    render(<LastDeliveryField value={value} onCommit={onCommit} language="uk" now={now} />);
    return { onCommit, input: screen.getByTestId('last-delivery-input') };
  };
  const note = () => screen.getByTestId('last-delivery-note').textContent;

  it('набране не форматується на ходу', () => {
    const { input } = renderField('');
    fireEvent.change(input, { target: { value: '1.5.' } });
    expect(input.value).toBe('1.5.');
  });

  it('під полем — розпізнана дата й скільки минуло', () => {
    const { input } = renderField('');
    fireEvent.change(input, { target: { value: '1.5.2019' } });
    expect(note()).toBe('Розпізнано 01.05.2019: пологи 7 років тому. Вірно?');
    fireEvent.change(input, { target: { value: '04.2026' } });
    expect(note()).toBe('Розпізнано 04.2026: пологи 6 міс тому. Вірно?');
  });

  it('близьке майбутнє — очікувані пологи через N тижнів', () => {
    const { input } = renderField('');
    fireEvent.change(input, { target: { value: '15.01.2027' } });
    expect(note()).toBe('Розпізнано 15.01.2027: пологи очікуються через 12 тиж. Вірно?');
  });

  it('на blur пише розпізнане в тій точності, яку дала людина, і показує його в полі', () => {
    const { input, onCommit } = renderField('');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'травень 2019' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('2019-05');
    expect(input.value).toBe('05.2019');
  });

  it('нерозпізнане не пише, а пояснює', () => {
    const { input, onCommit } = renderField('');
    fireEvent.change(input, { target: { value: '12.05' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(note()).toBe('Додайте рік: наприклад, 12.05.2019.');
    expect(input.value).toBe('12.05');
  });

  it('записану з описки дату з 2027 року показує з поясненням', () => {
    renderField('2027-10-01');
    expect(note()).toBe('Ця дата ще надто далеко в майбутньому — перевірте рік.');
  });

  it('записане з бази показує людським форматом', () => {
    const { input } = renderField('2019-05-12');
    expect(input.value).toBe('12.05.2019');
    expect(note()).toBe('Розпізнано 12.05.2019: пологи 7 років тому. Вірно?');
  });

  it('незмінену дату вдруге не пише, стерту — пише порожньою', () => {
    const { input, onCommit } = renderField('12.05.2019');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('');
  });
});
