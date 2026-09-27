/**
 * Мова інтерфейсу для сюїти, яка описує один із двох боків екрана.
 *
 * За замовчуванням застосунок стоїть українською (`getStoredLanguage`), а
 * екрани матчингу мову виконують: підписи, кнопки й порожні стани їдуть через
 * `utils/uiTranslations`, підписи картки — через `utils/profileTexts`. Сюїта,
 * написана проти одного боку, каже про це явно, замість того щоб покладатись
 * на те, якою мова була за замовчуванням: мова за замовчуванням уже раз
 * змінилась (була англійська), і сюїти, які на неї покладались, падали всі
 * разом з причини, яка до їхньої поведінки не має стосунку.
 *
 * Англійський бік стереже `utils/__tests__/uiTranslations.test.js` і
 * перевірки перемикання мови в самих екранах.
 */
const applyInterfaceLanguage = language => {
  beforeEach(() => {
    try {
      localStorage.setItem('appLanguage', language);
    } catch (error) {
      // Сюїта без localStorage лишається з мовою за замовчуванням.
    }
  });

  afterEach(() => {
    try {
      localStorage.removeItem('appLanguage');
    } catch (error) {
      // Те саме: прибирати нічого.
    }
  });
};

export const applyUkrainianInterface = () => applyInterfaceLanguage('uk');

export const applyEnglishInterface = () => applyInterfaceLanguage('en');

export default applyUkrainianInterface;
