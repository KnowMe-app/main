import fs from 'fs';
import path from 'path';
import {
  buildProfileDetailSections,
  composeAboutText,
  describeLifestyle,
  buildProfileStatStrip,
  buildProfileSummaryRows,
} from './ProfileFacts';
import { buildMatchingCardProjection, expandMatchingCard } from '../utils/matchingCardIndex';

// Нерозривні пробіли тримають число при слові; для звірки тексту вони — пробіли.
const plain = text => String(text || '').replace(/ /g, ' ');
const valueOf = (rows, key) => plain(rows.find(row => row.key === key)?.value) || undefined;
const labelOf = (rows, key) => rows.find(row => row.key === key)?.label;

// Дата пологів відносна: без сталого «сьогодні» тест старів би щомісяця.
const monthsAgo = months => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
};

/*
 * Анкета донорки так, як вона лежить у базі: колір очей і волосся вибрано зі
 * списку англійською, пологи й донації — числом, освіта — варіантом модалки.
 */
const fullProfile = {
  name: 'Олена',
  surname: 'Коваль',
  role: 'ed',
  birth: '1995-03-10',
  city: 'Вінниця',
  height: '166',
  weight: '57',
  blood: '1+',
  eyeColor: 'Green',
  hairColor: 'Fair',
  hairStructure: 'Thick',
  faceShape: 'Oval',
  race: 'European',
  bodyType: 'Rectangle',
  ownKids: '2',
  lastDelivery: monthsAgo(36),
  experience: '0',
  maritalStatus: 'No',
  education: 'Higher',
  profession: 'Лікар Терапевт',
  clothingSize: '34-36',
  shoeSize: '36',
  moreInfo_main: 'Весела й товариська.',
};

describe('смуга показників', () => {
  it('тримає чотири комірки в сталому порядку й ставить тире замість відсутнього', () => {
    const cells = buildProfileStatStrip({ height: '170', blood: '-' }, 'uk');
    expect(cells.map(cell => cell.label)).toEqual(['Зріст', 'Вага', 'ІМТ', 'Кров']);
    expect(cells.map(cell => cell.value)).toEqual(['170', '—', '—', 'Rh−']);
    expect(cells[0].unit).toBe('см');
    expect(cells[1]).toMatchObject({ empty: true, unit: '' });
  });

  it('уточнює кров на тому самому місці, коли приїхала повна анкета', () => {
    expect(buildProfileStatStrip({ height: '166', blood: '+' }, 'uk')[3].value).toBe('Rh+');
    expect(buildProfileStatStrip({ height: '166', blood: '1+' }, 'uk')[3].value).toBe('O+');
  });

  it('не малюється зовсім, коли не відомо жодного з чотирьох', () => {
    expect(buildProfileStatStrip({ city: 'Київ' }, 'uk')).toEqual([]);
  });
});

