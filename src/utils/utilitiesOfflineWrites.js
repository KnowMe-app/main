/**
 * Комуналка без звʼязку: оптимістичний запис і памʼять пристрою — той самий
 * шлях, що й у Flow (`utils/flowOfflineWrites`).
 *
 * Записи йдуть через спільну чергу пристрою (`utils/writeOutbox`): спершу на
 * диск, потім у базу, і досилаються самі, коли звʼязок повернувся (і з
 * наступної вкладки). Екран правку бачить одразу (`applyUtilitiesPatch`),
 * останній показаний стан лежить на пристрої (`km.utilitiesData.v1:{uid}`),
 * а відповідь сервера, що ще не знає недосланого, накривається чергою
 * (`overlayPendingUtilitiesWrites`) — інакше щойно внесений показник блимав
 * би й зникав.
 *
 * Тут же — латка навпаки для «Назад» (`buildInverseUtilitiesPatch`): відміна
 * пише в базу тією самою чергою, тож працює й без звʼязку.
 */

const CACHE_KEY_PREFIX = 'km.utilitiesData.v1:';

export const UTILITIES_OUTBOX_TYPE = 'utilities';

export const utilitiesRootPath = ownerId => `multiData/utilities/${ownerId}`;

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneData = data => {
  if (!isPlainObject(data)) return {};
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return { ...data };
  }
};

const setAtSegments = (root, segments, value) => {
  if (!segments.length) return;
  const trail = [];
  let node = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    if (!isPlainObject(node[key])) {
      if (value === null || value === undefined) return;
      node[key] = {};
    }
    trail.push([node, key]);
    node = node[key];
  }
  const last = segments[segments.length - 1];
  if (value === null || value === undefined) {
    delete node[last];
    // Порожні гілки знімаються: база їх теж не тримає.
    for (let i = trail.length - 1; i >= 0; i -= 1) {
      const [parent, key] = trail[i];
      if (isPlainObject(parent[key]) && Object.keys(parent[key]).length === 0) delete parent[key];
      else break;
    }
  } else {
    node[last] = isPlainObject(value) ? cloneData(value) : value;
  }
};

const readAtSegments = (root, segments) => {
  let node = root;
  for (const key of segments) {
    if (!isPlainObject(node) || !(key in node)) return undefined;
    node = node[key];
  }
  return node;
};

const relativeSegments = (path, ownerId) => {
  const root = utilitiesRootPath(ownerId);
  if (path === root) return [];
  if (!path.startsWith(`${root}/`)) return null;
  return path.slice(root.length + 1).split('/').filter(Boolean);
};

/** Накласти один запис черги (`{ шлях від кореня: значення }`). */
export const applyUtilitiesPatch = (data, patch, ownerId) => {
  let result = cloneData(data);
  if (!ownerId || !isPlainObject(patch)) return result;
  Object.entries(patch).forEach(([path, value]) => {
    const segments = relativeSegments(path, ownerId);
    if (segments === null) return;
    if (!segments.length) {
      result = isPlainObject(value) ? cloneData(value) : {};
      return;
    }
    setAtSegments(result, segments, value);
  });
  return result;
};

/**
 * Латка навпаки: для кожного шляху — значення, що лежало там до правки
 * (`null`, коли не було нічого). Шляхи, вкладені один в одного, рахуються
 * від того самого «до», тож порядок у латці значення не має.
 */
export const buildInverseUtilitiesPatch = (data, patch, ownerId) => {
  const inverse = {};
  if (!ownerId || !isPlainObject(patch)) return inverse;
  Object.keys(patch).forEach(path => {
    const segments = relativeSegments(path, ownerId);
    if (segments === null) return;
    const previous = segments.length ? readAtSegments(data, segments) : data;
    inverse[path] = previous === undefined ? null : cloneData({ v: previous }).v;
  });
  return inverse;
};

export const isUtilitiesPatchFor = (patch, ownerId) => {
  if (!ownerId || !isPlainObject(patch)) return false;
  return Object.keys(patch).some(path => relativeSegments(path, ownerId) !== null);
};

export const overlayPendingUtilitiesWrites = (data, ownerId, patches = []) =>
  (Array.isArray(patches) ? patches : [])
    .filter(patch => isUtilitiesPatchFor(patch, ownerId))
    .reduce((acc, patch) => applyUtilitiesPatch(acc, patch, ownerId), cloneData(data));

export const countPendingUtilitiesWrites = (ownerId, patches = []) =>
  (Array.isArray(patches) ? patches : []).filter(patch => isUtilitiesPatchFor(patch, ownerId)).length;

const cacheKey = ownerId => `${CACHE_KEY_PREFIX}${ownerId}`;

export const readUtilitiesCache = ownerId => {
  if (!ownerId) return null;
  try {
    const raw = localStorage.getItem(cacheKey(ownerId));
    const parsed = raw ? JSON.parse(raw) : null;
    return isPlainObject(parsed?.data) ? parsed.data : null;
  } catch {
    return null;
  }
};

export const writeUtilitiesCache = (ownerId, data) => {
  if (!ownerId) return;
  try {
    localStorage.setItem(cacheKey(ownerId), JSON.stringify({ savedAt: Date.now(), data: data || {} }));
  } catch {
    // Без місця на диску лишаємось без памʼяті пристрою — черга лежить окремо.
  }
};

/** Без власника — вихід з акаунта: на спільному пристрої суми не лишаються. */
export const clearUtilitiesCache = ownerId => {
  try {
    if (ownerId) {
      localStorage.removeItem(cacheKey(ownerId));
      return;
    }
    Object.keys(localStorage)
      .filter(key => key.startsWith(CACHE_KEY_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  } catch {
    // нічого
  }
};
