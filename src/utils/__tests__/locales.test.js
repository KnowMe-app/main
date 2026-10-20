import fs from 'fs';
import path from 'path';

import { uiText } from '../uiTranslations';
import {
  APP_LANGUAGES,
  EXTRA_LOCALES,
  SUPPORTED_LANGUAGE_CODES,
  formatRegionDisplayName,
  keepsNounCase,
  listMonthNames,
  translateOptionValue,
} from '../locales';
import { translateProfileLabel, profileUiText, derivedValueTexts, resolveProfileLanguage } from '../profileTexts';
import { translateFieldValue, getOptionLabel } from '../../components/formFields';
import { describeGlasses, describeWork, describeLooks } from '../profileSentences';
import { formatDeliveryRecency } from '../deliveryRecency';
import { buildProfileDetailSections, buildProfileSummaryRows } from '../../components/ProfileFacts';
import { SUPPORTED_APP_LANGUAGES } from '../../hooks/useAppSettings';

// Мови понад українську й англійську — модулі однакової форми
// (`utils/locales`). Кожен мусить мати рядок на кожен англійський ключ і ті
// самі підставки `{…}`, інакше в реченні лишиться дірка.
const readEnglishDictionary = () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'uiTranslations.js'), 'utf8');
  const start = source.indexOf('const EN_BY_UK = {') + 'const EN_BY_UK = '.length;
  const end = source.indexOf('\n};', start) + 2;
  // eslint-disable-next-line no-new-func
  return Function(`return (${source.slice(start, end)})`)();
};

const placeholders = text => (String(text).match(/\{\w+\}/g) || []).sort().join(',');
const english = readEnglishDictionary();
const CYRILLIC = /[А-Яа-яІіЇїЄєҐґ]/;

describe.each(Object.keys(EXTRA_LOCALES))('мова %s', code => {
  const locale = EXTRA_LOCALES[code];

  it('перекладає кожен рядок, який має англійський бік', () => {
    const missing = Object.keys(english).filter(key => !Object.prototype.hasOwnProperty.call(locale.byUk, key));
    expect(missing).toEqual([]);
  });

  it('зберігає ті самі підставки, що й оригінал, і не лишає кирилиці', () => {
    const broken = Object.entries(locale.byUk).filter(([uk, text]) => placeholders(uk) !== placeholders(text));
    expect(broken).toEqual([]);
    expect(Object.values(locale.byUk).filter(text => CYRILLIC.test(text))).toEqual([]);
  });

  it('має підписи картки, статичні написи, речення й навігацію', () => {
    expect(translateProfileLabel('Height', code)).not.toBe('Height');
    expect(profileUiText('publicComment', code)).toBeTruthy();
    expect(derivedValueTexts('marital', code)).toHaveLength(2);
    ['back', 'menu', 'find', 'add', 'mine', 'overlay', 'draft'].forEach(key => expect(locale.nav[key]).toBeTruthy());
    expect(describeGlasses('No', code)).toBe(locale.sentences.glasses.no);
    expect(CYRILLIC.test(describeGlasses('No', code))).toBe(false);
  });

  it('складає рядок фактів картки без українських слів', () => {
    const rows = buildProfileSummaryRows({
      eyeColor: 'Brown', hairColor: 'Blonde', hairStructure: 'Wavy',
      ownKids: '2', csection: '1', experience: '3', maritalStatus: 'Yes',
    }, code);
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach(row => {
      expect(CYRILLIC.test(row.label)).toBe(false);
      expect(CYRILLIC.test(row.value)).toBe(false);
    });
    const looks = describeLooks({ user: { faceShape: 'Oval', noseShape: 'Straight', lipsShape: 'Full' }, lang: code, typed: () => '' });
    expect(looks.text).toBeTruthy();
    expect(CYRILLIC.test(looks.text)).toBe(false);
  });
});

