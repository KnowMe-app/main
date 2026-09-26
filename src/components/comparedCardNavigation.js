export const openComparedCard = async ({
  userId, refresh, fetchUserById, toast, comparisonReturnRef, location,
  search, setState, setShowInfoModal, navigate,
}) => {
  const user = await fetchUserById(userId);
  if (!user) {
    toast.error('Не вдалося завантажити анкету');
    return;
  }
  comparisonReturnRef.current = { key: location.key, search, refresh };
  const params = new URLSearchParams(location.search);
  params.set('userId', userId);
  if (search) params.set('search', search);
  setState(user);
  setShowInfoModal(false);
  navigate({ pathname: location.pathname, search: `?${params.toString()}` });
};

export const restoreComparedCard = ({
  comparisonReturnRef, location, setState, setSearch, setShowInfoModal, toast,
}) => {
  const previous = comparisonReturnRef.current;
  if (!previous || previous.key !== location.key) return;
  setState({});
  setSearch(previous.search);
  setShowInfoModal('compareCards');
  comparisonReturnRef.current = null;
  previous.refresh?.().catch(error => toast.error(`Не вдалося оновити порівняння: ${error?.message || error}`));
};
