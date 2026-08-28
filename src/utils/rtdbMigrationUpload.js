/**
 * Заливка зібраних вузлів у RTDB — порціями і рівно в ті шляхи, де стоїть дозвіл.
 *
 * Досі єдиним шляхом у базу був ручний імпорт у консолі Firebase. Він працює,
 * але має дві незручності, які тут і знімаються. Перша: імпорт — це `set`, він
 * замінює вузол цілком, тож помилка на рівень вище зносить сусідні гілки.
 * Друга: файл треба спершу викачати, потім знайти в телефоні й залити руками.
 *
 * Тому заливка зроблена не одним `set` на корінь колекції, а серією `update`
 * на глибині самих записів:
 *
 *   update(ref('matchingCards'), { uid1: {...}, uid2: {...} })
 *   update(ref('multiData/getInTouch'), { 'owner/uid1': '2026-08-27' })
 *
 * Так вирішуються обидві речі одразу. По-перше, правила бази дають `.write`
 * саме на `matchingCards/$uid` і на `multiData/getInTouch/$ownerId/$userId`, а
 * на корені колекції `.write` немає взагалі — `set` туди отримав би
 * PERMISSION_DENIED, а порційний `update` проходить. По-друге, `update` не
 * чіпає сусідні записи: анкета, якої немає у файлі, лишається в базі як була.
 * Тобто заливка ДОПИСУЄ і ПЕРЕЗАПИСУЄ свої записи, але нічого не видаляє — на
 * відміну від імпорту в консолі. Видалення полів із `newUsers` так і лишається
 * ручним імпортом: воно незворотне, і між ним і людиною має стояти пауза.
 *
 * `depth` — на якій глибині лежить запис, за яким ділять на порції: 1 для
 * `profile*`/`matchingCards` (ключ = анкета), 2 для `multiData/{поле}` (ключ =
 * власник, а під ним анкета). Глибше йти не можна: об'єднати два рівні в один
 * ключ `owner/uid` — це і є той шлях, на якому база перевіряє дозвіл.
 */

/** Скільки записів іде одним `update`. */
export const UPLOAD_CHUNK_SIZE = 200;

/** Скільки разів пробувати порцію, перш ніж спинитись. */
export const UPLOAD_ATTEMPTS = 3;

/** Пауза між спробами, мс — росте лінійно з номером спроби. */
export const UPLOAD_RETRY_DELAY = 700;

/**
 * Символи, яких RTDB не приймає в назві ключа.
 *
 * Перевірка тут не з обережності взагалі: один непридатний ключ валить усю
 * порцію на 200 записів, і з повідомлення бази не видно, який саме. Дешевше
 * відкласти такий ключ убік і назвати його у звіті, ніж втратити 199 сусідів.
 */
