import { appendEmptyFieldRow, canAppendFieldRow, isEmptyFieldRow } from '../profileFieldRows';

/*
 * Кнопка «+» відкриває ще один інпут — і робить рівно це.
 *
 * Раніше вона дописувала в поле порожній рядок і одразу зберігала, тож скаляр
 * `name: 'Эвелина'` ставав у базі масивом від самого лише дотику. Відтоді як
 * порожня остання версія означає «поле стерли», такий рядок коштував би анкеті
 * імені.
 */
describe('порожній рядок форми — намір, а не значення', () => {
  it('додає версію, якої ще немає, а не порожню', () => {
    expect(appendEmptyFieldRow('Эвелина')).toEqual(['Эвелина', undefined]);
    expect(appendEmptyFieldRow(['Оксана', 'Ксенія'])).toEqual(['Оксана', 'Ксенія', undefined]);
  });

  // `undefined` у масиві — дірка, і писач знімає її перед записом
  // (`removeUndefined`), тож недописаний рядок до бази не доїжджає взагалі.
  it('порожній рядок не є ані значенням, ані стиранням', () => {
    const withNewRow = appendEmptyFieldRow('Эвелина');
    expect(withNewRow[withNewRow.length - 1]).toBeUndefined();
    expect(withNewRow.filter(value => value !== undefined)).toEqual(['Эвелина']);
  });

  it('впізнає порожній рядок у будь-якій його формі', () => {
    expect(isEmptyFieldRow(undefined)).toBe(true);
    expect(isEmptyFieldRow(null)).toBe(true);
    expect(isEmptyFieldRow('')).toBe(true);
    expect(isEmptyFieldRow('   ')).toBe(true);
    expect(isEmptyFieldRow('Эвелина')).toBe(false);
    expect(isEmptyFieldRow(0)).toBe(false);
  });

  // Другий порожній рядок під першим порожнім не потрібен нікому.
  it('пропонує новий рядок лише тоді, коли попередній заповнений', () => {
    expect(canAppendFieldRow('Эвелина')).toBe(true);
    expect(canAppendFieldRow(['Оксана', 'Ксенія'])).toBe(true);
    expect(canAppendFieldRow(['Оксана', undefined])).toBe(false);
    expect(canAppendFieldRow(['Оксана', ''])).toBe(false);
    expect(canAppendFieldRow('')).toBe(false);
    expect(canAppendFieldRow(undefined)).toBe(false);
    expect(canAppendFieldRow([])).toBe(false);
  });
});

describe('форма не зберігає порожній рядок', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'components', 'ProfileForm.jsx'),
    'utf8',
  );

  it('«+» лише додає рядок і нічого не надсилає', () => {
    const buttonBlock = source.slice(
      source.indexOf('canAppendFieldRow(state[field.name])'),
      source.indexOf('canAppendFieldRow(state[field.name])') + 1600,
    );
    expect(buttonBlock).toContain('[field.name]: appendEmptyFieldRow(prevState[field.name]),');
    expect(buttonBlock).not.toContain('submitWithNormalization');
  });
});
