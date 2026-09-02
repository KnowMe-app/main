import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import RtdbMigrationTool from './RtdbMigrationTool';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const pickFile = (label, content) => {
  // Кнопка лише клікає прихований input — файл кладеться саме в нього.
  const input = screen.getByLabelText(`Файл ${label}`);
  const file = new File([JSON.stringify(content)], label, { type: 'application/json' });
  fireEvent.change(input, { target: { files: [file] } });
};

describe('RtdbMigrationTool', () => {
  const id = 'a'.repeat(28);

  it('збирає вузли з обох колекцій і показує звіт', async () => {
    render(<RtdbMigrationTool />);

    // Поки джерел немає, збирати нічого.
    expect(screen.getByRole('button', { name: 'Зібрати вузли' })).toBeDisabled();

    pickFile('users.json', { [id]: { name: ['Ірина'], surname: 'Бриж', phone: '380671112233' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Зібрати вузли' })).not.toBeDisabled());

    pickFile('newUsers.json', { [id]: { name: ['IDClinic'], city: 'Київ' } });
    await screen.findByText(/завантажено: 1 записів/);

    fireEvent.click(screen.getByRole('button', { name: 'Зібрати вузли' }));

    // Звіт мусить назвати і скільки анкет, і скільки лягло в кожен вузол.
    expect(await screen.findByText(/Анкет усього: 1/)).toBeInTheDocument();
    expect(screen.getByText(/matchingCards: 1/)).toBeInTheDocument();
    expect(screen.getByText(/profileDetails: 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /matchingCards \(1\)/ })).toBeInTheDocument();
  });

  it('не мовчить про поле, де скаляри розійшлись', async () => {
    render(<RtdbMigrationTool />);

    pickFile('users.json', { [id]: { name: 'Ірина', city: 'Київ' } });
    pickFile('newUsers.json', { [id]: { name: 'Ірина', city: 'Львів' } });
    await screen.findAllByText(/завантажено/);

    fireEvent.click(screen.getByRole('button', { name: 'Зібрати вузли' }));

    expect(await screen.findByText(/Скалярні конфлікти: 1 анкет, поля: city/)).toBeInTheDocument();
  });
});
