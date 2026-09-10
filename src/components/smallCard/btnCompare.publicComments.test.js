import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));

jest.mock('../config', () => ({
  auth: { currentUser: { uid: '0ghb1LphfASV0Y3b6J010v4CDyD2' } },
  fetchPublicProfileComments: jest.fn(),
  fetchUserComment: jest.fn(),
  saveMyCardComment: jest.fn(),
}));

jest.mock('../../utils/legacyTgCommentMigration', () => ({
  copyPublicCommentsBetweenCards: jest.fn(),
}));

jest.mock('./actions', () => ({ handleSubmitAll: jest.fn() }));

const { fetchPublicProfileComments, fetchUserComment } = require('../config');
const { copyPublicCommentsBetweenCards } = require('../../utils/legacyTgCommentMigration');
const { btnCompare } = require('./btnCompare');

// Порівняння дублікатів переносило поля анкети й особисту нотатку, а публічні
// відгуки — ні: вони лишались на картці, яку закривають. Тепер вони стоять у
// таблиці окремим рядком, і клік переносить їх на сусідню картку.
describe('btnCompare — публічні відгуки в таблиці дублікатів', () => {
  const users = {
    TG0001: { userId: 'TG0001', name: 'Анастасія' },
    ID0009: { userId: 'ID0009', name: 'Анастасія' },
  };

  const openCompareTable = async () => {
    const setCompare = jest.fn();
    render(
      <div>
        {btnCompare(0, users, jest.fn(), jest.fn(), setCompare, { current: users })}
      </div>,
    );
    fireEvent.click(screen.getByTitle('Порівняти'));
    await waitFor(() => expect(setCompare).toHaveBeenCalledTimes(2));
    render(setCompare.mock.calls[1][0]);
  };

  beforeEach(() => {
    fetchUserComment.mockReset().mockResolvedValue(null);
    copyPublicCommentsBetweenCards.mockReset().mockResolvedValue({ copied: 1, skipped: 0 });
    fetchPublicProfileComments.mockReset().mockResolvedValue({
      TG0001: [{ id: 'c1', text: 'Зняли з підготовки до переносу', authorName: 'Деліверінг дрімз' }],
      ID0009: [],
    });
  });

  it('читає публічні відгуки обох карток і показує їх окремим рядком', async () => {
    await openCompareTable();

    expect(fetchPublicProfileComments).toHaveBeenCalledWith(['TG0001', 'ID0009']);
    expect(screen.getByText('publicComments')).toBeInTheDocument();
    expect(screen.getByText('Зняли з підготовки до переносу')).toBeInTheDocument();
  });

  it('клік по відгуку переносить його на сусідню картку — з автором, а не текстом у поле', async () => {
    await openCompareTable();

    fireEvent.click(screen.getByText('Зняли з підготовки до переносу'));

    await waitFor(() => expect(copyPublicCommentsBetweenCards).toHaveBeenCalledWith({
      sourceProfileId: 'TG0001',
      targetProfileId: 'ID0009',
    }));
  });

  it('без відгуків рядка немає взагалі', async () => {
    fetchPublicProfileComments.mockResolvedValue({ TG0001: [], ID0009: [] });

    await openCompareTable();

    expect(screen.queryByText('publicComments')).not.toBeInTheDocument();
  });
});
