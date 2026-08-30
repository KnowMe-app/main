import fs from 'fs';
import path from 'path';

describe('fetchUserById', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const body = source.slice(
    source.indexOf('export const fetchUserById'),
    source.indexOf('export const removeKeyFromFirebase'),
  );

  // Анкету складають нові вузли, і тільки вони. Legacy-колекція у вебі —
  // адресат дзеркального запису для мобільного застосунку, а не джерело: читати
  // її означало показувати те, що веб уже переніс і, бува, навмисно стер, та ще
  // й впиратись у права, яких у звичайного читача на чужий `users/$uid` немає.
  it('reads the profile nodes and nothing else', () => {
    expect(body).toContain('await readProfileFromNodes(userId, { includeTechnical: true })');
    expect(body).not.toContain('withLegacy');
    expect(body).not.toContain('users/${userId}');
  });

  it('hydrates photos on the one path it has', () => {
    expect(body.match(/getAllUserPhotos\(userId\)/g)).toHaveLength(1);
  });
});
