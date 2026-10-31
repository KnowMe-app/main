import fs from 'fs';
import path from 'path';
import { buildOfflineCardListRows } from './AddNewProfileOfflineLoad';
import { normalizeCardListPlan } from 'utils/cardListPlan';
import { buildCardListStreams } from 'utils/cardListEngine';

// «Перелік з JSON-файлів» — це вже не окремий режим зі своїм завантажувачем,
// а джерело кандидатів для того самого двигуна «Списку». Тут перевіряється
// те, на чому старий офлайн-режим ламався: у файлах вузлів позначки
// `getInTouch` немає, і фільтр «дата сьогодні й раніше» відкидав усіх.

const isoDaysFromToday = shift => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const profiles = {
  a: { name: 'A', lastAction: 300 },
  b: { name: 'B', lastAction: 100 },
  c: { name: 'C' },
  d: { name: 'D', lastAction: 200 },
  e: { name: 'E', lastAction: 50 },
};
const marks = {
  a: isoDaysFromToday(-3),
  b: isoDaysFromToday(0),
  c: isoDaysFromToday(5),
  e: '2099-99-99',
};

describe('перелік із JSON-файлів', () => {
  it('позначки приходять з бази, бо у файлах вузлів їх немає', () => {
    const rows = buildOfflineCardListRows({ profiles, marks, plan: normalizeCardListPlan({ segments: { due: true } }) });

    expect(rows.map(row => row.userId)).toEqual(['b', 'a']);
    expect(rows[0].getInTouch).toBe(marks.b);
  });

  it('склад і порядок ті самі, що й у списку з бази', () => {
    const plan = normalizeCardListPlan({ segments: { due: true, future: true, undated: true, never: true } });
    const rows = buildOfflineCardListRows({ profiles, marks, plan });

    // Кому дзвонити (від сьогодні назад) → заплановані → без дати → «99».
    expect(rows.map(row => row.userId)).toEqual(['b', 'a', 'c', 'd', 'e']);
  });

  it('за останньою дією — від найсвіжішої, без карток, у яких дії не було', () => {
    const plan = normalizeCardListPlan({ byLastAction: true, segments: { due: true, future: true, undated: true, never: true } });
    const rows = buildOfflineCardListRows({ profiles, marks, plan });

    expect(rows.map(row => row.userId)).toEqual(['a', 'd', 'b', 'e']);
  });

  it('фільтри панелі відсіюють ще на файлах — до будь-якого запиту', () => {
    const plan = normalizeCardListPlan({ segments: { due: true, undated: true } });
    const rows = buildOfflineCardListRows({
      profiles,
      marks,
      plan,
      accept: entries => entries.filter(([id]) => id !== 'a'),
    });

    expect(rows.map(row => row.userId)).toEqual(['b', 'd']);
  });

  it('файли заміняють обхід бази, а не додають ще один потік', () => {
    expect(buildCardListStreams(normalizeCardListPlan({ fromFiles: true, segments: { due: true } })))
      .toEqual([expect.objectContaining({ source: 'files' })]);
  });

  it('екран бере кандидатів з обраних файлів вузлів і позначки — мапою власника', () => {
    const source = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');
    const loader = source.slice(
      source.indexOf('const loadMoreCardList = async'),
      source.indexOf('const ensureCardListLoaded = async'),
    );

    expect(loader).toContain('getLocalNodeProfiles()');
    expect(loader).toContain('await readOwnerGetInTouchMap(resolveCardListOwnerUid())');
    expect(loader).toContain('buildOfflineCardListRows({');
    // Без файлів — не тихий порожній список, а прохання їх обрати.
    expect(loader).toContain("toast.error('Оберіть файли вузлів анкет");
    expect(source).toContain('onPickFiles={handlePickLocalNodeFiles}');
  });
});
