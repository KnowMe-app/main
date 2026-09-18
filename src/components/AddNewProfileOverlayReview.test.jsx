// Черга доповнень на `AddNewProfile`: адмін мусить бачити кожне дописане
// значення окремим рядком і вирішувати по ньому, а не по картці цілком.
//
// Три речі, заради яких цей тест і стоїть:
//  1) прийняте значення справді доїжджає до анкети (`persistCanonicalCard`), а
//     не лише зникає з черги — інакше «прийняв» означало б «загубив»;
//  2) прийняте прибирається з журналу, а відхилене лишається: «чому цього немає
//     в анкеті» — питання, на яке адмінові доводиться відповідати;
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

jest.mock('utils/persistCanonicalCard', () => ({
  persistCanonicalCard: jest.fn(async () => undefined),
}));

jest.mock('utils/multiAccountEdits', () => ({
  ...jest.requireActual('utils/multiAccountEdits'),
  listPendingOverlayCards: jest.fn(),
  getCanonicalCard: jest.fn(async () => ({ userId: 'CARD1', phone: '380500000000' })),
  settleOverlayFieldValue: jest.fn(async () => undefined),
  acceptAllOverlaysForCard: jest.fn(async () => ({})),
  removeAllOverlaysForCard: jest.fn(async () => ({})),
}));

const {
  listPendingOverlayCards,
  getCanonicalCard,
  settleOverlayFieldValue,
  removeAllOverlaysForCard,
} = require('utils/multiAccountEdits');
const { persistCanonicalCard } = require('utils/persistCanonicalCard');
const { fetchMatchingCardsByIds } = require('./config');
const { OverlayReviewQueue } = require('./AddNewProfileOverlayReview');

const QUEUE_ENTRY = {
  cardUserId: 'CARD1',
  editorIds: ['editorA'],
  fieldNames: ['phone'],
  updatedAt: 1764000000000,
  overlaysByEditor: {
    editorA: {
      cardUserId: 'CARD1',
      editorUserId: 'editorA',
      updatedAt: 1764000000000,
      fields: { phone: { added: ['380501112233'] } },
    },
  },
};

describe('OverlayReviewQueue', () => {
  beforeEach(() => {
    // CRA вмикає `resetMocks`, тож реалізації з фабрики `jest.mock` не
    // доживають до тесту — кожен мок ставиться тут заново.
    jest.clearAllMocks();
    listPendingOverlayCards.mockResolvedValue([QUEUE_ENTRY]);
    getCanonicalCard.mockResolvedValue({ userId: 'CARD1', phone: '380500000000' });
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

  it('writes an accepted value into the card and purges its journal rows', async () => {
    render(<OverlayReviewQueue onOpenCard={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Прийняти' }));

    await waitFor(() => expect(persistCanonicalCard).toHaveBeenCalled());
    expect(persistCanonicalCard.mock.calls[0][0].phone).toEqual(['380500000000', '380501112233']);
    expect(settleOverlayFieldValue).toHaveBeenCalledWith(expect.objectContaining({
      cardUserId: 'CARD1',
      editorUserId: 'editorA',
      fieldName: 'phone',
      historyAction: 'accept',
      purgeHistory: true,
    }));
  });

  it('keeps a discarded value in the journal and never touches the card', async () => {
    render(<OverlayReviewQueue onOpenCard={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Видалити' }));

    await waitFor(() => expect(settleOverlayFieldValue).toHaveBeenCalled());
    expect(settleOverlayFieldValue).toHaveBeenCalledWith(expect.objectContaining({
      historyAction: 'discard',
    }));
    expect(settleOverlayFieldValue.mock.calls[0][0].purgeHistory).toBeUndefined();
    expect(persistCanonicalCard).not.toHaveBeenCalled();
  });

  it('clears the whole card queue on "Видалити все"', async () => {
    render(<OverlayReviewQueue onOpenCard={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Видалити все' }));

    await waitFor(() => expect(removeAllOverlaysForCard).toHaveBeenCalledWith('CARD1'));
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
