import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('./config', () => ({
  fetchMatchingCardsByIds: jest.fn(async () => ({ cards: {}, missingIds: [] })),
}));

jest.mock('utils/profileProposalRepository', () => ({
  profileProposalService: { listDrafts: jest.fn(), reviewDraft: jest.fn() },
}));

jest.mock('utils/multiAccountEdits', () => ({
  ...jest.requireActual('utils/multiAccountEdits'),
  listPendingOverlayCards: jest.fn(),
  getCanonicalCard: jest.fn(),
}));

const { getCanonicalCard, listPendingOverlayCards } = require('utils/multiAccountEdits');
const { profileProposalService: { listDrafts, reviewDraft } } = require('utils/profileProposalRepository');
const { default: toast } = require('react-hot-toast');
const { fetchMatchingCardsByIds } = require('./config');
const { ProposalReviewQueue } = require('./AddNewProfileOverlayReview');

const LAYER = {
  cardUserId: 'CARD1',
  editorUserId: 'editorA',
  updatedAt: 1764000000000,
  fields: { phone: { added: ['380501112233'] } },
};

const QUEUE_ENTRY = {
  cardUserId: 'CARD1',
  editorIds: ['editorA'],
  fieldNames: ['phone'],
  updatedAt: 1764000000000,
  overlaysByEditor: { editorA: LAYER },
  recordsByEditor: { editorA: LAYER },
};

const CREATE = {
  id: 'create-1', operation: 'create', status: 'pendingReview', reservedCardId: 'DRAFT1',
  createdBy: 'authorA', revision: 3, updatedAt: 1764000000001,
  data: { name: 'Лада', surname: 'Коваль', city: 'Київ' },
};

