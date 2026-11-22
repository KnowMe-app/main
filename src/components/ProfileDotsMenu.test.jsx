import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfileDotsMenu } from './ProfileDotsMenu';
import { clearStoredAccessRights, resolveAccess } from 'utils/accessLevel';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

jest.mock('./VerifyEmail', () => ({ VerifyEmail: () => null }));

const renderMenu = props => render(
  <MemoryRouter>
    <ProfileDotsMenu
      navigate={jest.fn()}
      onExit={jest.fn()}
      onSelect={jest.fn()}
      {...props}
    />
  </MemoryRouter>,
);

// Ці перевірки описують український бік екрана — мову задаємо явно.
applyUkrainianInterface();

describe('ProfileDotsMenu logout confirmation', () => {
  beforeEach(() => {
    localStorage.clear();
    // Мова інтерфейсу лежить у тому ж сховищі, тож після очищення її ставимо
    // знову: сюїта описує український бік меню.
    localStorage.setItem('appLanguage', 'uk');
  });

  it('shows profile creation to every signed-in reader and navigates to its route', () => {
    // Заводити й доповнювати картки може кожен, хто увійшов.
    const navigate = jest.fn();
    renderMenu({ access: resolveAccess({ uid: 'user-id' }), navigate });

    fireEvent.click(screen.getByRole('menuitem', { name: /Створені мною/ }));

    expect(navigate).toHaveBeenCalledWith('/matching/create-profile');
  });

  it('прибирає з пристрою і старі позначки прав на виході', () => {
    // Права `accessLevel` і `canCreateProfiles` прибрано (22.11), але
    // позначки від старої збірки ще лежать у сховищі — вихід їх стирає.
    localStorage.setItem('accessLevel', 'matching:view');
    localStorage.setItem('canCreateProfiles', 'true');
    clearStoredAccessRights();

    expect(localStorage.getItem('accessLevel')).toBeNull();
    expect(localStorage.getItem('canCreateProfiles')).toBeNull();
  });

  it('does not end the session until logout is confirmed', async () => {
    const onExit = jest.fn().mockResolvedValue(undefined);
    const onSelect = jest.fn();
    renderMenu({ onExit, onSelect });

    fireEvent.click(screen.getByRole('menuitem', { name: /Вийти/ }));

    expect(screen.getByRole('dialog', { name: 'Вийти з акаунта?' })).not.toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ні, залишитися' }));

    expect(screen.queryByRole('dialog', { name: 'Вийти з акаунта?' })).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('menuitem', { name: /Вийти/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Так, вийти' }));

    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('closes the confirmation with Escape', () => {
    renderMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: /Вийти/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Вийти з акаунта?' })).toBeNull();
  });
});

/*
 * «Переглянути анкету» вело в інструкцію «встановіть застосунок у Google
 * Play», а мобільного застосунку більше немає — про це каже й сама заставка,
 * яку агенція KnowMe поставила собі замість фото. Пункт, за яким нічого немає,
 * гірший за відсутній: він обіцяє дію.
 */
describe('ProfileDotsMenu: секція «Анкета»', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('appLanguage', 'uk');
  });

  it('не пропонує переглянути анкету у застосунку', () => {
    renderMenu({ onDeleteProfile: jest.fn() });

    expect(screen.queryByRole('menuitem', { name: /Переглянути анкету/ })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /Видалити анкету/ })).toBeTruthy();
  });

  it('без «Видалити анкету» не малює й самої секції', () => {
    renderMenu();

    expect(screen.queryByText('Анкета')).toBeNull();
  });
});

// Меню з рядка спільної навігації не повторює її вкладок.
it('omits the primary navigation destinations when asked', () => {
  renderMenu({ isAdmin: true, access: {}, omitPrimaryDestinations: true });
  expect(screen.queryByText('Matching')).toBeNull();
  expect(screen.queryByText('Мій профіль')).toBeNull();
  expect(screen.queryByText('Нові профілі')).toBeNull();
  expect(screen.getByText('Flow')).toBeTruthy();
});

// Видані адміном екрани (Flow, комуналка) — особлива інструкція: людина з
// ними бачить у меню лише їх, без стрічки й «Мого профілю» (17.11).
describe('ProfileDotsMenu: видані адміном екрани', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('appLanguage', 'uk');
  });

  it('людині з виданими екранами показує лише їх', () => {
    renderMenu({ access: resolveAccess({ uid: 'user-id', screenAccess: 'flow,utilities' }) });
    const items = screen.getAllByRole('menuitem').map(item => item.textContent);
    expect(items.some(text => text.includes('Комуналка'))).toBe(true);
    expect(items.some(text => text.includes('Flow'))).toBe(true);
    expect(screen.queryByRole('menuitem', { name: /Мій профіль/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Matching/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Створені мною/ })).toBeNull();
  });

  it('без виданих екранів — звичайний набір, без комуналки', () => {
    renderMenu({ access: resolveAccess({ uid: 'user-id', screenAccess: '' }) });
    expect(screen.getByRole('menuitem', { name: /Мій профіль/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Комуналка/ })).toBeNull();
  });
});
