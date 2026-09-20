import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';

// Блок «усі поля» показує те, що база тримає про картку. Отже, дві речі:
// службових позначок застосунку там бути не має (їх у базі немає), а коментарі
// — мають (вони в базі є, просто в інших вузлах).

const mockFetchUserComment = jest.fn();
const mockFetchPublicComments = jest.fn();

jest.mock('./config', () => ({
  auth: { currentUser: { uid: 'admin-uid' } },
  database: {},
  fetchUserComment: (...args) => mockFetchUserComment(...args),
  fetchPublicProfileCommentsStrict: (...args) => mockFetchPublicComments(...args),
}));

jest.mock('firebase/database', () => ({
  get: jest.fn(async () => ({ exists: () => false, val: () => null })),
  ref: jest.fn(() => ({})),
}));

jest.mock('./smallCard/actions', () => ({ removeField: jest.fn() }));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const { renderAllFields } = require('./ProfileForm');
const { dropCachedPublicComments } = require('../utils/publicCommentsMemory');

// Анкета в тій формі, в якій її віддає `fetchUserById` → `readProfileFromNodes`:
// поля з усіх вузлів плюс службові позначки самого застосунку.
const profile = {
  userId: 'ID0001',
  name: ['Оксана'],
  surname: 'Коваленко',
  phone: ['380501112233'],
  __photosHydrated: true,
  __matchingSummary: true,
  __limitedProfile: false,
};

const renderDump = (options = {}) => render(
  <div>{renderAllFields(profile, '', { userId: 'ID0001', ...options })}</div>,
);

beforeEach(() => {
  mockFetchUserComment.mockReset();
  mockFetchPublicComments.mockReset();
  dropCachedPublicComments();
});

describe('дамп «усі поля»', () => {
  it('не показує службових позначок застосунку', () => {
    mockFetchUserComment.mockResolvedValue(null);
    renderDump();

    expect(screen.getByText('surname')).toBeInTheDocument();
    expect(screen.queryByText('__photosHydrated')).not.toBeInTheDocument();
    expect(screen.queryByText('__matchingSummary')).not.toBeInTheDocument();
    expect(screen.queryByText('__limitedProfile')).not.toBeInTheDocument();
  });

  it('показує обидва сховища коментарів', async () => {
    mockFetchUserComment.mockResolvedValue({ text: 'Дзвонила 1 вересня' });
    mockFetchPublicComments.mockResolvedValue({
      ID0001: [{ id: 'c1', text: 'Відповідальна', authorName: 'Агенція' }],
    });

    const { container } = renderDump({ loadStoredComments: true });

    await waitFor(() => expect(container.textContent).toMatch('Дзвонила 1 вересня'));
    await waitFor(() => expect(container.textContent).toMatch('Відповідальна'));
    expect(container.textContent).toMatch('Агенція');
  });

  it('прочитана порожнеча — це не те саме, що непрочитане', async () => {
    mockFetchUserComment.mockResolvedValue(null);
    mockFetchPublicComments.mockResolvedValue({ ID0001: [] });

    const { container } = renderDump({ loadStoredComments: true });

    await waitFor(() => expect(container.textContent).not.toMatch(/читаємо/));
    expect(container.textContent).not.toMatch(/не прочитано/);
  });

  it('у списку блок нічого не читає: показує вже прочитане або каже, що не читали', async () => {
    renderDump();

    await waitFor(() => expect(screen.getAllByText('не прочитано')).toHaveLength(2));
    expect(mockFetchUserComment).not.toHaveBeenCalled();
    expect(mockFetchPublicComments).not.toHaveBeenCalled();
  });
});
