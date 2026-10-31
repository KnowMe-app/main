import { classifyGetInTouchMark } from 'utils/reactionCategory';
import { normalizeCardListPlan } from 'utils/cardListPlan';
import { normalizeLastAction } from 'utils/normalizeLastAction';

/*
 * «Перелік з JSON-файлів» — джерело кандидатів для двигуна «Списку»
 * (`utils/cardListEngine`), а не окремий режим.
 *
 * Тут жив власний завантажувач офлайн-режиму зі своїм курсором, кешем і
 * фільтром `requireCurrentOrPastGetInTouch` на анкетах із файлів. Тільки у
 * файлах вузлів (`matchingCards`, `profileDetails`, …) позначки `getInTouch`
 * немає зовсім: вона належить тому, хто її поставив, і лежить у
 * `multiData/getInTouch/{власник}`. Фільтр «дата сьогодні й раніше» на таких
 * анкетах відкидав усіх, і список з файлів виходив порожнім. Тепер позначки
 * приходять мапою власника (одне читання), а склад, порядок і фільтри — ті
 * самі, що й у списку з бази: файли заміняють лише обхід бази.
 */

const compareCodeUnits = (left, right) => {
  const a = String(left ?? '');
  const b = String(right ?? '');
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

const hasMark = value => value !== undefined && value !== null && String(value).trim() !== '';

const SEGMENT_RANK = { due: 0, future: 1, undated: 2, never: 3 };

/**
 * Упорядкований перелік рядків `{ userId, getInTouch, lastAction? }` для
 * потоку `files` двигуна.
 *
 * Фільтри панелі (`accept`, тобто `filterMain`) застосовуються тут же, до
 * анкет із файлів: це той самий відсів, що індекс робить для бази, тільки
 * точний і без жодного запиту. Двигун однаково перевірить прийняте ще раз на
 * свіжій анкеті з бази.
 */
export const buildOfflineCardListRows = ({ profiles, marks = {}, plan, accept } = {}) => {
  const normalized = normalizeCardListPlan(plan);
  const entries = Object.entries(profiles || {}).map(([id, profile]) => {
    const userId = String(profile?.userId || id);
    const user = { ...(profile || {}), userId };
    const mark = marks?.[userId];
    if (hasMark(mark)) user.getInTouch = mark;
    else delete user.getInTouch;
    return [userId, user];
  });

  const inPlan = entries.filter(([, user]) => normalized.segments[classifyGetInTouchMark(user.getInTouch)]);
  const accepted = typeof accept === 'function' ? accept(inPlan) || [] : inPlan;

  if (normalized.byLastAction) {
    return accepted
      .map(([userId, user]) => ({ userId, getInTouch: user.getInTouch, lastAction: normalizeLastAction(user.lastAction) }))
      .filter(row => Number.isFinite(row.lastAction))
      .sort((a, b) => b.lastAction - a.lastAction || compareCodeUnits(b.userId, a.userId));
  }

  return accepted
    .map(([userId, user]) => ({ userId, getInTouch: user.getInTouch, segment: classifyGetInTouchMark(user.getInTouch) }))
    .sort((a, b) => {
      if (a.segment !== b.segment) return SEGMENT_RANK[a.segment] - SEGMENT_RANK[b.segment];
      // Той самий порядок, що й у бази: «кому дзвонити» — від сьогодні назад,
      // заплановані — від найближчої, решта — за ключем картки.
      if (a.segment === 'due') return compareCodeUnits(b.getInTouch, a.getInTouch) || compareCodeUnits(b.userId, a.userId);
      if (a.segment === 'future') return compareCodeUnits(a.getInTouch, b.getInTouch) || compareCodeUnits(a.userId, b.userId);
      return compareCodeUnits(a.userId, b.userId);
    })
    .map(({ segment, ...row }) => row);
};
