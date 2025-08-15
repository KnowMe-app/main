export const FAVORITES_KEY = 'favorites';

export const getFavorites = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY)) || {};
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, !!v]),
    );
  } catch {
    return {};
  }
};

export const setFavorite = (id, isFav) => {
  try {
    const favs = getFavorites();
    favs[id] = !!isFav;
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  } catch {
    // ignore write errors
  }
};

export const syncFavorites = remoteFavs => {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(remoteFavs || {}));
  } catch {
    // ignore write errors
  }
};

