import * as formFields from './formFields';
import { sanitizeTechnicalPayload } from './formFields';

describe('profile payload sanitizers', () => {
  it('keeps reaction metadata local instead of sending it to the backend', () => {
    expect(sanitizeTechnicalPayload({
      userId: 'profile-1',
      name: 'Profile',
      _reactionType: 'Like/Dislike',
    })).toEqual({
      userId: 'profile-1',
      name: 'Profile',
    });
  });
});

// Колись анкета була розділена між двома колекціями, і writer, role, lastCycle
// належали другій. Звідси був відбір, який викидав ці ключі з пейлоада —
// разом із null за ними, тож на картці їх було видно і неможливо видалити.
// Колекція одна, тож заборони за назвою ключа більше немає.
describe('запис не відбирає поля за назвою', () => {
  it('не лишає позаду ні предиката, ні фільтра тих часів', () => {
    expect(formFields.isUsersAllowedField).toBeUndefined();
    expect(formFields.pickUsersAllowedFields).toBeUndefined();
    expect(formFields.isSharedCollectionField).toBeUndefined();
    expect(formFields.isNewUsersAllowedField).toBeUndefined();
    expect(formFields.pickNewUsersAllowedFields).toBeUndefined();
    expect(formFields.sanitizeNewUsersPayload).toBeUndefined();
  });

  it('технічна санітизація пропускає поля колишнього списку колекції', () => {
    const payload = {
      userId: 'profile-1',
      writer: 'IgF',
      role: 'ip',
      lastCycle: '2026-08-01',
    };

    expect(sanitizeTechnicalPayload(payload)).toEqual(payload);
  });
});
