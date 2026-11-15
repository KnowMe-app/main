import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_FREQUENCIES,
  NOTIFICATION_PRESETS,
  matchPreset,
  normalizeNotificationSettings,
} from '../adminNotificationCatalog';

// Серверна копія каталогу: на деплой функцій `src/` не їде, тож копій дві, і
// розійтись вони не мають права — інакше сторінка пропонувала б вид, якого
// сервер не знає, або сервер слав би те, чого не можна вимкнути.
const serverCatalog = require('../../../functions/adminActivityCatalog');

describe('adminNotificationCatalog', () => {
  it('ключі й типові частоти збігаються з серверним каталогом', () => {
    const client = NOTIFICATION_EVENTS.map(event => [event.key, event.defaultFrequency]).sort();
    const server = serverCatalog.ADMIN_EVENTS.map(event => [event.key, event.defaultFrequency]).sort();
    expect(client).toEqual(server);
    expect(NOTIFICATION_FREQUENCIES.map(freq => freq.key)).toEqual([...serverCatalog.FREQUENCIES]);
  });

  it('кожен вид має підпис і пояснення', () => {
    NOTIFICATION_EVENTS.forEach(event => {
      expect(event.label).toBeTruthy();
      expect(event.description).toBeTruthy();
    });
  });

  it('набір упізнається за налаштуваннями', () => {
    NOTIFICATION_PRESETS.forEach(preset => {
      expect(matchPreset(preset.build())).toBe(preset.key);
    });
    expect(matchPreset({ like: 'instant' })).toBe('');
  });

  it('збережене з невідомими ключами нормалізується', () => {
    const settings = normalizeNotificationSettings({ events: { like: 'hourly', bogus: 'instant', dislike: 'weekly' }, channels: { push: true } });
    expect(settings.events.like).toBe('hourly');
    expect(settings.events.dislike).toBe('off');
    expect(settings.events.bogus).toBeUndefined();
    expect(settings.channels).toEqual({ telegram: false, push: true });
    expect(settings.quietHours).toBe(true);
  });
});

test('збережене до тижневого звіту «Вимкнути все» звіту не вмикає', () => {
  const { normalizeNotificationSettings } = require('../adminNotificationCatalog');
  expect(normalizeNotificationSettings({ events: { like: 'off' } }).weeklyReport).toBe(false);
  expect(normalizeNotificationSettings({ events: { like: 'hourly' } }).weeklyReport).toBe(true);
  expect(normalizeNotificationSettings({ events: { like: 'hourly' }, weeklyReport: false }).weeklyReport).toBe(false);
});