const INVALID_KEY_CHARS = /[.#$[\]/]/;

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const wait = ms => new Promise(resolve => { setTimeout(resolve, ms); });

/**
 * Розкласти вузол на записи `шлях -> значення` заданої глибини.
 *
 * Порожні значення пропускаються свідомо: у `update` порожній об'єкт і `null`
 * означають видалення. Файл міграції їх не має, але сплутати «нічого не
 * переносив» із «зітри це» — надто дорога помилка, щоб покладатись на це.
 */
export const flattenUploadEntries = (payload, depth = 1) => {
  const entries = [];
  const skipped = { emptyValues: 0, invalidKeys: [] };

  const walk = (node, prefix, level) => {
    Object.entries(node).forEach(([key, value]) => {
      if (INVALID_KEY_CHARS.test(key)) {
        if (skipped.invalidKeys.length < 20) skipped.invalidKeys.push(prefix ? `${prefix}/${key}` : key);
        return;
      }

      const path = prefix ? `${prefix}/${key}` : key;

      if (level < depth && isPlainObject(value)) {
        walk(value, path, level + 1);
        return;
      }

      if (value === null || value === undefined) {
        skipped.emptyValues += 1;
        return;
      }
      if (isPlainObject(value) && Object.keys(value).length === 0) {
        skipped.emptyValues += 1;
        return;
      }

      entries.push([path, value]);
    });
  };

  if (isPlainObject(payload)) walk(payload, '', 1);

  return { entries, skipped };
};

/**
 * З якої порції починати, якщо `written` записів уже в базі.
 *
 * Округлення вниз, до початку порції, у якій цей запис лежить, — і саме вниз.
 * Обрив завжди приходиться на межу порції (вона або пройшла цілком, або не
 * пройшла зовсім), тож у звичайному випадку округляти нема чого. Але якщо
 * число прийшло не звідти — краще переписати кілька записів тими самими
 * значеннями, ніж перестрибнути через них: перезапис коштує секунду, пропуск
 * лишає діру, якої ніхто не побачить.
 */
export const resumeChunkIndex = (written, chunkSize = UPLOAD_CHUNK_SIZE) => {
  const size = Math.max(1, chunkSize);
  const done = Number.isFinite(written) && written > 0 ? Math.floor(written) : 0;
  return Math.floor(done / size);
};

/** Порізати список записів на порції по `chunkSize`. */
export const chunkUploadEntries = (entries, chunkSize = UPLOAD_CHUNK_SIZE) => {
  const size = Math.max(1, chunkSize);
  const chunks = [];
  for (let index = 0; index < entries.length; index += size) {
    chunks.push(Object.fromEntries(entries.slice(index, index + size)));
  }
  return chunks;
};

/** Скільки записів поїде в базу — те саме число, що показує підтвердження. */
export const countUploadEntries = (payload, depth = 1) => flattenUploadEntries(payload, depth).entries.length;

/**
 * Залити вузол порціями.
 *
 * `write(path, patch)` віддається зовні — сюди не веде жодного імпорту
 * Firebase, тож функція перевіряється тестом без бази. Помилка не кидається
 * вгору, а повертається разом із лічильником залитого: після обриву на
 * 12-тисячному записі важливо знати, що перші 12 тисяч уже в базі, і що
 * повторний запуск просто перепише їх тими самими значеннями.
 *
 * `resumeFrom` — скільки записів уже лежить у базі з минулого заходу. Заливка
 * тоді починається з порції, у якій цей запис лежить, а не з нуля. Перезапис
 * тими самими значеннями шкоди не робить — але на 26 тисячах анкет це зайві
 * хвилини з телефона і зайвий трафік, і головне: після обриву видно, скільки
 * лишилось, а не «знову з початку».
 *
 * Умова, за якої це чесно, одна: порядок записів той самий, що й минулого
 * разу. Порядок дає `flattenUploadEntries` з того самого `payload`, тож він
 * тримається, доки той самий стан і ті самі застосовані групи. Виправлення
 * самого значення порядку не міняє — ключі лишаються ті самі й на тих самих
 * місцях, — а от інший файл чи інший набір груп його зсуває, і тоді
 * продовжувати не можна, треба заливати з нуля.
 */
export const uploadCollection = async (payload, {
  path,
  depth = 1,
  chunkSize = UPLOAD_CHUNK_SIZE,
  attempts = UPLOAD_ATTEMPTS,
  retryDelay = UPLOAD_RETRY_DELAY,
  resumeFrom = 0,
  write,
  onProgress,
  shouldStop,
  sleep = wait,
} = {}) => {
  const { entries, skipped } = flattenUploadEntries(payload, depth);
  const chunks = chunkUploadEntries(entries, chunkSize);
  const startChunk = Math.min(resumeChunkIndex(resumeFrom, chunkSize), chunks.length);
  /*
   * Лічильник веде наскрізний рахунок від початку вузла, а не від місця
   * продовження: `written` і `total` мають лишитись тим самим «N з M», яке
   * людина бачила до обриву, інакше друга спроба звітує меншим числом, ніж
   * перша, і зрозуміти по ній, чи вузол долитий, неможливо.
   */
  const alreadyWritten = chunks
    .slice(0, startChunk)
    .reduce((sum, chunk) => sum + Object.keys(chunk).length, 0);
  const result = {
    path,
    total: entries.length,
    written: alreadyWritten,
    chunks: chunks.length,
    chunksWritten: startChunk,
    resumedFrom: alreadyWritten,
    skipped,
    stopped: false,
    error: null,
  };

  if (typeof onProgress === 'function') onProgress({ ...result });

  for (let index = startChunk; index < chunks.length; index += 1) {
    if (typeof shouldStop === 'function' && shouldStop()) {
      result.stopped = true;
      return result;
    }

    const chunk = chunks[index];
    const size = Object.keys(chunk).length;
    let lastError = null;

    for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await write(path, chunk);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        /*
         * PERMISSION_DENIED не лікується повтором: це не мережа, а правило
         * бази. Повторювати його тричі — це тільки втратити секунди й
         * заплутати того, хто читає тост.
         */
        if (String(error?.message || error).includes('PERMISSION_DENIED')) break;
        // eslint-disable-next-line no-await-in-loop
        if (attempt < attempts) await sleep(retryDelay * attempt);
      }
    }

    if (lastError) {
      result.error = lastError;
      return result;
    }

    result.written += size;
    result.chunksWritten += 1;
    if (typeof onProgress === 'function') onProgress({ ...result });
  }

  return result;
};
