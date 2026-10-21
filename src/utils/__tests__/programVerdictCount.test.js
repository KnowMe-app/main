const fs = require('fs');
const path = require('path');

/**
 * «Вам підходить 1 з 1 програми» над чіпом «? Може підходити».
 *
 * Заголовок рахував підхожою програму, вимоги якої анкета не підтвердила
 * (резус не вказано): два сигнали про ту саму програму суперечили один одному.
 */
describe('лічильник «Вам підходить»', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'donorPrograms.js'), 'utf8');
  const view = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'programs', 'ProgramsView.jsx'), 'utf8');

  it('не рахує «може підходити» підхожою', () => {
    expect(source).toContain('item.result?.matches && !item.result?.uncertain');
  });

  it('називає «може підходити» окремо', () => {
    expect(view).toContain("' · ще {count} може підходити — уточніть анкету'");
  });
});
