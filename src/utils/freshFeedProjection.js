import { readCardRevision } from './matchingCardIndex';

/**
 * Свіжа проєкція картки стрічки (прочитана сторожем стану) замість кешованої.
 *
 * Це **заміна**, а не латка: проєкція — повний знімок картки, а порожні поля в
 * ній не пишуться зовсім (`buildMatchingCardProjection`). Злиття поверх старої
 * (`{ ...old, ...fresh }`) лишало б стерте — місто, назву агенції, `programsAt`
 * знятих програм (і стрічка показувала б з кешу програми, яких уже немає).
 * Від старої лишаються лише клієнтські позначки (`__…`: порядок чернеток,
 * пачка наданого доступу тощо) — їх у базі немає й бути не може.
 *
 * Старіша за показану версією анкети (`rev`) свіжа картка не стає: відповідь
 * сторожа могла приїхати вже після сторінки, що принесла новішу.
 *
 * @returns {object} `current`, коли міняти нічого (React не перемальовує).
 */
export const replaceFeedProjection = (current, fresh) => {
  if (!current || !fresh || typeof fresh !== 'object') return current;
  if (readCardRevision(fresh) < readCardRevision(current)) return current;
  const clientMarks = Object.fromEntries(Object.entries(current).filter(([key]) => key.startsWith('__')));
  const next = { ...clientMarks, ...fresh };
  const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
  const same = [...keys].every(key => JSON.stringify(current[key]) === JSON.stringify(next[key]));
  return same ? current : next;
};

/** Ті самі заміни на списку; без змін повертає той самий масив. */
export const replaceFeedProjections = (users, freshById, isProjection) => {
  if (!Array.isArray(users) || !freshById) return users;
  let changed = false;
  const next = users.map(user => {
    const fresh = user?.userId ? freshById[user.userId] : null;
    if (!fresh || !isProjection(user)) return user;
    const replaced = replaceFeedProjection(user, fresh);
    if (replaced !== user) changed = true;
    return replaced;
  });
  return changed ? next : users;
};
