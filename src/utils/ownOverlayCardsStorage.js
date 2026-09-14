/**
 * Які картки цей читач доповнював — памʼять пристрою.
 *
 * Оверлеї лежать під карткою (`multiData/edits/{картка}/{редактор}`), тож
 * питання «що я дописував» базі так просто не поставиш: щоб відповісти
 * перебором, стрічка мала б читати вузол на кожен свій рядок — рівно те, від
 * чого її відмивали (`docs/matching-feed-traffic.md`).
 *
 * Тому список карток ведеться двічі: у базі під власним uid
 * (`multiData/editsByEditor/{редактор}` — переживає зміну пристрою) і тут, у
 * `localStorage`. Локальна копія потрібна не заради швидкості: правила бази
 * викочуються руками (див. CLAUDE.md), і поки нового вузла в них немає, запис
 * у базу відбивається — а доповнення, зроблене в цьому ж браузері, читач має
 * бачити у стрічці одразу.
 *
 * Тут лежать самі лише id: що саме дописано, однаково читається з бази — інакше
 * стрічка показувала б значення, яке в базі вже прийняли або зняли.
 */

const STORAGE_KEY = 'km.ownOverlayCards.v1';

const readAll = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    // Заблокований або зіпсований `localStorage` коштує лише памʼяті про
    // дописане, а не самого доповнення.
    return {};
  }
};

const writeAll = value => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // те саме: мовчки й без наслідків для збереження оверлея
  }
};

export const readOwnOverlayCardIds = editorUserId => {
  if (!editorUserId) return [];
  const entry = readAll()[editorUserId];
  return entry && typeof entry === 'object' ? Object.keys(entry).filter(Boolean) : [];
};

export const rememberOwnOverlayCardLocally = (editorUserId, cardUserId) => {
  if (!editorUserId || !cardUserId) return;
  const all = readAll();
  const entry = { ...(all[editorUserId] || {}), [cardUserId]: Date.now() };
  writeAll({ ...all, [editorUserId]: entry });
};

export const forgetOwnOverlayCardLocally = (editorUserId, cardUserId) => {
  if (!editorUserId || !cardUserId) return;
  const all = readAll();
  const entry = all[editorUserId];
  if (!entry || !(cardUserId in entry)) return;
  const { [cardUserId]: removed, ...rest } = entry;
  writeAll({ ...all, [editorUserId]: rest });
};
