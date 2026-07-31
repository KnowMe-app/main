import { parseNewUsersJson } from './newUsersJsonImport';

describe('parseNewUsersJson', () => {
  it('keeps keyed cards and fills a missing userId from the card key', () => {
    expect(parseNewUsersJson('{"TG0001":{"name":"Анастасія"},"TG0002":{"userId":"TG0002"}}')).toEqual({
      TG0001: { userId: 'TG0001', name: 'Анастасія' },
      TG0002: { userId: 'TG0002' },
    });
  });

  it.each(['[]', 'null', '{}'])('rejects a JSON value without keyed cards: %s', value => {
    expect(() => parseNewUsersJson(value)).toThrow();
  });

  it('rejects malformed JSON, invalid Firebase keys, and non-object cards', () => {
    expect(() => parseNewUsersJson('{')).toThrow('некоректний JSON');
    expect(() => parseNewUsersJson('{"TG/1":{}}')).toThrow('Некоректний ключ');
    expect(() => parseNewUsersJson('{"TG0001":"not a card"}')).toThrow('має бути об’єктом');
  });
});
