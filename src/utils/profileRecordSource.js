import {
  fetchProfileDraftById,
  fetchUserById,
  setOwnerGetInTouch,
  setOwnerStimulationSchedule,
  setOwnerWriter,
} from 'components/config';
import { OWNER_MULTI_DATA_FIELD_NAMES } from 'utils/profileNodeSchema';
import { loadProfileMutation, saveCreateProfileMutation } from 'utils/profileMutations';

// Чернетку щойно записано (будь-ким у цьому табі): форма адміна перечитує
// її журнал. Подія окрема від «усі поля», бо та перечитує ще й пропозиції
// редакторів, а тут змінився лише журнал чернетки.
export const PROFILE_DRAFT_SAVED_EVENT = 'knowme:profile-draft-saved';

/*
 * Звідки береться і куди пишеться анкета, яку відкрила форма.
 *
 * Записів анкети два різні, і живуть вони в різних місцях:
 *
 *   готова анкета — вузли `matchingCards`, `profileDetails`, `profileContacts`,
 *                   `profileWorkflow`, `profileTechnical` (див. `profileNodeSchema`);
 *   чернетка      — один запис `multiData/profileMutations/{автор}/{картка}`,
 *                   поле `data`, і журнал змін `multiData/profileMutationHistory/{картка}`.
 *
 * Форма адміна (`AddNewProfile`, `EditProfile`, `ProfileForm`) знала лише перше.
 * Чернетку вона отримувала з видачі пошуку чи з кеша карток, а далі
 * поводилась із нею як із готовою анкетою: перечитування («усі поля»)
 * питало `profileContacts/{id}` і отримувало порожнечу — тобто лишало на
 * екрані старе; збереження писало у вузли готової анкети, яких у чернетки
 * немає, — тобто заводило поруч із чернеткою другу, напівготову картку, а сама
 * чернетка й її журнал правку адміна не бачили зовсім.
 *
 * Тепер питання «звідки» вирішує це одне місце: запис, що прийшов чернеткою,
 * несе адресу свого джерела (`__profileMutationCreatedBy`, ревізію), і
 * читання, запис та посилання в консоль ідуть за нею.
 */

export const isDraftProfileRecord = record => record?.__profileMutationOperation === 'create';

export const getDraftRecordCreator = record => String(record?.__profileMutationCreatedBy || '').trim();

/**
 * Шлях до даних чернетки в базі — для посилань форми в консоль. Посилання
 * блоку «Контакти» чернетки на `profileContacts/{id}` вело в `null` і саме так
 * виглядало як «контактів немає», хоч вони лежали в чернетці.
 */
export const getDraftRecordDataSegments = record => {
  const creator = getDraftRecordCreator(record);
  const cardId = String(record?.userId || '').trim();
  if (!isDraftProfileRecord(record) || !creator || !cardId) return null;
  return ['multiData', 'profileMutations', creator, cardId, 'data'];
};

/*
 * Ревізія, з якою цей таб востаннє бачив чи писав чернетку.
 *
 * Форма адміна тримає знімок усієї анкети і на збереженні подає його цілком.
 * Якщо автор тим часом зберіг своє, такий знімок затер би його правку мовчки.
 * Тож запис іде лише поверх тієї ревізії, яку форма й показувала; чужа
 * новіша ревізія — це відмова з поясненням, а не тихе перезаписування.
 * Тримається в модулі, а не в стані React: збереження стоять у черзі, і кожне
 * наступне мусить знати ревізію, яку записало попереднє.
 */
const knownDraftRevisions = new Map();

export const rememberDraftRecordRevision = record => {
  if (!isDraftProfileRecord(record) || !record?.userId) return;
  knownDraftRevisions.set(record.userId, Number(record.__profileMutationRevision) || 0);
};

export const forgetDraftRecordRevisions = () => knownDraftRevisions.clear();

