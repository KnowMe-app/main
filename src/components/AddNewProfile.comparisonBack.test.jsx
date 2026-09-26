import { openComparedCard, restoreComparedCard } from './comparedCardNavigation';

it('browser Back restores the comparison and search after opening either card', async () => {
  const refresh = jest.fn(async () => {});
  const comparisonReturnRef = { current: null };
  const setState = jest.fn();
  const setSearch = jest.fn();
  const setShowInfoModal = jest.fn();
  const navigate = jest.fn();
  const toast = { error: jest.fn() };
  await openComparedCard({
    userId: 'B', refresh, fetchUserById: jest.fn(async userId => ({ userId })), toast,
    comparisonReturnRef, location: { key: 'comparison', pathname: '/add', search: '?search=phone' },
    search: 'phone query', setState, setShowInfoModal, navigate,
  });
  expect(setState).toHaveBeenCalledWith({ userId: 'B' });
  expect(setShowInfoModal).toHaveBeenCalledWith(false);
  expect(navigate).toHaveBeenCalledWith({ pathname: '/add', search: '?search=phone+query&userId=B' });

  restoreComparedCard({
    comparisonReturnRef, location: { key: 'comparison' }, setState, setSearch,
    setShowInfoModal, toast,
  });
  expect(setState).toHaveBeenLastCalledWith({});
  expect(setSearch).toHaveBeenCalledWith('phone query');
  expect(setShowInfoModal).toHaveBeenLastCalledWith('compareCards');
  expect(refresh).toHaveBeenCalledTimes(1);
});
