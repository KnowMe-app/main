/**
 * Публікація «лише для вподобаних» — третій спосіб показати анкету.
 *
 * Донорка чи сурогатна мама, яка не хоче, щоб її анкету гортав кожен, може
 * відкрити її рівно тим агенціям, клінікам і біологічним батькам, яких сама
 * вподобала (серце в стрічці). Решта не бачить її ні в стрічці, ні в пошуку —
 * так само, як сховану. Ціна — менше пропозицій: анкету побачить менше
 * агенцій, тож і програм запропонують менше. Тому вмикається режим явно, з
 * поясненням, а не замість звичайної публікації.
 *
 * Модель — три місця, і кожне відповідає на своє питання:
 *
 * - **анкета** (`publishAudience: 'liked'` поруч із `publish: false`) — рішення
 *   власниці. `publish` лишається `false` навмисно: увесь код, що питає
 *   `publish`, за замовчуванням вважає таку анкету схованою, і показ
 *   відкривається лише там, де доведено, що читач — у колі. Помилка в
 *   будь-якому забутому місці коштує тоді непоказаної картки, а не
 *   розкритої анкети;
 * - **картка стрічки** (`matchingCards/{id}`: `feedDate: false` +
 *   `audience: 'liked'`) — те, що читають правила бази. Дати в такої картки
 *   немає й бути не може (правило `audience` це перевіряє), тож у запит
 *   стрічки `startAt('')` вона не потрапляє ні в кого;
 * - **право** — сама реакція: `multiData/favorites/{власниця}/{читач}`.
 *   Правила відкривають картку, `profileDetails` і `profileContacts` тому, кого
 *   власниця вподобала, і закривають тієї ж миті, коли вподобання знято.
 *
 * Знайти такі картки читач не може сам — чужі реакції йому закриті. Тож
 * поруч лежить обернений перелік `multiData/likedAudience/{читач}/{власниця}` =
 * час вподобання: його пише власниця, і лише поки режим увімкнено (у
 * звичайній публікації реакції лишаються таємницею, і перелік про них не
 * каже). Перелік — лише адреса: доступу він не дає, право перевіряє база за
 * самою реакцією, тож застарілий запис нічого не відкриває.
 */

export const LIKED_AUDIENCE = 'liked';

/** Поле анкети: рішення власниці, ким бути видимою. */
export const PUBLISH_AUDIENCE_FIELD = 'publishAudience';

/** Поле картки стрічки, яке читають правила бази. */
export const MATCHING_CARD_AUDIENCE_FIELD = 'audience';

/** Обернений перелік: кому власниця відкрила анкету. */
export const LIKED_AUDIENCE_ROOT = 'multiData/likedAudience';

/**
 * Подія вікна після того, як вподобання відкрило чи закрило анкету читачеві:
 * екран, де поставили серце, каже про це людині — лайк у цьому режимі вже не
 * лише «подобається», а й «показати їм мою анкету».
 */
export const LIKED_AUDIENCE_EVENT = 'knowme:liked-audience';

/** Позначка картки, яку стрічка привезла з оберненого переліку читача. */
export const LIKED_AUDIENCE_CARD_FLAG = '__likedAudience';

/**
 * Ролі, яким режим пропонується, — усі ролі матчингу. Спершу він був лише
 * для донорки й СМ, а тоді й агенції, клініки та батьки попросили того
 * самого: показувати анкету — а разом з нею й програми (`multiData/programs`
 * закриті тим самим правилом) — лише тим, кого самі вподобали. Картка в
 * людини одна, тож і режим один на всі її анкети.
 */
export const LIKED_AUDIENCE_ROLES = Object.freeze(['ed', 'sm', 'ag', 'cl', 'ip', 'pp']);

/** Особисті ролі: донорка й СМ шукають агенції, клініки й батьків, а не навпаки. */
const PERSONAL_ROLES = Object.freeze(['ed', 'sm']);

