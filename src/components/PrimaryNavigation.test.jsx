import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrimaryNavigation from './PrimaryNavigation';

jest.mock('../hooks/useAppSettings', () => ({
  useAppSettings: () => ({ language: 'uk' }),
}));

it('marks only the card workspace active on its nested matching route', () => {
  render(<MemoryRouter initialEntries={['/matching/create-profile?cardId=test']}><PrimaryNavigation /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Мої картки' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Мій профіль' }).getAttribute('href')).toBe('/my-profile');
});
