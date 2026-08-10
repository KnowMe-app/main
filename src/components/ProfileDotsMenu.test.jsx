import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfileDotsMenu } from './ProfileDotsMenu';
import {
  clearStoredAccessRights,
  persistCanCreateProfiles,
  readStoredCanCreateProfiles,
  resolveAccess,
} from 'utils/accessLevel';

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

describe('ProfileDotsMenu logout confirmation', () => {
  beforeEach(() => localStorage.clear());

  it.each([
    ['false', { canCreateProfiles: false }],
    ['відсутнє поле', {}],
  ])('does not show profile creation when the profile permission is %s', (_case, profile) => {
    renderMenu({ access: resolveAccess({ uid: 'user-id', canCreateProfiles: profile.canCreateProfiles === true }) });

    expect(screen.queryByRole('menuitem', { name: /Додати профіль/ })).toBeNull();
  });

  it('shows profile creation from the persisted page access source and navigates to its route', () => {
    const navigate = jest.fn();
    persistCanCreateProfiles(true);
    const pageAccess = resolveAccess({
      uid: 'user-id',
      canCreateProfiles: readStoredCanCreateProfiles(),
    });
    renderMenu({ access: pageAccess, navigate });

    fireEvent.click(screen.getByRole('menuitem', { name: /Додати профіль/ }));

    expect(navigate).toHaveBeenCalledWith('/matching/create-profile');
  });

  it('does not retain profile creation access after logout clears stored rights', () => {
    persistCanCreateProfiles(true);
    clearStoredAccessRights();
    const pageAccess = resolveAccess({
      uid: 'user-id',
      canCreateProfiles: readStoredCanCreateProfiles(),
    });
    renderMenu({ access: pageAccess });

    expect(screen.queryByRole('menuitem', { name: /Додати профіль/ })).toBeNull();
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
