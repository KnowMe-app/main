import { get, orderByChild, query, ref, startAt } from 'firebase/database';
import { auth, database } from './config';

/*
 * Хто з учасників має заповнений Flow — для вибору адміном (16.11, на прохання
 * власниці продукту: адмін веде розрахунки клієнтів у їхньому ж Flow).
 *
 * Перелік — це ключі `multiData/flow`, і SDK бази віддав би їх лише разом із
 * усіма записами всіх людей. Тому ключі питаються REST-запитом з
 * `shallow=true` (той самий квиток входу, ті самі правила: корінь `flow`
 * читають лише адміни й інспектор), а імʼя — з картки `matchingCards/{uid}`,
 * яку адмін і так читає.
 */
export const buildFlowOwnersRestUrl = (databaseURL, idToken, node = 'flow') => {
  const url = new URL(databaseURL);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/multiData/${node}.json`;
  url.searchParams.set('shallow', 'true');
  if (idToken) url.searchParams.set('auth', idToken);
  return url.toString();
};

const readCardName = async uid => {
  try {
    const snapshot = await get(ref(database, `matchingCards/${uid}`));
    const card = snapshot.exists() ? snapshot.val() : null;
    const pick = value => {
      if (Array.isArray(value)) return String(value.filter(Boolean).slice(-1)[0] || '').trim();
      return String(value || '').trim();
    };
    const name = [pick(card?.name), pick(card?.surname)].filter(Boolean).join(' ');
    return pick(card?.agencyName) || name;
  } catch {
    return '';
  }
};

// Той самий перелік для будь-якого вузла «дані під власником»: Flow і
// комуналка (`multiData/utilities`) читаються однаково.
const hasScreenCode = (value, code) => String(value || '').split(',').map(item => item.trim()).includes(code);

/*
 * Кому адмін видав екран (`profileTechnical/{uid}/screenAccess` містить код),
 * — навіть якщо даних у людини ще немає (17.11, на прохання власниці
 * продукту): адмін заводить комуналку чи Flow учасникові сам, а перелік
 * «у кого вже є дані» такої людини не знав. Запит — `orderByChild` з
 * `.indexOn: screenAccess` і межею `startAt('a')`: приходять лише записи з
 * непорожнім рядком кодів, тобто кілька людей, а не весь вузол.
 */
export const listScreenGrantees = async code => {
  const snapshot = await get(query(ref(database, 'profileTechnical'), orderByChild('screenAccess'), startAt('a')));
  const result = [];
  snapshot.forEach(child => {
    if (hasScreenCode(child.val()?.screenAccess, code)) result.push(child.key);
  });
  return result;
};

export const listDataOwners = async (node, { excludeUid, screenCode } = {}) => {
  const user = auth.currentUser;
  if (!user) return [];
  const idToken = await user.getIdToken();
  const [response, grantees] = await Promise.all([
    fetch(buildFlowOwnersRestUrl(database.app.options.databaseURL, idToken, node)),
    // Збій переліку виданих не ховає тих, у кого дані вже є.
    screenCode ? listScreenGrantees(screenCode).catch(error => {
      console.warn('Unable to list screen grantees', error);
      return [];
    }) : Promise.resolve([]),
  ]);
  if (!response.ok) {
    const error = new Error(response.status === 401 ? 'PERMISSION_DENIED' : `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const withData = new Set(Object.keys((await response.json()) || {}));
  const keys = [...new Set([...withData, ...grantees])].filter(uid => uid && uid !== excludeUid);
  const owners = await Promise.all(keys.map(async uid => ({ uid, name: await readCardName(uid), empty: !withData.has(uid) })));
  return owners.sort((a, b) => (a.name || a.uid).localeCompare(b.name || b.uid, 'uk'));
};

export const listFlowOwners = options => listDataOwners('flow', { screenCode: 'flow', ...options });
