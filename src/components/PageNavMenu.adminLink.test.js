import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import PageNavMenu from './PageNavMenu';
import { ADMIN_UIDS } from 'utils/accessLevel';

const openMenu = () => {
  render(
    <MemoryRouter>
      <PageNavMenu />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Switch page' }));
};

describe('PageNavMenu: RTDB migration', () => {
  beforeEach(() => localStorage.clear());

  it('показує пункт адміну', () => {
    localStorage.setItem('ownerId', ADMIN_UIDS[0]);
    openMenu();

    expect(screen.getByRole('button', { name: 'RTDB migration' })).toBeInTheDocument();
  });

  it('ховає пункт від решти, лишаючи звичайні сторінки', () => {
    localStorage.setItem('ownerId', 'someone-else');
    openMenu();

    expect(screen.queryByRole('button', { name: 'RTDB migration' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Matching' })).toBeInTheDocument();
  });
});
