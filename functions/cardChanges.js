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
 * У журналі лише id і час: ні вмісту картки, ні того, сховали її чи змінили.
 * Схованість читач однаково дізнається з самої картки, а її правила
 * відкривають не кожному.
 */
const MATCHING_CARDS_ROOT = 'matchingCards';
const MATCHING_CARD_CHANGES_ROOT = 'matchingCardChanges';

/** Шлях запису журналу для картки, або `null`, коли id непридатний. */
const buildCardChangePath = cardId => {
  const id = typeof cardId === 'string' ? cardId.trim() : '';
  if (!id || /[.#$\[\]/]/.test(id)) return null;
  return `${MATCHING_CARD_CHANGES_ROOT}/${id}`;
};

/**
 * Обробник тригера: пише час сервера в журнал. `setValue(path)` — запис
 * `ServerValue.TIMESTAMP` (Admin SDK), винесений, щоб тестувати без мережі.
 */
const recordCardChange = async (cardId, { setTimestamp }) => {
  const path = buildCardChangePath(cardId);
  if (!path) return false;
  await setTimestamp(path);
  return true;
};

module.exports = {
  MATCHING_CARDS_ROOT,
  MATCHING_CARD_CHANGES_ROOT,
  buildCardChangePath,
  recordCardChange,
};
