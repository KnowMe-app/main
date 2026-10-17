import {
  buildJsonProfileSearchValues,
  buildJsonStateCard,
  parseJsonProfileList,
} from './jsonProfileImport';

describe('jsonProfileImport', () => {
  it('reads a numbered object of profiles in order', () => {
    const list = parseJsonProfileList('{ "1": { "phone": 380751110125 }, "2": { "telegram": "a" } }');
    expect(list.map(item => item.key)).toEqual(['1', '2']);
  });

  it('treats a single profile without wrapper as a list of one', () => {
    expect(parseJsonProfileList('{"phone":"380501112233"}')).toEqual([{ key: '1', profile: { phone: '380501112233' } }]);
  });

  it('ignores plain queries and broken JSON', () => {
    expect(parseJsonProfileList('380501112233')).toEqual([]);
    expect(parseJsonProfileList('{ broken')).toEqual([]);
  });

  it('searches only by phone and telegram', () => {
    expect(buildJsonProfileSearchValues({ phone: 380751110125, telegram: '@stupko', city: 'Фастів' }))
      .toEqual(['380751110125', '@stupko']);
  });

  it('converts file dates to the database format', () => {
    expect(buildJsonStateCard('1', { birth: '01.01.1998', city: 'Київ' })).toMatchObject({ birth: '1998-01-01', city: 'Київ' });
  });

  it('marks the state card so nothing writes it by id', () => {
    expect(buildJsonStateCard('3', { phone: '1' })).toMatchObject({ userId: 'json_3', _fromJson: true, _jsonGroup: '3' });
  });
});
