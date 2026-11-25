import {
  auth,
  fetchProfileDraftById,
  fetchUserById,
  setOwnerGetInTouch,
  setOwnerStimulationSchedule,
  setOwnerWriter,
} from 'components/config';
import { OWNER_MULTI_DATA_FIELD_NAMES } from 'utils/profileNodeSchema';
import { profileProposalService } from 'utils/profileProposalRepository';
import { profileProposalPaths } from 'utils/profileProposalStoragePaths';

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
  return [...profileProposalPaths.create.split('/'), creator, cardId, 'data'];
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
const draftRevisionKey = (actorUid, creatorUid, cardId) => JSON.stringify([actorUid, creatorUid, cardId]);
const draftRevision = value => {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return undefined;
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : undefined;
};

export const rememberDraftRecordRevision = record => {
  const actorUid = auth.currentUser?.uid;
  const creatorUid = getDraftRecordCreator(record);
  const revision = draftRevision(record?.__profileMutationRevision);
  if (!actorUid || !creatorUid || !isDraftProfileRecord(record) || !record.userId) return;
  const key = draftRevisionKey(actorUid, creatorUid, record.userId);
  if (revision === undefined) knownDraftRevisions.delete(key);
  else knownDraftRevisions.set(key, { displayed: revision, written: revision });
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

const draftChangedElsewhere = cause => Object.assign(new Error(
  'Чернетку змінили після того, як її відкрили. Перечитайте її («усі поля») і повторіть правку.',
), { code: DRAFT_CHANGED_ELSEWHERE, ...(cause && { cause }) });

/**
 * Записати правку форми в саму чернетку — тим самим шляхом, яким пише автор
 * (`profileProposalService`): ревізія, журнал `profileMutationHistory`,
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
  if (auth.currentUser?.uid !== actorUid) throw new Error('PERMISSION_DENIED');

  const key = draftRevisionKey(actorUid, creatorUid, cardId);
  const remembered = knownDraftRevisions.get(key);
  const displayed = draftRevision(baseRevision === undefined ? submitted.__profileMutationRevision : baseRevision);
  if (displayed === undefined) throw draftChangedElsewhere();
  // Тільки наступний запис тієї самої форми може продовжити її чергу. Ревізія
  // іншого знімка, наприклад досилання з пристрою, не успадковує цей дозвіл.
  const expectedRevision = baseRevision === undefined && remembered?.displayed === displayed
    ? remembered.written
    : displayed;
  const current = await profileProposalService.getDraft({ operation: 'create', cardId, createdBy: creatorUid });
  if (!current || current.status === 'accepted') throw new Error('Чернетки вже немає — її видалили або опублікували');
  const formChanged = baseRevision === undefined && knownDraftRevisions.get(key) !== remembered;
  if (current.revision !== expectedRevision || formChanged) {
    throw draftChangedElsewhere();
  }

  if (auth.currentUser?.uid !== actorUid) throw new Error('PERMISSION_DENIED');
  const removed = new Set(deletedKeys || []);
  await Promise.all(Object.entries(OWNER_FIELD_WRITERS)
    .filter(([field]) => Object.prototype.hasOwnProperty.call(submitted, field) || removed.has(field))
    .map(([field, write]) => write(actorUid, cardId, removed.has(field) ? null : submitted[field])));

  let saved;
  try {
    if (auth.currentUser?.uid !== actorUid) throw new Error('PERMISSION_DENIED');
    saved = await profileProposalService.saveDraft({
      ...current,
      data: buildDraftRecordData(current.data, submitted, deletedKeys),
    }, { expected: current });
  } catch (error) {
    if (error?.code === 'REVISION_CONFLICT') throw draftChangedElsewhere(error);
    throw error;
  }
  // Рішення про доповнення має свою свіжу базу. Воно не робить стару
  // відкриту форму актуальною, доки та явно не перечитає анкету.
  if (baseRevision === undefined && knownDraftRevisions.get(key) === remembered) {
    knownDraftRevisions.set(key, { displayed, written: saved.revision });
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(PROFILE_DRAFT_SAVED_EVENT, {
      detail: { cardId, revision: Number(saved?.revision) || 0 },
    }));
  }
  const record = { ...saved, cardId };
  if (saved.duplicateConflicts) {
    Object.defineProperty(record, 'duplicateConflicts', { value: saved.duplicateConflicts });
  }
  return record;
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
