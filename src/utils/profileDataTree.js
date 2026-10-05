import { PROFILE_NODES } from 'utils/profileNodeSchema';
import { SEARCH_ID_ROOT, buildSearchIdValueKey, getSearchIdIndexedFields } from 'utils/searchKeyUtils';
import { isLongFormatUserId } from 'utils/userIdFormat';

/*
 * Усе, що база знає про одну картку, — деревом, по місцях, де воно лежить.
 *
 * Анкета розкладена по пʼяти вузлах, а поруч із нею живе ще з десяток
 * сховищ: позначки власника (`getInTouch`, `writer`, графік стимуляції),
 * нотатки, реакції, шари доповнень і їхній журнал, чернетка з журналом,
 * відгуки, програми, ключі `searchId`. Форма адміна показувала самі лише
 * поля анкети, і все інше видно було тільки з консолі Firebase — а там
 * треба памʼятати, де що лежить. Графік стимуляції, наприклад, у форму не
 * доїжджав зовсім, і поля для нього не було.
 *
 * Тут — перелік цих місць для однієї картки. Кожне джерело — шлях, який
 * читається одним точковим `get` і пишеться прямо за адресою, як у консолі.
 *
 * Чого тут навмисно немає:
 *   — `users/{id}`: legacy-дзеркало веб не читає ніколи (див. CLAUDE.md),
 *     тож воно стоїть посиланням у консоль без читання;
 *   — `searchKey`: бакет лежить під значенням фільтра, і знайти всі бакети
 *     картки можна лише обходом усього індексу;
 *   — `multiData/flow`: розкладено за датами, а не за карткою.
 */

export const PROFILE_DATA_TREE_GROUPS = Object.freeze({
  profile: 'Анкета',
  draft: 'Чернетка',
  owner: 'Ваші позначки до картки',
  edits: 'Доповнення редакторів',
  public: 'Відгуки й програми',
  search: 'Індекс пошуку searchId',
  account: 'Що цей користувач веде сам',
  external: 'Поза Realtime Database',
});

const PROFILE_NODE_TITLES = {
  [PROFILE_NODES.matchingCards]: 'Картка стрічки',
  [PROFILE_NODES.profileContacts]: 'Контакти',
  [PROFILE_NODES.profileDetails]: 'Анкета',
  [PROFILE_NODES.profileWorkflow]: 'Робота з анкетою',
  [PROFILE_NODES.profileTechnical]: 'Технічне',
};

// Сховища, де картка лежить під тим, хто дивиться: `{шлях}/{власник}/{картка}`.
const OWNER_CARD_STORES = [
  ['getInTouch', 'Звʼязатись'],
  ['writer', 'Хто веде'],
  ['stimulationSchedule', 'Графік стимуляції'],
  ['stimulation', 'Таблиця стимуляції'],
  ['stimulationShortcuts', 'Ярлик графіка'],
  ['comments', 'Особиста нотатка'],
  ['favorites', 'Вподобано'],
  ['dislikes', 'Не цікаво'],
  ['contactViews', 'Дотики до контактів'],
];

// Те саме, але вузол самого користувача цілком: його реакції, нотатки, чернетки.
// Буває великим (в адміна — тисячі записів), тож читається лише на розгортання.
const ACCOUNT_OWNER_STORES = [
  ['profileMutations', 'Заведені чернетки'],
  ['favorites', 'Вподобані'],
  ['dislikes', 'Не цікаві'],
  ['getInTouch', 'Звʼязатись'],
  ['writer', 'Хто веде'],
  ['stimulationSchedule', 'Графіки стимуляції'],
  ['stimulation', 'Таблиці стимуляції'],
  ['stimulationShortcuts', 'Ярлики графіків'],
  ['comments', 'Особисті нотатки'],
  ['contactViews', 'Дотики до контактів'],
  ['searchQueries', 'Історія пошуку'],
  ['editsByEditor', 'Картки, які доповнював'],
];

const text = value => String(value ?? '').trim();

const collectFieldValues = value => {
  if (Array.isArray(value)) return value.flatMap(collectFieldValues);
  if (value === null || value === undefined || typeof value === 'object') return [];
  const normalized = text(value);
  return normalized ? [normalized] : [];
};

/** Ключі `searchId`, під якими мусить лежати ця картка, — з її ж значень. */
export const listSearchIdSourcesForRecord = record => {
  const seen = new Set();
  const sources = [];
  getSearchIdIndexedFields().forEach(field => {
    collectFieldValues(record?.[field]).forEach(value => {
      const valueKey = buildSearchIdValueKey(field, value);
      if (!valueKey || seen.has(valueKey)) return;
      seen.add(valueKey);
      sources.push({
        id: `searchId:${valueKey}`,
        group: 'search',
        title: `${field}: ${value}`,
        segments: [SEARCH_ID_ROOT, valueKey],
      });
    });
  });
  return sources;
};

