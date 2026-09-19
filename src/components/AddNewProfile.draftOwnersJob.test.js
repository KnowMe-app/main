import fs from 'fs';
import path from 'path';

const addNewProfileSource = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

/**
 * Перебудова, яку ніхто не запускає, — це не запасний шлях, а його відсутність.
 *
 * Бекфіл авторів чернеток (`backfillProfileDraftOwners`) спершу стояв у
 * `createSearchIds` — на вигляд саме там, де й має бути, «у перебудові
 * індексу». Але `createSearchIds` не викликає ніхто: імпорт у `AddNewProfile`
 * закоментований, а серед бекендних робіт панелі індексації перебудови
 * `searchId` немає взагалі. Тобто чернетки, заведені до появи мапи, лишались
 * без автора назавжди, а порада «натисніть Індекси» нічого не робила.
 *
 * Тому тут перевіряється рівно одне: бекфіл висить на чекбоксі, який справді
 * є на екрані, і його справді запускає кнопка.
 */
describe('бекфіл авторів чернеток запускається з панелі індексації', () => {
  it('має власний чекбокс серед бекендних робіт', () => {
    expect(addNewProfileSource).toContain("key: 'profileMutationOwners'");
    expect(addNewProfileSource).toContain("hint: '→ multiData/profileMutationOwners'");
  });

  it('чекбокс рахується гейтом «оберіть хоча б один індекс»', () => {
    // Інакше робота, обрана самотою, впирається в «Оберіть хоча б один» і не
    // запускається — тобто чекбокс є, а кнопка його не бачить.
    expect(addNewProfileSource).toContain('!selectedIndexJobs.profileMutationOwners &&');
  });

  it('кнопка справді кличе бекфіл', () => {
    expect(addNewProfileSource).toContain('backfillProfileDraftOwners,');
    expect(addNewProfileSource).toContain('await backfillProfileDraftOwners()');
    // Локальні роботи роблять `return`, тож бекфіл мусить стояти до них.
    expect(addNewProfileSource.indexOf('await backfillProfileDraftOwners()'))
      .toBeLessThan(addNewProfileSource.indexOf('if (selectedIndexJobs.searchLocalIdAndKey) {'));
  });
});
