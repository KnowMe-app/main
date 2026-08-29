import { expandMatchingCard, MATCHING_SUMMARY_FLAG } from './matchingCardIndex';

/**
 * Збирає анкету назад із розділених вузлів.
 *
 * Чистий код без бази: на вхід — те, що прочитали, на вихід — обʼєкт тієї самої
 * форми, яку решта застосунку знала завжди. Це і є суть адаптера: розділення
 * вузлів не має бути видно ані `renderFacts`, ані фільтрам, ані формі анкети.
 *
 * Порядок накладання не випадковий. Картка стрічки йде першою, бо в ній лежать
 * похідні — ініціал замість прізвища, розібрана група крові. Потім `details`
 * кладе згори повні значення і затирає похідні: у повній анкеті має бути
 * «Коваленко», а не «К.». Далі контакти, робочі позначки і технічне — вони не
 * перетинаються ні з чим.
 *
 * Тобто дублікатів між вузлами немає, а там, де деталізація навмисно різна,
 * виграє детальніше значення.
 */

/** Похідні картки, які повне значення з `profileDetails` має право затерти. */
const CARD_DERIVED_OVERRIDABLE = {
  surname: 'surname',
  blood: 'blood',
};

const isFilled = value => value !== undefined && value !== null && value !== '';

const hasAnyNode = nodes => nodes.some(node => node && typeof node === 'object' && Object.keys(node).length);

/**
 * @param {object} parts
 * @param {string} parts.userId
 * @param {object|null} parts.card       сирий вузол `matchingCards/{id}`
 * @param {object|null} parts.details    `profileDetails/{id}`
 * @param {object|null} parts.contacts   `profileContacts/{id}`
 * @param {object|null} parts.workflow   `profileWorkflow/{id}`
 * @param {object|null} parts.technical  `profileTechnical/{id}`
 * @param {object|null} parts.legacy     анкета зі старої колекції, якщо її читали
 */
export const mergeProfileNodes = ({
  userId,
  card = null,
  details = null,
  contacts = null,
  workflow = null,
  technical = null,
  legacy = null,
} = {}) => {
  const id = String(userId || '').trim();
  if (!id) return null;
  if (!hasAnyNode([card, details, contacts, workflow, technical, legacy])) return null;

  const expandedCard = card ? expandMatchingCard(id, card) : null;
  const merged = { userId: id };

  // Legacy йде найпершим шаром: поки анкету не перенесли, він єдиний, хто щось
  // знає; після перенесення нові вузли лягають згори і перекривають його.
  if (legacy && typeof legacy === 'object') Object.assign(merged, legacy);

  if (expandedCard) {
    Object.entries(expandedCard).forEach(([key, value]) => {
      // Прапорець проєкції назовні не тече: це повна анкета, а не рядок стрічки.
      if (key === MATCHING_SUMMARY_FLAG) return;
      if (isFilled(value)) merged[key] = value;
    });
  }

  [details, contacts, workflow, technical].forEach(node => {
    if (!node || typeof node !== 'object') return;
    Object.assign(merged, node);
  });

  // Повне значення перемагає похідне — але тільки якщо воно справді є. Інакше в
  // анкеті без `profileDetails` лишиться ініціал, і це чесніше за порожнечу.
  Object.keys(CARD_DERIVED_OVERRIDABLE).forEach(field => {
    if (details && isFilled(details[field])) merged[field] = details[field];
  });

  // Фото повні тільки тоді, коли їх дав `profileDetails`. Аватар із картки —
  // це один знімок, тож набір лишається негідратованим, і застосунок доб'є
  // його своїм звичайним шляхом.
  const hasFullPhotos = Boolean(details && isFilled(details.photos));
  merged.__photosHydrated = hasFullPhotos;

  return merged;
};

/**
 * Чи є в цих вузлах хоч щось — тобто чи варто взагалі відповідати.
 *
 * Порожня відповідь від усіх пʼятьох означає «анкета сюди ще не переїхала», і
 * викликач має піти в legacy, а не показати порожню картку.
 */
export const hasAnyProfileNode = parts => hasAnyNode([
  parts?.card, parts?.details, parts?.contacts, parts?.workflow, parts?.technical,
]);
