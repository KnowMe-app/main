export const ADMIN_UIDS = ['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2'];

// Тестовий акаунт веб-сесій (`MIGRATION_EMAIL`): бачить застосунок очима
// адміна — усі екрани, зокрема `AddNewProfile`, і всі колекції, — але нічого
// не пише. Межа запису стоїть не тут, а в правилах: `database.rules.json` і
// `storage.rules` дають цьому UID лише `.read`, тож будь-яка правка з його
// сесії відлітає з `PERMISSION_DENIED`. Без розгорнутих правил він не читає
// більше, ніж звичайний користувач. Потрібен для дебагу живим застосунком:
// адмінські екрани інакше не відкрити з контейнера взагалі.
export const READONLY_ADMIN_UIDS = ['vtDxkDMjCwYuTDqTUnZsO29bpQr1'];

export const isReadOnlyAdminUid = uid => !!uid && READONLY_ADMIN_UIDS.includes(uid);

export const isAdminUid = uid => !!uid && (ADMIN_UIDS.includes(uid) || READONLY_ADMIN_UIDS.includes(uid));

// UIDs granted Invoice Builder access without full admin rights.
export const INVOICE_BUILDER_UIDS = ['S0VhDLCYjuTFDNLalRa85u7fPcg2'];

export const isInvoiceBuilderUid = uid => !!uid && (isAdminUid(uid) || INVOICE_BUILDER_UIDS.includes(uid));

export const normalizeRole = role => String(role || '').trim().toLowerCase();

export const isNonEdRole = role => {
  const normalizedRole = normalizeRole(role);
  return Boolean(normalizedRole) && normalizedRole !== 'ed';
};

// Рівень доступу (`accessLevel`) і `canCreateProfiles` прибрано 22.11 на
// прохання власниці продукту: службовий доступ до чужих анкет мають лише
// адміни, а картку заводить кожен, хто увійшов (вона стає чернеткою). Значення,
// що лишились у `profileTechnical` старих акаунтів, не читає ні застосунок, ні
// правила бази.
export const canAccessMatchingByRole = ({ role, userRole } = {}) => isNonEdRole(userRole || role);

/*
 * Додаткові екрани, які адмін відкриває окремому користувачеві
 * (`profileTechnical/{uid}/screenAccess`, рядок кодів через кому — `'flow'`).
 *
 * Екран тут лише той, чиї дані й так лежать під власником
 * (`multiData/flow/{uid}` — читає й пише сам власник), тож право відкриває
 * маршрут і пункт меню, а не чужі дані: у нового користувача Flow порожній і
 * свій. Новий екран — рядок у цьому переліку, маршрут у `App` і пункт меню.
 */
export const SCREEN_ACCESS_OPTIONS = Object.freeze([
  Object.freeze({ code: 'flow', path: '/flow', label: 'Flow', description: 'Особисті фінанси: доходи, витрати, розрахунки' }),
  Object.freeze({ code: 'utilities', path: '/utilities', label: 'Комуналка', description: 'Розрахунок комунальних платежів по квартирах' }),
]);

const SCREEN_ACCESS_CODES = new Set(SCREEN_ACCESS_OPTIONS.map(option => option.code));

export const parseScreenAccess = value => {
  const raw = Array.isArray(value) ? value.join(',') : typeof value === 'string' ? value : '';
  const codes = raw
    .split(/[\s,;|]+/)
    .map(code => code.trim().toLowerCase())
    .filter(code => SCREEN_ACCESS_CODES.has(code));
  return [...new Set(codes)];
};

// Порядок — порядок переліку, тож та сама множина дає той самий рядок (і
// збереження форми без зміни нічого не пише).
export const encodeScreenAccess = codes => {
  const selected = new Set(parseScreenAccess(codes));
  return SCREEN_ACCESS_OPTIONS.map(option => option.code).filter(code => selected.has(code)).join(',');
};

export const SCREEN_ACCESS_STORAGE_KEY = 'screenAccess';

export const readStoredScreenAccess = () => (
  typeof localStorage !== 'undefined' ? localStorage.getItem(SCREEN_ACCESS_STORAGE_KEY) || '' : ''
);

export const persistScreenAccess = screenAccess => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SCREEN_ACCESS_STORAGE_KEY, encodeScreenAccess(screenAccess));
  }
};

// Ключі `accessLevel` і `canCreateProfiles` знімаються теж: їх клали на
// пристрій старі збірки, а читати їх більше нема кому.
const LEGACY_ACCESS_STORAGE_KEYS = ['accessLevel', 'canCreateProfiles'];

export const clearStoredAccessRights = () => {
  if (typeof localStorage !== 'undefined') {
    LEGACY_ACCESS_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem(SCREEN_ACCESS_STORAGE_KEY);
  }
};

