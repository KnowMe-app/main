import { searchCardsOnDevice } from './offlineCardSearch';

const cards = [
  { userId: 'a', name: ['Оксана'], surname: 'Коваленко', city: 'Київ' },
  { userId: 'b', name: 'Марія', telegram: '@maria_k' },
  { userId: 'c', name: 'Ірина', phone: '+380 67 123 45 67' },
];

describe('пошук без звʼязку серед збереженого', () => {
  it('знаходить за іменем, прізвищем і містом без огляду на регістр', () => {
    expect(searchCardsOnDevice(cards, { name: 'оксан' }).map(c => c.userId)).toEqual(['a']);
    expect(searchCardsOnDevice(cards, { surname: 'КОВАЛ' }).map(c => c.userId)).toEqual(['a']);
    expect(searchCardsOnDevice(cards, { name: 'київ' }).map(c => c.userId)).toEqual(['a']);
  });

  it('номер — з кодом і без, з картки й з кешу контактів', () => {
    expect(searchCardsOnDevice(cards, { phone: '0671234567' }).map(c => c.userId)).toEqual(['c']);
    expect(searchCardsOnDevice(cards, { phone: '380501112233' }, {
      contactsById: { b: { phone: '0501112233' } },
    }).map(c => c.userId)).toEqual(['b']);
  });

  it('нік із «@» і без', () => {
    expect(searchCardsOnDevice(cards, { telegram: 'maria_k' }).map(c => c.userId)).toEqual(['b']);
  });

  it('порожнє й однолітерне нічого не знаходить', () => {
    expect(searchCardsOnDevice(cards, { name: '' })).toEqual([]);
    expect(searchCardsOnDevice(cards, { name: 'о' })).toEqual([]);
  });
});
