/**
 * Мова інтерфейсу для сюїти, яка описує український бік екрана.
 *
 * За замовчуванням застосунок стоїть англійською (`getStoredLanguage`), і
 * екрани матчингу тепер це виконують: підписи, кнопки й порожні стани їдуть
 * через `utils/uiTranslations`. Тести, написані проти українських написів,
 * перевіряють саме український бік — і кажуть про це явно, замість того щоб
 * покладатись на те, якою мова була за замовчуванням.
 *
 * Англійський бік стереже `utils/__tests__/uiTranslations.test.js` і
 * перевірки перемикання мови в самих екранах.
 */
export const applyUkrainianInterface = () => {
  beforeEach(() => {
    try {
      localStorage.setItem('appLanguage', 'uk');
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

export default applyUkrainianInterface;
