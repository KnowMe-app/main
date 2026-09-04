import {
  derivedValueTexts,
  profileUiText,
  resolveProfileLanguage,
  translateProfileLabel,
} from '../profileTexts';
import {
  getProfileSections,
  getRoleLabel,
  maritalStatusLabel,
} from '../../components/profileLayoutConfig';

// Скарга, з якої почалась ця правка: «Own kids» англійською, а поруч «є»
// українською. Тобто підпис і відповідь на нього складали різні модулі, і в
// кожного була своя мова за замовчуванням.
describe('картка говорить однією мовою', () => {
  beforeEach(() => localStorage.clear());

  it('англійський інтерфейс не підставляє українських відповідей', () => {
    expect(maritalStatusLabel('no', 'en')).toBe('Single');
    expect(maritalStatusLabel('yes', 'en')).toBe('Married');
    expect(derivedValueTexts('ownKids', 'en')).toEqual(['Yes', 'No']);
  });

  it('український інтерфейс перекладає і підписи, і відповіді', () => {
    expect(maritalStatusLabel('no', 'uk')).toBe('не заміжня');
    expect(translateProfileLabel('Own kids', 'uk')).toBe('Власні діти');
    expect(translateProfileLabel('Main information', 'uk')).toBe('Основне');
    expect(getRoleLabel('ed', 'uk')).toBe('Донорка яйцеклітин');
  });

  it('веде мову крізь усю розкладку анкети, а не лише в окремих гетерах', () => {
    const user = { userRole: 'ed', maritalStatus: 'no', ownKids: '2' };

    const uk = getProfileSections(user, 'ed', { language: 'uk' });
    const ukMain = uk.find(section => section.title === 'Основне');
    expect(ukMain).toBeDefined();
    expect(ukMain.fields.map(field => [field.label, field.value])).toEqual(
      expect.arrayContaining([['Сімейний стан', 'не заміжня'], ['Власні діти', 'є']]),
    );

    const en = getProfileSections(user, 'ed', { language: 'en' });
    const enMain = en.find(section => section.title === 'Main information');
    expect(enMain).toBeDefined();
    expect(enMain.fields.map(field => [field.label, field.value])).toEqual(
      expect.arrayContaining([['Marital status', 'Single'], ['Own kids', 'Yes']]),
    );
  });

  // Вміст анкети не перекладається: значення, введене людиною, лишається тим,
  // що вона написала, — інакше картка показувала б не те, що в ній стоїть.
  it('не чіпає того, що ввела людина', () => {
    expect(maritalStatusLabel('вдова', 'en')).toBe('вдова');
    expect(translateProfileLabel('Полтава', 'uk')).toBe('Полтава');
  });

  it('без явної мови бере ту, що обрана в меню', () => {
    localStorage.setItem('appLanguage', 'uk');
    expect(resolveProfileLanguage()).toBe('uk');
    expect(profileUiText('publicComment')).toBe('Публічний коментар');

    localStorage.setItem('appLanguage', 'en');
    expect(resolveProfileLanguage()).toBe('en');
    expect(profileUiText('publicComment')).toBe('Public comment');
  });
});
