import * as formFields from './formFields';
import { sanitizeNewUsersPayload, sanitizeTechnicalPayload } from './formFields';

describe('profile payload sanitizers', () => {
  it.each([
    ['users', sanitizeTechnicalPayload],
    ['newUsers', sanitizeNewUsersPayload],
  ])('keeps reaction metadata local for %s payloads', (_collection, sanitizePayload) => {
    expect(sanitizePayload({
      userId: 'profile-1',
      name: 'Profile',
      _reactionType: 'Like/Dislike',
    })).toEqual({
      userId: 'profile-1',
      name: 'Profile',
    });
  });
});

// Колись довгий userId жив одночасно в `users` і `newUsers`, і той самий запис
// був розділений між колекціями: writer, role, lastCycle належали другій. Звідси
// був відбір, який викидав ці ключі з пейлоада для `users` — разом із null за
// ними, тож на картці їх було видно і неможливо видалити. Довгий userId тепер
// лежить лише в `users`, тож заборони за назвою ключа більше немає.
describe('запис у users не відбирає поля за назвою', () => {
  it('не лишає позаду ні предиката, ні фільтра тих часів', () => {
    expect(formFields.isUsersAllowedField).toBeUndefined();
    expect(formFields.pickUsersAllowedFields).toBeUndefined();
    expect(formFields.isSharedCollectionField).toBeUndefined();
  });

  it('технічна санітизація пропускає поля колишнього списку newUsers-only', () => {
    const payload = {
      userId: 'profile-1',
      writer: 'IgF',
      role: 'ip',
      lastCycle: '2026-08-01',
    };

    expect(sanitizeTechnicalPayload(payload)).toEqual(payload);
  });

  it('список newUsers лишається списком наповнення тієї колекції', () => {
    // Він і далі каже, що має долетіти до `newUsers` понад дзеркальні контакти.
    expect(formFields.isNewUsersAllowedField('writer')).toBe(true);
    expect(formFields.isNewUsersAllowedField('role')).toBe(true);
  });
});
