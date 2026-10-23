import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SharedProfilePage } from './SharedProfilePage';
import { readSharedProfileCard } from './profileShareRemote';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

jest.mock('./profileShareRemote', () => ({
  readSharedProfileCard: jest.fn(),
}));

const TOKEN = 'shareTokenAAAAAAAAAAAAAA';

const renderAt = token => render(
  <MemoryRouter initialEntries={[`/p/${token}`]}>
    <Routes>
      <Route path="/p/:token" element={<SharedProfilePage />} />
    </Routes>
  </MemoryRouter>,
);

applyUkrainianInterface();

beforeAll(() => {
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

// Мета-теги лежать у `<head>`, поза деревом компонента: Testing Library їх не
// бачить, тож читаються вони напряму.
const readMeta = name => {
  // eslint-disable-next-line testing-library/no-node-access
  const tag = document.head.querySelector(`meta[name="${name}"]`);
  return tag ? tag.getAttribute('content') : null;
};

afterEach(() => {
  jest.clearAllMocks();
});

describe('анкета за посиланням', () => {
  it('показує картку знімка тією самою розкладкою, що й стрічка', async () => {
    readSharedProfileCard.mockResolvedValue({
      status: 'ok',
      card: { role: 'ed', name: 'Оксана', surname: 'М.', age: 27, ageAt: '2026-10-23', city: 'Київ', height: '168', weight: '57' },
    });
    renderAt(TOKEN);

    expect(await screen.findByTestId('shared-profile')).toBeTruthy();
    expect(screen.getByText(/Оксана/)).toBeTruthy();
    expect(readSharedProfileCard).toHaveBeenCalledWith(TOKEN);
  });

  it('не індексується й не віддає адресу сторінки сервісам фото', async () => {
    readSharedProfileCard.mockResolvedValue({ status: 'missing' });
    renderAt(TOKEN);
    await screen.findByTestId('shared-profile-missing');

    expect(readMeta('robots')).toContain('noindex');
    expect(readMeta('referrer')).toBe('no-referrer');
    // Імені людини в назві вкладки немає: історія браузера живе довше за посилання.
    expect(document.title).not.toMatch(/Оксана/);
  });

  it('відкликане чи прострочене посилання каже про це, а не показує порожню картку', async () => {
    readSharedProfileCard.mockResolvedValue({ status: 'missing' });
    renderAt(TOKEN);

    expect(await screen.findByText('Посилання недійсне')).toBeTruthy();
    expect(screen.queryByTestId('shared-profile')).toBeNull();
  });

  it('токен не тієї форми бази не питає зовсім', async () => {
    renderAt('abc');

    expect(await screen.findByTestId('shared-profile-missing')).toBeTruthy();
    expect(readSharedProfileCard).not.toHaveBeenCalled();
  });

  it('збій мережі — з кнопкою повтору', async () => {
    readSharedProfileCard
      .mockResolvedValueOnce({ status: 'error', error: new Error('offline') })
      .mockResolvedValueOnce({ status: 'ok', card: { role: 'sm', name: 'Ірина' } });
    renderAt(TOKEN);

    const retry = await screen.findByRole('button', { name: 'Спробувати ще раз' });
    fireEvent.click(retry);
    expect(await screen.findByTestId('shared-profile')).toBeTruthy();
    expect(readSharedProfileCard).toHaveBeenCalledTimes(2);
  });
});
