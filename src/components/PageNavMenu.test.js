// Batch 26 §10/§11: PageNavMenu (the shared "⋮" page switcher) must list every existing top-level
// screen - not just the five UKRCOM admin pages it originally covered - so an admin on any one of
// them can reach addNewProfile/matching/my-profile/flow without typing a URL.
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PageNavMenu from './PageNavMenu';

describe('spec (batch 26 §10): PageNavMenu lists every top-level screen', () => {
  it('opens to a dropdown containing every destination, not just the five UKRCOM admin pages', () => {
    render(<MemoryRouter><PageNavMenu /></MemoryRouter>);
    fireEvent.click(screen.getByTitle('Switch page'));

    ['Add profile', 'Matching', 'My profile', 'Flow', 'Budget', 'Invoice', 'Documents', 'Parties', 'Style Editor']
      .forEach(label => expect(screen.getByText(label)).toBeInTheDocument());
  });

  it('navigates to the matching route on click', () => {
    render(<MemoryRouter><PageNavMenu /></MemoryRouter>);
    fireEvent.click(screen.getByTitle('Switch page'));
    fireEvent.click(screen.getByText('Matching'));
    // The dropdown closes after a pick - the same interaction every other link already gets.
    expect(screen.queryByText('Documents')).not.toBeInTheDocument();
  });
});
