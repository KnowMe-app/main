// Відміна й повтор правок Flow, як «Назад / Вперед» у Word (17.11, на
// прохання власниці продукту). Кожна правка Flow — це латка черги записів
// (`{ шлях від кореня: значення }`), тож відміна — це латка навпаки: ті самі
// шляхи з тим, що лежало там до правки (`buildInverseFlowPatch`). Вона йде в
// базу тим самим шляхом, що й будь-яка правка (черга пристрою), тож працює й
// без звʼязку.
//
// Історія лежить на пристрої (`km.flowHistory.v1:{власник}`) три дні: людина,
// що закрила вкладку посеред роботи, може відкотити і вчорашнє. Старіше
// відкидається на читанні й записі. У ній суми й описи, тож вихід з акаунта її
// стирає разом із памʼяттю Flow (`clearFlowCache` без власника).

import { flowRootPath } from './flowOfflineWrites';

export const FLOW_HISTORY_KEY_PREFIX = 'km.flowHistory.v1:';
export const FLOW_HISTORY_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
export const FLOW_HISTORY_MAX_STEPS = 100;

const historyKey = ownerId => `${FLOW_HISTORY_KEY_PREFIX}${ownerId}`;

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const clone = value => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

const readAt = (data, segments) => {
  let node = data;
  for (const key of segments) {
    if (!isPlainObject(node) || !(key in node)) return null;
    node = node[key];
  }
  return clone(node);
};

/** Латка, що повертає дані Flow до стану перед `patch`. */
export const buildInverseFlowPatch = (data, patch, ownerId) => {
  const root = flowRootPath(ownerId);
  const inverse = {};
  Object.keys(patch || {}).forEach(path => {
    if (path === root) {
      inverse[path] = clone(data) || null;
      return;
    }
    if (!path.startsWith(`${root}/`)) return;
    const segments = path.slice(root.length + 1).split('/').filter(Boolean);
    inverse[path] = readAt(data, segments);
  });
  return inverse;
};

const isFresh = (entry, now) => Number(entry?.at) > now - FLOW_HISTORY_MAX_AGE_MS;

const sanitizeStack = (stack, now) =>
  (Array.isArray(stack) ? stack : [])
    .filter(entry => entry && isPlainObject(entry.patch) && isPlainObject(entry.inverse) && isFresh(entry, now))
    .slice(-FLOW_HISTORY_MAX_STEPS);

export const readFlowHistory = (ownerId, now = Date.now()) => {
  if (!ownerId) return { undo: [], redo: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(historyKey(ownerId)) || 'null');
    return { undo: sanitizeStack(parsed?.undo, now), redo: sanitizeStack(parsed?.redo, now) };
  } catch {
    return { undo: [], redo: [] };
  }
};

// Переповнене сховище — відкидаємо найстаріші кроки, а не всю історію.
export const writeFlowHistory = (ownerId, history, now = Date.now()) => {
  if (!ownerId) return history;
  let undo = sanitizeStack(history?.undo, now);
  let redo = sanitizeStack(history?.redo, now);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      if (!undo.length && !redo.length) localStorage.removeItem(historyKey(ownerId));
      else localStorage.setItem(historyKey(ownerId), JSON.stringify({ undo, redo }));
      return { undo, redo };
    } catch {
      undo = undo.slice(Math.ceil(undo.length / 2));
      redo = redo.slice(Math.ceil(redo.length / 2));
    }
  }
  return { undo, redo };
};

/**
 * Новий крок. Кілька записів однієї дії (збереження кількох рядків, імпорт)
 * приходять поспіль з тим самим `batch` і зливаються в один крок: відміна
 * знімає їх разом. Для злитого кроку «до» кожного шляху — найперше.
 * Новий крок стирає «Вперед», як у будь-якому редакторі.
 */
export const pushFlowHistoryStep = (
  history,
  { patch, inverse, label = '', batch = null, at = Date.now(), rename = null }
) => {
  const undo = [...(history?.undo || [])];
  const last = undo[undo.length - 1];
  if (batch && last && last.batch === batch) {
    undo[undo.length - 1] = {
      ...last,
      at,
      patch: { ...last.patch, ...patch },
      inverse: { ...inverse, ...last.inverse },
      ...(rename || last.rename ? { rename: last.rename || rename } : {}),
    };
  } else {
    // `rename` — назва групи до й після перейменування й чи йшли за нею група
    // надходжень і фільтр: відміна повертає їх разом із записами.
    undo.push({ at, label, batch, patch, inverse, ...(rename ? { rename } : {}) });
  }
  return { undo: undo.slice(-FLOW_HISTORY_MAX_STEPS), redo: [] };
};

export const clearFlowHistory = ownerId => {
  try {
    if (ownerId) {
      localStorage.removeItem(historyKey(ownerId));
      return;
    }
    Object.keys(localStorage)
      .filter(key => key.startsWith(FLOW_HISTORY_KEY_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  } catch {
    // нічого
  }
};
