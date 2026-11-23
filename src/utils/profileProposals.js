import {
  applyOverlayToCard,
  buildOverlayFromDraft,
  isPlainObject,
  normalizeArray,
  normalizeOverlayFields,
} from './profileFieldChanges';

/**
 * Обидві операції мають автора, стабільний ID, час, стан і ревізію.
 * Нова пропозиція починається з pendingReview і ревізії 1. Старий запис
 * зберігає свій стан і відому ревізію. null означає невідому ревізію.
 *
 * create тримає дані нової анкети й зарезервований ID картки. identityKeys —
 * записані посилання на заявки, стан самих заявок перевіряє сховище.
 * update тримає ціль, зміни та оригінали лише змінених полів. Пара from/to
 * зберігає заміну або очищення. added/removed — окремі значення, тому
 * одночасні додавання й видалення зі списку не означають парної заміни.
 * Якщо редактор знає, яке значення замінили, він передає replacements поруч
 * із фінальними значеннями в edits. Пари from/to зберігають зв'язок для
 * розгляду, а added/removed — порядок накладання всіх змін списку.
 * Відсутній запис в originalValues означає невідому базу. present: false
 * означає, що поле точно було відсутнє, а '' зберігає відоме порожнє поле.
 * Передавати треба значення після нормалізації форми. Відсутня або undefined
 * правка не зачіпає поля, null або порожній рядок очищає його.
 *
 * Старий шар може посилатись на неопубліковану чернетку. Якщо її вже знайшов
 * викликач, targetCreateProposalId зберігає цей зв'язок. Перегляд накладає
 * зміни для показу. Перевірка прав, станів і конфліктів належить сервісу.
 */
const key = value => (typeof value === 'string' && value.trim() ? value : null);
const owns = (record, field) => Object.prototype.hasOwnProperty.call(record, field);

// Знімки анкети містять JSON-значення. Копія має відв'язати й вкладені поля,
// бо і редактор, і перегляд можуть змінювати свої дані після створення пропозиції.
const copyProfileValue = value => {
  if (Array.isArray(value)) return value.map(copyProfileValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, copyProfileValue(item)]));
};

const sameProfileValue = (left, right) => {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  } else if (!isPlainObject(left) || !isPlainObject(right)) {
    return false;
  }
  const fields = Object.keys(left);
  return fields.length === Object.keys(right).length
    && fields.every(field => owns(right, field) && sameProfileValue(left[field], right[field]));
};

// Нова пропозиція відв'язана від анкети. Для порівняння списків стара
// утиліта має отримати ті самі посилання на рівні за вмістом значення.
const matchProfileValues = (value, original) => {
  const baseValues = normalizeArray(original);
  const match = item => baseValues.find(base => sameProfileValue(base, item)) ?? item;
  return Array.isArray(value) ? value.map(match) : match(value);
};

const addListReplacements = (changes, replacements, editedValues) => {
  Object.entries(replacements).forEach(([field, pairs]) => {
    if (!Array.isArray(pairs)) throw new TypeError('Field replacements must be a list');
    if (!pairs.length) return;

    const change = changes[field];
    const unpaired = [...(change?.removed ?? [])];
    const next = normalizeArray(editedValues[field]);
    const matched = pairs.map(pair => {
      const index = unpaired.findIndex(value => sameProfileValue(value, pair?.from));
      if (index < 0 || !next.some(value => sameProfileValue(value, pair?.to))) {
        throw new TypeError('A list replacement requires a removed original and a resulting value');
      }
      const [from] = unpaired.splice(index, 1);
      return { from, to: pair.to };
    });
    change.replacements = matched;
  });
};

const proposalHeader = ({ id, operation, createdBy, createdAt, updatedAt, revision, status }) => ({
  id, operation, createdBy, createdAt, updatedAt, revision, status,
});

const newProposalHeader = ({ id, operation, createdBy, at }) => {
  if (!key(id) || !key(createdBy)) throw new TypeError('Proposal ID and creator are required');
  if (!Number.isSafeInteger(at) || at < 0) throw new TypeError('Proposal timestamp is required');
  return proposalHeader({
    id, operation, createdBy, createdAt: at, updatedAt: at, revision: 1, status: 'pendingReview',
  });
};

export const buildCreateProposal = ({ id, reservedCardId, createdBy, at, data, identityKeys = [] }) => {
  if (!key(reservedCardId)) throw new TypeError('Reserved card ID is required');
  if (!isPlainObject(data)) throw new TypeError('Create proposal data is required');
  if (!Array.isArray(identityKeys)) throw new TypeError('Identity keys must be a list');

  const fields = Object.fromEntries(
    Object.entries(data).filter(([field, value]) => !field.startsWith('__') && value !== undefined),
  );

  return {
    ...newProposalHeader({ id, operation: 'create', createdBy, at }),
    reservedCardId,
    targetCardId: null,
    data: copyProfileValue({ ...fields, userId: reservedCardId }),
    identityKeys: [...identityKeys],
  };
};