const readScalar = value => (Array.isArray(value) ? value[value.length - 1] : value);

/** Чи анкета (або розгорнута картка) опублікована лише для вподобаних. */
export const isLikedAudienceProfile = data => (
  Boolean(data) && typeof data === 'object'
  && String(readScalar(data[PUBLISH_AUDIENCE_FIELD]) ?? '').trim() === LIKED_AUDIENCE
);

/**
 * Чи картка відкрита колу вподобаних — і в сирій формі з `matchingCards`
 * (`audience`), і в розгорнутій (`publishAudience`, `expandMatchingCard`).
 */
export const isCardSharedWithLikedAudience = card => (
  Boolean(card) && typeof card === 'object' && (
    String(card[MATCHING_CARD_AUDIENCE_FIELD] ?? '').trim() === LIKED_AUDIENCE
    || isLikedAudienceProfile(card)
  )
);

const normalizeRoles = roles => (Array.isArray(roles) ? roles : [roles])
  .map(role => String(role || '').trim().toLowerCase())
  .filter(Boolean);

/** Чи пропонувати режим анкеті з такими ролями: будь-якій відомій ролі матчингу. */
export const canOfferLikedAudiencePublication = (roles = []) => {
  const list = normalizeRoles(roles);
  return list.length > 0 && list.every(role => LIKED_AUDIENCE_ROLES.includes(role));
};

/**
 * Кого власниця вподобовує, а отже, хто й побачить анкету — від цього
 * залежать слова на екрані. Донорка й СМ відкриваються агенціям, клінікам і
 * батькам; агенція, клініка й батьки — донорам, сурогатним мамам і одне
 * одному. Картка з особистою роллю й роллю організації пише про ширше коло.
 */
export const resolveLikedAudienceKind = (roles = []) => {
  const list = normalizeRoles(roles);
  return list.length > 0 && list.every(role => PERSONAL_ROLES.includes(role)) ? 'person' : 'organisation';
};

const isValidKey = id => typeof id === 'string' && id.trim() !== '' && !/[.#$/[\]]/.test(id);

/**
 * Хто серед реакцій власниці справді отримує доступ: кожен ключ мапи
 * вподобаних із truthy-значенням (мітка часу, `true`, роль анкети `'ed'`), крім
 * неї самої.
 */
export const listLikedAudienceViewerIds = (favorites = {}, ownerId = '') => (
  Object.entries(favorites && typeof favorites === 'object' ? favorites : {})
    .filter(([id, value]) => Boolean(value) && isValidKey(id) && id !== ownerId)
    .map(([id]) => id)
);

const readLikedAt = (value, fallback) => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
);

/**
 * Мультилокаційний патч оберненого переліку: увімкнути (час вподобання) чи
 * зняти (`null`) запис для кожного читача. Відносно кореня бази.
 */
export const buildLikedAudiencePatch = ({ ownerId, favorites = {}, viewerIds, enabled, now = Date.now() } = {}) => {
  const owner = String(ownerId || '').trim();
  if (!isValidKey(owner)) return {};
  const ids = Array.isArray(viewerIds) ? viewerIds.filter(isValidKey) : listLikedAudienceViewerIds(favorites, owner);
  return ids.reduce((patch, viewerId) => {
    if (viewerId === owner) return patch;
    patch[`${LIKED_AUDIENCE_ROOT}/${viewerId}/${owner}`] = enabled ? readLikedAt(favorites?.[viewerId], now) : null;
    return patch;
  }, {});
};

/** Власниці з оберненого переліку читача — свіжіше вподобання першим. */
export const orderLikedAudienceOwnerIds = (map = {}) => (
  Object.entries(map && typeof map === 'object' ? map : {})
    .filter(([id, value]) => isValidKey(id) && Boolean(value))
    .sort(([idA, a], [idB, b]) => (readLikedAt(b, 0) - readLikedAt(a, 0)) || idB.localeCompare(idA))
    .map(([id]) => id)
);
