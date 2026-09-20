import fs from 'fs';
import path from 'path';

const addNewProfileSource = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

/**
 * Відкрита картка — це окремий екран, хай і без власної адреси.
 *
 * Два наслідки цього, і обидва колись не працювали. Перший: апаратна кнопка
 * «назад» мусить повернути до списку, а не винести з екрана анкет — адресу
 * картка переписує через `replace`, тож власного запису в історії в неї немає
 * і жест знімав увесь маршрут. Другий: показувати вона мусить анкету, а не
 * проєкцію `matchingCards`, з якою прийшов рядок списку, — інакше «всі поля»
 * показують десяток скалярів і жодного контакту.
 */
describe('відкрита картка на екрані анкет', () => {
  it('закривається апаратною кнопкою «назад» тим самим шляхом, що й стрілкою', () => {
    expect(addNewProfileSource).toContain("import { useHardwareBackClose } from '../hooks/useHardwareBackClose';");
    expect(addNewProfileSource).toContain('const handleHardwareBackFromProfile = useCallback(() => {');
    expect(addNewProfileSource).toContain('handleBackToPreviousList();');
    expect(addNewProfileSource).toContain('useHardwareBackClose(');
    expect(addNewProfileSource).toContain("'addNewProfileCard',");
  });

  it('не бере на себе жест там, де його вже обслуговують', () => {
    // Перегляд дублів кладе в історію власний запис, а повернення в модалку
    // «Ще» слухає той самий `popstate` і має відновити саме її.
    expect(addNewProfileSource).toContain('Boolean(state?.userId) && !isDuplicateView,');
    expect(addNewProfileSource).toContain('if (shouldReturnToMoreActionsRef.current) return;');
  });

  it('проєкція стрічки не рахується за прочитану анкету', () => {
    expect(addNewProfileSource).toContain('const isSummaryProfileSnapshot = card => (');
    expect(addNewProfileSource).toContain('isMatchingSummaryCard(card) || card?.__limitedProfile === true');
    // Гейт «стан уже наповнений — не читаємо» і гейт «відповідь застаріла»
    // мусять питати те саме: інакше читання або не почнеться, або почнеться й
    // буде відкинуте.
    expect(addNewProfileSource).toContain('const stateIsSummaryOnly = isSummaryProfileSnapshot(currentState);');
    expect(addNewProfileSource).toContain('if (Object.keys(currentState).length > 1 && !stateIsSummaryOnly) {');
    expect(addNewProfileSource).toContain('(Object.keys(latestState).length > 1 && !isSummaryProfileSnapshot(latestState));');
  });

  it('кеш проєкції теж не видається за анкету', () => {
    expect(addNewProfileSource).toContain(
      'const cached = cachedCard && !isSummaryProfileSnapshot(cachedCard) ? cachedCard : null;',
    );
  });
});
