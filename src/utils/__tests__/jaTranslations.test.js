import fs from 'fs';
import path from 'path';

import { uiText } from '../uiTranslations';
import { JA_BY_UK, translateOptionValueToJapanese } from '../jaTranslations';
import { translateProfileLabel, profileUiText, derivedValueTexts, resolveProfileLanguage } from '../profileTexts';
import { translateFieldValue, getOptionLabel } from '../../components/formFields';
import { describeGlasses, describeWork } from '../profileSentences';
import { formatDeliveryRecency } from '../deliveryRecency';
import { SUPPORTED_APP_LANGUAGES } from '../../hooks/useAppSettings';

// Японська — третя мова екранів матчингу. Словник тримає ті самі ключі, що й
// англійський: рядок, який має англійський бік, мусить мати й японський, а
// підставки `{…}` — збігатись, інакше в японському реченні лишиться дірка.
const readEnglishDictionary = () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'uiTranslations.js'), 'utf8');
  const start = source.indexOf('const EN_BY_UK = {') + 'const EN_BY_UK = '.length;
  const end = source.indexOf('\n};', start) + 2;
  // eslint-disable-next-line no-new-func
  return Function(`return (${source.slice(start, end)})`)();
};

const placeholders = text => (String(text).match(/\{\w+\}/g) || []).sort().join(',');

describe('японський словник інтерфейсу', () => {
  const english = readEnglishDictionary();

  it('перекладає кожен рядок, який має англійський бік', () => {
    const missing = Object.keys(english).filter(key => !Object.prototype.hasOwnProperty.call(JA_BY_UK, key));
    expect(missing).toEqual([]);
  });

  it('зберігає ті самі підставки, що й оригінал', () => {
    const broken = Object.entries(JA_BY_UK).filter(([uk, ja]) => placeholders(uk) !== placeholders(ja));
    expect(broken).toEqual([]);
  });

  it('uiText віддає японський рядок і підставляє змінні', () => {
    expect(uiText('Шукаємо донора ооцитів', 'ja')).toBe('卵子ドナーを募集しています');
    expect(uiText('Показати ще {count}', 'ja', { count: 3 })).toBe('あと3件を表示');
  });

  it('рядок без японського перекладу японський читач бачить англійським', () => {
    expect(uiText('Такого рядка в словнику немає', 'ja')).toBe('Такого рядка в словнику немає');
    expect(uiText('Шукаємо донора ооцитів', 'uk')).toBe('Шукаємо донора ооцитів');
  });
});

describe('японська в картці анкети', () => {
  it('мова зберігається й читається як окрема', () => {
    expect(SUPPORTED_APP_LANGUAGES).toEqual(['uk', 'en', 'ja']);
    expect(resolveProfileLanguage('ja')).toBe('ja');
  });

  it('перекладає підписи, статичні написи й похідні значення', () => {
    expect(translateProfileLabel('Height', 'ja')).toBe('身長');
    expect(translateProfileLabel('Height', 'uk')).toBe('Зріст');
    expect(profileUiText('publicComment', 'ja')).toBe('公開レビュー');
    expect(derivedValueTexts('marital', 'ja')).toEqual(['既婚', '未婚']);
  });

  it('значення довідника перекладає з англійського слова, яким воно лежить у базі', () => {
    expect(translateFieldValue('eyeColor', 'Hazel', 'ja')).toBe('ヘーゼル');
    expect(translateFieldValue('eyeColor', 'Hazel')).toBe('Карі');
    // Одне слово — різні поля: «Round» у фігурі й у формі обличчя.
    expect(translateOptionValueToJapanese('bodyType', 'Round')).toBe('リンゴ型');
    expect(translateOptionValueToJapanese('faceShape', 'Round')).toBe('丸顔');
    expect(getOptionLabel({ placeholder: 'Blue', ukrainian: 'Сині' }, 'ja')).toBe('青');
    // Текст, який ввела людина, не перекладається.
    expect(translateFieldValue('eyeColor', 'як у мами', 'ja')).toBe('як у мами');
  });

  it('складає японські речення без українських слів', () => {
    expect(describeGlasses('No', 'ja')).toBe('眼鏡はかけていません。視力は良好です。');
    expect(describeWork({ user: { education: 'Higher' }, lang: 'ja', typed: field => (field === 'profession' ? '医師' : '') }).text)
      .toBe('学歴は高等教育、職業は医師です。');
    const lastYear = new Date();
    lastYear.setMonth(lastYear.getMonth() - 30);
    expect(formatDeliveryRecency(lastYear.toISOString().slice(0, 10), 'ja')).toBe('2年');
  });
});
