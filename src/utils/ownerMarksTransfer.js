import { appendComparisonText } from './comparisonValues';

/**
 * Позначки власника про картку — те, що лежить у `multiData/{вид}/{власник}/{картка}`:
 * нотатка, реакція (обране чи «не цікаво») і дата дзвінка.
 *
 * Дубль картки закривають, а позначки під його id лишались сиротами: ні
 * перенести їх на справжню картку, ні прибрати адмін не міг, бо чужі реакції
 * правила пускали писати лише самому власнику. Тепер повні адміни пишуть їх за
 * будь-якого власника (`database.rules.json`), а що куди лягає, вирішує цей
 * модуль — один план і для переносу, і для прибирання.
 */
export const OWNER_MARK_KINDS = ['comments', 'favorites', 'dislikes', 'getInTouch'];
export const OWNER_REACTION_KINDS = ['favorites', 'dislikes'];

export const ownerMarkPath = (kind, ownerId, cardId) => `multiData/${kind}/${ownerId}/${cardId}`;

const hasValue = value => value !== null && value !== undefined && value !== '' && value !== false;
const commentText = value => (typeof value?.text === 'string' ? value.text.trim() : '');

/**
 * Чи є в цього власника про картку хоч щось. Порожня нотатка позначкою не
 * вважається — така лишається після стирання тексту.
 */
export const hasOwnerMarks = (marks = {}) => OWNER_MARK_KINDS.some(kind => (
  kind === 'comments' ? !!commentText(marks.comments) : hasValue(marks[kind])
));

/**
 * План переносу позначок одного власника з `sourceCardId` на `targetCardId`.
 *
 * - **нотатка**: на отримувачі порожньо — переїжджає як є (з датою); є своя —
 *   тексти зливаються (`appendComparisonText`, той самий, що в рядку
 *   `myComment` порівняння), а дата береться новіша;
 * - **реакція**: обране й «не цікаво» взаємовиключні, тож це одне рішення —
 *   якщо власник уже відповів на отримувача, його відповідь лишається, інакше
 *   переїжджає відповідь з дубля;
 * - **дата дзвінка**: переїжджає лише туди, де її немає (дизлайк пише її
 *   `2099-99-99`, і переносити її окремо від дизлайку не можна).
 *
 * Із дубля знімається все — і те, що переїхало, і те, що програло отримувачу:
 * дубль іде на видалення, і лишене там було б тим самим сміттям.
 */
export const planOwnerMarksTransfer = ({ ownerId, sourceCardId, targetCardId, source = {}, target = {} }) => {
  const patch = {};
  const moved = [];
  if (!ownerId || !sourceCardId || !targetCardId || sourceCardId === targetCardId) return { patch, moved };

  const sourceText = commentText(source.comments);
  if (sourceText) {
    const targetText = commentText(target.comments);
    const merged = appendComparisonText(targetText, sourceText);
    if (merged !== targetText) {
      const updatedAt = Math.max(Number(source.comments?.updatedAt) || 0, Number(target.comments?.updatedAt) || 0)
        || Date.now();
      patch[ownerMarkPath('comments', ownerId, targetCardId)] = { text: merged, updatedAt };
      moved.push('comments');
    }
  }
  if (source.comments !== undefined && source.comments !== null) {
    patch[ownerMarkPath('comments', ownerId, sourceCardId)] = null;
  }

  const targetReacted = OWNER_REACTION_KINDS.some(kind => hasValue(target[kind]));
  OWNER_REACTION_KINDS.forEach(kind => {
    if (!hasValue(source[kind])) return;
    if (!targetReacted) {
      patch[ownerMarkPath(kind, ownerId, targetCardId)] = source[kind];
      moved.push(kind);
    }
    patch[ownerMarkPath(kind, ownerId, sourceCardId)] = null;
  });

  if (hasValue(source.getInTouch)) {
    if (!hasValue(target.getInTouch)) {
      patch[ownerMarkPath('getInTouch', ownerId, targetCardId)] = source.getInTouch;
      moved.push('getInTouch');
    }
    patch[ownerMarkPath('getInTouch', ownerId, sourceCardId)] = null;
  }

  return { patch, moved };
};

/** План прибирання: усі позначки власника про картку — геть. */
export const planOwnerMarksRemoval = ({ ownerId, cardId, marks = {} }) => {
  const patch = {};
  if (!ownerId || !cardId) return { patch };
  OWNER_MARK_KINDS.forEach(kind => {
    if (marks[kind] !== undefined && marks[kind] !== null) patch[ownerMarkPath(kind, ownerId, cardId)] = null;
  });
  return { patch };
};

/** Короткий підпис позначок для таблиці порівняння. */
export const describeOwnerMarks = (marks = {}) => {
  const parts = [];
  const text = commentText(marks.comments);
  if (text) parts.push(`📝 ${text}`);
  if (hasValue(marks.favorites)) parts.push('❤ обране');
  if (hasValue(marks.dislikes)) parts.push('👎 не цікаво');
  if (hasValue(marks.getInTouch)) parts.push(`📅 ${marks.getInTouch}`);
  return parts;
};