describe('ProposalReviewQueue', () => {
  beforeEach(() => {
    // CRA вмикає `resetMocks`, тож реалізації з фабрики `jest.mock` не
    // доживають до тесту — кожен мок ставиться тут заново.
    jest.clearAllMocks();
    listPendingOverlayCards.mockResolvedValue([QUEUE_ENTRY]);
    listDrafts.mockResolvedValue([]);
    reviewDraft.mockResolvedValue({ value: '380501112233', remainingOverlay: null });
    getCanonicalCard.mockResolvedValue({ userId: 'CARD1', phone: ['380671111122', '380671111133'] });
    fetchMatchingCardsByIds.mockResolvedValue({
      cards: { CARD1: { userId: 'CARD1', name: 'Оксана', surname: 'Коваленко' } },
      missingIds: [],
    });
  });

  it('shows every pending value with its card, named by the feed card', async () => {
    render(<ProposalReviewQueue onOpenCard={jest.fn()} />);

    expect(await screen.findByText('Оксана Коваленко')).toBeTruthy();
    expect(screen.getByText('380501112233')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Прийняти' })).toHaveAttribute(
      'title', 'Записати значення в анкету і прибрати з черги',
    );
    // Ім'я береться з картки стрічки, а не з повної анкети: рядків тут десятки.
    expect(fetchMatchingCardsByIds).toHaveBeenCalledWith(['CARD1']);
  });

  it('requires the exact displayed record when approving a value', async () => {
    render(<ProposalReviewQueue onOpenCard={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Прийняти' }));

    await waitFor(() => expect(reviewDraft).toHaveBeenCalledWith({
      operation: 'update', action: 'accept',
      cardUserId: 'CARD1',
      editorUserId: 'editorA',
      fieldName: 'phone',
      value: '380501112233',
      expectedCurrent: LAYER,
    }));
  });

  it('settles a discarded value through the shared path and never touches the card', async () => {
    render(<ProposalReviewQueue onOpenCard={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Видалити' }));

    await waitFor(() => expect(reviewDraft).toHaveBeenCalled());
    expect(reviewDraft).toHaveBeenCalledWith({
      cardUserId: 'CARD1',
      editorUserId: 'editorA',
      fieldName: 'phone',
      value: '380501112233',
      operation: 'update', action: 'reject',
      expectedCurrent: LAYER,
    });
    expect(reviewDraft).toHaveBeenCalledTimes(1);
  });

  it('passes a replacement with its original value to the guarded review writer', async () => {
    const record = { ...LAYER, fields: { city: { from: 'Київ', to: 'Львів' } } };
    listPendingOverlayCards.mockResolvedValue([{
      ...QUEUE_ENTRY,
      fieldNames: ['city'],
      overlaysByEditor: { editorA: record },
      recordsByEditor: { editorA: record },
    }]);

    render(<ProposalReviewQueue onOpenCard={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Прийняти' }));

    await waitFor(() => expect(reviewDraft).toHaveBeenCalledWith(expect.objectContaining({
      fieldName: 'city', value: 'Львів', expectedCurrent: record,
    })));
  });

  it('discards all the displayed values through guarded per-value settlement', async () => {
    render(<ProposalReviewQueue onOpenCard={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Видалити все' }));

    await waitFor(() => expect(reviewDraft).toHaveBeenCalledWith(expect.objectContaining({
      cardUserId: 'CARD1', action: 'reject', expectedCurrent: LAYER,
    })));
  });

  it('uses only the confirmed remainder when bulk approval moves to a second value', async () => {
    const secondPhone = '380671112233';
    const original = { ...LAYER, fields: { phone: { added: ['380501112233', secondPhone] } } };
    const remaining = { ...LAYER, fields: { phone: { added: [secondPhone] } } };
    listPendingOverlayCards.mockResolvedValue([{
      ...QUEUE_ENTRY,
      overlaysByEditor: { editorA: original },
      recordsByEditor: { editorA: original },
    }]);
    reviewDraft.mockResolvedValueOnce({ remainingOverlay: remaining });
    reviewDraft.mockRejectedValueOnce(Object.assign(new Error('stale'), { code: 'REVISION_CONFLICT' }));

    render(<ProposalReviewQueue onOpenCard={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Прийняти все' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/вже змінено/)));
    expect(reviewDraft).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedCurrent: original, value: '380501112233',
    }));
    expect(reviewDraft).toHaveBeenNthCalledWith(2, expect.objectContaining({
      expectedCurrent: remaining, value: secondPhone,
    }));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('names the reason when the queue cannot be read instead of showing it empty', async () => {
    listPendingOverlayCards.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' }),
    );

    render(<ProposalReviewQueue onOpenCard={jest.fn()} />);

    expect(await screen.findByText(/PERMISSION_DENIED/)).toBeTruthy();
    expect(screen.queryByText('Пропозицій на розгляд немає.')).toBeNull();
  });

  it('says plainly when there is nothing to review', async () => {
    listPendingOverlayCards.mockResolvedValueOnce([]);

    render(<ProposalReviewQueue onOpenCard={jest.fn()} />);

    expect(await screen.findByText('Пропозицій на розгляд немає.')).toBeTruthy();
  });

  it('shows pending create and update proposals in the same queue and opens the draft editor', async () => {
    listDrafts.mockResolvedValue([CREATE, { ...CREATE, id: 'returned', status: 'private', data: { name: 'Повернута' } }]);
    const onOpenDraft = jest.fn();
    render(<ProposalReviewQueue onOpenCard={jest.fn()} onOpenDraft={onOpenDraft} />);

    expect(await screen.findByRole('heading', { name: /Черга пропозицій/ })).toBeInTheDocument();
    const [createCard] = await screen.findAllByRole('article');
    expect(within(createCard).getByText('Лада Коваль')).toBeInTheDocument();
    expect(within(createCard).getByText(/Нова анкета/)).toBeInTheDocument();
    expect(within(createCard).getByText(/Автор authorA · Ревізія 3/)).toBeInTheDocument();
    expect(screen.getByText(/Зміни до анкети/)).toBeInTheDocument();
    expect(screen.queryByText('Повернута')).not.toBeInTheDocument();
    fireEvent.click(within(createCard).getByRole('button', { name: 'Відкрити' }));
    expect(onOpenDraft).toHaveBeenCalledWith('DRAFT1');
    expect(listDrafts).toHaveBeenCalledWith({ review: true, operation: 'create' });
  });

  it.each([CREATE.id, undefined])('identifies an active create draft as the target of a contribution (%s)', async linkedId => {
    const record = {
      ...LAYER,
      cardUserId: CREATE.reservedCardId,
      ...(linkedId && { proposal: { targetCreateProposalId: linkedId } }),
    };
    listDrafts.mockResolvedValue([{ ...CREATE, status: 'private' }]);
    listPendingOverlayCards.mockResolvedValue([{
      ...QUEUE_ENTRY,
      cardUserId: CREATE.reservedCardId,
      recordsByEditor: { editorA: record },
      overlaysByEditor: { editorA: record },
    }]);
    fetchMatchingCardsByIds.mockResolvedValue({ cards: {}, missingIds: [CREATE.reservedCardId] });
    const onOpenCard = jest.fn();
    render(<ProposalReviewQueue onOpenCard={onOpenCard} />);

    expect(await screen.findByText(/Доповнення до чернетки · DRAFT1/)).toBeInTheDocument();
    expect(screen.getByText('Лада Коваль')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Прийняти' })).toHaveAttribute(
      'title', 'Записати значення в чернетку і прибрати з черги',
    );
    expect(screen.queryByRole('button', { name: 'Створити анкету' })).toBeNull();
    expect(getCanonicalCard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Відкрити' }));
    expect(onOpenCard).toHaveBeenCalledWith(CREATE.reservedCardId);
  });

  it('shows an existing canonical projection for an update even when its old draft is present', async () => {
    listDrafts.mockResolvedValue([{ ...CREATE, reservedCardId: 'CARD1', status: 'publishing' }]);

    render(<ProposalReviewQueue onOpenCard={jest.fn()} />);

    expect(await screen.findByText(/Зміни до анкети · CARD1/)).toBeInTheDocument();
    expect(screen.getByText('Оксана Коваленко')).toBeInTheDocument();
    expect(screen.queryByText(/Доповнення до чернетки/)).toBeNull();
  });

  it('publishes a new card through the shared service with the displayed revision', async () => {
    listDrafts.mockResolvedValue([CREATE]);
    render(<ProposalReviewQueue onOpenCard={jest.fn()} onOpenDraft={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Створити анкету' }));
    await waitFor(() => expect(reviewDraft).toHaveBeenCalledWith({
      operation: 'create', action: 'accept', cardId: 'DRAFT1', creatorUid: 'authorA',
      expectedRevision: 3, expected: CREATE, finalData: CREATE.data,
    }));
  });

  it('returns a new card proposal to its author through the shared service', async () => {
    listDrafts.mockResolvedValue([CREATE]);
    render(<ProposalReviewQueue onOpenCard={jest.fn()} onOpenDraft={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Повернути автору' }));
    await waitFor(() => expect(reviewDraft).toHaveBeenCalledWith({
      operation: 'create', action: 'reject', cardId: 'DRAFT1', creatorUid: 'authorA',
      expectedRevision: 3, expected: CREATE,
    }));
  });

  it('leaves a duplicate pending and tells the admin to review the match', async () => {
    listDrafts.mockResolvedValue([CREATE]);
    reviewDraft.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 'DUPLICATE_PROFILE' }));
    render(<ProposalReviewQueue onOpenCard={jest.fn()} onOpenDraft={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Створити анкету' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Перевірте збіг/)));
    expect(screen.getByText('Лада Коваль')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('loads the actual canonical values on demand and shows the proposal author and revision', async () => {
    const record = { ...LAYER, proposal: { revision: 7 } };
    const otherRecord = { ...LAYER, editorUserId: 'editorB', fields: { phone: { added: ['380501113344'] } } };
    listPendingOverlayCards.mockResolvedValue([{
      ...QUEUE_ENTRY, editorIds: ['editorA', 'editorB'],
      recordsByEditor: { editorA: record, editorB: otherRecord },
      overlaysByEditor: { editorA: record, editorB: otherRecord },
    }]);
    render(<ProposalReviewQueue onOpenCard={jest.fn()} />);
    expect(await screen.findByText(/Автор editorA · Ревізія 7/)).toBeInTheDocument();
    expect(screen.getByText(/Автор editorB/)).toBeInTheDocument();
    expect(getCanonicalCard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Поточні значення' }));
    expect(await screen.findByText(/380671111122 · 380671111133/)).toBeInTheDocument();
    expect(getCanonicalCard).toHaveBeenCalledWith('CARD1');
  });

  it('lets the inspector read both operations with review actions disabled', async () => {
    listDrafts.mockResolvedValue([CREATE]);
    render(<ProposalReviewQueue onOpenCard={jest.fn()} onOpenDraft={jest.fn()} readOnly />);
    expect(await screen.findByRole('button', { name: 'Створити анкету' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Повернути автору' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Прийняти' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Видалити' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Прийняти все' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Поточні значення' })).toBeEnabled();
    screen.getAllByRole('button', { name: 'Відкрити' }).forEach(button => expect(button).toBeEnabled());
    expect(reviewDraft).not.toHaveBeenCalled();
  });

  it('shows the old and new values of a list replacement and submits the pair', async () => {
    const replacement = { from: '380501110000', to: '380501112233' };
    const record = {
      ...LAYER,
      fields: { phone: { removed: [replacement.from], added: [replacement.to] } },
      proposal: { replacements: JSON.stringify({ phone: [replacement] }) },
    };
    listPendingOverlayCards.mockResolvedValue([{
      ...QUEUE_ENTRY,
      recordsByEditor: { editorA: record },
      overlaysByEditor: { editorA: record },
    }]);
    render(<ProposalReviewQueue onOpenCard={jest.fn()} />);

    expect(await screen.findByText(replacement.from)).toBeInTheDocument();
    expect(screen.getByText(replacement.to)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Прийняти' }));
    await waitFor(() => expect(reviewDraft).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'update', action: 'accept', expectedCurrent: record, value: replacement.to, replacement,
    })));
  });
});