describe('короткі факти', () => {
  it('кажуть про зовнішність самими полями картки стрічки', () => {
    const rows = buildProfileSummaryRows({ eyeColor: 'Hazel', hairColor: 'Fair', hairStructure: 'Straight' }, 'uk');
    expect(labelOf(rows, 'appearance')).toBe('Зовнішність');
    // Усе про волосся — тут, одним словосполученням: структуру дописує повна
    // анкета (у картці стрічки її немає).
    expect(valueOf(rows, 'appearance')).toBe('карі очі, русяве пряме волосся');
  });

  // Довідник кольору тримає іменники жіночого роду («Шатенка»), а перед
  // «волоссям» стоїть прикметник.
  it('узгоджує з «волоссям» колір, який у довіднику є іменником', () => {
    expect(valueOf(buildProfileSummaryRows({ hairColor: 'Shoten' }, 'uk'), 'appearance')).toBe('світло-каштанове волосся');
    expect(valueOf(buildProfileSummaryRows({ hairColor: 'Brunette', hairStructure: 'Wavy' }, 'uk'), 'appearance')).toBe('темне хвилясте волосся');
  });

  // Варіант A2 мокапу: підпис «Пологи», далі цифра, кесарів і давність.
  it('пише кількість пологів цифрою й каже давність останніх', () => {
    const rows = buildProfileSummaryRows({ ownKids: '2', lastDelivery: monthsAgo(18), experience: '1' }, 'uk');
    expect(labelOf(rows, 'reproduction')).toBe('Пологи');
    expect(valueOf(rows, 'reproduction')).toBe('2, останні 18 міс тому');
    expect(rows.find(row => row.key === 'reproduction').parts[0]).toEqual({ text: '2', tone: 'count' });
  });

  // Відкрита картка казала «3 роки після пологів», а рядок мовчав: він питав
  // спершу кількість, а в анкеті лежала сама дата.
  it('каже давність пологів і без їхньої кількості', () => {
    const rows = buildProfileSummaryRows({ lastDelivery: monthsAgo(36) }, 'uk');
    expect(valueOf(rows, 'reproduction')).toBe('останні 3 роки тому');
  });

  it('каже кесарів одразу після кількості', () => {
    const value = user => valueOf(buildProfileSummaryRows(user, 'uk'), 'reproduction');
    expect(value({ ownKids: '3', lastDelivery: monthsAgo(37), csection: '2' })).toBe('3, з яких 2 КР, останні 3 роки тому');
    expect(value({ ownKids: '2', lastDelivery: monthsAgo(16), csection: '0' })).toBe('2, без КР, останні 16 міс тому');
    expect(value({ ownKids: '3', csection: '1' })).toBe('3, з яких 1 КР');
    expect(value({ ownKids: '3', csection: '3' })).toBe('3, усі КР');
    expect(value({ ownKids: '1', csection: 'не було' })).toBe('1, без КР');
    expect(value({ ownKids: '1', lastDelivery: monthsAgo(25), csection: '1' })).toBe('1, КР, 2 роки тому');
    // Кількість пологів невідома — кесарів стоїть сам.
    expect(value({ csection: '2' })).toBe('2 КР');
  });

  it('фарбує «без КР» зеленим, а кесарів — жовтим', () => {
    const tones = user => buildProfileSummaryRows(user, 'uk')
      .find(row => row.key === 'reproduction').parts.filter(part => part.tone).map(part => part.tone);
    expect(tones({ ownKids: '2', csection: '0', lastDelivery: monthsAgo(16) })).toEqual(['count', 'natural', 'muted', 'muted']);
    const parts = buildProfileSummaryRows({ ownKids: '3', csection: '2' }, 'uk')
      .find(row => row.key === 'reproduction').parts;
    // «з яких» — звичайним текстом, жовте лише «2 КР».
    expect(parts.map(part => [part.text.replace(/\u00a0/g, ' '), part.tone])).toEqual([
      ['3', 'count'], [', ', undefined], ['з яких ', undefined], ['2 КР', 'caesarean'],
    ]);
  });

  // «2+» поруч із резусом і групою крові читалось як «РК 2+».
  it('пише «2+» словами, а не плюсом', () => {
    const value = user => valueOf(buildProfileSummaryRows(user, 'uk'), 'reproduction');
    expect(value({ ownKids: '4', csection: '2+' })).toBe('4, з яких щонайменше 2 КР');
    expect(value({ csection: '2+' })).toBe('щонайменше 2 КР');
  });

  // Свій текст про кесарів у рядок пологів не вкладається.
  it('ставить свій текст про кесарів окремим рядком «КР»', () => {
    const rows = buildProfileSummaryRows({ ownKids: '3', csection: 'планове у 2019, екстрене у 2022' }, 'uk');
    expect(valueOf(rows, 'reproduction')).toBe('3');
    expect(labelOf(rows, 'cSection')).toBe('КР');
    expect(valueOf(rows, 'cSection')).toBe('планове у 2019, екстрене у 2022');
    expect(rows.find(row => row.key === 'cSection').parts[0].tone).toBe('caesarean');
  });

  // Чип «Ні» форма пише мінусом, а мінус для показу — порожнє поле: СМ
  // відповідала «кесаревого не було», а рядок про це мовчав.
  it('читає «Ні» з форми як «без КР»', () => {
    const value = (user, lang = 'uk') => valueOf(buildProfileSummaryRows(user, lang), 'reproduction');
    expect(value({ ownKids: '4', csection: '-' })).toBe('4, без КР');
    expect(value({ ownKids: '1', csection: ['2', '-'] })).toBe('1, без КР');
    expect(value({ ownKids: '2', csection: '-' }, 'en')).toBe('2, no C-section');
    // Без пологів «без КР» не відповідає ні на що.
    expect(value({ csection: '-' })).toBeUndefined();
  });

  it('ставить донації окремим рядком і цифрою', () => {
    const rows = buildProfileSummaryRows({ ownKids: '0', experience: '0' }, 'uk');
    expect(valueOf(rows, 'reproduction')).toBe('не було');
    expect(labelOf(rows, 'donations')).toBe('Донації');
    expect(valueOf(rows, 'donations')).toBe('ще не було');
    expect(valueOf(buildProfileSummaryRows({ experience: '3' }, 'uk'), 'donations')).toBe('3');
    expect(valueOf(buildProfileSummaryRows({ experience: '3' }, 'uk'), 'reproduction')).toBeUndefined();
  });

  it('ставить рядки в порядку: пологи, донації, сімейний стан, зовнішність', () => {
    const rows = buildProfileSummaryRows({ ...fullProfile, experience: '2' }, 'uk');
    expect(rows.map(row => row.key)).toEqual(['reproduction', 'donations', 'marital', 'appearance']);
  });

  it('не відриває числа від слова при переносі', () => {
    const value = buildProfileSummaryRows({ ownKids: '2', lastDelivery: monthsAgo(6), csection: '1' }, 'uk')[0].value;
    expect(value).toBe('2, з яких 1\u00a0КР, останні 6\u00a0міс тому');
  });

  it('каже сімейний стан словом, а не «так/ні»', () => {
    expect(valueOf(buildProfileSummaryRows({ maritalStatus: 'No' }, 'uk'), 'marital')).toBe('не заміжня');
  });

  it('англійською каже те саме англійською', () => {
    const rows = buildProfileSummaryRows({ eyeColor: 'Hazel', hairColor: 'Fair', ownKids: '2', experience: '1' }, 'en');
    expect(labelOf(rows, 'appearance')).toBe('Appearance');
    expect(valueOf(rows, 'appearance')).toBe('hazel eyes, fair hair');
    expect(valueOf(rows, 'reproduction')).toBe('2');
    expect(valueOf(rows, 'donations')).toBe('1');
  });

  /*
   * Головне правило блоку: рядок списку (картка стрічки) і верх відкритої
   * картки (повна анкета) кажуть про людину одне й те саме тими самими
   * словами. Якщо колись у короткі факти потрапить поле, якого в картці
   * стрічки немає, рядок покаже менше, ніж картка, — і тест впаде тут.
   */
  it('з картки стрічки й з повної анкети дають однаковий блок', () => {
    const projection = buildMatchingCardProjection('donor-1', fullProfile, { avatar: '' });
    const card = expandMatchingCard('donor-1', projection);
    expect(card).toBeTruthy();
    // Виняток один і навмисний: структуру волосся картка стрічки не несе,
    // її дописує повна анкета.
    expect(card.hairStructure).toBeUndefined();
    const { hairStructure, ...profileWithoutHairStructure } = fullProfile;
    expect(buildProfileSummaryRows(card, 'uk')).toEqual(buildProfileSummaryRows(profileWithoutHairStructure, 'uk'));
    const stripFromCard = buildProfileStatStrip(card, 'uk');
    const stripFromProfile = buildProfileStatStrip(fullProfile, 'uk');
    expect(stripFromCard.slice(0, 3)).toEqual(stripFromProfile.slice(0, 3));
    expect(stripFromCard[3].label).toBe(stripFromProfile[3].label);
  });
});

