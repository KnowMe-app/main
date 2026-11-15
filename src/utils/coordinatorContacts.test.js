import { buildCoordinatorPhoneLink, buildCoordinatorTelegramLink } from './coordinatorContacts';

describe('контакти координатора', () => {
  test('нік Telegram — посилання t.me, порожній чи битий — нічого', () => {
    expect(buildCoordinatorTelegramLink('knowme_coordinator')).toBe('https://t.me/knowme_coordinator');
    expect(buildCoordinatorTelegramLink('@knowme_coordinator')).toBe('https://t.me/knowme_coordinator');
    expect(buildCoordinatorTelegramLink('https://t.me/knowme_coordinator')).toBe('https://t.me/knowme_coordinator');
    expect(buildCoordinatorTelegramLink('')).toBe('');
    expect(buildCoordinatorTelegramLink('TODO: [TELEGRAM]')).toBe('');
  });

  test('номер — посилання tel: без пробілів', () => {
    expect(buildCoordinatorPhoneLink('+380 50 123 45 67')).toBe('tel:+380501234567');
    expect(buildCoordinatorPhoneLink('')).toBe('');
    expect(buildCoordinatorPhoneLink('TODO: [PHONE]')).toBe('');
  });
});
