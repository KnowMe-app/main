import fs from 'fs';
import path from 'path';
import {
  buildProfileDetailSections,
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

  it('називає пологи пологами й каже давність останніх', () => {
    const rows = buildProfileSummaryRows({ ownKids: '2', lastDelivery: monthsAgo(18), experience: '1' }, 'uk');
    expect(labelOf(rows, 'reproduction')).toBe('Пологи, донації');
    expect(valueOf(rows, 'reproduction')).toBe('двоє пологів, останні 18 міс тому · 1 донація');
  });

  // Відкрита картка казала «3 роки після пологів», а рядок мовчав: він питав
  // спершу кількість, а в анкеті лежала сама дата.
  it('каже давність пологів і без їхньої кількості', () => {
    const rows = buildProfileSummaryRows({ lastDelivery: monthsAgo(36), experience: '0' }, 'uk');
    expect(valueOf(rows, 'reproduction')).toBe('останні пологи 3 роки тому · донацій ще не було');
  });

  it('каже кесарів поруч із пологами', () => {
    expect(valueOf(buildProfileSummaryRows({ ownKids: '3', csection: '1' }, 'uk'), 'reproduction')).toBe('троє пологів · 1 кесарів');
    expect(valueOf(buildProfileSummaryRows({ ownKids: '1', csection: 'не було' }, 'uk'), 'reproduction')).toBe('одні пологи · природні пологи');
    expect(valueOf(buildProfileSummaryRows({ ownKids: '2', csection: '2' }, 'uk'), 'reproduction')).toBe('двоє пологів · 2 кесаревих');
  });

  it('узгоджує числівник і відповідає словами на нуль', () => {
    expect(valueOf(buildProfileSummaryRows({ ownKids: '0', experience: '0' }, 'uk'), 'reproduction'))
      .toBe('пологів не було · донацій ще не було');
    expect(valueOf(buildProfileSummaryRows({ experience: '3' }, 'uk'), 'reproduction')).toBe('3 донації');
    expect(valueOf(buildProfileSummaryRows({ experience: '11' }, 'uk'), 'reproduction')).toBe('11 донацій');
    expect(labelOf(buildProfileSummaryRows({ experience: '2' }, 'uk'), 'reproduction')).toBe('Донації');
  });

  it('не відриває числа від слова при переносі', () => {
    const value = buildProfileSummaryRows({ ownKids: '2', lastDelivery: monthsAgo(6), experience: '6' }, 'uk')[0].value;
    expect(value).toBe('двоє пологів, останні 6 міс тому · 6 донацій');
  });

  it('каже сімейний стан словом, а не «так/ні»', () => {
    expect(valueOf(buildProfileSummaryRows({ maritalStatus: 'No' }, 'uk'), 'marital')).toBe('не заміжня');
  });

  it('англійською каже те саме англійською', () => {
    const rows = buildProfileSummaryRows({ eyeColor: 'Hazel', hairColor: 'Fair', ownKids: '2', experience: '1' }, 'en');
    expect(labelOf(rows, 'appearance')).toBe('Appearance');
    expect(valueOf(rows, 'appearance')).toBe('hazel eyes, fair hair');
    expect(valueOf(rows, 'reproduction')).toBe('2 deliveries · 1 donation');
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
  const looksText = glasses => buildProfileDetailSections({ glasses }, 'uk')[0]?.text;

  it('«ні» — це гарний зір', () => {
    expect(looksText('no')).toBe('Окулярів не ношу, зір гарний.');
  });

  it('діоптрії — це сам зір', () => {
    expect(looksText('-2.5')).toBe('Мій зір — −2.5 діоптрії.');
  });

  it('власна відповідь стає уточненням про зір', () => {
    expect(looksText('Лінзи')).toBe('Щодо зору й окулярів — лінзи.');
  });
});
