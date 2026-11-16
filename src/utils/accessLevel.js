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

const normalize = level =>
  String(level || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '')
    .replace(/&/g, 'and');

export const normalizeRole = role => String(role || '').trim().toLowerCase();

export const isNonEdRole = role => {
  const normalizedRole = normalizeRole(role);
  return Boolean(normalizedRole) && normalizedRole !== 'ed';
};

const parseAccessLevel = accessLevel => {
  const level = normalize(accessLevel);
  if (!level) {
    return { hasMatching: false, hasAdd: false };
  }

  const hasMatching = level.includes('matching');
  const hasAdd = level.includes('add') || level.includes('addnewprofile');

  return { hasMatching, hasAdd };
};

export const canAccessMatchingByLevel = accessLevel => {
  const { hasMatching } = parseAccessLevel(accessLevel);
  return hasMatching;
};

export const canAccessMatchingByRole = ({ role, userRole } = {}) => isNonEdRole(userRole || role);

export const canAccessAddByLevel = accessLevel => {
  const { hasAdd } = parseAccessLevel(accessLevel);
  return hasAdd;
};

export const ACCESS_LEVEL_STORAGE_KEY = 'accessLevel';

/**
 * Рівень доступу, збережений при вході.
 *
 * `null` — це не «немає прав», а «застосунок ще не знає»: ключ зникає на виході
 * і зʼявляється назад лише після того, як прочитано власну анкету. Різниця між
 * ним і порожнім рядком (звичайний користувач без жодного рівня) важлива для
 * тих, хто вирішує за цим значенням, що показувати.
 */
export const readStoredAccessLevel = () => (
  typeof localStorage !== 'undefined' ? localStorage.getItem(ACCESS_LEVEL_STORAGE_KEY) : null
);

export const CAN_CREATE_PROFILES_STORAGE_KEY = 'canCreateProfiles';

export const readStoredCanCreateProfiles = () => (
  typeof localStorage !== 'undefined'
  && localStorage.getItem(CAN_CREATE_PROFILES_STORAGE_KEY) === 'true'
);

export const persistCanCreateProfiles = canCreateProfiles => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CAN_CREATE_PROFILES_STORAGE_KEY, String(canCreateProfiles === true));
  }
};

/*
 * Додаткові екрани, які адмін відкриває окремому користувачеві
 * (`profileTechnical/{uid}/screenAccess`, рядок кодів через кому — `'flow'`).
 *
 * Окреме поле, а не ще один токен у `accessLevel`: правила бази порівнюють
 * `accessLevel` **точним рядком** (`== 'matching:view&write'`), і дописаний
 * `,flow` мовчки зняв би людині вже видане право на запис у матчингу.
 *
 * Екран тут лише той, чиї дані й так лежать під власником
 * (`multiData/flow/{uid}` — читає й пише сам власник), тож право відкриває
 * маршрут і пункт меню, а не чужі дані: у нового користувача Flow порожній і
 * свій. Новий екран — рядок у цьому переліку, маршрут у `App` і пункт меню.
 */
export const SCREEN_ACCESS_OPTIONS = Object.freeze([
  Object.freeze({ code: 'flow', path: '/flow', label: 'Flow', description: 'Особисті фінанси: доходи, витрати, розрахунки' }),
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

export const clearStoredAccessRights = () => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(CAN_CREATE_PROFILES_STORAGE_KEY);
    localStorage.removeItem(SCREEN_ACCESS_STORAGE_KEY);
  }
};

// `screenAccess` не передали — береться збережене при вході: меню рендеряться
// всередині чужих сторінок і власної анкети не мають, а розійтись із
// маршрутами `App` вони не мусять.
export const resolveAccess = ({ uid, accessLevel, role, userRole, canCreateProfiles = false, screenAccess } = {}) => {
  const isAdmin = isAdminUid(uid);
  const canAccessMatching = isAdmin || canAccessMatchingByLevel(accessLevel) || canAccessMatchingByRole({ role, userRole });
  const canAccessAdd = isAdmin || canAccessAddByLevel(accessLevel);
  const canAccessInvoices = isInvoiceBuilderUid(uid);
  const canCreateProfilesResolved = isAdmin || canCreateProfiles === true;
  const screens = parseScreenAccess(screenAccess === undefined ? readStoredScreenAccess() : screenAccess);
  const canAccessFlow = isAdmin || screens.includes('flow');

  return {
    isAdmin,
    canAccessMatching,
    canAccessAdd,
    canAccessInvoices,
    canCreateProfiles: canCreateProfilesResolved,
    canAccessFlow,
  };
};

/*
 * Поля, яким правила бази довіряють як правам читача: `accessLevel`
 * (службовий доступ до всіх анкет), `canCreateProfiles` і
 * `multiDataSourceUserIds` (чужі реакції й позначки). Міняти їх може лише
 * двоє адмінів (`ADMIN_UIDS`) — так тепер написано й у `database.rules.json`:
 * поки власник міг писати їх у свій `users/{uid}` чи `profileTechnical/{uid}`
 * сам, будь-хто, хто увійшов, ставив собі `matching:view` і читав контакти
 * будь-якої, навіть схованої, анкети.
 *
 * Писачі анкети знімають ці поля з усього, що пише не адмін: інакше
 * збереження, яке везе їх із Firestore (там вони можуть відрізнятися від
 * бази), правила відкинули б цілим вузлом — разом із датою входу й рештою.
 */
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
export const resolveFlowHomeRoute = access =>
  (access && !access.isAdmin && access.canAccessFlow ? FLOW_HOME_ROUTE : null);

export const PRIVILEGED_PROFILE_FIELDS = Object.freeze(['accessLevel', 'canCreateProfiles', 'multiDataSourceUserIds', 'screenAccess']);

export const canGrantProfilePrivileges = uid => !!uid && ADMIN_UIDS.includes(uid);

export const stripPrivilegedProfileFields = (payload, writerUid) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (canGrantProfilePrivileges(writerUid)) return payload;
  if (!PRIVILEGED_PROFILE_FIELDS.some(field => Object.prototype.hasOwnProperty.call(payload, field))) return payload;
  const next = { ...payload };
  PRIVILEGED_PROFILE_FIELDS.forEach(field => { delete next[field]; });
  return next;
};
