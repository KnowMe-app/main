import fs from 'fs';
import path from 'path';

const rowSource = fs.readFileSync(path.join(__dirname, 'ProfileRow.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, 'MatchingHiddenList.styled.jsx'), 'utf8');

// Користувачі не помічали контактів: ряд сірих рамок 28 px зі значками 13 px
// без жодного підпису читався як декор, і в нього не влучали пальцем.
describe('зона контактів у рядку стрічки', () => {
  it('підписана й має дзвінок словом, а не ще одним значком', () => {
    expect(rowSource).toContain("<S.RowContactsTitle>{uiText('Контакти', language)}</S.RowContactsTitle>");
    expect(rowSource).toContain("<span>{uiText('Подзвонити', language)}</span>");
  });

  it('тримає мішені 40 px і кольори месенджерів', () => {
    const box = styles.slice(styles.indexOf('const contactIconBox = css`'));
    expect(box).toContain('width: 40px;');
    expect(box).toContain('height: 40px;');
    expect(styles).toContain("telegram: '#229ED9'");
    expect(rowSource).toContain('$channel={key}');
  });
});
