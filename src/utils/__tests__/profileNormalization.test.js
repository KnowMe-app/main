import {
  computeBmi,
  formatCityName,
  formatCountryName,
  formatRegionName,
  isUkraineCountry,
  normalizeHeightCm,
  normalizeProfileFieldInput,
  normalizeWeightKg,
  resolveCountryCode,
} from '../profileNormalization';
import { resolveCountryBucket, resolveBmiBucket } from '../searchKeyBuckets';

/**
 * Країна, область, місто, зріст і вага — у вигляді, який можна показати.
 *
 * Значення нижче взяті з опублікованих анкет: саме так їх набрали люди.
 */
describe('країна', () => {
  it('впізнає Україну в усіх написаннях, що трапляються в базі', () => {
    ['Україна', 'Україна ', 'Украина', 'Украина ', 'Ukraine ', 'Ukraine', 'УкраЇна', 'Уркаїна']
      .forEach(value => expect(isUkraineCountry(value)).toBe(true));
    expect(isUkraineCountry('Польща')).toBe(false);
    expect(isUkraineCountry('')).toBe(false);
  });

  it('показує знайому країну мовою інтерфейсу', () => {
    expect(formatCountryName('Германия', 'uk')).toBe('Німеччина');
    expect(formatCountryName('Германия', 'en')).toBe('Germany');
    expect(formatCountryName('Southafrica', 'uk')).toBe('Південна Африка');
    expect(formatCountryName('USA ', 'en')).toBe('United States');
    expect(formatCountryName('Украина', 'uk')).toBe('Україна');
  });

  it('лишає незнайоме як написали, лише без зайвих пробілів', () => {
    expect(formatCountryName('  Arkansas  ', 'uk')).toBe('Arkansas');
    expect(resolveCountryCode('Arkansas')).toBe('');
  });

  it('кладе в бакет «Україна» й ті анкети, яких перелік написань не знав', () => {
    expect(resolveCountryBucket({ country: 'УкраЇна' })).toBe('ua');
    expect(resolveCountryBucket({ country: 'Ukraine ' })).toBe('ua');
    expect(resolveCountryBucket({ country: 'Kenya' })).toBe('other');
    expect(resolveCountryBucket({ country: '' })).toBe('unknown');
  });
});

describe('область', () => {
  it('показує російську назву області українською', () => {
    expect(formatRegionName('Днепропетровская', 'uk')).toBe('Дніпропетровська область');
    expect(formatRegionName('Донецкая ', 'uk', { short: true })).toBe('Донецька обл.');
    expect(formatRegionName('Вінницкая', 'uk', { short: true })).toBe('Вінницька обл.');
    expect(formatRegionName('Київська область', 'uk', { short: true })).toBe('Київська обл.');
  });

  it('впізнає англійську назву з суфіксом і показує її англійською', () => {
    expect(formatRegionName('Dnipropetrovsk region', 'uk')).toBe('Дніпропетровська область');
    expect(formatRegionName('Kharkivska', 'en')).toBe('Kharkiv Oblast');
  });

  it('не вгадує область там, де написане може бути й містом', () => {
    expect(formatRegionName('Kyiv', 'uk')).toBe('Kyiv');
    expect(formatRegionName('місто Київ', 'uk')).toBe('місто Київ');
    expect(formatRegionName('Maharashtra', 'uk')).toBe('Maharashtra');
  });
});

describe('місто', () => {
  it('показує знайоме місто мовою інтерфейсу', () => {
    expect(formatCityName('Славянск', 'uk')).toBe("Слов'янськ");
    expect(formatCityName('Каменское', 'uk')).toBe("Кам'янське");
    expect(formatCityName('Коломыя', 'uk')).toBe('Коломия');
    expect(formatCityName('Київ', 'en')).toBe('Kyiv');
  });

  it('перекладає російський префікс поселення, а решту лишає', () => {
    expect(formatCityName('Пгт Олександрівка', 'uk')).toBe('смт Олександрівка');
    expect(formatCityName('с. Дмитрівка', 'uk')).toBe('с. Дмитрівка');
    expect(formatCityName('м. Киев', 'uk')).toBe('м. Київ');
    expect(formatCityName('Naivasha', 'uk')).toBe('Naivasha');
  });
});

describe('зріст, вага й ІМТ', () => {
  it('приймає сантиметри, метри й фути', () => {
    expect(normalizeHeightCm('168')).toBe(168);
    expect(normalizeHeightCm('1.68')).toBe(168);
    expect(normalizeHeightCm('5')).toBe(152);
    expect(normalizeHeightCm("5'4")).toBe(163);
    expect(normalizeHeightCm('5.4')).toBe(163);
  });

  it('не показує зросту, якого з записаного не вивести', () => {
    expect(normalizeHeightCm('15')).toBeNull();
    expect(normalizeHeightCm('')).toBeNull();
    expect(normalizeHeightCm('abc')).toBeNull();
  });

  it('приймає кілограми, перераховує фунти, відкидає неправдоподібне', () => {
    expect(normalizeWeightKg('58')).toBe(58);
    expect(normalizeWeightKg('150 lbs')).toBe(68);
    expect(normalizeWeightKg('3')).toBeNull();
  });

  it('рахує ІМТ з нормалізованих значень і мовчить, коли той неправдоподібний', () => {
    expect(computeBmi('170', '60')).toBe(21);
    // «5/75» у базі — п'ять футів і 75 кг, а не «BMI 30000».
    expect(computeBmi('5', '75')).toBe(32);
    // «5/3» — вага невідома, тож і ІМТ теж.
    expect(computeBmi('5', '3')).toBeNull();
  });

  it('кладе в бакет ІМТ нормалізоване значення, а не 30000', () => {
    expect(resolveBmiBucket({ height: '5', weight: '75' })).toBe('30_plus');
    expect(resolveBmiBucket({ height: '5', weight: '3' })).toBe('other');
    expect(resolveBmiBucket({ height: '170', weight: '60' })).toBe('18_5_24_9');
  });
});

describe('введення на blur', () => {
  it('записує знайоме канонічною українською назвою', () => {
    expect(normalizeProfileFieldInput('country', 'Украина ')).toBe('Україна');
    expect(normalizeProfileFieldInput('region', 'Харьковская')).toBe('Харківська');
    expect(normalizeProfileFieldInput('city', 'Одесса')).toBe('Одеса');
    expect(normalizeProfileFieldInput('height', '5')).toBe('152');
  });

  it('незнайоме лишає як набрали, а інших полів не чіпає', () => {
    expect(normalizeProfileFieldInput('city', 'Naivasha')).toBe('Naivasha');
    expect(normalizeProfileFieldInput('height', '16')).toBe('16');
    expect(normalizeProfileFieldInput('name', ' Оксана ')).toBe(' Оксана ');
  });
});
