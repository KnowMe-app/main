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

jest.mock('../../utils/legacyImportCommentMigration', () => ({
  copyPublicCommentsBetweenCards: jest.fn(),
}));

jest.mock('./actions', () => ({ handleSubmitAll: jest.fn() }));

const { fetchPublicProfileComments, fetchUserComment } = require('../config');
const { handleSubmitAll } = require('./actions');
const { btnCompare } = require('./btnCompare');

/**
 * Позначка `writer` не переносилась зовсім, і мовчки: кома в ній —
 * частина рядка («Т, Ik»), а таблиця розбивала її на масив. База приймає сюди
 * лише рядок (`.validate: newData.isString()` на `multiData/writer`), тож
 * запис відповідав PERMISSION_DENIED, а відмову позначки ковтає `catch`.
 */
describe('btnCompare — перенос позначки writer', () => {
  const users = {
    'card-current': { userId: 'card-current', writer: 'Т, Ik' },
    'card-next': { userId: 'card-next' },
  };

  beforeEach(() => {
    fetchUserComment.mockReset().mockResolvedValue(null);
    fetchPublicProfileComments.mockReset().mockResolvedValue({});
    handleSubmitAll.mockReset().mockResolvedValue(undefined);
  });

  it('лишає writer рядком, а не розбиває його комою на масив', async () => {
    const usersRef = { current: users };
    const setCompare = jest.fn();
    render(
      <div>{btnCompare(0, users, jest.fn(), jest.fn(), setCompare, usersRef)}</div>,
    );
    fireEvent.click(screen.getByTitle('Порівняти'));
    await waitFor(() => expect(setCompare).toHaveBeenCalledTimes(2));
    render(setCompare.mock.calls[1][0]);

    fireEvent.click(screen.getByText('Т, Ik'));

    await waitFor(() => expect(handleSubmitAll).toHaveBeenCalled());
    expect(usersRef.current['card-next'].writer).toBe('Т, Ik');
    expect(handleSubmitAll.mock.calls[0][0].writer).toBe('Т, Ik');
  });
});
