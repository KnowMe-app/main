'use strict';

/**
 * Журнал змін карток стрічки: `matchingCardChanges/{картка}` = час сервера
 * останнього запису в `matchingCards/{картка}`.
 *
 * Навіщо. Кеш пристрою досі вирішував «чи картка ще та сама» годинником
 * (шість годин) і точковою перевіркою кожної показаної картки — 10 запитів на
 * кожне тепле перезавантаження стрічки, навіть коли не змінилось нічого. З
 * журналом пристрій питає один раз: «що змінилось після мого останнього
 * разу», — і перечитує лише змінене.
 *
 * Чому тригер, а не писачі. Писачів картки десяток — збереження анкети, дата
 * входу, приховування, програми, відгуки, порівняння дублікатів, роботи
 * адміна, видалення акаунта в цих же функціях — і пропущений писач означав би
 * картку, застарілу в кожного читача аж до страховки TTL. Тригер бачить кожен
 * запис, хоч би хто його зробив, а клієнтам у журнал писати не треба зовсім
 * (правила його й не пускають).
 *
 * У журналі лише id і кошик часу: ні вмісту картки, ні того, сховали її чи
 * змінили; сховані картки й щоденний вхід туди не потрапляють зовсім.
 * Схованість читач однаково дізнається з самої картки, а її правила
 * відкривають не кожному.
 */
const MATCHING_CARDS_ROOT = 'matchingCards';
const MATCHING_CARD_CHANGES_ROOT = 'matchingCardChanges';

/**
 * Час у журналі — 15-хвилинний кошик, а не мітка до мілісекунди: журнал
 * читає кожен, хто увійшов, і точний час розкривав би, коли людина правила
 * анкету. Пристрій перекриває вікно на більше за кошик
 * (`CARD_CHANGES_OVERLAP_MS` у застосунку), тож запис не губиться.
 */
const CARD_CHANGE_BUCKET_MS = 15 * 60 * 1000;
const bucketCardChangeTime = ms => Math.floor(ms / CARD_CHANGE_BUCKET_MS) * CARD_CHANGE_BUCKET_MS;

const isDateFeed = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Картку видно комусь поза власницею: дата в стрічці або коло вподобаних. */
const isCardVisible = card => Boolean(card) && typeof card === 'object'
  && (isDateFeed(card.feedDate) || card.audience === 'liked');

/**
 * Чи писати цей запис у журнал.
 *
 * - Картка поза стрічкою до й після (схована, видалена, неопублікована) —
 *   ні: журнал читає кожен, і такий запис розкривав би, що людина зі
 *   схованою анкетою щось правила. Перехід «видно → сховано» — так: без
 *   нього пристрої далі показували б анкету з кешу.
 * - Змінилась сама дата в стрічці (вхід раз на день) — ні: це мітка
 *   активності людини, а для кешу вона лише порядок, не видимість.
 */
const shouldRecordCardChange = (before, after) => {
  if (!isCardVisible(before) && !isCardVisible(after)) return false;
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changed = [...keys].filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    if (changed.length === 1 && changed[0] === 'feedDate'
      && isDateFeed(before.feedDate) && isDateFeed(after.feedDate)) return false;
  }
  return true;
};

/** Шлях запису журналу для картки, або `null`, коли id непридатний. */
const buildCardChangePath = cardId => {
  const id = typeof cardId === 'string' ? cardId.trim() : '';
  if (!id || /[.#$\[\]/]/.test(id)) return null;
  return `${MATCHING_CARD_CHANGES_ROOT}/${id}`;
};

/**
 * Обробник тригера: пише кошик часу сервера функцій у журнал. `setValue` —
 * запис Admin SDK, винесений, щоб тестувати без мережі.
 */
const recordCardChange = async (cardId, { before, after, now = Date.now(), setValue }) => {
  const path = buildCardChangePath(cardId);
  if (!path) return false;
  // Картку видалено, коли її вже ніхто не бачив (очищення акаунта після
  // приховування): запис журналу знімається — id картки, якої більше немає,
  // не мусить лишатись у переліку, який читає кожен.
  if ((after === null || after === undefined) && !isCardVisible(before)) {
    await setValue(path, null);
    return false;
  }
  if (!shouldRecordCardChange(before, after)) return false;
  await setValue(path, bucketCardChangeTime(now));
  return true;
};

module.exports = {
  CARD_CHANGE_BUCKET_MS,
  bucketCardChangeTime,
  shouldRecordCardChange,
  MATCHING_CARDS_ROOT,
  MATCHING_CARD_CHANGES_ROOT,
  buildCardChangePath,
  recordCardChange,
};
