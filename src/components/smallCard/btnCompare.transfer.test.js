import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { btnCompare } from './btnCompare';
import { saveComparisonField, fetchUserComment, saveMyCardComment } from '../config';
import { mergeComparisonValues } from '../../utils/comparisonValues';

jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
  auth: { currentUser: { uid: 'admin' } },
  fetchPublicProfileComments: jest.fn(async () => ({})),
  fetchUserComment: jest.fn(async () => null),
  saveComparisonField: jest.fn(),
  saveMyCardComment: jest.fn(),
}));
jest.mock('../../utils/cache', () => ({ updateCachedUser: jest.fn() }));
jest.mock('../../utils/legacyImportCommentMigration', () => ({ copyPublicCommentsBetweenCards: jest.fn() }));

const open = async (fields, target = {}) => {
  const users = { A: { userId: 'A', ...fields }, B: { userId: 'B', ...target } };
  const usersRef = { current: users };
  const setUsers = jest.fn();
  const setCompare = jest.fn();
  render(btnCompare(0, users, setUsers, jest.fn(), setCompare, usersRef));
  fireEvent.click(screen.getByTitle('Порівняти'));
  await waitFor(() => expect(setCompare).toHaveBeenCalledTimes(2));
  render(setCompare.mock.calls[1][0]);
  return { usersRef, setUsers };
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchUserComment.mockResolvedValue(null);
});

it.each([
  ['123', ['123', '456'], ['123', '456']],
  [['123', '123'], '123', ['123']],
  [['123', '456'], ['456', '789'], ['456', '789', '123']],
  ['123', null, ['123']],
])('deduplicates each scalar/array item', (source, target, expected) => {
  expect(mergeComparisonValues(source, target)).toEqual(expected);
});

it.each(['height', 'weight'])('waits for %s confirmation and displays the returned value', async key => {
  let resolve;
  saveComparisonField.mockReturnValue(new Promise(done => { resolve = done; }));
  const { usersRef, setUsers } = await open({ [key]: '170' }, { [key]: '160' });
  fireEvent.click(screen.getByText('170'));
  await waitFor(() => expect(saveComparisonField).toHaveBeenCalledWith('B', key, ['160', '170']));
  expect(usersRef.current.B[key]).toBe('160');
  expect(setUsers).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
  await act(async () => resolve(['160', '170.0']));
  expect(usersRef.current.B[key]).toEqual(['160', '170.0']);
  expect(toast.success).toHaveBeenCalledWith(`${key} → 160, 170.0`, { duration: 2500 });
});

it('keeps the old value and reports a rejected backend write', async () => {
  saveComparisonField.mockRejectedValue(new Error('PERMISSION_DENIED'));
  const { usersRef, setUsers } = await open({ height: '170' }, { height: '160' });
  fireEvent.click(screen.getByText('170'));
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect(toast.success).not.toHaveBeenCalled();
  expect(setUsers).not.toHaveBeenCalled();
  expect(usersRef.current.B.height).toBe('160');
});

it('serializes rapid transfers to the same card without losing either field', async () => {
  let resolve;
  saveComparisonField.mockImplementationOnce(() => new Promise(done => { resolve = done; }))
    .mockResolvedValueOnce(['60']);
  const { usersRef } = await open({ height: '170', weight: '60' });
  fireEvent.click(screen.getByText('170'));
  fireEvent.click(screen.getByText('60'));
  await waitFor(() => expect(saveComparisonField).toHaveBeenCalledTimes(1));
  await act(async () => resolve(['170']));
  await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(2));
  expect(usersRef.current.B).toMatchObject({ height: ['170'], weight: ['60'] });
});

it('copies only the current personal comment and uses the acknowledged text', async () => {
  fetchUserComment.mockImplementation(async (_, id) => id === 'A' ? { text: 'current' } : null);
  saveMyCardComment.mockResolvedValue({ text: 'confirmed', lastAction: 123 });
  const { usersRef } = await open({ myComment: 'stale' });
  expect(screen.queryByText('stale')).toBeNull();
  fireEvent.click(screen.getByText('current'));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('myComment → confirmed', { duration: 2500 }));
  expect(saveMyCardComment).toHaveBeenCalledWith('B', 'current', 'admin');
  expect(usersRef.current.B.myComment).toBe('confirmed');
});

it('keeps the receiving card\'s own note instead of overwriting it', async () => {
  fetchUserComment.mockImplementation(async (_, id) => (
    id === 'A' ? { text: 'from A' } : id === 'B' ? { text: 'already on B' } : null
  ));
  saveMyCardComment.mockResolvedValue({ text: 'already on B\n\nfrom A', lastAction: 123 });
  const { usersRef } = await open({ myComment: 'stale A' }, { myComment: 'stale B' });
  fireEvent.click(screen.getByText('from A'));
  await waitFor(() => expect(saveMyCardComment).toHaveBeenCalled());
  expect(saveMyCardComment).toHaveBeenCalledWith('B', 'already on B\n\nfrom A', 'admin');
  expect(usersRef.current.B.myComment).toBe('already on B\n\nfrom A');
});

it('does not append the same note twice when the transfer is repeated', async () => {
  fetchUserComment.mockImplementation(async (_, id) => (
    id === 'A' ? { text: 'from A' } : id === 'B' ? { text: 'already on B\n\nfrom A' } : null
  ));
  saveMyCardComment.mockResolvedValue({ text: 'already on B\n\nfrom A', lastAction: 123 });
  await open({ myComment: 'stale A' }, { myComment: 'stale B' });
  fireEvent.click(screen.getByText('from A'));
  await waitFor(() => expect(saveMyCardComment).toHaveBeenCalled());
  expect(saveMyCardComment).toHaveBeenCalledWith('B', 'already on B\n\nfrom A', 'admin');
});

it('keeps a free-text field whole and appends the transferred text instead of splitting it on commas', async () => {
  saveComparisonField.mockImplementation(async (_, __, value) => value);
  await open({ moreInfo_main: 'Працюю вчителем, маю двох дітей' }, { moreInfo_main: 'Люблю спорт, читання' });
  fireEvent.click(screen.getByText('Працюю вчителем, маю двох дітей'));
  await waitFor(() => expect(saveComparisonField).toHaveBeenCalled());
  expect(saveComparisonField).toHaveBeenCalledWith('B', 'moreInfo_main', [
    'Люблю спорт, читання',
    'Люблю спорт, читання\n\nПрацюю вчителем, маю двох дітей',
  ]);
});

it('keeps the receiving card\'s text history when appending', async () => {
  saveComparisonField.mockImplementation(async (_, __, value) => value);
  await open({ allergy: 'пеніцилін' }, { allergy: ['пил', 'пилок, шерсть'] });
  fireEvent.click(screen.getByText('пеніцилін'));
  await waitFor(() => expect(saveComparisonField).toHaveBeenCalled());
  expect(saveComparisonField).toHaveBeenCalledWith('B', 'allergy', [
    'пил',
    'пилок, шерсть',
    'пилок, шерсть\n\nпеніцилін',
  ]);
});
