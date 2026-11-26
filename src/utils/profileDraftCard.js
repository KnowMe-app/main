import { ref, remove, set, update } from 'firebase/database';

import { buildMatchingCardProjection, expandMatchingCard } from './matchingCardIndex';
import { PROFILE_PROPOSAL_LIVE, usesUnifiedProposalStorage } from './profileProposalStoragePaths';

/**
 * Картка чернетки — те, що про чужу чернетку бачить кожен, хто увійшов.
 *
 * Чернетку заводить будь-хто, і система має жити без адміна: знайдена за
 * номером, поштою чи ніком, чернетка мусить відкриватись кожному, навіть коли
 * адмін її ще не прийняв або повернув автору. Але межа приватності та сама,
 * що в анкети поза стрічкою: стороннім видно саму проєкцію (`matchingCards`),
 * а контакти й решта анкети — ні. Тож повний запис чернетки
 * (`heads/create/{автор}/{картка}`) читають лише автор, адміни й інспектор, а
 * поруч кожне збереження кладе цю картку, зібрану тим самим будівником, що й
 * картка стрічки, і лише з дозволених полів (правила: `$other: false`).
 *
 * Знайти чернетку можна за будь-яким контактом, який до неї дописали: шар
 * доповнення пише значення в `searchId` з id цієї картки, тож усі пошуки
 * сходяться до однієї чернетки, а показ — до цієї картки.
 */
export const PROFILE_DRAFT_CARDS_ROOT = `${PROFILE_PROPOSAL_LIVE}/cards`;

export const getProfileDraftCardPath = cardId => (cardId ? `${PROFILE_DRAFT_CARDS_ROOT}/${cardId}` : '');

// Ті самі поля, що в картці стрічки, без похідних опублікованої анкети
// (`feedDate`, `audience`, повна група крові, «Про нас», фото, версії).
export const PROFILE_DRAFT_CARD_FIELDS = Object.freeze([
  'name', 'surnameShort', 'birth', 'city', 'region', 'country', 'role',
  'height', 'weight', 'bmi', 'rh', 'ownKids', 'csection', 'lastDelivery',
  'maritalStatus', 'experience', 'eyeColor', 'hairColor', 'agencyName', 'seekingRole',
]);

export const PROFILE_DRAFT_CARD_META_FIELDS = Object.freeze([
  'createdBy', 'status', 'revision', 'proposalId', 'updatedAt',
]);

const VISIBLE_STATUSES = new Set(['private', 'pendingReview', 'publishing']);

export const buildProfileDraftCard = (cardId, mutation) => {
  if (!cardId || !mutation || mutation.operation !== 'create' || !mutation.createdBy) return null;
  if (!VISIBLE_STATUSES.has(mutation.status)) return null;
  const projection = buildMatchingCardProjection(cardId, { ...(mutation.data || {}), userId: cardId }) || {};
  const card = {};
  PROFILE_DRAFT_CARD_FIELDS.forEach(field => {
    if (projection[field] !== undefined) card[field] = projection[field];
  });
  card.createdBy = mutation.createdBy;
  card.status = mutation.status;
  card.revision = Number(mutation.revision) || 1;
  if (mutation.proposalId) card.proposalId = String(mutation.proposalId);
  card.updatedAt = Number(mutation.updatedAt) || Date.now();
  return card;
};

/**
 * Картка чернетки у формі запису чернетки: `data` — розгорнута проєкція, як
 * у рядка стрічки. Позначка `projectionOnly` каже читачам, що повного запису
 * тут немає: контакти й решта полів сторонньому не віддаються.
 */
export const profileDraftCardToMutation = (cardId, card) => {
  if (!cardId || !card || typeof card !== 'object' || !card.createdBy || !VISIBLE_STATUSES.has(card.status)) return null;
  const projection = {};
  PROFILE_DRAFT_CARD_FIELDS.forEach(field => {
    if (card[field] !== undefined) projection[field] = card[field];
  });
  const expanded = expandMatchingCard(cardId, projection) || { userId: cardId };
  return {
    cardId,
    operation: 'create',
    createdBy: card.createdBy,
    status: card.status,
    revision: Number(card.revision) || 1,
    ...(card.proposalId ? { proposalId: card.proposalId } : {}),
    updatedAt: Number(card.updatedAt) || 0,
    data: { ...expanded, userId: cardId },
    projectionOnly: true,
  };
};

// Запис картки — бухгалтерія після збереження чернетки: відмова не валить
// саме збереження (набране вже в базі), але й не мовчить.
export const writeProfileDraftCard = async (database, cardId, mutation) => {
  if (!usesUnifiedProposalStorage || !cardId) return false;
  const card = buildProfileDraftCard(cardId, mutation);
  try {
    if (card) await set(ref(database, getProfileDraftCardPath(cardId)), card);
    else await remove(ref(database, getProfileDraftCardPath(cardId)));
    return true;
  } catch (error) {
    console.warn('[profileDraftCard] картку чернетки не записано', { cardId, error });
    return false;
  }
};

export const removeProfileDraftCard = async (database, cardId) => {
  if (!usesUnifiedProposalStorage || !cardId) return false;
  try {
    await remove(ref(database, getProfileDraftCardPath(cardId)));
    return true;
  } catch (error) {
    console.warn('[profileDraftCard] картку чернетки не знято', { cardId, error });
    return false;
  }
};

// Дописати картки чернеткам, які заведено до її появи (повний адмін бачить
// усі записи в черзі й має право писати будь-яку картку).
export const backfillProfileDraftCards = async (database, mutations = []) => {
  if (!usesUnifiedProposalStorage) return 0;
  const updates = {};
  mutations.forEach(mutation => {
    const card = buildProfileDraftCard(mutation?.cardId, mutation);
    if (card) updates[getProfileDraftCardPath(mutation.cardId)] = card;
  });
  const count = Object.keys(updates).length;
  if (!count) return 0;
  await update(ref(database), updates);
  return count;
};