describe('розділи повної анкети', () => {
  it('ставлять решту анкети в розділи, однакові для рядка й картки', () => {
    const sections = buildProfileDetailSections(fullProfile, 'uk');
    expect(sections.map(section => section.title)).toEqual(['Обличчя й фігура', 'Освіта й робота']);
    // Відповіді зі списку — реченням; волосся тут немає, воно вгорі.
    expect(sections[0].text).toContain('овальна форма обличчя');
    expect(sections[0].text).toContain('Моя раса — європейська.');
    expect(sections[0].text).not.toContain('волосся');
    expect(valueOf(sections[0].rows, 'faceShape')).toBeUndefined();
  });

  it('пише значення зі списку малими літерами цілком', () => {
    const looks = buildProfileDetailSections({ bodyType: 'Hourglass' }, 'uk')[0];
    expect(looks.text).toBe('Тип моєї фігури — пісочний годинник.');
  });

  it('складає освіту й професію в речення', () => {
    const work = buildProfileDetailSections(fullProfile, 'uk').find(section => section.key === 'work');
    expect(work.text).toBe('Я маю вищу освіту та працюю за професією лікар терапевт.');
    expect(work.rows).toEqual([]);
  });

  // Власна відповідь у речення не лягає: її рід і відмінок невідомі.
  it('лишає власні відповіді рядками анкети', () => {
    const looks = buildProfileDetailSections({ faceShape: 'як у мами', noseShape: 'Straight' }, 'uk')[0];
    expect(looks.text).toBe('У мене прямий ніс.');
    expect(valueOf(looks.rows, 'faceShape')).toBe('як у мами');
  });

  // «Так/ні» в освіті — відповідь на питання форми, а не назва освіти.
  it('не показує «Освіта — так»', () => {
    const sections = buildProfileDetailSections({ education: 'Yes', profession: 'Кухар' }, 'uk');
    expect(valueOf(sections[0].rows, 'education')).toBeUndefined();
    expect(sections[0].text).toBe('Я працюю за професією кухар.');
  });

  it('не малює розділу без жодного значення', () => {
    expect(buildProfileDetailSections({ eyeColor: 'Green' }, 'uk')).toEqual([]);
  });
});

