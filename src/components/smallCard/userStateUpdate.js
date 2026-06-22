export const getUserStateShape = state => {
  if (Array.isArray(state)) return 'array';
  if (!state || typeof state !== 'object') return 'unknown';
  if (state.userId) return 'single';
  const values = Object.values(state);
  if (values.length > 0 && values.every(value => value && typeof value === 'object')) {
    return 'map';
  }
  return 'single';
};

export const updateUserInState = (state, userId, updater) => {
  if (!state || typeof updater !== 'function') return state;
  const shape = getUserStateShape(state);

  if (shape === 'array') {
    let changed = false;
    const next = state.map(item => {
      if (!item || item.userId !== userId) return item;
      const updated = updater(item);
      if (updated !== item) changed = true;
      return updated;
    });
    return changed ? next : state;
  }

  if (shape === 'map') {
    const current = state[userId];
    if (!current || typeof current !== 'object') return state;
    const updated = updater(current);
    return updated === current ? state : { ...state, [userId]: updated };
  }

  if (shape === 'single') {
    if (state.userId && userId && state.userId !== userId) return state;
    const updated = updater(state);
    return updated === state ? state : updated;
  }

  return state;
};

export const markUserPendingRemove = (state, userId) =>
  updateUserInState(state, userId, user => ({ ...user, _pendingRemove: true }));
