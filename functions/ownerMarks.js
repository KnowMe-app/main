'use strict';

/**
 * Версія позначок власника: `multiData/ownerMarksAt/{власник}/{вид}` = час
 * сервера останнього запису в `multiData/{вид}/{власник}/…`.
 *
 * Навіщо. Памʼятки, реакції, дати «Відкласти» й перелік «лише для
 * вподобаних» пристрій тримає шість годин (`utils/matchingCachePolicy`), а
 * журнал змін карток про них не знає: вони лежать не в картці. Тож памʼятку,
 * написану з телефона, ноутбук того самого читача (і спільні власники)
 * показував старою до TTL. Тепер пристрій раз на вкладку питає цей вузол — один
 * запит на власника — і забуває ті види, чия версія новіша за побачену.
 *
 * Чому тригер, а не писачі: писачів кілька (черга пристрою, форма адміна,
 * міграції, видалення акаунта в цих функціях), і пропущений писач лишав би
 * чужий пристрій зі старим. Клієнтам у вузол писати не треба зовсім.
 *
 * Вузол читає той самий коло, що й самі позначки (власник, адміни, спільні
 * власники), тож час останньої памʼятки нікому нового не розкриває.
 */
const OWNER_MARKS_ROOT = 'multiData';
const OWNER_MARKS_VERSION_ROOT = 'multiData/ownerMarksAt';
const OWNER_MARK_KINDS = ['comments', 'favorites', 'dislikes', 'getInTouch', 'likedAudience'];

const changesOwnerMark = (before, after) => JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);

/**
 * Строго зростає: два записи в ту саму мілісекунду (чи годинник сервера, що
 * відступив) не дають однакової версії, і пристрій, який бачив першу, не
 * пропустить другу.
 */
const stampOwnerMarkChange = async (ownerId, kind, { updateVersion, now = Date.now }) => {
  if (!ownerId || !OWNER_MARK_KINDS.includes(kind)) return;
  await updateVersion(`${OWNER_MARKS_VERSION_ROOT}/${ownerId}/${kind}`, previous => {
    const prev = Number(previous) || 0;
    return Math.max(now(), prev + 1);
  });
};

module.exports = {
  OWNER_MARKS_ROOT,
  OWNER_MARKS_VERSION_ROOT,
  OWNER_MARK_KINDS,
  changesOwnerMark,
  stampOwnerMarkChange,
};