/**
 * Перелік джерел для картки.
 *
 * `viewerId` — хто дивиться: позначки власника лежать під ним. `draftAuthorId`
 * — автор чернетки, якщо форма його знає; інакше автора називає
 * `profileMutationOwners/{картка}`, і компонент дочитує чернетку слідом.
 */
export const buildProfileDataSources = ({ cardId, viewerId = '', draftAuthorId = '', record = null } = {}) => {
  const id = text(cardId);
  if (!id) return [];
  const viewer = text(viewerId);
  const author = text(draftAuthorId);

  const sources = Object.keys(PROFILE_NODE_TITLES).map(node => ({
    id: `node:${node}`,
    group: 'profile',
    title: PROFILE_NODE_TITLES[node],
    segments: [node, id],
  }));

  sources.push(
    {
      id: 'draft:owner',
      group: 'draft',
      title: 'Автор чернетки',
      segments: ['multiData', 'profileMutationOwners', id],
    },
    ...(author ? [{
      id: `draft:record:${author}`,
      group: 'draft',
      title: 'Запис чернетки',
      segments: ['multiData', 'profileMutations', author, id],
    }] : []),
    {
      id: 'draft:history',
      group: 'draft',
      title: 'Журнал чернетки',
      segments: ['multiData', 'profileMutationHistory', id],
    },
  );

  if (viewer) {
    OWNER_CARD_STORES.forEach(([store, title]) => {
      sources.push({
        id: `owner:${store}`,
        group: 'owner',
        title,
        segments: ['multiData', store, viewer, id],
      });
    });
  }

  sources.push(
    { id: 'edits:layers', group: 'edits', title: 'Шари доповнень', segments: ['multiData', 'edits', id] },
    { id: 'edits:history', group: 'edits', title: 'Журнал доповнень', segments: ['multiData', 'editsHistory', id] },
    { id: 'public:comments', group: 'public', title: 'Публічні відгуки', segments: ['comments', id] },
    { id: 'public:programs', group: 'public', title: 'Програми', segments: ['multiData', 'programs', id] },
    ...listSearchIdSourcesForRecord(record),
  );

  // Довгий id — анкета акаунта: людина, яка сама гортає стрічку, реагує,
  // заводить чернетки. Її власні вузли теж «дані по цьому юзеру».
  if (isLongFormatUserId(id)) {
    ACCOUNT_OWNER_STORES.forEach(([store, title]) => {
      sources.push({
        id: `account:${store}`,
        group: 'account',
        title,
        segments: ['multiData', store, id],
        lazy: true,
      });
    });
    sources.push(
      { id: 'account:usersIndex', group: 'account', title: 'usersIndex', segments: ['usersIndex', id], lazy: true },
      {
        id: 'external:firestore',
        group: 'external',
        title: 'Firestore users',
        segments: ['users', id],
        store: 'firestore',
        lazy: true,
        readOnly: true,
      },
    );
  }

  sources.push({
    id: 'external:legacy',
    group: 'external',
    title: 'Legacy users (не читається)',
    segments: ['users', id],
    linkOnly: true,
  });

  return sources;
};

/** Значення з дерева назад у тип, який там лежав: правила бази звіряють тип. */
export const castTreeInput = (original, raw) => {
  if (typeof original === 'number') {
    const trimmed = String(raw).replace(',', '.').trim();
    const parsed = Number(trimmed);
    return trimmed !== '' && Number.isFinite(parsed) ? parsed : raw;
  }
  if (typeof original === 'boolean') return raw === true || raw === 'true';
  return raw;
};

export const setInTree = (source, path, value) => {
  if (!path.length) return value;
  const [head, ...rest] = path;
  const base = Array.isArray(source) ? [...source] : { ...(source && typeof source === 'object' ? source : {}) };
  base[head] = setInTree(base[head], rest, value);
  return base;
};

export const removeFromTree = (source, path) => {
  if (!path.length) return null;
  const [head, ...rest] = path;
  if (!source || typeof source !== 'object') return source;
  if (!rest.length) {
    if (Array.isArray(source)) {
      const next = [...source];
      delete next[head];
      return next;
    }
    const { [head]: _removed, ...kept } = source;
    return Object.keys(kept).length ? kept : null;
  }
  const base = Array.isArray(source) ? [...source] : { ...source };
  base[head] = removeFromTree(base[head], rest);
  if (base[head] === null || base[head] === undefined) delete base[head];
  return Array.isArray(base) || Object.keys(base).length ? base : null;
};

/** Короткий підпис згорнутого вузла. */
export const describeTreeValue = value => {
  if (value === null || value === undefined) return 'немає';
  if (Array.isArray(value)) return `${value.filter(item => item !== undefined).length} ел.`;
  if (typeof value === 'object') {
    const count = Object.keys(value).length;
    return `${count} ${count === 1 ? 'ключ' : 'ключів'}`;
  }
  return '';
};
