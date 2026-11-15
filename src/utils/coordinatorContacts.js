/**
 * Контакти координатора — одне місце на весь застосунок.
 *
 * Їх показують порожня стрічка з фільтром ролі («Зараз немає публічних
 * анкет…»), кінець такої стрічки («Не знайшли потрібну?») і модалка
 * видалення акаунта («Можемо допомогти особисто»). Більшість сурогатних мам і
 * донорок анкету відкрито не публікують, тож порожня стрічка — це не «нікого
 * немає», а привід написати людині.
 *
 * Значення вписує власниця продукту. Поки рядок порожній, кнопка стоїть
 * вимкненою з поясненням: битого посилання в проді бути не мусить.
 */

// TODO: [TELEGRAM] — нік координатора без «@» і без https://t.me/ (наприклад, 'knowme_coordinator').
export const COORDINATOR_TELEGRAM = '';

// TODO: [PHONE] — номер у міжнародному форматі (наприклад, '+380501234567').
export const COORDINATOR_PHONE = '';

export const buildCoordinatorTelegramLink = (username = COORDINATOR_TELEGRAM) => {
  const nick = String(username || '').trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(nick) ? `https://t.me/${nick}` : '';
};

export const buildCoordinatorPhoneLink = (phone = COORDINATOR_PHONE) => {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return /^\+?\d{7,15}$/.test(digits) ? `tel:${digits}` : '';
};

/** Перше, чим можна звʼязатись: Telegram, інакше дзвінок. */
export const resolveCoordinatorRequestLink = () => buildCoordinatorTelegramLink() || buildCoordinatorPhoneLink();
