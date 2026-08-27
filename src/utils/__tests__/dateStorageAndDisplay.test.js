import fs from 'fs';
import path from 'path';

import { formatDateToDisplay, formatDateToServer, calculateAge } from 'components/inputValidations';
import { utilCalculateAge } from 'components/smallCard/utilCalculateAge';
import { utilCalculateMonthsAgo } from 'components/smallCard/utilCalculateMonthsAgo';
import { isUserAllowedByAdditionalAccess, parseAdditionalAccessRules } from '../additionalAccessRules';

const configSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'components', 'config.js'),
  'utf8',
);

/**
 * Одна дата — два написання, і кожне на своєму боці.
 *
 * У базі дата лежить у `YYYY-MM-DD`: у ньому рядкове порівняння збігається з
 * хронологічним, тож база вміє і сортувати, і брати діапазон. Людині вона
 * показується крапками — так її вводять і так її читають.
 *
 * Небезпека тут не в самому перетворенні, а в місцях, які знають лише одну
 * форму. Доки в базі лежали крапкові дати, читач із крапковим парсером
 * працював; після переїзду він мовчки почав би віддавати `NaN` — вік зникає з
 * картки, фільтр за віком не знаходить нікого, сортування ставить дати
 * навмання. Тести нижче стережуть саме ці місця.
 */
describe('дата: у базі ISO, людині — крапки', () => {
  it('переставляє дату в обидва боки', () => {
    expect(formatDateToServer('25.08.2026')).toBe('2026-08-25');
    expect(formatDateToDisplay('2026-08-25')).toBe('25.08.2026');
  });

  it('не чіпає того, що вже у своєму форматі', () => {
    expect(formatDateToServer('2026-08-25')).toBe('2026-08-25');
    expect(formatDateToDisplay('25.08.2026')).toBe('25.08.2026');
  });

  it('не чіпає нотатки, у якій дата стоїть усередині', () => {
    // Три частини після `split('.')` має і нотатка — без перевірки формату
    // вона поверталася б перекрученою.
    expect(formatDateToServer('до 01.09.2026 не писати')).toBe('до 01.09.2026 не писати');
    expect(formatDateToDisplay('до 01.09.2026 не писати')).toBe('до 01.09.2026 не писати');
  });

  it('legacy-позначку «ніколи» лишає впізнаваною', () => {
    expect(formatDateToServer('99.99.2099')).toBe('2099-99-99');
    expect(formatDateToDisplay('2099-99-99')).toBe('99.99.2099');
  });

  it('доповнює однознакові день і місяць нулями', () => {
    // Інакше в базі опинились би два різні ключі на ту саму дату.
    expect(formatDateToServer('1.9.2026')).toBe('2026-09-01');
  });
});

describe('вік рахується з обох написань', () => {
  const yearsAgo = years => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - years);
    return date;
  };

  const iso = date => date.toISOString().slice(0, 10);
  const dotted = date => {
    const [year, month, day] = iso(date).split('-');
    return `${day}.${month}.${year}`;
  };

  it('картка показує вік і для дати з бази, і для legacy-дати', () => {
    const birthday = yearsAgo(30);
    expect(utilCalculateAge(iso(birthday))).toBe(30);
    expect(utilCalculateAge(dotted(birthday))).toBe(30);
  });

  it('те саме в перевірці правил доступу', () => {
    const rules = parseAdditionalAccessRules('age: 30');
    const birthday = yearsAgo(30);

    expect(isUserAllowedByAdditionalAccess({ birth: iso(birthday) }, rules)).toBe(true);
    expect(isUserAllowedByAdditionalAccess({ birth: dotted(birthday) }, rules)).toBe(true);
  });

  it('валідація вводу теж приймає обидва', () => {
    const birthday = yearsAgo(25);
    expect(calculateAge(iso(birthday))).toBe(25);
    expect(calculateAge(dotted(birthday))).toBe(25);
  });

  it('на нечитабельному значенні мовчить, а не вигадує вік', () => {
    expect(utilCalculateAge('незрозуміло')).toBe(null);
    expect(utilCalculateAge('')).toBe(null);
  });
});

describe('«скільки місяців тому» — так само', () => {
  const monthsAgo = months => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - months);
    return date;
  };

  it('рахує і від ISO, і від крапкової дати', () => {
    const date = monthsAgo(5);
    const isoValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    const dottedValue = `01.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;

    expect(utilCalculateMonthsAgo(isoValue)).toBe(5);
    expect(utilCalculateMonthsAgo(dottedValue)).toBe(5);
  });
});

describe('запис у базу приводить дату до формату бази', () => {
  // Шляхів збереження кілька — форма анкети, поля картки, імпорт, — і кожен
  // домовлявся б із базою окремо. Тому перетворення стоїть на виході, поруч із
  // чисткою транзитних полів, і його проходять усі три писачі.
  it('усі писачі проганяють пейлоад через normalizeStoredDates', () => {
    const writers = configSource.match(/normalizeStoredDates\(stripTransientUserDataFields\(/g) || [];
    expect(writers.length).toBe(3);
  });

  it('перелік полів-дат явний, а не «усе, що схоже на дату»', () => {
    const block = configSource.slice(
      configSource.indexOf('const STORAGE_DATE_FIELDS = ['),
      configSource.indexOf('];', configSource.indexOf('const STORAGE_DATE_FIELDS = [')),
    );

    ['birth', 'lastDelivery', 'opuDate', 'lastCycle', 'getInTouch', 'lastLogin2']
      .forEach(field => expect(block).toContain(`'${field}'`));
    // `csection` буває і датою, і текстом («2 кесарі») — його не чіпають.
    expect(block).not.toContain("'csection'");
  });

  it('індекс віку знає обидва написання дати народження', () => {
    // Інакше після переїзду кожна анкета індексувалась би як «вік невідомий»,
    // і фільтр за віком не знаходив би нікого.
    const indexer = configSource.slice(
      configSource.indexOf('const normalizeAgeBirthDateIndexValue ='),
      configSource.indexOf('const getAgeIndexSet ='),
    );
    expect(indexer).toContain('const dotted =');
    expect(indexer).toContain('const iso =');
    expect(indexer).toContain('-(');
  });
});
