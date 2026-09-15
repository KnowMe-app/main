import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

/**
 * Смужка дій у відкритій картці не ловить подій — вона лише тло під кнопками,
 * а анкета під нею має лишатись прокручуваною. Ловить їх **кожна** кнопка в
 * ній, і саме це колись і зламалось: виняток стояв на самих лише `span` (у них
 * загорнуті реакції), а олівець — прямий нащадок-`button`. Він малювався, мав
 * підказку й aria-label, але дотик проходив крізь нього в анкету під смужкою:
 * жест, який у рядку стрічки працював, у відкритій картці не робив нічого.
 *
 * Тест питає саме різницю: виняток описаний для всіх нащадків, а не для одного
 * типу вузла.
 */
describe('кнопки смужки дій ловлять дотик', () => {
  const rail = () => {
    const source = read('Matching.styled.jsx');
    const start = source.indexOf('export const ModernActionRail');
    return source.slice(start, source.indexOf('`;', start));
  };

  it('смужка лишається прозорою для подій', () => {
    expect(rail()).toContain('pointer-events: none;');
  });

  it('а кожен її нащадок — ні', () => {
    expect(rail()).toContain('& > * {\n    pointer-events: auto;\n  }');
    expect(rail()).not.toContain('& > span {');
  });

  it('олівець у відкритій картці стоїть прямо в смужці', () => {
    // Якби він був загорнутий у span, попереднє правило нічого не важило б —
    // саме тому тест дивиться і сюди.
    const matching = read('Matching.jsx');
    const railMarkup = matching.slice(
      matching.indexOf('<ModernActionRail>'),
      matching.indexOf('</ModernActionRail>')
    );
    expect(railMarkup).toContain('{editProfileAction && (');
    expect(railMarkup).toContain('<ActionButton');
  });
});
