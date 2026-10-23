import React from 'react';
import { render, screen } from '@testing-library/react';
import { CheckboxGroup } from './CheckboxGroup';

const options = [
  { val: 'ag', label: 'Агенція' },
  { val: 'ip', label: 'Біологічні батьки' },
  { val: 'other', label: 'Інші' },
];

// `null` — числа немає: опцію вимкнено, і дека її не вантажила. Нуль на її
// місці читався як «таких анкет немає».
describe('числа біля чіпів групи', () => {
  it('показує число й нуль, а вимкненій незавантаженій опції числа не ставить', () => {
    render(
      <CheckboxGroup
        label="Тип профілю"
        filterName="userRole"
        options={options}
        filters={{ userRole: { ag: true, ip: false, other: false } }}
        onChange={() => {}}
        optionCounts={{ ag: 14, ip: null }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Тип профілю: Агенція, 14' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Тип профілю: Біологічні батьки' }).textContent).toBe('Біологічні батьки');
    expect(screen.getByRole('button', { name: 'Тип профілю: Інші, 0' })).toBeTruthy();
  });
});