describe('обидва екрани', () => {
  const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

  // Відкритої картки більше немає — вона складалась із тих самих частин, що
  // й рядок, і повторювала його з більшим фото. Екран тепер один.
  it('складають картку з тих самих частин — і екран для цього один', () => {
    const row = read('ProfileRow.jsx');
    const matching = read('Matching.jsx');
    ['buildProfileStatStrip(user, language)', 'buildProfileSummaryRows(user, language)', 'buildProfileDetailSections(user, language)']
      .forEach(call => {
        expect(row).toContain(call);
        expect(matching).not.toContain(call);
      });
    expect(row).toContain('<ProfileStatStrip cells={statCells} />');
    expect(matching).not.toContain('<ProfileStatStrip cells={statCells} large />');
  });

  // Курсивний рядок фактів лишився самій плитці галереї: у рядку він казав
  // те саме, що смуга й короткі факти, іншим почерком.
  it('не лишає в рядку курсивного рядка фактів і сітки «Одяг: 34–36»', () => {
    const row = read('ProfileRow.jsx');
    expect(row).not.toContain('<S.FactsRow');
    expect(row).not.toContain('<S.Grid>');
  });
});

/*
 * Анкети зі стрічки, на яких речення розвалювались: «темно русий природній
 * пряме волосся», «Я працюю за професією Ні», «Освіта — середня» окремим
 * рядком під реченням, «розмір грудей — 1 розмір».
 */
describe('власні відповіді в реченнях анкети', () => {
  it('не вставляє власний опис кольору між прикметником і «волоссям»', () => {
    const rows = buildProfileSummaryRows({ eyeColor: 'Green', hairColor: 'Темно русий природній', hairStructure: 'Straight' }, 'uk');
    expect(valueOf(rows, 'appearance')).toBe('зелені очі, пряме волосся, колір волосся — темно русий природній');
  });

  it('не пише «працюю за професією Ні»', () => {
    const sections = buildProfileDetailSections({ education: 'Secondary', profession: 'Ні' }, 'uk');
    const work = sections.find(section => section.key === 'work');
    expect(work.text).toBe('Я маю загальну середню освіту.');
    expect(valueOf(work.rows, 'profession')).toBeUndefined();
  });

  it('впізнає «Середня», набрану власноруч, як варіант довідника', () => {
    const sections = buildProfileDetailSections({ education: 'Середня ', profession: 'Бухгалтер' }, 'uk');
    const work = sections.find(section => section.key === 'work');
    expect(work.text).toBe('Я маю загальну середню освіту та працюю за професією бухгалтер.');
    expect(valueOf(work.rows, 'education')).toBeUndefined();
  });

  it('не повторює «розмір» у розмірі грудей', () => {
    const sections = buildProfileDetailSections({ bodyType: 'Triangle', breastSize: '1 розмір ' }, 'uk');
    expect(sections.find(section => section.key === 'looks').text).toContain('розмір грудей — 1.');
  });
});