// `screenAccess` не передали — береться збережене при вході: меню рендеряться
// всередині чужих сторінок і власної анкети не мають, а розійтись із
// маршрутами `App` вони не мусять.
export const resolveAccess = ({ uid, role, userRole, screenAccess } = {}) => {
  const isAdmin = isAdminUid(uid);
  const canAccessMatching = isAdmin || canAccessMatchingByRole({ role, userRole });
  const canAccessAdd = isAdmin;
  const canAccessInvoices = isInvoiceBuilderUid(uid);
  const screens = parseScreenAccess(screenAccess === undefined ? readStoredScreenAccess() : screenAccess);
  const canAccessFlow = isAdmin || screens.includes('flow');
  const canAccessUtilities = isAdmin || screens.includes('utilities');
  // Видані адміном екрани — особлива інструкція (17.11, на прохання власниці
  // продукту): людина, якій відкрили Flow чи комуналку, приходить саме по них,
  // а стрічка й «Мій профіль» для неї — шум. Тож поки в неї є хоч один такий
  // екран, у меню лише вони, а звичайні екрани ведуть на перший із них.
  // Без інструкції — звичайний набір (стрічка, «Мій профіль»). Адмінів це не
  // стосується.
  const specialScreens = isAdmin ? [] : screens;
  const specialScreensOnly = specialScreens.length > 0;

  return {
    isAdmin,
    canAccessMatching,
    canAccessAdd,
    canAccessInvoices,
    canAccessFlow,
    canAccessUtilities,
    specialScreens,
    specialScreensOnly,
  };
};

/*
 * Перший екран не-адміна з відкритим Flow — сам Flow (16.11, на прохання
 * власниці продукту). Ярлик на головному екрані телефона відкриває корінь
 * (`start_url: "."` у маніфесті), а корінь вів не-адміна в «Мій профіль» — і
 * людина, яка заходить сюди лише рахувати, щоразу проходила через анкету.
 * Адмінів це не стосується: їхній корінь — робочий стіл `AddNewProfile`.
 * Одне правило на обидва входи — корінь у `App` і вибір екрана після входу в
 * `LoginScreen`, — інакше ярлик і форма входу вели б у різні місця.
 */
export const FLOW_HOME_ROUTE = '/flow';
// Перший виданий екран у порядку `SCREEN_ACCESS_OPTIONS` (Flow, потім
// комуналка) — і для кореня, і для звичайних екранів такої людини.
export const resolveSpecialHomeRoute = access => {
  if (!access || access.isAdmin || !access.specialScreensOnly) return null;
  const first = SCREEN_ACCESS_OPTIONS.find(option => access.specialScreens.includes(option.code));
  return first ? first.path : null;
};
// Звичайні екрани (стрічка, «Мій профіль», «Створені мною»), яких людина з
// виданими екранами не бачить: адреса веде на її перший екран.
export const REGULAR_SCREEN_PATHS = Object.freeze(['/my-profile', '/matching', '/matching/create-profile']);
export const SPECIAL_SCREEN_PATHS = Object.freeze(SCREEN_ACCESS_OPTIONS.map(option => option.path));

/*
 * Поля, яким правила бази довіряють як правам читача: `multiDataSourceUserIds`
 * (чужі реакції й позначки) і `screenAccess` (видані екрани). Міняти їх може
 * лише двоє адмінів (`ADMIN_UIDS`) — так написано й у `database.rules.json`.
 * Писачі анкети знімають ці поля з усього, що пише не адмін: інакше відмова
 * правил забрала б увесь вузол — разом із датою входу й рештою. Застарілі
 * `accessLevel` і `canCreateProfiles` знімаються з будь-якого запису: їх
 * більше ніхто не пише.
 */
export const PRIVILEGED_PROFILE_FIELDS = Object.freeze(['multiDataSourceUserIds', 'screenAccess']);
export const RETIRED_PROFILE_FIELDS = Object.freeze(['accessLevel', 'canCreateProfiles', 'additionalAccessRules']);

export const canGrantProfilePrivileges = uid => !!uid && ADMIN_UIDS.includes(uid);

export const stripPrivilegedProfileFields = (payload, writerUid) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const stripped = canGrantProfilePrivileges(writerUid)
    ? RETIRED_PROFILE_FIELDS
    : [...RETIRED_PROFILE_FIELDS, ...PRIVILEGED_PROFILE_FIELDS];
  if (!stripped.some(field => Object.prototype.hasOwnProperty.call(payload, field))) return payload;
  const next = { ...payload };
  stripped.forEach(field => { delete next[field]; });
  return next;
};
