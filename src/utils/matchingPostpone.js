/*
 * «Повернутись пізніше» — відкладена картка стрічки.
 *
 * Анкета буває гарна, але не на зараз: пологи були пів року тому, донорка ще
 * відновлюється. Хрестик тут бреше («не цікаво»), а лайк ховає її серед
 * обраних. Відкладена картка лишається в стрічці, але стоїть **у кінці
 * списку**, доки не настане дата, — а дата стає тією самою позначкою
 * `getInTouch` («коли звʼязатись»), яку адмінка ставить на картці давно:
 * `multiData/getInTouch/{читач}/{картка}` = `YYYY-MM-DD`. Тож відкладене тут
 * видно й у списку «кому дзвонити», а дата, поставлена там, так само
 * відсуває картку в стрічці.
 *
 * Питання людині ставиться в місяцях від сьогодні («через 3 міс»), бо так
 * про відновлення й думають; у базу йде дата.
 */

export const POSTPONE_MONTH_OPTIONS = Object.freeze([1, 2, 3, 6, 9, 12]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = value => String(value).padStart(2, '0');

/** Дата в локальному часі — так само, як її ставить `fieldGetInTouch`. */
export const toIsoDate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const todayIsoDate = (now = new Date()) => toIsoDate(now);

/** Завтра — нижня межа запиту відкладених: сьогоднішня дата вже не відкладає. */
export const tomorrowIsoDate = (now = new Date()) => toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

/**
 * Сьогодні + N місяців. 31 січня + 1 місяць — це 28/29 лютого, а не 3
 * березня: `Date` переносив би надлишок днів у наступний місяць.
 */
export const addMonthsIsoDate = (months, now = new Date()) => {
  const target = new Date(now.getFullYear(), now.getMonth() + Number(months || 0), 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(now.getDate(), lastDay));
  return toIsoDate(target);
};

/** Позначка як дата — або порожньо, коли там не дата (стара нотатка тощо). */
export const readPostponeDate = value => {
  const raw = Array.isArray(value) ? value[value.length - 1] : value;
  const text = String(raw ?? '').trim();
  return ISO_DATE_RE.test(text) ? text : '';
};

/** Відкладена — дата пізніша за сьогодні. Сьогоднішня вже не відкладена. */
export const isPostponedUntil = (value, today = todayIsoDate()) => {
  const date = readPostponeDate(value);
  return Boolean(date) && date > today;
};

/** «03.01.2027» */
export const formatPostponeDate = value => {
  const date = readPostponeDate(value);
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
};

/**
 * Відкладені картки — у кінець списку, найближча дата першою; решта
 * зберігає свій порядок. Повертає той самий масив, коли нічого не відкладено:
 * мемоізація стрічки на ньому тримається.
 */
export const placePostponedCardsLast = (rows, readDate, today = todayIsoDate()) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const current = [];
  const postponed = [];
  rows.forEach(row => {
    const date = readPostponeDate(readDate(row));
    if (date && date > today) postponed.push({ row, date });
    else current.push(row);
  });
  if (!postponed.length) return rows;
  postponed.sort((a, b) => a.date.localeCompare(b.date));
  return [...current, ...postponed.map(item => item.row)];
};