export const buildUpdateProposal = ({
  id, targetCardId, createdBy, at, canonical, edits, replacements = {}, baseCardRevision = canonical?.rev ?? null,
}) => {
  if (!key(targetCardId)) throw new TypeError('Target card ID is required');
  if (!isPlainObject(canonical) || (canonical.userId && canonical.userId !== targetCardId)) {
    throw new TypeError('Canonical profile for the target card is required');
  }
  if (edits != null && !isPlainObject(edits)) throw new TypeError('Profile edits must be keyed by field');
  if (!isPlainObject(replacements)) throw new TypeError('List replacements must be keyed by field');

  const getOriginal = field => (owns(canonical, field) ? canonical[field] : undefined);
  const touched = Object.entries(edits ?? {}).filter(([field, value]) => (
    value !== undefined && !field.startsWith('__') && !sameProfileValue(getOriginal(field), value)
  ));
  const before = Object.fromEntries(touched.map(([field]) => [field, getOriginal(field)]));
  const after = Object.fromEntries(touched.map(([field, value]) => [
    field,
    Array.isArray(value) || Array.isArray(before[field]) ? matchProfileValues(value, before[field]) : value,
  ]));
  const delta = buildOverlayFromDraft(before, after);
  addListReplacements(delta, replacements, after);
  const changedFields = Object.keys(delta);
  if (!changedFields.length) return null;

  // Порожнє «звідки» в старій парі означало додавання. Нова пропозиція
  // зберігає його окремо від заміни, щоб застосування не витерло інші значення.
  const changes = Object.fromEntries(Object.entries(delta).map(([field, change]) => [
    field,
    change.from === '' && change.to !== '' ? { added: [change.to] } : change,
  ]));
  const originalValues = Object.fromEntries(changedFields.map(field => [
    field,
    before[field] !== undefined
      ? { present: true, value: before[field] }
      : { present: false },
  ]));

  return {
    ...newProposalHeader({ id, operation: 'update', createdBy, at }),
    targetCardId,
    baseCardRevision,
    changes: copyProfileValue(changes),
    originalValues: copyProfileValue(originalValues),
  };
};

export const buildProposalPreview = (proposal, canonical) => {
  if (proposal?.operation === 'create') {
    return copyProfileValue({ ...proposal.data, userId: proposal.reservedCardId });
  }
  if (proposal?.operation !== 'update' || !isPlainObject(canonical)) return null;
  if (canonical.userId && canonical.userId !== proposal.targetCardId) return null;
  // Старий запис розбирається один раз. У записах зі старим add і парою
  // from/to повторна нормалізація могла б змінити спосіб накладання.
  const fields = proposal.legacy
    ? { ...proposal.changes, ...proposal.legacy.fields }
    : Object.fromEntries(Object.entries(proposal.changes).map(([field, change]) => [field, {
      ...change,
      ...(change.added && { added: matchProfileValues(change.added, canonical[field]) }),
      ...(change.removed && { removed: matchProfileValues(change.removed, canonical[field]) }),
    }]));
  return copyProfileValue(applyOverlayToCard(canonical, fields));
};

const legacyKey = (stored, fromPath) => (
  stored != null && fromPath != null && stored !== fromPath ? null : key(fromPath ?? stored)
);

const legacyId = (operation, parentKey, childKey) => (
  `legacy:${operation}:${encodeURIComponent(parentKey)}:${encodeURIComponent(childKey)}`
);

const legacyNumber = value => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};

export const normalizeLegacyCreateProposal = (record, { creatorUid, cardId } = {}) => {
  if (!isPlainObject(record) || (record.operation != null && record.operation !== 'create')) return null;
  const createdBy = legacyKey(record.createdBy, creatorUid);
  const reservedCardId = legacyKey(record.cardId, cardId);
  if (!createdBy || !reservedCardId) return null;

  return {
    ...proposalHeader({
      id: legacyId('create', createdBy, reservedCardId),
      operation: 'create',
      createdBy,
      createdAt: legacyNumber(record.createdAt),
      updatedAt: legacyNumber(record.updatedAt),
      revision: legacyNumber(record.revision),
      status: record.status ?? null,
    }),
    reservedCardId,
    targetCardId: null,
    data: copyProfileValue({ ...record.data, userId: reservedCardId }),
    identityKeys: copyProfileValue(record.identityKeys ?? []),
    acceptedAt: legacyNumber(record.acceptedAt),
    legacy: { source: 'profileMutations', creatorUid: createdBy, cardId: reservedCardId },
  };
};

export const normalizeLegacyOverlayProposal = (record, { editorUid, cardId, targetCreateProposalId } = {}) => {
  if (!isPlainObject(record) || !isPlainObject(record.fields)) return null;
  const createdBy = legacyKey(record.editorUserId, editorUid);
  const targetCardId = legacyKey(record.cardUserId, cardId);
  if (!createdBy || !targetCardId) return null;

  const changes = normalizeOverlayFields(record.fields);
  // Старі заміни списків під час перегляду стають різницею наборів. Зберігаємо
  // вихідний запис лише там, де нормалізація змінила його або пропустила поле.
  const originalFields = Object.fromEntries(
    Object.entries(record.fields).filter(([field, change]) => !owns(changes, field) || changes[field] !== change),
  );
  return {
    ...proposalHeader({
      id: legacyId('update', targetCardId, createdBy),
      operation: 'update',
      createdBy,
      createdAt: null,
      updatedAt: legacyNumber(record.updatedAt),
      revision: null,
      status: 'pendingReview',
    }),
    targetCardId,
    ...(targetCreateProposalId ? { targetCreateProposalId } : {}),
    baseCardRevision: null,
    changes: copyProfileValue(changes),
    originalValues: {},
    legacy: {
      source: 'edits',
      cardId: targetCardId,
      editorUid: createdBy,
      ...(record.adminOnly === true ? { adminOnly: true } : {}),
      ...(Object.keys(originalFields).length ? { fields: copyProfileValue(originalFields) } : {}),
    },
  };
};
