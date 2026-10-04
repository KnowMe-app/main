import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrimaryNavigation from './PrimaryNavigation';
import { PrimaryNavigationSlotProvider, usePrimaryNavigationSlot } from './PrimaryNavigationSlot';

jest.mock('../hooks/useAppSettings', () => ({
  useAppSettings: () => ({ language: 'uk' }),
}));

it('marks only the card workspace active on its nested matching route', () => {
  render(<MemoryRouter initialEntries={['/matching/create-profile?cardId=test']}><PrimaryNavigation /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Додати картку' }).getAttribute('aria-current')).toBe('page');
  expect(screen.queryByRole('link', { name: 'Пошук анкет', current: 'page' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Мій профіль' }).getAttribute('href')).toBe('/my-profile');
});

// Стрілка, меню й підпис вкладки — те, що зареєструвала сторінка
// (`usePrimaryNavigationSlot`); місце під стрілку стоїть порожнім, коли
// повертатись нікуди.
describe('рядок навігації зі слотом сторінки', () => {
  const Page = ({ onBack, workspaceLabel }) => {
    usePrimaryNavigationSlot({
      onBack,
      workspaceLabel,
      renderMenu: ({ close }) => <button type="button" onClick={close}>Пункт меню</button>,
    });
    return null;
  };

  const renderWith = props => render(
    <MemoryRouter initialEntries={['/matching/create-profile']}>
      <PrimaryNavigationSlotProvider>
        <PrimaryNavigation />
        <Page {...props} />
      </PrimaryNavigationSlotProvider>
    </MemoryRouter>
  );

  it('малює стрілку лише коли сторінці є куди повертатись', () => {
    const onBack = jest.fn();
    const { unmount } = renderWith({});
    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull();
    unmount();
    renderWith({ onBack });
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('над доповненням називає вкладку карток «Доповнення»', () => {
    renderWith({ workspaceLabel: 'overlay' });
    expect(screen.getByRole('link', { name: 'Доповнення' }).getAttribute('href')).toBe('/matching/create-profile');
    expect(screen.queryByRole('link', { name: 'Додати картку' })).toBeNull();
  });

  it('відкриває меню сторінки праворуч від «Мій профіль» і закриває його хрестиком', () => {
    renderWith({});
    fireEvent.click(screen.getByRole('button', { name: 'Відкрити меню' }));
    expect(screen.getByText('Пункт меню')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Закрити меню' }));
    expect(screen.queryByText('Пункт меню')).toBeNull();
  });
});