describe('окуляри реченням про зір', () => {
  // Окуляри — у «Про себе», а не в «Обличчі й фігурі».
  const looksText = glasses => describeLifestyle({ glasses }, 'uk');

  it('«ні» — це гарний зір', () => {
    expect(looksText('no')).toBe('Не ношу окулярів, зір хороший.');
  });

  it('діоптрії — це сам зір', () => {
    expect(looksText('-2.5')).toBe('Мій зір — −2.5 діоптрії.');
  });

  it('власна відповідь стає уточненням про зір', () => {
    expect(looksText('Лінзи')).toBe('Щодо зору й окулярів — лінзи.');
  });
});

// Відповіді СМ про досвід, ускладнення й звички — реченнями в «Про себе», а
// не табличкою «Куріння — ні»; винагорода — окремим розділом.
describe('здоровʼя й спосіб життя в картці', () => {
  it('складає з відповідей речення від першої особи', () => {
    expect(describeLifestyle({
      surrogacyExperience: 'Yes', healthComplications: 'No', smoking: 'No', alcohol: 'No',
    }, 'uk')).toBe('Не курю й не вживаю алкоголю.');
  });

  it('досвід СМ і ускладнення стоять у рядку «Пологи»', () => {
    const row = buildProfileSummaryRows({ ownKids: '4', surrogacyExperience: 'Yes', healthComplications: 'No' }, 'uk')
      .find(item => item.key === 'reproduction');
    expect(plain(row.value)).toBe('4. Маю досвід сурогатного материнства. Ускладнень під час вагітностей і пологів не було.');
  });

  it('власну відповідь продовжує з малої', () => {
    expect(describeLifestyle({ alcohol: 'На свята' }, 'uk')).toBe('Алкоголь: на свята.');
  });

  it('старе «average» у губах лягає в речення', () => {
    expect(buildProfileDetailSections({ lipsShape: 'average', faceShape: 'Oval' }, 'uk')[0].text)
      .toBe('У мене овальна форма обличчя та середні губи.');
  });

  it('власну відповідь лишає як написали', () => {
    expect(describeLifestyle({ smoking: 'No', alcohol: 'келих на свята' }, 'uk'))
      .toBe('Не курю. Алкоголь: келих на свята.');
  });

  it('дописує речення до «Про себе» й ставить крапку, якої бракувало', () => {
    expect(composeAboutText('Люблю подорожувати', { smoking: 'No', alcohol: 'No' }, 'uk'))
      .toBe('Люблю подорожувати. Не курю й не вживаю алкоголю.');
    expect(composeAboutText('', { smoking: 'Yes' }, 'en')).toBe('I smoke.');
    expect(composeAboutText('Про себе.', {}, 'uk')).toBe('Про себе.');
  });

  it('винагороду показує окремим розділом, а звичок у розділах немає', () => {
    const sections = buildProfileDetailSections({
      surrogacyExperience: 'Yes', smoking: 'No', reward: 'від 18 000 $',
    }, 'uk');
    expect(sections.find(section => section.key === 'health')).toBeUndefined();
    const reward = sections.find(section => section.key === 'reward');
    expect(reward.title).toBe('Бажана винагорода');
    expect(reward.text).toBe('від 18 000 $');
  });

  it('порожнього розділу винагороди не малює', () => {
    expect(buildProfileDetailSections({}, 'uk').find(section => section.key === 'reward')).toBeUndefined();
  });
});
