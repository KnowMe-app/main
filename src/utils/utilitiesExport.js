import {
  CATEGORY_TYPES,
  computeMonth,
  evalUtilityExpr,
  formatDmy,
  getPath,
  isNumber,
  listApartments,
  listCategories,
  listMonths,
  monthName,
  todayIso,
  zonesOf,
} from './utilitiesModel';

/*
 * Експорт комуналки в Excel (17.11, на прохання власниці продукту): кожна
 * квартира — окрема книга (файл .xlsx), у ній аркуш «Місяці» з усіма числами
 * й розрахунком і аркуш «Налаштування» з блоками й початковими показниками.
 * Окремі книги, а не аркуші однієї: квартиру передають окремо (орендарці,
 * бухгалтерці), і чужих квартир у файлі бути не мусить.
 *
 * Чисті функції тут (`buildApartmentSheets` — рядки аркушів), а сам рушій
 * `xlsx` вантажиться лише на натискання: у файлі екрана він важив би ~400 КБ.
 */

const round2 = value => (isNumber(value) ? Math.round(value * 100) / 100 : '');
const exprCell = expr => {
  const value = evalUtilityExpr(expr);
  return isNumber(value) ? value : '';
};

export const buildApartmentSheets = (data, aptId) => {
  const apt = data?.apartments?.[aptId] || {};
  const cats = listCategories(apt);
  const header = ['Місяць', 'Показники зняли', 'Стан'];
  cats.forEach(cat => {
    if (cat.type === CATEGORY_TYPES.SUM) {
      header.push(`${cat.name}, ₴`, `${cat.name} — як записано`);
      return;
    }
    zonesOf(cat).forEach(zone => {
      const name = cat.type === CATEGORY_TYPES.METER2 ? `${cat.name} ${zone.label.toLowerCase()}` : cat.name;
      header.push(`${name}: було`, `${name}: зараз`, `${name}: спожито, ${cat.unit || ''}`.trim(), `${name}: тариф`, `${name}: сума, ₴`);
    });
  });
  header.push('Разом комуналка, ₴', 'Бюджет, ₴', 'Залишок минулого місяця', 'Перенесено в бюджет, ₴', 'Коригування, ₴', 'Коригування — що це', 'Результат, ₴', 'Переплата / борг');

  const memo = new Map();
  const rows = listMonths(data, aptId).map(month => {
    const computed = computeMonth(data, month, memo);
    const row = [monthName(month.mk), formatDmy(month.date), month.closed === true ? 'закрито' : 'заповнюється'];
    computed.blocks.forEach(block => {
      if (block.cat.type === CATEGORY_TYPES.SUM) {
        row.push(round2(block.value), block.expr ?? '');
        return;
      }
      block.zones.forEach(zoneRow => {
        row.push(
          isNumber(zoneRow.prev.value) ? zoneRow.prev.value : '',
          isNumber(zoneRow.cur) ? zoneRow.cur : '',
          isNumber(zoneRow.use) ? zoneRow.use : '',
          isNumber(zoneRow.tariff) ? zoneRow.tariff : '',
          zoneRow.complete ? round2(zoneRow.sum) : '',
        );
      });
    });
    row.push(
      round2(computed.cost),
      computed.budgetSet ? round2(computed.budget) : '',
      computed.prevMonth ? (month.carry === true ? 'перенесено' : month.carry === false ? 'не переносили' : 'не вирішено') : '',
      computed.carried ? round2(computed.carried) : '',
      computed.adjustment ? round2(computed.adjustment) : '',
      computed.extras.map(extra => `${extra.label || 'Коригування'}: ${extra.kind === 'charge' ? '−' : '+'}${extra.e}`).join('; '),
      round2(computed.result),
      computed.result >= 0 ? 'переплата' : 'борг',
    );
    return row;
  });

  const settings = [
    ['Квартира', apt.name || ''],
    ['День платежу', apt.payDay ?? ''],
    ['Початкові показники записано', formatDmy(apt?.init?.date)],
    [],
    ['Блок', 'Вид', 'Одиниця', 'Початковий показник'],
  ];
  cats.forEach(cat => {
    const kind = cat.type === CATEGORY_TYPES.METER2 ? 'лічильник, день і ніч' : cat.type === CATEGORY_TYPES.METER ? 'лічильник' : 'сума за місяць';
    if (cat.type === CATEGORY_TYPES.SUM) {
      settings.push([cat.name, kind, '', '']);
      return;
    }
    zonesOf(cat).forEach(zone => {
      const name = cat.type === CATEGORY_TYPES.METER2 ? `${cat.name} · ${zone.label.toLowerCase()}` : cat.name;
      settings.push([name, kind, cat.unit || '', exprCell(getPath(apt.init, zone.cur))]);
    });
  });

  return { name: apt.name || aptId, months: [header, ...rows], settings };
};

const safeFileName = name => String(name || 'Квартира').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Квартира';

export const buildExportFileName = (name, date = todayIso()) => `Комуналка — ${safeFileName(name)} — ${date}.xlsx`;

/** Усі квартири — по книзі на кожну. Повертає імена збережених файлів. */
export const exportUtilitiesToExcel = async (data, { pauseMs = 400 } = {}) => {
  const [XLSX, fileSaver] = await Promise.all([import('xlsx'), import('file-saver')]);
  // `file-saver` — CommonJS: динамічний імпорт віддає функцію в `default`, а
  // не іменем `saveAs` (статичний `import { saveAs }` інших екранів це ховав).
  const saveAs = fileSaver.saveAs || fileSaver.default?.saveAs || fileSaver.default;
  const files = [];
  const apartments = listApartments(data);
  for (let index = 0; index < apartments.length; index += 1) {
    const apt = apartments[index];
    const sheets = buildApartmentSheets(data, apt.id);
    const book = XLSX.utils.book_new();
    const monthsSheet = XLSX.utils.aoa_to_sheet(sheets.months);
    monthsSheet['!cols'] = sheets.months[0].map((title, column) => ({ wch: column === 0 ? 16 : Math.min(28, Math.max(10, String(title).length + 2)) }));
    XLSX.utils.book_append_sheet(book, monthsSheet, 'Місяці');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheets.settings), 'Налаштування');
    const fileName = buildExportFileName(sheets.name);
    // `XLSX.writeFile` у браузері знімає посилання одразу після кліку, і
    // Chromium зберігав файл під іменем «download» без розширення —
    // `file-saver` дає браузеру саме імʼя книги.
    const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
    files.push(fileName);
    // Браузер, що бачить кілька завантажень за мить, частину з них мовчки
    // відкидає — між книгами коротка пауза.
    if (index < apartments.length - 1 && pauseMs > 0) {
      await new Promise(resolve => setTimeout(resolve, pauseMs));
    }
  }
  return files;
};
