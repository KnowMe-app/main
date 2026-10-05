import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { get, ref, remove, set } from 'firebase/database';
import { ProfileDataTree } from './ProfileDataTree';

jest.mock('./config', () => ({ database: {}, db: {} }));
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn() }));
jest.mock('firebase/database', () => ({
  ref: jest.fn((_db, path) => path),
  get: jest.fn(),
  set: jest.fn(() => Promise.resolve()),
  remove: jest.fn(() => Promise.resolve()),
}));

const DATA = {
  'multiData/stimulationSchedule/admin/AA0001': '1 день — Гонал 150',
  'profileDetails/AA0001': { about: 'текст', nested: { deep: 3 } },
  'multiData/profileMutationOwners/AA0001': 'author',
  'multiData/profileMutations/author/AA0001': { data: { name: 'Олена' } },
};

const snapshotOf = value => ({ exists: () => value !== undefined, val: () => value });

beforeEach(() => {
  // CRA вмикає resetMocks: реалізації моків задаються тут, а не у фабриці.
  ref.mockImplementation((_db, path) => path);
  set.mockImplementation(() => Promise.resolve());
  remove.mockImplementation(() => Promise.resolve());
  get.mockImplementation(path => Promise.resolve(snapshotOf(DATA[path])));
  window.confirm = jest.fn(() => true);
});

const openTree = async () => {
  render(<ProfileDataTree cardId="AA0001" viewerId="admin" record={{ userId: 'AA0001' }} />);
  expect(get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Усі дані картки в базі'));
  return screen.findByDisplayValue('1 день — Гонал 150');
};

it('читає лише після розгортання і показує графік стимуляції', async () => {
  await openTree();
  expect(get).toHaveBeenCalledWith('multiData/stimulationSchedule/admin/AA0001');
  expect(get).not.toHaveBeenCalledWith('users/AA0001');
});

it('дочитує запис чернетки за автором з profileMutationOwners', async () => {
  await openTree();
  expect(await screen.findByText('multiData/profileMutations/author/AA0001')).toBeTruthy();
  expect(get).toHaveBeenCalledWith('multiData/profileMutations/author/AA0001');
});

it('пише відредагований скаляр за його шляхом', async () => {
  const input = await openTree();
  fireEvent.change(input, { target: { value: '2 день' } });
  fireEvent.blur(input);
  await waitFor(() => expect(set).toHaveBeenCalledWith('multiData/stimulationSchedule/admin/AA0001', '2 день'));
});

it('видаляє вкладений вузол після підтвердження', async () => {
  await openTree();
  // Корінь джерела розгорнутий одразу; вкладений `nested` згорнутий, але
  // хрестик стоїть у його заголовку.
  fireEvent.click(await screen.findByLabelText('Видалити profileDetails/AA0001/nested'));
  await waitFor(() => expect(screen.queryByLabelText('Видалити profileDetails/AA0001/nested')).toBeNull());
  expect(remove).toHaveBeenCalledWith('profileDetails/AA0001/nested');
});

it('на порожньому місці пропонує записати значення', async () => {
  await openTree();
  fireEvent.change(screen.getByLabelText('Нове значення для multiData/writer/admin/AA0001'), { target: { value: 'Ірина' } });
  fireEvent.click(screen.getByLabelText('Записати multiData/writer/admin/AA0001'));
  await waitFor(() => expect(set).toHaveBeenCalledWith('multiData/writer/admin/AA0001', 'Ірина'));
});
