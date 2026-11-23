// Черга доповнень на `AddNewProfile`: адмін мусить бачити кожне дописане
// значення окремим рядком і вирішувати по ньому, а не по картці цілком.
//
// Три речі, заради яких цей тест і стоїть:
//  1) прийняття перевіряє саме той шар, з якого намальований обраний рядок;
//  2) рішення ухвалюється тим самим `settleOverlayValueForCard`, що й у формі
//     редагування: він транзакційний і знімає відхилене значення ще й з
//     `searchId` — інакше прибраний номер далі знаходився б пошуком;
//  3) відмова читання показує причину, а не порожню чергу: найімовірніша
//     причина — нерозгорнуті правила бази, і тоді «доповнень немає» бреше рівно
//     тоді, коли їх найбільше.
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('./config', () => ({
  fetchMatchingCardsByIds: jest.fn(async () => ({ cards: {}, missingIds: [] })),
}));

jest.mock('utils/profileOverlayReview', () => ({
  approveOverlayValue: jest.fn(),
}));

jest.mock('utils/multiAccountEdits', () => ({
  ...jest.requireActual('utils/multiAccountEdits'),
  listPendingOverlayCards: jest.fn(),
  settleOverlayValueForCard: jest.fn(),
}));

const {
  listPendingOverlayCards,
  settleOverlayValueForCard,
} = require('utils/multiAccountEdits');
const { approveOverlayValue } = require('utils/profileOverlayReview');
const { default: toast } = require('react-hot-toast');
const { fetchMatchingCardsByIds } = require('./config');
const { OverlayReviewQueue } = require('./AddNewProfileOverlayReview');

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

describe('OverlayReviewQueue', () => {
  beforeEach(() => {
    // CRA вмикає `resetMocks`, тож реалізації з фабрики `jest.mock` не
    // доживають до тесту — кожен мок ставиться тут заново.
    jest.clearAllMocks();
    listPendingOverlayCards.mockResolvedValue([QUEUE_ENTRY]);
    approveOverlayValue.mockResolvedValue({ value: '380501112233', remainingOverlay: null });
    settleOverlayValueForCard.mockResolvedValue({ settledChange: {}, remainingChange: null, remainingOverlay: null });
    fetchMatchingCardsByIds.mockResolvedValue({
      cards: { CARD1: { userId: 'CARD1', name: 'Оксана', surname: 'Коваленко' } },
      missingIds: [],
    });
  });

  it('shows every pending value with its card, named by the feed card', async () => {
    render(<OverlayReviewQueue onOpenCard={jest.fn()} />);

    expect(await screen.findByText('Оксана Коваленко')).toBeTruthy();
    expect(screen.getByText('380501112233')).toBeTruthy();
    // Ім'я береться з картки стрічки, а не з повної анкети: рядків тут десятки.
    expect(fetchMatchingCardsByIds).toHaveBeenCalledWith(['CARD1']);
  });

  it('requires the exact displayed record when approving a value', async () => {
    render(<OverlayReviewQueue onOpenCard={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Прийняти' }));

    await waitFor(() => expect(approveOverlayValue).toHaveBeenCalledWith({
      cardUserId: 'CARD1',
      editorUserId: 'editorA',
      fieldName: 'phone',
      value: '380501112233',
      expectedCurrent: LAYER,
    }));
  });

  it('settles a discarded value through the shared path and never touches the card', async () => {
    render(<OverlayReviewQueue onOpenCard={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Видалити' }));

    await waitFor(() => expect(settleOverlayValueForCard).toHaveBeenCalled());
    expect(settleOverlayValueForCard).toHaveBeenCalledWith({
      cardUserId: 'CARD1',
      editorUserId: 'editorA',
      fieldName: 'phone',
      value: '380501112233',
      action: 'discard',
      expectedCurrent: LAYER,
    });
    expect(approveOverlayValue).not.toHaveBeenCalled();
  });

  it('passes a replacement with its original value to the guarded review writer', async () => {
    const record = { ...LAYER, fields: { city: { from: 'Київ', to: 'Львів' } } };
    listPendingOverlayCards.mockResolvedValue([{
      ...QUEUE_ENTRY,
      fieldNames: ['city'],
      overlaysByEditor: { editorA: record },
      recordsByEditor: { editorA: record },
    }]);

    render(<OverlayReviewQueue onOpenCard={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Прийняти' }));

    await waitFor(() => expect(approveOverlayValue).toHaveBeenCalledWith(expect.objectContaining({
      fieldName: 'city', value: 'Львів', expectedCurrent: record,
    })));
  });

  it('discards all the displayed values through guarded per-value settlement', async () => {
    render(<OverlayReviewQueue onOpenCard={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Видалити все' }));

    await waitFor(() => expect(settleOverlayValueForCard).toHaveBeenCalledWith(expect.objectContaining({
      cardUserId: 'CARD1', action: 'discard', expectedCurrent: LAYER,
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
    approveOverlayValue.mockResolvedValueOnce({ remainingOverlay: remaining });
    approveOverlayValue.mockRejectedValueOnce(Object.assign(new Error('stale'), { code: 'REVISION_CONFLICT' }));

    render(<OverlayReviewQueue onOpenCard={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Прийняти все' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/вже змінено/)));
    expect(approveOverlayValue).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedCurrent: original, value: '380501112233',
    }));
    expect(approveOverlayValue).toHaveBeenNthCalledWith(2, expect.objectContaining({
      expectedCurrent: remaining, value: secondPhone,
    }));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('names the reason when the queue cannot be read instead of showing it empty', async () => {
    listPendingOverlayCards.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' }),
    );

    render(<OverlayReviewQueue onOpenCard={jest.fn()} />);

    expect(await screen.findByText(/PERMISSION_DENIED/)).toBeTruthy();
    expect(screen.queryByText('Нерозсуджених доповнень немає.')).toBeNull();
  });

  it('says plainly when there is nothing to review', async () => {
    listPendingOverlayCards.mockResolvedValueOnce([]);

    render(<OverlayReviewQueue onOpenCard={jest.fn()} />);

    expect(await screen.findByText('Нерозсуджених доповнень немає.')).toBeTruthy();
  });
});