/**
 * Анкета за id з того джерела, де вона справді лежить.
 *
 * `prefer: 'draft'` — коли форма вже знає, що тримає чернетку: тоді перший і
 * єдиний запит іде за адресою чернетки. Без підказки першими питаються вузли
 * готової анкети (так було й доти, і для готових анкет нічого не змінюється),
 * а чернетка — лише коли вузлів немає.
 */
export const fetchProfileRecordById = async (cardId, { prefer = '', creatorUid = '' } = {}) => {
  const id = String(cardId || '').trim();
  if (!id) return null;

  // Ревізію тут не запамʼятовуємо: її памʼятає той, хто запис справді взяв
  // у форму (`rememberDraftRecordRevision`). Прочитане й відкинуте — бо адмін
  // уже щось правив — не має права стати базою для його збереження.
  const readDraft = () => fetchProfileDraftById(id, { creatorUid });

  if (prefer === 'draft') {
    // Прийнята (опублікована) чернетка за цією адресою вже не віддається —
    // тоді анкета живе у вузлах, і саме там її й треба читати.
    return (await readDraft()) || fetchUserById(id);
  }
  return (await fetchUserById(id)) || readDraft();
};

/**
 * Поля, які форма тримає поруч з анкетою, але які анкетою не є.
 *
 * `lastAction` форма ставить на кожне збереження, `age` рахує з дати
 * народження, `photos` дочитує зі Storage, `myComment` — особиста памʼятка
 * адміна з `multiData/comments`. У журналі чернетки вони стали б «правками»,
 * а памʼятка адміна — ще й текстом, який побачить автор.
 */
// Сюди ж — особисті позначки адміна щодо картки (`getInTouch`, `writer`,
// графік стимуляції): у готової анкети вони теж лежать не в ній, а під
// адміном у `multiData` (`fanOutProfileNodes`), і в чернетці їх побачив би автор.
const FORM_ONLY_KEYS = new Set([
  'lastAction', 'age', 'photos', 'cacheVersion', 'myComment', ...OWNER_MULTI_DATA_FIELD_NAMES,
]);

// Ті самі позначки, що й для готової анкети, — під тим, хто їх поставив.
const OWNER_FIELD_WRITERS = {
  getInTouch: setOwnerGetInTouch,
  writer: setOwnerWriter,
  stimulationSchedule: setOwnerStimulationSchedule,
};

const isDraftDataKey = key => key && !key.startsWith('__') && !FORM_ONLY_KEYS.has(key);

/**
 * Дані чернетки з того, що подала форма.
 *
 * Поле, яке форма прибрала (`deletedKeys` чи `null`), у даних не лишається —
 * і журнал записує його стирання. Поля, яких форма не знає (`FORM_ONLY_KEYS`),
 * беруться з чинної чернетки як є, щоб збереження адміна їх не чіпало.
 */
export const buildDraftRecordData = (currentData = {}, submitted = {}, deletedKeys = []) => {
  const removed = new Set((deletedKeys || []).filter(Boolean));
  const next = {};
  Object.entries(currentData || {}).forEach(([key, value]) => {
    if (FORM_ONLY_KEYS.has(key) && value !== undefined) next[key] = value;
  });
  Object.entries(submitted || {}).forEach(([key, value]) => {
    if (!isDraftDataKey(key) || removed.has(key)) return;
    if (value === null || value === undefined) return;
    next[key] = value;
  });
  return next;
};

export const DRAFT_CHANGED_ELSEWHERE = 'DRAFT_CHANGED_ELSEWHERE';

/**
 * Записати правку форми в саму чернетку — тим самим шляхом, яким пише автор
 * (`saveCreateProfileMutation`): ревізія, журнал `profileMutationHistory`,
 * заявки на унікальність і `searchId` чернетки. Дописувати у вузли готової
 * анкети тут нема чого: чернетку публікує окреме рішення адміна.
 */
