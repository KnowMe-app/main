export const FAVORITES_KEY = 'favorites';

export const getFavorites = () => {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || {};
  } catch {
    return {};
  }
};

export const setFavorite = (id, isFav) => {
  try {
    const favs = getFavorites();
    if (isFav) {
      favs[id] = true;
    } else {
      delete favs[id];
    }
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

