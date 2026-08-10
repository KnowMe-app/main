import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfileDotsMenu } from './ProfileDotsMenu';

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
  it('shows profile creation only with the dedicated permission', () => {
    const { rerender } = renderMenu({ access: { canAccessMatching: true } });
    expect(screen.queryByRole('menuitem', { name: /Додати профіль/ })).toBeNull();
    rerender(<MemoryRouter><ProfileDotsMenu navigate={jest.fn()} access={{ canCreateProfiles: true }} /></MemoryRouter>);
    expect(screen.getByRole('menuitem', { name: /Додати профіль/ })).not.toBeNull();
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
