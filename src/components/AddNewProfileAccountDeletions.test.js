import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AccountDeletionQueue, describePurgeSteps } from './AddNewProfileAccountDeletions';
import { listPendingAccountDeletions, purgeDeletedAccount } from 'utils/accountDeletion';

jest.mock('./config', () => ({ auth: { app: {}, currentUser: { uid: 'admin' } } }));
jest.mock('utils/cardIndex', () => ({ removeCard: () => {} }));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: () => {}, error: () => {} } }));
jest.mock('utils/accountDeletion', () => ({
  listPendingAccountDeletions: jest.fn(),
  purgeDeletedAccount: jest.fn(),
  summarizePurgeCounts: () => 12,
}));

const ITEM = { uid: 'abcdefghijklmnopqrst1234', name: 'Оксана К.', role: 'ed', requestedAt: 1, authDeletedAt: 2, hasCard: true };

describe('AccountDeletionQueue', () => {
  beforeEach(() => {
    listPendingAccountDeletions.mockReset();
    purgeDeletedAccount.mockReset();
  });

  it('мовчить, коли черга порожня', async () => {
    listPendingAccountDeletions.mockResolvedValue({ items: [], canPurge: true, error: '' });
    const { container } = render(<AccountDeletionQueue />);
    await waitFor(() => expect(listPendingAccountDeletions).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('горить, поки є запис, і очищає лише з другого дотику', async () => {
    listPendingAccountDeletions
      .mockResolvedValueOnce({ items: [ITEM], canPurge: true, error: '' })
      .mockResolvedValue({ items: [], canPurge: true, error: '' });
    purgeDeletedAccount.mockResolvedValue({ complete: true, failed: [], counts: { nodes: 12 }, error: '' });
    render(<AccountDeletionQueue />);
    expect((await screen.findByTestId('account-deletions')).textContent).toContain('Оксана К.');

    fireEvent.click(screen.getByTestId('account-deletion-purge'));
    expect(purgeDeletedAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('account-deletion-purge'));
    await waitFor(() => expect(screen.queryByTestId('account-deletions')).toBeNull());
    expect(purgeDeletedAccount).toHaveBeenCalledWith(expect.objectContaining({ uid: ITEM.uid }));
  });

  it('інспектор бачить чергу, але кнопки очищення не має', async () => {
    listPendingAccountDeletions.mockResolvedValue({ items: [ITEM], canPurge: false, error: '' });
    render(<AccountDeletionQueue />);
    expect((await screen.findByTestId('account-deletions')).textContent).toContain('Очищення запускає повний адмін');
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
