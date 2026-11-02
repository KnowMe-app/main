import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockAuth = { currentUser: null };

jest.mock('./config', () => ({ auth: mockAuth }));
jest.mock('firebase/auth', () => ({
  applyActionCode: jest.fn(),
  checkActionCode: jest.fn(),
  confirmPasswordReset: jest.fn(),
  verifyPasswordResetCode: jest.fn(),
  onAuthStateChanged: jest.fn((auth, callback) => {
    callback(auth.currentUser);
    return () => {};
  }),
}));
jest.mock('../utils/emailVerification', () => ({
  requestVerificationEmail: jest.fn(() => Promise.resolve({ via: 'knowme', status: 'sent' })),
}));

const firebaseAuth = require('firebase/auth');
const { requestVerificationEmail } = require('../utils/emailVerification');
const { AuthActionPage, resetAuthActionResultsForTests } = require('./AuthActionPage');
const { applyUkrainianInterface } = require('../testUtils/interfaceLanguage');

applyUkrainianInterface();

const expiredError = () => Object.assign(new Error('expired'), { code: 'auth/invalid-action-code' });

const renderAt = url =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/action" element={<AuthActionPage />} />
        <Route path="/login" element={<p>login screen</p>} />
        <Route path="/my-profile" element={<p>my profile</p>} />
      </Routes>
    </MemoryRouter>,
  );

/*
 * Сторінка, куди веде кнопка з листа. Головне, що вона мусить робити
 * правильно: не казати «посилання не діє» поверх щойно підтвердженої пошти,
 * вести людину далі (в анкету чи на вхід) і не ламати «Забули пароль?», коли
 * в консолі Firebase посилання всіх листів переведено сюди.
 */
