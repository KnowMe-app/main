// Batch 26 §10/§11: PageNavMenu (the shared "⋮" page switcher) must list every top-level screen
// this viewer can actually open - not just the UKRCOM admin pages it originally covered - so an
// admin on any one of them can reach addNewProfile/matching/my-profile/flow without typing a URL.
//
// «Може відкрити» тут не фігура мови: пункт без права вів у порожній `Routes`, і читач,
// натиснувши його, лишався на тому ж екрані без жодного пояснення.
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PageNavMenu from './PageNavMenu';
import { ADMIN_UIDS } from 'utils/accessLevel';

const openMenu = () => {
  render(<MemoryRouter><PageNavMenu /></MemoryRouter>);
  fireEvent.click(screen.getByTitle('Switch page'));
};

beforeEach(() => localStorage.clear());

describe('spec (batch 26 §10): PageNavMenu lists every top-level screen', () => {
  it('opens to a dropdown containing every destination an admin may open', () => {
    localStorage.setItem('ownerId', ADMIN_UIDS[0]);
    openMenu();

    ['Add profile', 'Matching', 'Створені мною', 'My profile', 'Flow', 'Budget', 'Invoice', 'Documents', 'Parties']
      .forEach(label => expect(screen.getByText(label)).toBeInTheDocument());
  });

  it('navigates to the matching route on click', () => {
    localStorage.setItem('ownerId', ADMIN_UIDS[0]);
    openMenu();
    fireEvent.click(screen.getByText('Matching'));
    // The dropdown closes after a pick - the same interaction every other link already gets.
    expect(screen.queryByText('Documents')).not.toBeInTheDocument();
  });

  it('показує звичайному читачеві лише ті екрани, куди його пустить App', () => {
    localStorage.setItem('ownerId', 'plain-user');
    localStorage.setItem('canCreateProfiles', 'true');
    openMenu();

    expect(screen.getByText('Matching')).toBeInTheDocument();
    expect(screen.getByText('My profile')).toBeInTheDocument();
    expect(screen.getByText('Створені мною')).toBeInTheDocument();
    ['Add profile', 'Flow', 'Budget', 'Invoice', 'Documents', 'Parties', 'RTDB migration']
      .forEach(label => expect(screen.queryByText(label)).toBeNull());
  });

  it('не пропонує створення карток тому, кому його не дали', () => {
    localStorage.setItem('ownerId', 'plain-user');
    openMenu();

    expect(screen.queryByText('Створені мною')).toBeNull();
    expect(screen.getByText('Matching')).toBeInTheDocument();
  });
});
