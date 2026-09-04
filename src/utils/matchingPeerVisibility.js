import { normalizeProfileRole } from './profileRole';

/**
 * Донорка не гортає стрічку інших донорок.
 *
 * Стрічка матчингу відповідає на питання «кого мені шукати», і в донорки це
 * питання інше: вона в цій стрічці — не читач каталогу, а сама анкета. Показ
 * чужих донорських анкет не давав їй нічого, крім чужих фото й метрик, — і саме
 * тому картки колег звідти прибрані.
 *
 * Прибрані **зі стрічки**, а не з пошуку. Це і є межа цього правила: якщо
 * донорка вводить конкретний контакт чи імʼя, вона питає про конкретну людину,
 * і мовчати у відповідь означало б не відповісти на запит — так само, як це
 * було б із неопублікованою анкетою. Тому воно застосовується лише до деки за
 * замовчуванням: пошук, реакції й окремо надані картки проходять повз нього.
 *
 * Три винятки — свідомі:
 *
 * - **власна анкета** лишається видимою: це єдина картка, яку читачка веде;
 * - **явно наданий доступ** (`__matchingAccessAllowed`) б'є це правило так
 *   само, як б'є `publish`: правила додаткового доступу для того й існують;
 * - **анкета кількох ролей** ховається лише тоді, коли всі її ролі — `ed`.
 *   Агенція, яка заявила себе ще й доноркою, лишається агенцією.
 */

const PEER_HIDDEN_VIEWER_ROLE = 'ed';

const roleValues = value => {
  if (Array.isArray(value)) return value.flatMap(roleValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(roleValues);
  const text = String(value ?? '').trim();
  return text ? [text] : [];
};

/** Ролі картки — нормалізовані й без порожніх. Порядок збережено. */
export const listProfileRoles = user => [
  ...new Set(
    [...roleValues(user?.userRole), ...roleValues(user?.role)]
      .map(value => normalizeProfileRole(value.toLowerCase()))
      .filter(Boolean),
  ),
];

/** Чи ця людина дивиться стрічку як донорка. */
export const isDonorViewer = viewerRole =>
  normalizeProfileRole(String(viewerRole ?? '').trim().toLowerCase()) === PEER_HIDDEN_VIEWER_ROLE;

/** Чи ця картка — колега по ролі, тобто донорка і тільки донорка. */
export const isPeerDonorCard = user => {
  const roles = listProfileRoles(user);
  return roles.length > 0 && roles.every(role => role === PEER_HIDDEN_VIEWER_ROLE);
};

/**
 * Прибирає з деки картки колег. Поза декою за замовчуванням не застосовується —
 * рішення про це ухвалює викликач.
 */
export const hidePeerDonorCards = ({ users = [], viewerRole, viewerId } = {}) => {
  if (!isDonorViewer(viewerRole)) return users;
  const ownId = String(viewerId || '').trim();

  return users.filter(user => {
    if (!user) return false;
    if (ownId && String(user.userId || '').trim() === ownId) return true;
    if (user.__matchingAccessAllowed === true) return true;
    return !isPeerDonorCard(user);
  });
};
