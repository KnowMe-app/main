import fs from 'fs';
import path from 'path';

const rowSource = fs.readFileSync(path.join(__dirname, 'ProfileRow.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, 'MatchingHiddenList.styled.jsx'), 'utf8');

describe('зона контактів у рядку стрічки', () => {
  it('показує контакти без зайвого заголовка й тексту кнопки дзвінка', () => {
    expect(rowSource).not.toContain('S.RowContactsTitle');
    expect(rowSource).not.toContain("<span>{uiText('Подзвонити', language)}</span>");
  });

  it('повертає компактні мішені 28 px, зберігаючи кольори месенджерів', () => {
    const box = styles.slice(styles.indexOf('const contactIconBox = css`'));
    expect(box).toContain('width: 28px;');
    expect(box).toContain('height: 28px;');
    expect(box).toContain('width: 13px;');
    expect(box).toContain('height: 13px;');
    expect(styles).toContain("telegram: '#229ED9'");
    expect(rowSource).toContain('$channel={key}');
  });
});
