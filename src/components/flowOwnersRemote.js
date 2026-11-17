import { get, ref } from 'firebase/database';
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
export const listDataOwners = async (node, { excludeUid } = {}) => {
  const user = auth.currentUser;
  if (!user) return [];
  const idToken = await user.getIdToken();
  const response = await fetch(buildFlowOwnersRestUrl(database.app.options.databaseURL, idToken, node));
  if (!response.ok) {
    const error = new Error(response.status === 401 ? 'PERMISSION_DENIED' : `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const keys = Object.keys((await response.json()) || {}).filter(uid => uid && uid !== excludeUid);
  const owners = await Promise.all(keys.map(async uid => ({ uid, name: await readCardName(uid) })));
  return owners.sort((a, b) => (a.name || a.uid).localeCompare(b.name || b.uid, 'uk'));
};

export const listFlowOwners = options => listDataOwners('flow', options);
