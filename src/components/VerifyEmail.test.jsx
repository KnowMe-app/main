import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('./config', () => ({ auth: {} }));
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
  sendEmailVerification: jest.fn(),
}));

const { VerifyEmail } = require('./VerifyEmail');
const { MenuItem } = require('./ProfileDotsMenu.styled');
const { applyUkrainianInterface } = require('../testUtils/interfaceLanguage');

applyUkrainianInterface();

describe('кнопка підтвердження пошти в меню', () => {
  // Чистимо саме відлік, а не весь `localStorage`: там же лежить і мова,
  // яку цій сюїті ставить `applyUkrainianInterface`.
  afterEach(() => {
    localStorage.removeItem('isCounting');
    localStorage.removeItem('countdown');
  });

  /*
   * Це єдиний рядок меню з чужого файлу, і поки він малював себе сам — суцільною
   * плашкою в окремій обгортці, — сусідський селектор `& + &` на `MenuItem` до
   * наступного рядка не досягав, тож «Вийти» ліплось просто під ним. Тому
   * перевірка саме на клас `MenuItem`: відступ між рядками меню тримає він.
   */
  it('є таким самим рядком меню, як сусідні, — інакше зникає відступ під ним', () => {
    render(<VerifyEmail />);
    const row = screen.getByRole('menuitem');
    expect(row.className).toContain(MenuItem.styledComponentId);
  });

  it('говорить мовою інтерфейсу, а не жорстко українською', () => {
    render(<VerifyEmail />);
    expect(screen.getByText('Підтвердити email')).toBeTruthy();
    expect(screen.getByText('Надіслати лист із підтвердженням на вашу пошту')).toBeTruthy();
  });

  it('поки лист щойно пішов — рядок не натискається й каже, скільки чекати', () => {
    localStorage.setItem('isCounting', 'true');
    localStorage.setItem('countdown', '95');
    render(<VerifyEmail />);

    expect(screen.getByRole('menuitem').disabled).toBe(true);
    expect(screen.getByText('Лист надіслано — повторити через 1:35 хв')).toBeTruthy();
  });
});
