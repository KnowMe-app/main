import { mergeProfileNodes, hasAnyProfileNode } from '../profileNodeMerge';
import { buildMatchingCardProjection } from '../matchingCardIndex';

const AUTH_UID = 'a'.repeat(28);

const fullProfile = {
  name: 'Яна',
  surname: 'Дорошенко',
  birth: '12.03.1994',
  city: 'Київ',
  blood: '1+',
  publish: true,
  lastLogin2: '2026-08-19',
  photos: ['https://a.jpg', 'https://b.jpg'],
  phone: '+380671112233',
};

const card = buildMatchingCardProjection(AUTH_UID, fullProfile);

/**
 * Розділення вузлів не має бути видно нікому, крім самого адаптера. Тут
 * перевіряється саме це: на виході — анкета тієї форми, яку решта застосунку
 * знала завжди, з тими самими іменами полів.
 */
describe('збірка анкети з розділених вузлів', () => {
  it('віддає повні значення там, де картка носить похідні', () => {
    const merged = mergeProfileNodes({
      userId: AUTH_UID,
      card,
      details: { surname: 'Дорошенко', blood: '1+', photos: fullProfile.photos },
    });

    // Картка знає лише ініціал і розібрану групу; повне значення перемагає.
    expect(card.surnameShort).toBe('Д.');
    expect(merged.surname).toBe('Дорошенко');
    expect(merged.blood).toBe('1+');
    expect(merged.photos).toEqual(fullProfile.photos);
    expect(merged.__photosHydrated).toBe(true);
  });

  it('лишає ініціал, коли повного прізвища ще немає', () => {
    // Чесніше показати «Д.», ніж порожнечу: анкета ще не переїхала повністю.
    const merged = mergeProfileNodes({ userId: AUTH_UID, card });
    expect(merged.surname).toBe('Д.');
    expect(merged.__photosHydrated).toBe(false);
  });

  it('розкриває feedDate у ту саму пару, яку читає стрічка', () => {
    const merged = mergeProfileNodes({ userId: AUTH_UID, card });
    expect(merged.publish).toBe(true);
    expect(merged.lastLogin2).toBe('2026-08-19');
    expect(merged).not.toHaveProperty('feedDate');
  });

  it('не тече прапорцем проєкції назовні', () => {
    const merged = mergeProfileNodes({ userId: AUTH_UID, card });
    expect(merged).not.toHaveProperty('__matchingSummary');
  });

  it('накладає контакти, робочі позначки і технічне без перетинів', () => {
    const merged = mergeProfileNodes({
      userId: AUTH_UID,
      card,
      details: { surname: 'Дорошенко' },
      contacts: { phone: ['+380671112233'], telegram: '@yana' },
      workflow: { lastAction: 'дзвінок', cycleStatus: 'active' },
      technical: { lastLogin2: '2026-08-19', language: 'uk' },
    });

    expect(merged.phone).toEqual(['+380671112233']);
    expect(merged.telegram).toBe('@yana');
    expect(merged.lastAction).toBe('дзвінок');
    expect(merged.language).toBe('uk');
  });

  it('legacy лягає найпершим шаром і перекривається новими вузлами', () => {
    // Поки анкета не переїхала, legacy — єдиний, хто щось знає. Щойно вузол
    // непорожній, виграє він.
    const merged = mergeProfileNodes({
      userId: AUTH_UID,
      legacy: { city: 'Львів', education: 'вища', phone: 'старий' },
      card,
      contacts: { phone: '+380671112233' },
    });

    expect(merged.city).toBe('Київ');
    expect(merged.phone).toBe('+380671112233');
    expect(merged.education).toBe('вища');
  });

  it('не носить позначки колекції — колекція у вебі одна', () => {
    expect(mergeProfileNodes({ userId: AUTH_UID, card })).not.toHaveProperty('__sourceCollection');
    expect(mergeProfileNodes({ userId: 'AC00001', details: { surname: 'К' } }))
      .not.toHaveProperty('__sourceCollection');
  });

  it('порожні вузли означають «анкета сюди ще не переїхала»', () => {
    expect(hasAnyProfileNode({})).toBe(false);
    expect(hasAnyProfileNode({ card: {}, details: null })).toBe(false);
    expect(hasAnyProfileNode({ contacts: { phone: '+380' } })).toBe(true);

    expect(mergeProfileNodes({ userId: AUTH_UID })).toBeNull();
    expect(mergeProfileNodes({ userId: '' , card })).toBeNull();
  });
});
