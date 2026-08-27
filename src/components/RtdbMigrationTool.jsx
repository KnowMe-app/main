import React, { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import { ref as dbRef, update as dbUpdate } from 'firebase/database';

import {
  MIGRATION_GROUPS,
  createMigrationState,
  resetMigrationState,
  planMigrationGroup,
  applyMigrationPlan,
  buildCollectionInventory,
  buildCombinedRootPatch,
  buildCleanedNewUsers,
  buildCleanedCollections,
  buildMigrationAudit,
  buildRemaindersExport,
  CLEANED_COLLECTIONS_KIND,
} from 'utils/rtdbMigration';
import {
  UPLOAD_CHUNK_SIZE,
  countUploadEntries,
  uploadCollection,
} from 'utils/rtdbMigrationUpload';
import {
  PROFILE_NODES,
  OWNER_MULTI_DATA_FIELDS,
  CLEANED_COLLECTION_NOISE_FIELDS,
  CLEANED_COLLECTION_PRESERVED_FIELDS,
} from 'utils/profileNodeSchema';
import { auth, database } from './config';
import PageNavMenu from './PageNavMenu';
import {
  KmCard,
  KmGhostButton,
  KmPage,
  KmPrimaryButton,
  KmTopbar,
  KnowMeBrand,
} from './styles/knowme';

/**
 * Локальний інструмент міграції RTDB.
 *
 * Рахує він завжди локально: бере `users.json` / `newUsers.json`, розкладає їх
 * по нових вузлах у памʼяті браузера і показує звіт. Жодна кнопка міграції в
 * базу не пише — `Apply` міняє лише копію в памʼяті.
 *
 * У базу веде рівно один шлях, і він окремий: кнопка «Залити» біля кожного
 * новоствореного вузла в розділі «Експорт». Вона не робить `set` на корінь
 * колекції (правила бази дають `.write` на рівні запису, а не колекції, та й
 * `set` зніс би сусідні гілки) — вона шле серію `update` порціями по
 * {@link UPLOAD_CHUNK_SIZE} записів. Тому заливка дописує і перезаписує свої
 * записи, але нічого не видаляє.
 *
 * А от видалення полів із `newUsers` кнопки не має і не матиме: воно
 * незворотне, і `cleaned-newUsers.json` так і їде ручним імпортом у консоль —
 * між рішенням скрипта і зникненням даних стоїть людина.
 *
 * Кожна кнопка спершу показує preview, і лише другий клік застосовує план.
 */

/*
 * Оформлення тримається на токенах `--km-*` (src/index.css), як і решта
 * застосунку: сторінка адмінська, але тема на ній та сама, що всюди. Раніше тут
 * стояли захардкожені `#fff` без `color` — у темній темі це давало білі написи
 * на білих кнопках, тобто порожні прямокутники. Токен вирішує це сам собою:
 * фон і текст завжди беруться з однієї палітри.
 */
const Shell = styled.div`
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px 16px 56px;

  /*
   * Шляхи у вузлах довгі й без пробілів (multiData/getInTouch/{uid}/…), а
   * контейнер вузький. Без примусового переносу вони вилазять за межі картки —
   * саме те, що ламало верстку на телефоні.
   */
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.92em;
    padding: 1px 5px;
    border-radius: 6px;
    background: var(--km-accent-light);
    color: var(--km-accent);
    overflow-wrap: anywhere;
    word-break: break-word;
  }
`;

const PageTitle = styled.h1`
  margin: 0 0 6px;
  font-family: var(--km-font-display);
  font-size: 24px;
  font-weight: 700;
  color: var(--km-text);
`;

const Section = styled(KmCard)`
  padding: 14px;
  margin-bottom: 16px;
`;

const SectionTitle = styled.h2`
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--km-text);
`;

const Note = styled.p`
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--km-muted);
  overflow-wrap: anywhere;

  &:last-child {
    margin-bottom: 0;
  }
`;

const Warn = styled(Note)`
  color: var(--km-danger);
  font-weight: 600;
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 10px;
`;

const SmallGhost = styled(KmGhostButton)`
  min-height: 38px;
  padding: 8px 14px;
  font-size: 13px;
`;

const SmallPrimary = styled(KmPrimaryButton)`
  min-height: 38px;
  padding: 8px 14px;
  font-size: 13px;
`;

/*
 * Ghost, а не залитий KmDangerButton: у темній темі --km-danger це світлий рожевий,
 * і білий напис на ньому майже не читається. Тут же колір іде в текст і рамку, а фон
 * лишається картковим — контраст однаковий в обох темах.
 */
const SmallDanger = styled(SmallGhost)`
  border-color: var(--km-danger-border);
  color: var(--km-danger);

  &:hover {
    background: var(--km-danger-bg);
    border-color: var(--km-danger);
    color: var(--km-danger);
  }

  &:focus-visible {
    border-color: var(--km-danger);
    box-shadow: 0 0 0 3px var(--km-danger-bg);
  }
`;

const FileButton = styled(SmallGhost)`
  /* <label> замість <button>: клік має відкривати схований file input. */
  cursor: pointer;
`;

const FieldLabel = styled.label`
  font-size: 13px;
  font-weight: 700;
  color: var(--km-text);
`;

const TextInput = styled.input`
  flex: 1 1 280px;
  min-width: 0;
  min-height: 38px;
  padding: 8px 12px;
  border: 1.5px solid var(--km-border);
  border-radius: var(--km-radius);
  background: var(--km-card);
  color: var(--km-text);
  font-family: var(--km-font);
  font-size: 13px;

  &::placeholder {
    color: var(--km-muted);
  }

  &:focus-visible {
    outline: none;
    border-color: var(--km-accent);
    box-shadow: 0 0 0 3px var(--km-accent-ring);
  }
`;

const Stats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 2px 18px;
  max-height: 320px;
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-bg);
  color: var(--km-text);
  font-size: 12.5px;
  line-height: 1.6;
