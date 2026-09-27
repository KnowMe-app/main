import { listProfileRoles } from './matchingPeerVisibility';

/**
 * Акаунти, у яких роль розійшлась між карткою стрічки й Firestore.
 *
 * Форма входу щоразу вимагала обрати роль (лише «донорка» чи «агенція») і
 * писала її в Firestore `users/{uid}` та legacy `users/{uid}`, а картки
 * `matchingCards/{uid}` не чіпала. «Мій профіль» читав роль із Firestore,
 * стрічка — з картки, тож людина бачила в профілі одну роль, а гортала деку
 * іншої. Правдивою тут вважається картка: її пишуть реєстрація й зміна ролі в
 * «Моєму профілі» (`updateProfileRole`), тобто явний вибір людини, а не
 * радіокнопка на формі входу.
 *
 * Картка з кількома ролями (`['ip', 'ag']`) — окремий випадок: так її міг
 * зібрати `deriveRole` з ролі входу й справжньої, і котра з них правдива, код
 * не знає. Такі акаунти лише називаються — вирішує людина в «Моєму профілі».
 *
 * @param {object} params
 * @param {Record<string, object>} params.cards — `matchingCards` за id.
 * @param {Record<string, {userRole?: unknown, role?: unknown}>} params.firestoreRoles
 *   — роль з документа Firestore `users/{uid}` за id.
 */
export const buildRoleDivergencePlan = ({ cards = {}, firestoreRoles = {} } = {}) => {
  const mismatched = [];
  const multiRole = [];
  const updates = {};

  Object.entries(firestoreRoles || {}).forEach(([id, stored]) => {
    const card = cards?.[id];
    if (!card) return;
    const cardRoles = listProfileRoles({ role: card.role });
    if (!cardRoles.length) return;
    if (cardRoles.length > 1) {
      multiRole.push({ id, roles: cardRoles });
      return;
    }
    const cardRole = cardRoles[0];
    // Обидва написання разом: вхід писав лише `userRole`, тож `role` у тому ж
    // документі часто лишався правдивим, і звіт мусить показати обидва.
    const storedRoles = listProfileRoles(stored || {});
    const alreadyAligned = storedRoles.length === 1 && storedRoles[0] === cardRole;
    if (alreadyAligned) return;
    mismatched.push({ id, cardRole, firestoreRole: storedRoles.join(', ') });
    updates[id] = { userRole: cardRole, role: cardRole };
  });

  return { mismatched, multiRole, updates };
};

export default buildRoleDivergencePlan;
