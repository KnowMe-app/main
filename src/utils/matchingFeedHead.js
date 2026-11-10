/**
 * Верх стрічки на кожному відкритті з кешу.
 *
 * Список стрічки вважається свіжим від останньої дочитаної сторінки
 * (`pagination.savedAt`), і кожна дочитана сторінка продовжує йому життя ще на
 * TTL. З кешем `loadInitial` показує збережене й гортає далі від курсора, а
 * першої сторінки не перечитує. Тож той, хто заходить щодня й гортає, нових
 * анкет угорі не бачив зовсім — доки не мине шість годин без гортання або доки
 * не натисне «Почати стрічку заново» (а та ще й скидає фільтри).
 *
 * Тепер після показу деки з кешу у фоні читається перша порція з голови
 * стрічки — той самий запит, що на холодному старті, проєкції по ~0,2 КБ, — і
 * те, чого в деці немає, стає нагору. Колись тут уже перечитували першу
 * сторінку й прибрали: тоді сторінкою були повні анкети з `users`.
 */

/** Анкети з голови стрічки, яких у показаній деці ще немає, — у порядку стрічки. */
export const selectFreshFeedHead = ({ headUsers, knownIds }) => {
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds || []);
  const seen = new Set();
  return (Array.isArray(headUsers) ? headUsers : []).filter(user => {
    const id = user?.userId;
    if (!id || known.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

/** Дека з новими анкетами нагорі; тих, що вже в ній, удруге не додає. */
export const prependFeedHead = (users, fresh) => {
  const current = Array.isArray(users) ? users : [];
  const add = selectFreshFeedHead({ headUsers: fresh, knownIds: current.map(user => user?.userId) });
  return add.length ? [...add, ...current] : current;
};

/**
 * Нове ставиться нагору одразу лише тоді, коли людина й так угорі. Посеред
 * стрічки вставка над екраном зсунула б рядок під пальцем (Safari прокрутку
 * не прив'язує), тож там нове чекає на плашку «Нові анкети: N».
 */
export const FEED_HEAD_PREPEND_SCROLL_LIMIT = 160;

export const shouldPrependFeedHeadNow = scrollY => !(Number(scrollY) > FEED_HEAD_PREPEND_SCROLL_LIMIT);