describe('AuthActionPage', () => {
  // CRA скидає реалізації моків перед кожним тестом (`resetMocks`), тож
  // відповідь Firebase про сесію ставимо тут, а не у фабриці.
  beforeEach(() => {
    resetAuthActionResultsForTests();
    mockAuth.currentUser = null;
    firebaseAuth.onAuthStateChanged.mockImplementation((auth, callback) => {
      callback(auth.currentUser);
      return () => {};
    });
    requestVerificationEmail.mockResolvedValue({ via: 'knowme', status: 'sent' });
  });

  it('підтверджує пошту й веде в анкету того, хто вже увійшов', async () => {
    const user = { email: 'oksana@example.com', emailVerified: false, reload: jest.fn(() => Promise.resolve()) };
    mockAuth.currentUser = user;
    firebaseAuth.checkActionCode.mockResolvedValue({ data: { email: 'oksana@example.com' } });
    firebaseAuth.applyActionCode.mockResolvedValue();

    renderAt('/auth/action?mode=verifyEmail&oobCode=abc&lang=uk');

    expect(await screen.findByText('Пошту підтверджено')).toBeTruthy();
    expect(screen.getByText(/oksana@example\.com/)).toBeTruthy();
    expect(firebaseAuth.applyActionCode).toHaveBeenCalledWith(mockAuth, 'abc');
    // Застосунок мусить побачити підтверджену пошту без нового входу.
    expect(user.reload).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Перейти до анкети' }));
    expect(await screen.findByText('my profile')).toBeTruthy();
  });

  it('без сесії після підтвердження пропонує увійти', async () => {
    firebaseAuth.checkActionCode.mockResolvedValue({ data: { email: 'a@example.com' } });
    firebaseAuth.applyActionCode.mockResolvedValue();

    renderAt('/auth/action?mode=verifyEmail&oobCode=abc');

    expect(await screen.findByText('Пошту підтверджено')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByText('login screen')).toBeTruthy();
  });

  it('використаний код поверх підтвердженої пошти — «вже підтверджено», а не помилка', async () => {
    mockAuth.currentUser = { email: 'a@example.com', emailVerified: true, reload: jest.fn(() => Promise.resolve()) };
    firebaseAuth.checkActionCode.mockRejectedValue(expiredError());

    renderAt('/auth/action?mode=verifyEmail&oobCode=used');

    expect(await screen.findByText('Пошту вже підтверджено')).toBeTruthy();
  });

  it('застаріле посилання: той, хто увійшов, шле новий лист звідси ж', async () => {
    mockAuth.currentUser = { email: 'a@example.com', emailVerified: false, reload: jest.fn(() => Promise.resolve()) };
    firebaseAuth.checkActionCode.mockRejectedValue(expiredError());

    renderAt('/auth/action?mode=verifyEmail&oobCode=old');

    expect(await screen.findByText('Посилання вже не діє')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Надіслати новий лист' }));

    expect(await screen.findByText('Перевірте пошту')).toBeTruthy();
    expect(requestVerificationEmail).toHaveBeenCalledWith(mockAuth.currentUser, expect.objectContaining({ auth: mockAuth }));
    expect(screen.getByText('Новий лист надіслано на a@example.com. Перевірте й «Спам».')).toBeTruthy();
  });

  it('застаріле посилання без сесії каже, де взяти новий лист', async () => {
    firebaseAuth.checkActionCode.mockRejectedValue(expiredError());

    renderAt('/auth/action?mode=verifyEmail&oobCode=old');

    expect(await screen.findByText('Посилання вже не діє')).toBeTruthy();
    expect(screen.getByText('Увійдіть в акаунт, і новий лист можна буде надіслати з меню ⋮ → «Підтвердити email».')).toBeTruthy();
  });

  it('збій мережі — не «посилання не діє», а повтор', async () => {
    firebaseAuth.checkActionCode
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'auth/network-request-failed' }))
      .mockResolvedValueOnce({ data: { email: 'a@example.com' } });
    firebaseAuth.applyActionCode.mockResolvedValue();

    renderAt('/auth/action?mode=verifyEmail&oobCode=abc');

    expect(await screen.findByText('Не вдалося перевірити посилання')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));
    expect(await screen.findByText('Пошту підтверджено')).toBeTruthy();
  });

  it('зміна пароля: форма, коротший за 6 символів не йде, новий — зберігається', async () => {
    firebaseAuth.verifyPasswordResetCode.mockResolvedValue('a@example.com');
    firebaseAuth.confirmPasswordReset.mockResolvedValue();

    renderAt('/auth/action?mode=resetPassword&oobCode=reset1');

    expect(await screen.findByText('Для акаунта a@example.com')).toBeTruthy();
    const input = screen.getByLabelText('Новий пароль');

    fireEvent.change(input, { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти пароль' }));
    expect(await screen.findByText('Пароль має містити щонайменше 6 символів')).toBeTruthy();
    expect(firebaseAuth.confirmPasswordReset).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'secret-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти пароль' }));
    expect(await screen.findByText('Пароль змінено')).toBeTruthy();
    expect(firebaseAuth.confirmPasswordReset).toHaveBeenCalledWith(mockAuth, 'reset1', 'secret-42');
  });

  it('застаріле посилання зміни пароля веде на «Забули пароль?»', async () => {
    firebaseAuth.verifyPasswordResetCode.mockRejectedValue(expiredError());

    renderAt('/auth/action?mode=resetPassword&oobCode=old');

    expect(await screen.findByText('Посилання для зміни пароля вже не діє')).toBeTruthy();
    expect(screen.getByText('Попросіть новий лист на екрані входу: «Забули пароль?».')).toBeTruthy();
  });

  it('посилання без коду — неповне, і нічого не надсилається до Firebase', async () => {
    renderAt('/auth/action?mode=verifyEmail');

    expect(await screen.findByText('Посилання неповне')).toBeTruthy();
    expect(firebaseAuth.applyActionCode).not.toHaveBeenCalled();
    expect(firebaseAuth.checkActionCode).not.toHaveBeenCalled();
  });

  it('код застосовується один раз, навіть коли ефект запускається двічі', async () => {
    firebaseAuth.checkActionCode.mockResolvedValue({ data: { email: 'a@example.com' } });
    firebaseAuth.applyActionCode.mockResolvedValue();

    renderAt('/auth/action?mode=verifyEmail&oobCode=once');
    expect(await screen.findByText('Пошту підтверджено')).toBeTruthy();
    renderAt('/auth/action?mode=verifyEmail&oobCode=once');

    await waitFor(() => expect(screen.getAllByText('Пошту підтверджено')).toHaveLength(2));
    expect(firebaseAuth.applyActionCode).toHaveBeenCalledTimes(1);
  });
});
