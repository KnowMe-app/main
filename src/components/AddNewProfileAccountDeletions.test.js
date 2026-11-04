import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AccountDeletionQueue, describePurgeSteps } from './AddNewProfileAccountDeletions';
import { analyzeDeletedAccount, listPendingAccountDeletions, purgeDeletedAccount } from 'utils/accountDeletion';

jest.mock('./config', () => ({ auth: { app: {}, currentUser: { uid: 'admin' } } }));
jest.mock('utils/cardIndex', () => ({ removeCard: () => {} }));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: () => {}, error: () => {} } }));
jest.mock('utils/accountDeletion', () => {
  const actual = jest.requireActual('utils/accountDeletion');
  return {
    analyzeDeletedAccount: jest.fn(),
    groupPurgePlan: actual.groupPurgePlan,
    listPendingAccountDeletions: jest.fn(),
    purgeDeletedAccount: jest.fn(),
    summarizePurgeCounts: () => 12,
  };
});

const PLAN = {
  steps: [
    { step: 'searchId', count: 2, paths: ['searchId/380/phone', 'searchId/олена/name'], kept: { 'searchId/олена/name': 'AA1' } },
    { step: 'nodes', count: 2, paths: ['matchingCards/abcdefghijklmnopqrst1234', 'profileDetails/abcdefghijklmnopqrst1234'] },
  ],
  storage: [{ prefix: 'avatar/abcdefghijklmnopqrst1234/', files: 3 }],
  authExists: false,
  legacyDocs: [],
};

const ITEM = { uid: 'abcdefghijklmnopqrst1234', name: 'Оксана К.', role: 'ed', requestedAt: 1, authDeletedAt: 2, hasCard: true };

describe('AccountDeletionQueue', () => {
  beforeEach(() => {
    listPendingAccountDeletions.mockReset();
    purgeDeletedAccount.mockReset();
    analyzeDeletedAccount.mockReset();
  });

  it('мовчить, коли черга порожня', async () => {
    listPendingAccountDeletions.mockResolvedValue({ items: [], canPurge: true, error: '' });
    const { container } = render(<AccountDeletionQueue />);
    await waitFor(() => expect(listPendingAccountDeletions).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('горить, поки є запис; видалення — лише після аналізу й з другого дотику', async () => {
    listPendingAccountDeletions
      .mockResolvedValueOnce({ items: [ITEM], canPurge: true, error: '' })
      .mockResolvedValue({ items: [], canPurge: true, error: '' });
    analyzeDeletedAccount.mockResolvedValue({ plan: PLAN, failed: [], error: '' });
    purgeDeletedAccount.mockResolvedValue({ complete: true, failed: [], counts: { nodes: 12 }, error: '' });
    render(<AccountDeletionQueue />);
    expect((await screen.findByTestId('account-deletions')).textContent).toContain('Оксана К.');
    // До аналізу кнопки видалення немає зовсім.
    expect(screen.queryByTestId('account-deletion-purge')).toBeNull();

    fireEvent.click(screen.getByTestId('account-deletion-analyze'));
    const plan = await screen.findByTestId('account-deletion-plan');
    expect(analyzeDeletedAccount).toHaveBeenCalledWith(expect.objectContaining({ uid: ITEM.uid }));
    expect(plan.textContent).toContain('буде видалено 4 записів');
    expect(plan.textContent).toContain('searchId — пошуковий індекс');
    expect(plan.textContent).toContain('лишиться: AA1');
    expect(plan.textContent).toContain('3 файли');
    expect(screen.getAllByTestId('account-deletion-plan-collection')).toHaveLength(3);
    expect(purgeDeletedAccount).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('account-deletion-purge'));
    expect(purgeDeletedAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('account-deletion-purge'));
    await waitFor(() => expect(screen.queryByTestId('account-deletions')).toBeNull());
    expect(purgeDeletedAccount).toHaveBeenCalledWith(expect.objectContaining({ uid: ITEM.uid }));
  });

  it('інспектор аналізує, але кнопки видалення не має', async () => {
    listPendingAccountDeletions.mockResolvedValue({ items: [ITEM], canPurge: false, error: '' });
    analyzeDeletedAccount.mockResolvedValue({ plan: PLAN, failed: [], error: '' });
    render(<AccountDeletionQueue />);
    expect((await screen.findByTestId('account-deletions')).textContent).toContain('Видалення запускає повний адмін');
    fireEvent.click(screen.getByTestId('account-deletion-analyze'));
    await screen.findByTestId('account-deletion-plan');
    expect(screen.queryByTestId('account-deletion-purge')).toBeNull();
  });

  it('відмова читання черги — не порожнеча, а причина', async () => {
    listPendingAccountDeletions.mockResolvedValue({ items: [], canPurge: false, error: 'functions/not-found' });
    render(<AccountDeletionQueue />);
    expect((await screen.findByTestId('account-deletions-error')).textContent).toContain('functions/not-found');
  });

  it('кроки очищення називає словами', () => {
    expect(describePurgeSteps(['nodes', 'telegram', 'unknown'])).toBe('вузли анкети, привʼязка Telegram, unknown');
  });
});
