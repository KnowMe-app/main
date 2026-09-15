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

/**
 * Підписи полів знають мову — але лише там, де її передали.
 *
 * Ті самі поля малює десяток екранів поза матчингом (анкета адміна,
 * редагування, імпорт), і вони лишаються українськими, як були: мова тут —
 * необовʼязковий аргумент, а не глобальний стан.
 */
describe('мова підписів полів', () => {
  const field = { name: 'surname', label: 'Прізвище', ukrainian: 'Прізвище', placeholder: 'Іваненко' };

  it('без мови віддає підпис таким, яким він лежить у формі', () => {
    expect(formFields.getFieldLabel(field)).toBe('Прізвище');
    expect(formFields.getFieldPlaceholder(field)).toBe('Іваненко');
  });

  it('англійською перекладає і підпис, і приклад значення', () => {
    expect(formFields.getFieldLabel(field, 'en')).toBe('Surname');
    expect(formFields.getFieldPlaceholder(field, 'en')).toBe('Ivanenko');
  });

  it('українською лишає той самий підпис', () => {
    expect(formFields.getFieldLabel(field, 'uk')).toBe('Прізвище');
  });

  // Варіант списку вже лежить парою: `placeholder` англійською, `ukrainian` —
  // українською. Перекладати його словником не треба.
  it('варіант списку бере англійський бік із самої пари', () => {
    const option = { placeholder: 'Oval', ukrainian: 'Овальне' };

    expect(formFields.getOptionLabel(option)).toBe('Овальне');
    expect(formFields.getOptionLabel(option, 'uk')).toBe('Овальне');
    expect(formFields.getOptionLabel(option, 'en')).toBe('Oval');
  });
});