describe('реєстр мов', () => {
  it('знає сім мов і зберігає їх як окремі', () => {
    expect(SUPPORTED_LANGUAGE_CODES).toEqual(['uk', 'en', 'es', 'de', 'nl', 'ja', 'zh']);
    expect(SUPPORTED_APP_LANGUAGES).toEqual(SUPPORTED_LANGUAGE_CODES);
    expect(APP_LANGUAGES.map(item => item.nativeName))
      .toEqual(['Українська', 'English', 'Español', 'Deutsch', 'Nederlands', '日本語', '中文']);
    SUPPORTED_LANGUAGE_CODES.forEach(code => expect(resolveProfileLanguage(code)).toBe(code));
  });

  it('рядок без перекладу читач бачить англійським, а не українським', () => {
    expect(uiText('Шукаємо донора ооцитів', 'de')).toBe('Wir suchen eine Eizellspenderin');
    expect(uiText('Показати ще {count}', 'es', { count: 3 })).toBe('Mostrar 3 más');
    expect(uiText('Такого рядка в словнику немає', 'zh')).toBe('Такого рядка в словнику немає');
  });

  it('значення довідника — з англійського слова в базі, з урахуванням поля', () => {
    expect(translateFieldValue('eyeColor', 'Hazel', 'ja')).toBe('ヘーゼル');
    expect(translateFieldValue('eyeColor', 'Hazel')).toBe('Карі');
    expect(translateOptionValue('es', 'faceShape', 'Oval')).toBe('ovalada');
    expect(translateOptionValue('es', 'chin', 'Oval')).toBe('ovalado');
    expect(translateOptionValue('ja', 'bodyType', 'Round')).toBe('リンゴ型');
    expect(getOptionLabel({ placeholder: 'Blue', ukrainian: 'Сині' }, 'nl')).toBe('Blauw');
    // Текст, який ввела людина, не перекладається.
    expect(translateFieldValue('eyeColor', 'як у мами', 'de')).toBe('як у мами');
  });

  it('речення мовою читача', () => {
    expect(describeWork({ user: { education: 'Higher' }, lang: 'ja', typed: field => (field === 'profession' ? '医師' : '') }).text)
      .toBe('学歴は高等教育、職業は医師です。');
    expect(describeWork({ user: { education: 'Higher' }, lang: 'es', typed: field => (field === 'profession' ? 'médica' : '') }).text)
      .toBe('Tengo estudios superiores y trabajo como médica.');
    const lastYear = new Date();
    lastYear.setMonth(lastYear.getMonth() - 30);
    const date = lastYear.toISOString().slice(0, 10);
    expect(formatDeliveryRecency(date, 'ja')).toBe('2年');
    expect(formatDeliveryRecency(date, 'nl')).toBe('2 jaar');
  });

  it('місяці й країни дає Intl, а не таблиця в коді', () => {
    expect(listMonthNames('de')[0]).toBe('Januar');
    expect(formatRegionDisplayName('es', 'UA')).toBe('Ucrania');
  });
});

describe('dictionary lookups', () => {
  it('never returns prototype members for keys like "constructor"', () => {
    const { uiText } = require('../uiTranslations');
    const { translateProfileLabel } = require('../profileTexts');
    ['uk', 'en', 'ja', 'de'].forEach(language => {
      expect(uiText('constructor', language)).toBe('constructor');
      expect(uiText('toString', language)).toBe('toString');
      expect(translateProfileLabel('constructor', language)).toBe('constructor');
    });
  });
});

// Значення зі списку посеред рядка стоять з малої, але німецький іменник —
// з великої: «Bildung — hochschulabschluss» було помилкою.
describe('регістр значень зі списку', () => {
  const user = { education: 'Higher', maritalStatus: 'No', role: 'ed' };
  const flatValues = language => buildProfileDetailSections(user, language)
    .flatMap(section => [section.text, ...section.rows.map(row => row.value)])
    .map(value => String(value ?? ''))
    .concat(buildProfileSummaryRows(user, language).map(row => String(row.value)))
    .join(' | ');

  it('німецька лишає іменник з великої', () => {
    expect(flatValues('de')).toContain('Hochschulabschluss');
    expect(flatValues('de')).not.toContain('hochschulabschluss');
  });

  it('українська й іспанська й далі пишуть значення з малої', () => {
    expect(flatValues('uk')).not.toMatch(/Вища/);
    expect(keepsNounCase('es')).toBe(false);
    expect(keepsNounCase('de')).toBe(true);
  });
});
