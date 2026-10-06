import fs from 'fs';
import path from 'path';

const rowSource = fs.readFileSync(path.join(__dirname, 'ProfileRow.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, 'MatchingHiddenList.styled.jsx'), 'utf8');

describe('зона контактів у рядку стрічки', () => {
  it('показує контакти без зайвого заголовка й тексту кнопки дзвінка', () => {
    expect(rowSource).not.toContain('S.RowContactsTitle');
    // Підпис «Подзвонити» — лише головній дії картки організації
    // (`primaryLabel`): у рядку людини дзвінок лишається значком.
    expect(rowSource).not.toContain("$primary\n              title={callLabel}\n              aria-label={callLabel}\n              onClick={act('phone')}\n            >\n              <PhoneHandsetIcon />\n              <span>");
    expect(rowSource).toContain("{primaryLabel && phones[0] === entry ? <span>{uiText('Подзвонити', language)}</span> : null}");
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
