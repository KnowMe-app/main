/**
 * Flow без звʼязку: оптимістичний запис і памʼять пристрою.
 *
 * Чому. Flow писав у базу прямим `set`/`remove` і чекав на відповідь, а
 * потім перечитував усе (`fetchFlowData`). Без звʼязку SDK тримає запис лише
 * в памʼяті вкладки, `get` висить, тож внесене не зʼявлялось на екрані, а
 * закрита вкладка губила його зовсім — платіж, внесений у дорозі, просто
 * зникав.
 *
 * Як. Записи Flow йдуть через спільну чергу пристрою (`utils/writeOutbox`):
 * спершу на диск, потім у базу, і досилаються самі, щойно звʼязок
 * повернувся (зокрема з наступної вкладки — `startWriteOutbox` на вході).
 * Екран правку бачить одразу: зміни черги накладаються на дані Flow тут
 * (`applyFlowPatch`), а останній показаний стан лежить на пристрої
 * (`km.flowData.v1:{uid}`), тож Flow відкривається й без мережі. Відповідь
 * сервера, що ще не знає недосланого, накривається чергою
 * (`overlayPendingFlowWrites`), інакше щойно внесене блимало б і зникало.
 */

const CACHE_KEY_PREFIX = 'km.flowData.v1:';
// Той самий префікс, що в `utils/flowHistory` (імпорт звідти дав би цикл).
const FLOW_HISTORY_KEY_PREFIX = 'km.flowHistory.v1:';

export const flowRootPath = ownerId => `multiData/flow/${ownerId}`;

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneData = data => {
  if (!isPlainObject(data)) return {};
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return { ...data };
  }
};

const setAtPath = (root, segments, value) => {
  if (!segments.length) return;
  // Порожні гілки після видалення знімаються: база їх теж не тримає, а
  // порожня група на екрані виглядала б як група без записів.
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
    for (let i = trail.length - 1; i >= 0; i -= 1) {
      const [parent, key] = trail[i];
      if (isPlainObject(parent[key]) && Object.keys(parent[key]).length === 0) delete parent[key];
      else break;
    }
  } else {
    node[last] = isPlainObject(value) ? cloneData(value) : value;
  }
};

/**
 * Накласти один запис черги (`{ шлях від кореня: значення }`) на дані Flow
 * власника. Шляхи поза `multiData/flow/{власник}` пропускаються.
 */
export const applyFlowPatch = (data, patch, ownerId) => {
  const next = cloneData(data);
  if (!ownerId || !isPlainObject(patch)) return next;
  const root = flowRootPath(ownerId);
  let result = next;
  Object.entries(patch).forEach(([path, value]) => {
    if (path === root) {
      result = isPlainObject(value) ? cloneData(value) : {};
      return;
    }
    if (!path.startsWith(`${root}/`)) return;
    const segments = path.slice(root.length + 1).split('/').filter(Boolean);
    setAtPath(result, segments, value);
  });
  return result;
};

/** Накласти всі ще не доставлені записи Flow цього власника. */
export const overlayPendingFlowWrites = (data, ownerId, patches = []) =>
  (Array.isArray(patches) ? patches : []).reduce(
    (acc, patch) => applyFlowPatch(acc, patch, ownerId),
    cloneData(data)
  );

export const isFlowPatchFor = (patch, ownerId) => {
  if (!ownerId || !isPlainObject(patch)) return false;
  const root = flowRootPath(ownerId);
  return Object.keys(patch).some(path => path === root || path.startsWith(`${root}/`));
};

export const countPendingFlowWrites = (ownerId, patches = []) =>
  (Array.isArray(patches) ? patches : []).filter(patch => isFlowPatchFor(patch, ownerId)).length;

const cacheKey = ownerId => `${CACHE_KEY_PREFIX}${ownerId}`;

export const readFlowCache = ownerId => {
  if (!ownerId) return null;
  try {
    const raw = localStorage.getItem(cacheKey(ownerId));
    const parsed = raw ? JSON.parse(raw) : null;
    return isPlainObject(parsed?.data) ? parsed.data : null;
  } catch {
    return null;
  }
};

export const writeFlowCache = (ownerId, data) => {
  if (!ownerId) return;
  try {
    localStorage.setItem(cacheKey(ownerId), JSON.stringify({ savedAt: Date.now(), data: data || {} }));
  } catch {
    // Без місця на диску Flow лишається без памʼяті пристрою — дані в черзі
    // однаково лежать окремо й досилаються.
  }
};

/** Вихід з акаунта: Flow — особисті фінанси, на спільному пристрої не лишаються. */
export const clearFlowCache = ownerId => {
  try {
    if (ownerId) {
      localStorage.removeItem(cacheKey(ownerId));
      return;
    }
    // Без власника — вихід з акаунта: разом із памʼяттю Flow іде й історія
    // відміни (`utils/flowHistory`), у ній ті самі суми й описи.
    Object.keys(localStorage)
      .filter(key => key.startsWith(CACHE_KEY_PREFIX) || key.startsWith(FLOW_HISTORY_KEY_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  } catch {
    // нічого
  }
};

/** Піддерево за шляхом відносно кореня Flow (`група/підгрупа`). */
export const readFlowSubtree = (data, relativePath) => {
  const segments = String(relativePath || '').split('/').filter(Boolean);
  let node = data;
  for (const key of segments) {
    if (!isPlainObject(node) || !(key in node)) return undefined;
    node = node[key];
  }
  return node;
};

/**
 * Листки піддерева як окремі шляхи. Запис Flow — рядок або обʼєкт формули
 * (`{ amount, … }`); він лишається цілим, а не розсипається на поля.
 */
export const listFlowLeaves = (node, prefix = '') => {
  if (!isPlainObject(node) || 'amount' in node) return prefix ? [[prefix, node]] : [];
  return Object.entries(node).flatMap(([key, child]) =>
    listFlowLeaves(child, prefix ? `${prefix}/${key}` : key)
  );
};