`;

const StatLine = styled.div`
  color: ${({ $warn }) => ($warn ? 'var(--km-danger)' : 'inherit')};
  font-weight: ${({ $warn }) => ($warn ? 700 : 400)};
`;

/* Таблиці ширші за телефон — хай їдуть горизонтально всередині себе, а не тягнуть сторінку. */
const TableScroll = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

const Table = styled.table`
  border-collapse: collapse;
  width: 100%;
  min-width: 640px;
  font-size: 12.5px;
  color: var(--km-text);

  /*
   * Шлях імпорту — половина операції, і рвати його переносом посеред слова
   * («matchingCard / s») означає давати прочитати не те. Тут хай краще
   * горизонтально їде вся таблиця, ніж ламається окремий шлях.
   */
  code {
    white-space: nowrap;
  }

  th,
  td {
    border: 1px solid var(--km-border);
    padding: 6px 8px;
    text-align: left;
    vertical-align: middle;
  }

  th {
    background: var(--km-bg);
    color: var(--km-muted);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
`;

const Disclosure = styled.details`
  margin-top: 10px;

  summary {
    cursor: pointer;
    padding: 8px 10px;
    border: 1px solid var(--km-border);
    border-radius: 10px;
    background: var(--km-bg);
    color: var(--km-text);
    font-size: 13px;
    font-weight: 700;
  }

  &[open] summary {
    margin-bottom: 8px;
  }
`;

const GroupBlock = styled.div`
  padding: 12px 0;
  border-top: 1px solid var(--km-border);

  &:first-of-type {
    border-top: none;
    padding-top: 0;
  }
`;

const GroupName = styled.strong`
  flex: 1 1 100%;
  font-size: 14px;
  color: var(--km-text);

  @media (min-width: 560px) {
    flex: 0 0 auto;
    min-width: 190px;
  }
`;

const CriticalSection = styled(Section)`
  border-color: var(--km-danger-border);
  background: var(--km-danger-bg);
`;

const CriticalTitle = styled(SectionTitle)`
  color: var(--km-danger);
`;

const HiddenFileInput = styled.input`
  display: none;
`;

/* Прогрес заливки стоїть під самою кнопкою: питання «скільки вже пройшло» виникає рівно тут. */
const UploadStatus = styled.div`
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.4;
  font-weight: 700;
  color: ${({ $status }) => ($status === 'error' ? 'var(--km-danger)' : 'var(--km-muted)')};
  white-space: normal;
`;

const downloadJson = (filename, payload) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const readJsonFile = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      resolve(JSON.parse(String(reader.result)));
    } catch (error) {
      reject(error);
    }
  };
  reader.onerror = () => reject(reader.error);
  reader.readAsText(file);
});

/**
 * Файл може бути як вмістом вузла (`{ uid: {...} }`), так і експортом кореня
 * (`{ users: { uid: {...} } }`) — консоль Firebase віддає і те, і те залежно
 * від того, з якого рівня качали. Розгортати обгортку тут дешевше, ніж
 * пояснювати різницю в підказці до кнопки.
 */
const unwrapCollection = (parsed, collectionName) => {
  if (!parsed || typeof parsed !== 'object') return {};
  if (parsed[collectionName] && typeof parsed[collectionName] === 'object') return parsed[collectionName];
  return parsed;
};

const formatCount = value => new Intl.NumberFormat('uk-UA').format(value || 0);

/** Обидві колекції в одному порядку скрізь, де їх показують поруч. */
const REMAINDER_COLLECTIONS = ['newUsers', 'users'];

/** `поле×кількість`, від найчастішого — так видно, з чого починати розбір. */
const formatFieldStats = stats => Object.entries(stats || {})
  .sort((a, b) => b[1] - a[1])
  .map(([field, count]) => `${field}×${count}`)
  .join(', ') || '—';

const InventoryTable = ({ title, inventory }) => {
  if (!inventory) return null;
  return (
    <Disclosure>
      <summary>
        {title}: {formatCount(inventory.recordCount)} записів, {formatCount(inventory.uniqueFieldCount)} унікальних полів
      </summary>
      <TableScroll>
        <Table>
          <thead>
            <tr>
              <th>поле</th>
              <th>к-сть</th>
              <th>типи</th>
              <th>статус</th>
            </tr>
          </thead>
          <tbody>
            {inventory.fields.map(entry => (
              <tr key={entry.field}>
                <td>{entry.field}</td>
                <td>{formatCount(entry.count)}</td>
                <td>
                  {Object.entries(entry.types).map(([type, count]) => `${type}:${count}`).join(', ')}
                </td>
                <td>
                  {entry.excluded ? 'не мігрується' : (entry.mapped ? 'у мапінгу' : 'невідоме')}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableScroll>
    </Disclosure>
  );
};

const PlanSummary = ({ plan }) => {
  if (!plan) return null;
  if (plan.blocked === 'MISSING_OWNER_UID') {
    return <Warn>Потрібен UID власника позначок.</Warn>;
  }

  const { counters } = plan;
  return (
    <Stats>
      <StatLine>анкет переглянуто: {formatCount(counters.profilesScanned)}</StatLine>
      <StatLine>скопійовано з users: {formatCount(counters.fieldsCopiedFromUsers)}</StatLine>
      <StatLine>перенесено з newUsers: {formatCount(counters.fieldsMovedFromNewUsers)}</StatLine>
      <StatLine>похідних створено: {formatCount(counters.derivedValuesCreated)}</StatLine>
      <StatLine>вже було в цілі: {formatCount(counters.alreadyPresent)}</StatLine>
      <StatLine>пропущено порожніх: {formatCount(counters.skippedEmpty)}</StatLine>
      <StatLine $warn={Boolean(counters.conflicts)}>
        конфліктів: {formatCount(counters.conflicts)}
      </StatLine>
      <StatLine $warn={Boolean(counters.errors)}>
        блокуючих помилок: {formatCount(counters.errors)}
      </StatLine>
      <StatLine>буде видалено з newUsers: {formatCount(counters.deletionsFromNewUsers)}</StatLine>
      {Object.keys(plan.warningsByCode).length > 0 && (
        <StatLine style={{ gridColumn: '1 / -1', marginTop: 6 }}>
          попередження:{' '}
          {Object.entries(plan.warningsByCode).map(([code, count]) => `${code}×${count}`).join(', ')}
        </StatLine>
      )}
    </Stats>
  );
};

/** Що саме замінить імпорт кожного вузла `multiData`. */
const OWNER_VALUE_EFFECTS = {
  getInTouch: 'замінює позначки «звʼязатись» усіх власників',
  writer: 'замінює позначки способу звʼязку всіх власників',
  stimulationSchedule: 'замінює персональні графіки стимуляції всіх власників',
};

/**
 * Куди саме їде кожен файл.
 *
 * Імпорт у консолі Firebase — це `set`, а не `update`: він замінює вузол цілком.
 * Тому шлях імпорту вказаний поруч із кнопкою, а не в інструкції збоку: один
 * рівень вище — і замість оновлення одного вузла ви зносите його сусідів.
 */
export const EXPORT_TARGETS = [
  {
    label: 'profileDetails',
    importPath: 'profileDetails',
    effect: 'замінює всі деталі анкет',
    build: state => state.targets[PROFILE_NODES.profileDetails],
    uploadDepth: 1,
  },
  {
    label: 'profileContacts',
    importPath: 'profileContacts',
    effect: 'замінює всі контакти',
    build: state => state.targets[PROFILE_NODES.profileContacts],
    uploadDepth: 1,
  },
  {
    label: 'profileWorkflow',
    importPath: 'profileWorkflow',
    effect: 'замінює всі робочі позначки',
    build: state => state.targets[PROFILE_NODES.profileWorkflow],
    uploadDepth: 1,
  },
  {
    label: 'profileTechnical',
    importPath: 'profileTechnical',
    effect: 'замінює всі технічні дані',
    build: state => state.targets[PROFILE_NODES.profileTechnical],
    uploadDepth: 1,
  },
  /*
   * matchingCards стоїть після вузлів анкети, а не першим, як раніше: правило
   * `matchingCards/$uid` пускає картку тільки якщо анкета вже існує хоч в
   * одному вузлі. Поки джерелом лишається `users`/`newUsers`, воно виконується
   * і так, але порядок кнопок згори вниз — це і є порядок заливки, і хай він
   * буде тим, який працює в обидва боки.
   */
  {
    label: 'matchingCards',
    importPath: 'matchingCards',
    effect: 'замінює всі картки стрічки',
    build: state => state.targets[PROFILE_NODES.matchingCards],
    uploadDepth: 1,
  },
  /*
   * Саме `multiData/{поле}`, а не `multiData`: на рівень вище лежать обране,
   * коментарі, правки й історія — імпорт туди зніс би їх усі. Перелік іде зі
   * схеми, тож нове поле власника зʼявляється тут само собою.
   */
  ...OWNER_MULTI_DATA_FIELDS.map(({ field, path }) => ({
    label: `multiData-${field}`,
    importPath: path,
    effect: OWNER_VALUE_EFFECTS[field] || 'замінює персональні позначки всіх власників',
    build: state => state.targets.multiDataPatch[field],
    /*
     * Двійка, а не одиниця: під `multiData/getInTouch` спершу йде власник, і
     * лише під ним анкета. Дозвіл на запис стоїть саме на анкеті
     * (`$ownerId/$userId`), тож порція має адресувати цей рівень — інакше
     * `update` цілим власником спробував би записати вузол, на якому правил
     * немає.
     */
    uploadDepth: 2,
  })),
  {
    label: 'cleaned-newUsers',
    importPath: 'newUsers',
    effect: 'і є видаленням: замінює newUsers версією без перенесених полів і без порожніх оболонок',
    build: state => buildCleanedNewUsers(state),
  },
  {
    // Не для бази: `users` читає мобільний застосунок, і заливати туди залишок
    // не можна. Це файл, з якого інструмент продовжує роботу наступного дня.
    label: 'cleaned-collections',
    importPath: '— не імпортувати',
    effect: 'обидві колекції без перенесених полів — файл для повторного завантаження сюди',
    build: state => buildCleanedCollections(state),
  },
];

export const RtdbMigrationTool = () => {
  const stateRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [usersInventory, setUsersInventory] = useState(null);
  const [newUsersInventory, setNewUsersInventory] = useState(null);
  const [existingCards, setExistingCards] = useState(null);
  // Legacy `getInTouch` був фактично одним значенням від одного адміна, і цей
  // адмін — той, хто зараз запустив інструмент. Тож поле заповнюється його
  // UID: типовий випадок не має вимагати копіювання ідентифікатора з консолі.
  // Замінити його вручну можна — перенести чужі позначки теж буває треба.
  const [ownerUid, setOwnerUid] = useState(() => auth?.currentUser?.uid || '');
  const [plans, setPlans] = useState({});
  const [audit, setAudit] = useState(null);
  /*
   * Стан заливки на кожен вузол окремо: {status, written, total, error}.
   * Окремо, а не одним прапорцем на всю таблицю, бо саме так їх і натискають —
   * по одному, дивлячись на результат попереднього.
   */
  const [uploads, setUploads] = useState({});
  const uploadingRef = useRef(false);
  // Робочий стан живе в ref, а не в state: він великий і мутується на місці.
  // Лічильник — єдиний спосіб сказати React, що з нього треба перечитати.
  const [, bumpRevision] = useState(0);

  const pendingRef = useRef({ users: null, newUsers: null });

  const refreshAudit = useCallback(() => {
    if (!stateRef.current) return;
    setAudit(buildMigrationAudit(stateRef.current));
    bumpRevision(value => value + 1);
  }, []);

  const rebuildState = useCallback(() => {
    stateRef.current = createMigrationState({
      users: pendingRef.current.users || {},
      newUsers: pendingRef.current.newUsers || {},
    });
    setPlans({});
    setLoaded(true);
    refreshAudit();
  }, [refreshAudit]);

  const handleFile = useCallback(async (event, collectionName) => {
    const file = event.target.files?.[0];
    // Скидається одразу, щоб той самий файл можна було вибрати вдруге після Reset.
    event.target.value = '';
    if (!file) return;

    try {
      const raw = await readJsonFile(file);

      /*
       * Файл залишків несе обидві колекції одразу — це той самий стан, у якому
       * скінчився попередній захід. Він і завантажується як одне ціле: інакше
       * довелося б качати два файли і памʼятати, який із них до якого.
       */
      if (collectionName === 'cleanedCollections') {
        if (!raw || typeof raw !== 'object' || (!raw.users && !raw.newUsers)) {
          toast.error('У файлі немає ані users, ані newUsers');
          return;
        }
        if (raw.kind && raw.kind !== CLEANED_COLLECTIONS_KIND) {
          toast.error('Це не файл залишків міграції');
          return;
        }

        const cleanedUsers = raw.users && typeof raw.users === 'object' ? raw.users : {};
        const cleanedNewUsers = raw.newUsers && typeof raw.newUsers === 'object' ? raw.newUsers : {};
        pendingRef.current.users = cleanedUsers;
        pendingRef.current.newUsers = cleanedNewUsers;
        const usersStats = buildCollectionInventory(cleanedUsers);
        const newUsersStats = buildCollectionInventory(cleanedNewUsers);
        setUsersInventory(usersStats);
        setNewUsersInventory(newUsersStats);
        rebuildState();
        toast.success(
          `Залишок прочитано: users ${formatCount(usersStats.recordCount)}, `
          + `newUsers ${formatCount(newUsersStats.recordCount)} записів`,
        );
        return;
      }

      const parsed = unwrapCollection(raw, collectionName);
      if (collectionName === 'matchingCards') {
        // Тільки для порівняння у звіті — джерелом істини наявний вузол не є.
        setExistingCards(parsed);
        toast.success(`matchingCards.json прочитано: ${formatCount(Object.keys(parsed).length)} карток (лише для звірки)`);
        return;
      }

      pendingRef.current[collectionName] = parsed;
      const inventory = buildCollectionInventory(parsed);
      if (collectionName === 'users') setUsersInventory(inventory);
      else setNewUsersInventory(inventory);

      rebuildState();
      toast.success(`${collectionName}.json прочитано: ${formatCount(inventory.recordCount)} записів`);
    } catch (error) {
      console.error('[RtdbMigrationTool] не вдалося прочитати файл', error);
      toast.error(`Не вдалося прочитати ${file.name}: ${error?.message || 'некоректний JSON'}`);
    }
  }, [rebuildState]);

  const handlePreview = useCallback(group => {
    if (!stateRef.current) return;
    const plan = planMigrationGroup(stateRef.current, group, { ownerUid });
    setPlans(current => ({ ...current, [group]: plan }));
  }, [ownerUid]);

  const handleApply = useCallback(group => {
    if (!stateRef.current) return;
    const plan = plans[group] || planMigrationGroup(stateRef.current, group, { ownerUid });
    if (plan.blocked) {
      toast.error('Потрібен UID власника позначок');
      return;
    }

    const confirmed = window.confirm(
      `Застосувати «${MIGRATION_GROUPS.find(entry => entry.id === group)?.label}»?\n\n`
      + `Записів у цілі: ${plan.writes.length + plan.ownerValueWrites.length}\n`
      + `Полів буде видалено з локального newUsers: ${plan.deletions.length}\n`
      + `Конфліктів: ${plan.counters.conflicts}\n\n`
      + 'У Firebase нічого не пишеться — зміни лише в локальній копії.',
    );
    if (!confirmed) return;

    applyMigrationPlan(stateRef.current, plan);
    // Після застосування план перераховується: тепер він має бути порожній —
    // це і є видима перевірка ідемпотентності.
    const after = planMigrationGroup(stateRef.current, group, { ownerUid });
    setPlans(current => ({ ...current, [group]: after }));
    refreshAudit();
    toast.success(`${group}: застосовано`);
  }, [ownerUid, plans, refreshAudit]);

  /**
   * Залити один вузол у базу.
   *
   * Пише не `set` на корінь колекції, а серію `update` на глибині записів —
   * тобто дописує і перезаписує свої анкети, не чіпаючи сусідніх. Це навмисно
   * слабша операція, ніж імпорт у консолі: імпорт замінює вузол цілком, і
   * повторний захід ним стер би те, що заливка попереднього дня вже принесла.
   */
  const handleUpload = useCallback(async target => {
    if (!stateRef.current) return;
    if (uploadingRef.current) {
      toast.error('Спершу дочекайтесь поточної заливки');
      return;
    }

    const payload = target.build(stateRef.current);
    const total = countUploadEntries(payload, target.uploadDepth);
    if (!total) {
      toast.error(`${target.label}: нічого заливати — спершу застосуйте потрібні групи`);
      return;
    }

    const confirmed = window.confirm(
      `Залити «${target.label}» у базу?\n\n`
      + `Шлях: ${target.importPath}\n`
      + `Записів: ${formatCount(total)} (порціями по ${UPLOAD_CHUNK_SIZE})\n\n`
      + 'Це запис у РЕАЛЬНУ базу. Записи з тими самими ключами будуть перезаписані; '
      + 'усе інше в цьому вузлі лишиться недоторканим.',
    );
    if (!confirmed) return;

    uploadingRef.current = true;
    setUploads(current => ({
      ...current,
      [target.label]: { status: 'running', written: 0, total, error: null },
    }));

    const result = await uploadCollection(payload, {
      path: target.importPath,
      depth: target.uploadDepth,
      write: (path, patch) => dbUpdate(dbRef(database, path), patch),
      onProgress: ({ written }) => {
        setUploads(current => ({
          ...current,
          [target.label]: { ...current[target.label], written },
        }));
      },
    });

    uploadingRef.current = false;

    if (result.error) {
      console.error('[RtdbMigrationTool] заливка обірвалась', result.error);
      setUploads(current => ({
        ...current,
        [target.label]: {
          status: 'error',
          written: result.written,
          total: result.total,
          error: result.error?.message || 'невідома помилка',
        },
      }));
      toast.error(
        `${target.label}: обірвалось на ${formatCount(result.written)} з ${formatCount(result.total)}. `
        + 'Повторний запуск перезаллє з початку — це безпечно.',
      );
      return;
    }

    setUploads(current => ({
      ...current,
      [target.label]: {
        status: 'done',
        written: result.written,
        total: result.total,
        error: null,
        skipped: result.skipped,
      },
    }));
    toast.success(`${target.label}: залито ${formatCount(result.written)} записів у ${target.importPath}`);
  }, []);

  const handleReset = useCallback(() => {
    if (!stateRef.current) return;
    if (!window.confirm('Повернути робочий стан до завантажених файлів?')) return;
    stateRef.current = resetMigrationState(stateRef.current);
    setPlans({});
    refreshAudit();
    toast.success('Робочий стан повернуто до вихідних файлів');
  }, [refreshAudit]);

  // Штамп береться в момент завантаження, а не рендера: у назві файлу має
  // стояти час, коли його справді викачали.
  const download = useCallback((label, payload) => {
    if (!stateRef.current) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadJson(`${label}-${stamp}.json`, payload());
  }, []);

  const cardsComparison = (() => {
    if (!existingCards || !stateRef.current) return null;
    const built = stateRef.current.targets[PROFILE_NODES.matchingCards];
    const builtIds = Object.keys(built);
    const existingIds = Object.keys(existingCards);
    return {
      built: builtIds.length,
      existing: existingIds.length,
      onlyInExisting: existingIds.filter(id => !built[id]).length,
      onlyInBuilt: builtIds.filter(id => !existingCards[id]).length,
    };
  })();

  return (
    <KmPage>
      {/*
        Топбар із «⋮» — щоб зі сторінки був вихід кудись, крім кнопки «назад»:
        решта адмінських сторінок влаштована так само.
      */}
      <KmTopbar>
        <KnowMeBrand tagline="RTDB" />
        <PageNavMenu />
      </KmTopbar>

      <Shell>
        <PageTitle>Локальна міграція RTDB</PageTitle>
        <Note>
          Інструмент не звертається до Firebase. Він читає локальні JSON-копії, розкладає їх по нових
          вузлах і віддає файли для ручного імпорту. Локальний <code>users</code> не змінюється взагалі;
          поле зникає з локального <code>newUsers</code> лише після того, як звіт підтвердив успіх саме
          для нього.
        </Note>

        <Section>
          <SectionTitle>1. Вхідні файли</SectionTitle>
          <Row>
            <FileButton as="label">
              Load users.json
              <HiddenFileInput type="file" accept="application/json,.json" onChange={event => handleFile(event, 'users')} />
            </FileButton>
            <FileButton as="label">
              Load newUsers.json
              <HiddenFileInput type="file" accept="application/json,.json" onChange={event => handleFile(event, 'newUsers')} />
            </FileButton>
            <FileButton as="label">
              Load matchingCards.json (звірка)
              <HiddenFileInput type="file" accept="application/json,.json" onChange={event => handleFile(event, 'matchingCards')} />
            </FileButton>
            <FileButton as="label">
              Load cleaned-collections.json (продовжити)
              <HiddenFileInput type="file" accept="application/json,.json" onChange={event => handleFile(event, 'cleanedCollections')} />
            </FileButton>
          </Row>
          <Note>
            <code>cleaned-collections.json</code> — файл із розділу «Експорт»: обидві колекції без уже
            перенесених полів. Завантажений сюди, він замінює обидва вхідні файли, і міграція
            продовжується з того місця, де скінчилась, а не з нуля.
          </Note>
          <Row>
            <FieldLabel htmlFor="owner-uid">UID власника (getInTouch, writer, графік):</FieldLabel>
            <TextInput
              id="owner-uid"
              value={ownerUid}
              onChange={event => setOwnerUid(event.target.value)}
              placeholder="UID адміна, чиї позначки переносимо"
            />
            {auth?.currentUser?.uid && auth.currentUser.uid !== ownerUid && (
              <SmallGhost type="button" onClick={() => setOwnerUid(auth.currentUser.uid)}>
                Мій UID
              </SmallGhost>
            )}
          </Row>
          <Note>
            <code>getInTouch</code>, <code>writer</code> і <code>stimulationSchedule</code> — це персональні
            позначки адміна, а не поля анкети: перша каже, коли з людиною звʼязатись, друга — хто і чим
            із нею вже спілкувався, третя — як їй ведуть стимуляцію. Усі три лежать під тим, хто їх
            поставив, і значенням, а не назвою ключа
            (<code>multiData/getInTouch/{ownerUid || '{ownerId}'}/анкета</code> = дата).
          </Note>
          <Note>
            Значення під анкетою, а не в назві ключа, — щоб нотатка не втрачала <code>.</code>,{' '}
            <code>/</code> і власну довжину, а база вміла сортувати сама: на вузлі власника стоїть{' '}
            <code>.indexOn: &quot;.value&quot;</code>, тож <code>orderByValue()</code> віддає картки
            вже впорядкованими за датою «звʼязатись» і, за потреби, лише потрібний діапазон.
          </Note>
          <Note>
            Дати всюди переїжджають одним написанням — <code>РРРР-ММ-ДД</code>. Те саме число,
            записане як <code>25.08.2026</code>, до нового вузла їде як <code>2026-08-25</code>: інакше
            дві копії анкети конфліктують на рівному місці, а сортування рядком ставить крапкові
            дати не туди.
          </Note>
          <InventoryTable title="users" inventory={usersInventory} />
          <InventoryTable title="newUsers" inventory={newUsersInventory} />
          {cardsComparison && (
            <Note>
              Звірка з наявним matchingCards: зібрано {formatCount(cardsComparison.built)},
              у файлі {formatCount(cardsComparison.existing)},
              тільки у файлі {formatCount(cardsComparison.onlyInExisting)},
              тільки зібрано {formatCount(cardsComparison.onlyInBuilt)}.
            </Note>
          )}
        </Section>

        {audit?.securityWarnings?.length > 0 && (
          <CriticalSection>
            <CriticalTitle>
              CRITICAL: у даних знайдено {formatCount(audit.securityWarnings.length)} полів «password»
            </CriticalTitle>
            <Note>
              Значення не показані і не переносяться в жоден новий вузол. Перелік адрес — у
              migration-audit.json.
            </Note>
          </CriticalSection>
        )}

        <Section>
          <SectionTitle>2. Кнопки міграції</SectionTitle>
          {!loaded && <Note>Спершу завантажте users.json або newUsers.json.</Note>}
          {loaded && MIGRATION_GROUPS.map(group => (
            <GroupBlock key={group.id}>
              <Row>
                <GroupName>{group.label}</GroupName>
                <SmallGhost type="button" onClick={() => handlePreview(group.id)}>
                  Preview
                </SmallGhost>
                <SmallPrimary type="button" onClick={() => handleApply(group.id)}>
                  Apply
                </SmallPrimary>
                {audit?.groups?.[group.id] && (
                  <Note as="span">
                    застосовано {audit.groups[group.id].runCount}×, залишок ключів у newUsers:{' '}
                    {formatCount(audit.groups[group.id].remainingNewUsersKeys)}
                  </Note>
                )}
              </Row>
              <PlanSummary plan={plans[group.id]} />
            </GroupBlock>
          ))}
          {loaded && (
            <Row style={{ marginTop: 12, marginBottom: 0 }}>
              <SmallDanger type="button" onClick={handleReset}>
                Reset to original files
              </SmallDanger>
            </Row>
          )}
        </Section>

        {loaded && (
          <Section>
            <SectionTitle>3. Експорт</SectionTitle>

            {/*
              Preview нічого не застосовує — і файли після нього виходять
              порожні, але не порожнього вигляду: combined-root-patch.json з
              шістьма порожніми вузлами важко відрізнити від справжнього, а
              залитий у корінь він знесе те, що там уже є. Тож поки жодної
              кнопки не застосовано, це сказано прямо, а не лишається здогадкою
              з `appliedGroups: []` усередині файлу.
            */}
            {audit?.appliedGroups?.length === 0 && (
              <Warn>
                Жодної групи ще не застосовано — Preview лише рахує. Файли вузлів і
                combined-root-patch.json зараз порожні; migration-audit.json і
                migration-remainders.json уже осмислені.
              </Warn>
            )}

            {/*
              Кожен файл — це ВМІСТ одного вузла, а імпорт у консолі Firebase
              замінює вузол цілком. Тобто шлях імпорту — не подробиця, а половина
              операції: той самий файл, залитий на рівень вище, зносить сусідні
              гілки. Тому шлях стоїть на самій кнопці.
            */}
            <TableScroll>
              <Table>
                <thead>
                  <tr>
                    <th>файл</th>
                    <th>імпортувати рівно в</th>
                    <th>залити в базу</th>
                    <th>що станеться</th>
                  </tr>
                </thead>
                <tbody>
                  {EXPORT_TARGETS.map(target => {
                    const upload = uploads[target.label];
                    return (
                      <tr key={target.label}>
                        <td>
                          <SmallGhost
                            type="button"
                            onClick={() => download(target.label, () => target.build(stateRef.current))}
                          >
                            {target.label}.json
                          </SmallGhost>
                        </td>
                        <td><code>{target.importPath}</code></td>
                        <td>
                          {/*
                            Кнопки немає там, де запис у базу означав би не
                            дозапис, а видалення: `cleaned-newUsers` замінює
                            вузол цілком, `cleaned-collections` у базу не їде
                            взагалі. Обидва лишаються файлами.
                          */}
                          {target.uploadDepth ? (
                            <>
                              <SmallPrimary
                                type="button"
                                disabled={upload?.status === 'running'}
                                onClick={() => handleUpload(target)}
                              >
                                {upload?.status === 'running' ? 'Заливаю…' : 'Залити'}
                              </SmallPrimary>
                              {upload && (
                                <UploadStatus $status={upload.status}>
                                  {upload.status === 'error'
                                    ? `обірвалось на ${formatCount(upload.written)} з ${formatCount(upload.total)}: ${upload.error}`
                                    : `${formatCount(upload.written)} з ${formatCount(upload.total)}`}
                                </UploadStatus>
                              )}
                            </>
                          ) : (
                            <Note as="span">лише файлом</Note>
                          )}
                        </td>
                        <td>{target.effect}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableScroll>

            <Note>
              «Залити» пише в базу прямо звідси, порціями по {UPLOAD_CHUNK_SIZE} записів, і на
              глибині самого запису (<code>{'matchingCards/{анкета}'}</code>,{' '}
              <code>{'multiData/getInTouch/{власник}/{анкета}'}</code>) — саме там, де правила бази
              дають дозвіл на запис. Тому вона <b>дописує і перезаписує</b> свої записи, але нічого
              не видаляє: анкета, якої немає у файлі, лишається в базі як була. Це слабша операція,
              ніж імпорт у консолі, і саме тому її можна повторювати: обірвалась на середині —
              просто натисніть ще раз.
            </Note>
            <Note>
              Порядок згори вниз: спершу вузли анкети, потім <code>matchingCards</code> (правило
              пускає картку лише до існуючої анкети), потім <code>multiData</code>. Поки заливка
              йде, решта кнопок чекає — база й так приймає порції одну за одною.
            </Note>
            <Warn>
              <code>cleaned-newUsers.json</code> кнопки «Залити» не має навмисно. Це не дозапис, а
              видалення: воно робиться імпортом у консолі, де вузол замінюється цілком, і рішення
              про нього лишається за людиною.
            </Warn>

            <Row style={{ marginTop: 12 }}>
              <SmallGhost
                type="button"
                onClick={() => download('migration-audit', () => buildMigrationAudit(stateRef.current))}
              >
                Download migration-audit.json
              </SmallGhost>
              <SmallGhost
                type="button"
                onClick={() => download('combined-root-patch', () => buildCombinedRootPatch(stateRef.current))}
              >
                Download combined-root-patch.json
              </SmallGhost>
              <SmallGhost
                type="button"
                onClick={() => download('migration-remainders', () => buildRemaindersExport(stateRef.current))}
              >
                Download migration-remainders.json
              </SmallGhost>
            </Row>

            {/*
              Залишок — це не «нічого не сталось», а список того, що міграція
              свідомо не взяла: конфлікти, порожні значення, поля поза жодним
              allowlist. Побачити його треба до того, як `cleaned-newUsers`
              поїде в базу, бо після імпорту питати вже нема в кого.
            */}
            <Note>
              migration-remainders.json — рештки обох колекцій в одному файлі: що з{' '}
              <code>users</code> і <code>newUsers</code> не переїхало у нові вузли, плюс
              підсумок по полях. Це звіт, а не патч: у базу він не імпортується, паролі в
              ньому заміщені позначкою. З <code>users</code> при цьому нічого не видаляється —
              там позначається лише те, що вже скопійовано.
            </Note>

            <Warn>
              combined-root-patch.json — тільки для очей. Не імпортуйте його в корінь: імпорт
              замінює вузол цілком, а в цьому файлі немає ані <code>users</code>, ані{' '}
              <code>searchKey</code>, ані решти <code>multiData</code> — вони просто зникнуть.
              У базу файли їдуть поодинці, кожен у свій шлях із таблиці вище.
            </Warn>
            <Note>
              <code>cleaned-newUsers.json</code> — це і є видалення: він замінює вузол{' '}
              <code>newUsers</code> версією без перенесених полів. Замінює <b>цілком</b>, тож усе,
              що записали в <code>newUsers</code> після викачування вихідних файлів, буде втрачено.
              Тож качайте, мігруйте і заливайте одним заходом, а не через день. Анкети, від яких
              лишився сам <code>userId</code>, у нього не входять — тобто імпорт прибирає і порожні
              оболонки.
            </Note>
            <Note>
              <code>cleaned-collections.json</code> — той самий залишок, але обома колекціями і зі
              справжніми значеннями. У базу він не їде: його завантажують назад у цей інструмент
              кнопкою «Load cleaned-collections.json», щоб продовжити з того місця, де скінчили.
            </Note>
            <Warn>
              Обидва очищені файли не везуть далі шуму: {CLEANED_COLLECTION_NOISE_FIELDS.join(', ')},
              а також будь-який ключ, у якому лежить порожнє значення, і анкету, від якої після
              цього не лишилось жодного ключа. Делегування ({CLEANED_COLLECTION_PRESERVED_FIELDS.join(', ')})
              лишається завжди — воно живе тільки тут; решта прав переїжджає кнопкою Technical. Скільки саме ключів прибрано і яких, видно
              у <code>summary.droppedFields</code> самого файлу; звіт{' '}
              <code>migration-remainders.json</code> показує залишок як є, без цього очищення.
            </Warn>
          </Section>
        )}

        {audit && (
          <Section>
            <SectionTitle>4. Звіт</SectionTitle>
            {/*
              Дві колекції поруч, а не сама лише `newUsers`: питання «що ще не
              переїхало» одне на обидві, і відповідь по одній із них читалась би
              як відповідь по всьому.
            */}
            <Stats>
              <StatLine>
                залишок у newUsers: {formatCount(audit.remainingNewUsers.recordCount)} записів,{' '}
                {formatCount(audit.remainingNewUsers.keyCount)} ключів
              </StatLine>
              <StatLine>
                залишок у users: {formatCount(audit.remainingUsers.recordCount)} записів,{' '}
                {formatCount(audit.remainingUsers.keyCount)} ключів
              </StatLine>
              <StatLine>
                порожніх оболонок (сам userId): newUsers{' '}
                {formatCount(audit.remainingNewUsers.identityOnlyRecordCount)}, users{' '}
                {formatCount(audit.remainingUsers.identityOnlyRecordCount)} — в очищені файли не йдуть
              </StatLine>
              <StatLine>конфліктів у звіті: {formatCount(audit.conflicts.length)}</StatLine>
              {REMAINDER_COLLECTIONS.map(collection => (
                <StatLine key={collection} style={{ gridColumn: '1 / -1' }}>
                  незмаплені поля {collection}:{' '}
                  {formatFieldStats(audit.remainderFieldStats?.[collection]?.unknown)}
                </StatLine>
              ))}
            </Stats>
          </Section>
        )}
      </Shell>
    </KmPage>
  );
};

export default RtdbMigrationTool;
