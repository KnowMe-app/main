import {
  composeRewardValue,
  encodeProgramPlaces,
  formatRewardForDisplay,
  parseProgramPlaces,
  parseRewardValue,
  readHabitExtraKind,
  readYesDetails,
  readYesWithDetails,
} from '../profileAnswers';
import { buildProfileDetailSections, describeLifestyle } from '../../components/ProfileFacts';
import { loadExtraLocale } from '../locales';

// Німецький словник вантажиться на вимогу (`loadExtraLocale`).
beforeAll(() => loadExtraLocale('de'));

// Бажана винагорода — сума, валюта й «Хочу обговорити» замість вільного
// тексту; у базі — так само рядок.
describe('бажана винагорода', () => {
  it('розбирає суму з валютою, голе число й «Хочу обговорити»', () => {
    expect(parseRewardValue('15000 $')).toEqual({ kind: 'amount', amount: 15000, currency: '$' });
    expect(parseRewardValue('19.000 €')).toEqual({ kind: 'amount', amount: 19000, currency: '€' });
    expect(parseRewardValue('40 000 грн')).toEqual({ kind: 'amount', amount: 40000, currency: '₴' });
    expect(parseRewardValue('1350')).toEqual({ kind: 'amount', amount: 1350, currency: '$' });
    expect(parseRewardValue('Negotiable')).toEqual({ kind: 'negotiable' });
    expect(parseRewardValue('')).toEqual({ kind: 'empty' });
  });

  // Старий текст форма не перекручує: «від 1000 $, залежить від програми»
  // — не сума, а розповідь.
  it('старий текст лишається текстом', () => {
    ['від 1000 $, залежить від програми', '15 000 $ + щомісячні', '1500-2000 $'].forEach(text => {
      expect(parseRewardValue(text)).toEqual({ kind: 'text', text });
    });
  });

  it('пише суму з валютою й показує її з розрядами', () => {
    expect(composeRewardValue({ amount: '15 000', currency: '€' })).toBe('15000 €');
    expect(composeRewardValue({ amount: '1000' })).toBe('1000 $');
    expect(composeRewardValue({ amount: '' })).toBe('');
    expect(formatRewardForDisplay('15000 €', 'обговорюється')).toBe('15 000 €');
    expect(formatRewardForDisplay('Negotiable', 'обговорюється')).toBe('обговорюється');
    expect(formatRewardForDisplay('від 1000 $', 'обговорюється')).toBe('від 1000 $');
  });

  it('картка показує «Хочу обговорити» словами мовою читача', () => {
    const reward = lang => buildProfileDetailSections({ reward: 'Negotiable' }, lang).find(section => section.key === 'reward');
    expect(reward('uk').text).toBe('За домовленістю');
    expect(reward('en').text).toBe('Open to discussion');
    expect(buildProfileDetailSections({ reward: '1350' }, 'uk').find(section => section.key === 'reward').text).toBe('1 350 $');
  });
});

describe('куріння й алкоголь — готові варіанти', () => {
  it('«Іноді» й «Припинила» картка читає реченнями', () => {
    expect(readHabitExtraKind('Sometimes')).toBe('sometimes');
    expect(readHabitExtraKind('Quit')).toBe('quit');
    expect(readHabitExtraKind('Yes')).toBe('');
    expect(describeLifestyle({ smoking: 'Quit', alcohol: 'Sometimes' }, 'uk')).toBe('Кинула курити. Алкоголь вживаю іноді.');
    expect(describeLifestyle({ smoking: 'Sometimes', alcohol: 'No' }, 'en')).toBe('I smoke occasionally. I don’t drink alcohol.');
    expect(describeLifestyle({ smoking: 'No', alcohol: 'No' }, 'uk')).toBe('Не курю й не вживаю алкоголю.');
  });
});

// «Ні / Так», і подробиця — лише після «Так», у тому самому полі.
describe('«Так» з подробицею', () => {
  it('подробиця світить «Так», а «ні»-слова — «Ні»', () => {
    expect(readYesWithDetails('Yes')).toBe('Yes');
    expect(readYesWithDetails('апендицит у 2021')).toBe('Yes');
    expect(readYesWithDetails('-2.5')).toBe('Yes');
    expect(readYesWithDetails('No')).toBe('No');
    expect(readYesWithDetails('відсутні')).toBe('No');
    expect(readYesWithDetails('')).toBe('');
    expect(readYesDetails('Yes')).toBe('');
    expect(readYesDetails('апендицит у 2021')).toBe('апендицит у 2021');
    expect(readYesDetails('No')).toBe('');
  });
});

describe('де готова проходити програму', () => {
  it('кілька відповідей — кодами в сталому порядку', () => {
    expect(encodeProgramPlaces(['abroad', 'city', 'bogus'])).toBe('city,abroad');
    expect(parseProgramPlaces('abroad,country')).toEqual(['country', 'abroad']);
    expect(parseProgramPlaces('')).toEqual([]);
  });

  it('картка називає місця мовою читача, а країни — як написали', () => {
    const section = lang => buildProfileDetailSections({ programPlace: 'city,abroad', programPlaceNote: 'Грузія, Кіпр' }, lang)
      .find(item => item.key === 'programPlace');
    expect(section('uk').title).toBe('Програма');
    expect(section('uk').text).toBe('Готова проходити програму: у своєму місті, за кордоном (Грузія, Кіпр).');
    expect(section('en').text).toBe('Ready for a programme: in my city, abroad (Грузія, Кіпр).');
    expect(section('de').text).toBe('Bereit für ein Programm: in meiner Stadt, im Ausland (Грузія, Кіпр).');
  });
});
