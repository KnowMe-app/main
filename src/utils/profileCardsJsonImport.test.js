import { parseProfileCardsJson } from './profileCardsJsonImport';

describe('parseProfileCardsJson', () => {
  it('keeps keyed cards and fills a missing userId from the card key', () => {
    expect(parseProfileCardsJson('{"TG0001":{"name":"Анастасія"},"TG0002":{"userId":"TG0002"}}')).toEqual({
      TG0001: { userId: 'TG0001', name: 'Анастасія' },
      TG0002: { userId: 'TG0002' },
    });
  });

  it.each(['[]', 'null', '{}'])('rejects a JSON value without keyed cards: %s', value => {
    expect(() => parseProfileCardsJson(value)).toThrow();
  });

  it('rejects malformed JSON, invalid Firebase keys, and non-object cards', () => {
    expect(() => parseProfileCardsJson('{')).toThrow('некоректний JSON');
    expect(() => parseProfileCardsJson('{"TG/1":{}}')).toThrow('Некоректний ключ');
    expect(() => parseProfileCardsJson('{"TG0001":"not a card"}')).toThrow('має бути об’єктом');
  });
});
