import fs from 'fs';
import path from 'path';

const matchingSource = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
const styledSource = fs.readFileSync(path.join(__dirname, 'Matching.styled.jsx'), 'utf8');

const slice = (source, from, until) => {
  const start = source.indexOf(from);
  const end = source.indexOf(until, start + from.length);
  if (start < 0 || end < 0) throw new Error(`не знайдено межі зрізу: ${from} → ${until}`);
  return source.slice(start, end);
};

/*
 * «Адмін натиснув приховати, а `feedDate` не став `false`».
 *
 * Писач тут був ні до чого: відкрита картка — це `{ ...рядок, ...повна анкета }`,
 * і обробник правив самий рядок. Анкета лишалась із `publish: true`, цятка не
 * мінялась, і другий дотик публікував анкету назад.
 */
describe('цятка публікації адміна', () => {
  const toggle = slice(matchingSource, 'const togglePublish = React.useCallback(', '}, [isAdmin, language]);');

  it('міняє і рядок, і вже прочитану повну анкету', () => {
    expect(toggle).toContain('setUsers(prev => prev.map(u => (u.userId === userId ? patchPublication(u) : u)));');
    expect(toggle).toContain('setFullProfileByUserId(prev => (prev[userId] ? { ...prev, [userId]: patchPublication(prev[userId]) } : prev));');
  });

  it('після запису правит обидва кеші, а відмову називає', () => {
    expect(toggle).toContain('if (getCard(userId)) updateCard(userId, { publish: newValue });');
    expect(toggle).toContain('setCachedMatchingSummaryCards({ [userId]: { ...summary, publish: newValue } });');
    expect(toggle).toContain('toast.error(');
  });
});

describe('чіп фільтра з хрестиком — одна плашка', () => {
  it('хрестик тієї самої висоти, що й чіп', () => {
    const chip = slice(styledSource, 'export const FilterRailChip = styled.button`', '`;');
    const clear = slice(styledSource, 'export const FilterRailChipClear = styled.button`', '`;');
    expect(chip).toContain('height: 40px;');
    expect(clear).toContain('height: 40px;');
  });

  it('знята права рамка чіпа стоїть після скороченого border', () => {
    const chip = slice(styledSource, 'export const FilterRailChip = styled.button`', '`;');
    expect(chip.indexOf('border-right-width')).toBeGreaterThan(chip.indexOf('border: 1px solid'));
  });
});