/**
 * `baseRevision` — ревізія, на якій зібрано `submitted`, коли її знає сам
 * виклик: прийняте доповнення складається з щойно прочитаної чернетки, і
 * памʼять форми про давнішу ревізію тут ні до чого. Форма її не передає —
 * для неї базою є те, що вона показувала й записувала.
 */
export const saveDraftProfileRecord = async ({ submitted, deletedKeys = [], actorUid, baseRevision }) => {
  const cardId = String(submitted?.userId || '').trim();
  const creatorUid = getDraftRecordCreator(submitted);
  if (!cardId || !creatorUid || !actorUid) {
    throw new Error('Чернетку не записано: невідомо, чия вона чи хто її править');
  }

  const current = await loadProfileMutation(creatorUid, cardId);
  if (!current) throw new Error('Чернетки вже немає — її видалили або опублікували');

  // Ревізію, записану цим табом, памʼятає модуль; якщо її ще немає (запис
  // прийшов із видачі пошуку), то ту, з якою запис приїхав у форму.
  const knownRevision = baseRevision !== undefined
    ? Number(baseRevision)
    : knownDraftRevisions.has(cardId)
    ? knownDraftRevisions.get(cardId)
    : (Number.isFinite(Number(submitted.__profileMutationRevision)) && submitted.__profileMutationRevision !== undefined
      ? Number(submitted.__profileMutationRevision)
      : undefined);
  if (knownRevision !== undefined && Number(current.revision) !== knownRevision) {
    const error = new Error(
      'Чернетку змінили після того, як її відкрили. Перечитайте її («усі поля») і повторіть правку.'
    );
    error.code = DRAFT_CHANGED_ELSEWHERE;
    throw error;
  }

  const removed = new Set(deletedKeys || []);
  await Promise.all(Object.entries(OWNER_FIELD_WRITERS)
    .filter(([field]) => Object.prototype.hasOwnProperty.call(submitted, field) || removed.has(field))
    .map(([field, write]) => write(actorUid, cardId, removed.has(field) ? null : submitted[field])));

  const saved = await saveCreateProfileMutation({
    cardId,
    creatorUid,
    actorUid,
    data: buildDraftRecordData(current.data, submitted, deletedKeys),
    expectedRevision: current.revision,
  });
  knownDraftRevisions.set(cardId, Number(saved?.revision) || 0);
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(PROFILE_DRAFT_SAVED_EVENT, {
      detail: { cardId, revision: Number(saved?.revision) || 0 },
    }));
  }
  return saved;
};

const formatHistoryValues = values => (Array.isArray(values) ? values : [values])
  .map(value => String(value ?? '').trim())
  .filter(Boolean)
  .join(', ');

/**
 * Одна правка журналу чернетки словами: що додали, що прибрали, на що
 * замінили. Запис журналу — це одне збереження одного поля, тож заміна
 * номера стоїть тут одним рядком «стало / було», а не двома різними подіями.
 */
export const describeDraftHistoryChange = change => {
  if (!change || typeof change !== 'object') return '';
  if ('from' in change || 'to' in change) {
    const from = formatHistoryValues(change.from);
    const to = formatHistoryValues(change.to);
    if (from && to) return `${from} → ${to}`;
    if (to) return `додано: ${to}`;
    return from ? `стерто: ${from}` : '';
  }
  const toList = values => (Array.isArray(values) ? values : [values])
    .map(value => String(value ?? '').trim())
    .filter(Boolean);
  const added = toList(change.added ?? change.add ?? []);
  const removed = toList(change.removed ?? []);
  // Один прибраний і один доданий в одному збереженні — це заміна значення
  // («412 → 413»). Коли їх різна кількість, пару вгадати нема з чого, і
  // журнал каже окремо, що прибрали і що додали.
  if (added.length === 1 && removed.length === 1) return `${removed[0]} → ${added[0]}`;
  const parts = [];
  if (removed.length) parts.push(`видалено: ${removed.join(', ')}`);
  if (added.length) parts.push(`додано: ${added.join(', ')}`);
  return parts.join('; ');
};
