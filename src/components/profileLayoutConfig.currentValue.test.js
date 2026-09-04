import { getContactEntries } from './contactMethods';
import {
  getProfileName,
  getProfileSections,
  normalizeDisplayValue,
  shouldRenderField,
} from './profileLayoutConfig';
import { deriveSurnameShort } from '../utils/profileFieldDerive';

/*
 * Одне правило на всю картку: показане значення — останнє в полі.
 *
 * Стерте поле не показується взагалі — ані підписом, ані попереднім записом.
 * Це та сама історія, що й у `getCurrentValue.test.js`, але перевірена там, де
 * її видно людині: імʼя, контакти, секції анкети, ініціал у стрічці.
 */
describe('картка показує поточне значення поля, а не попереднє', () => {
  it('порожня остання версія — це порожнє поле', () => {
    expect(normalizeDisplayValue(['Оксана', ''])).toBe('');
    expect(shouldRenderField(['Оксана', ''])).toBe(false);
    expect(normalizeDisplayValue(['Оксана', 'Ксенія'])).toBe('Ксенія');
    expect(shouldRenderField(['Оксана', 'Ксенія'])).toBe(true);
  });

  it('скаляр показується як був', () => {
    expect(normalizeDisplayValue('Оксана')).toBe('Оксана');
    expect(normalizeDisplayValue('')).toBe('');
  });

  it('стерте прізвище зникає з імені картки', () => {
    expect(getProfileName({ name: 'Анна', surname: ['Коваленко', ''] })).toBe('Анна');
    expect(getProfileName({ name: 'Анна', surname: ['Коваленко', 'Ковальчук'] }))
      .toBe('Анна Ковальчук');
  });

  it('стертий контакт не дає ані посилання, ані рядка в секції', () => {
    const erased = { phone: ['+380501112233', ''], telegram: ['@old', '@new'] };

    expect(getContactEntries(erased)).toEqual([
      expect.objectContaining({ key: 'telegram', value: '@new' }),
    ]);

    const contacts = getProfileSections(erased, 'ag')
      .find(section => section.variant === 'contacts');
    expect(contacts.fields.map(item => item.key)).toEqual(['telegram']);
  });

  // Секція контактів існує лише тоді, коли є що показати: поле, стерте в усіх
  // контактах, не має лишати на картці порожню шапку «Contacts».
  it('без жодного поточного контакту секції немає', () => {
    const sections = getProfileSections({ phone: ['+380501112233', ''] }, 'ag');
    expect(sections.some(section => section.variant === 'contacts')).toBe(false);
  });

  // Ініціал у рядку стрічки читає те саме поточне значення: інакше картка
  // показувала б «К.» від прізвища, якого в анкеті вже немає.
  it('ініціал стрічки теж бере останню версію', () => {
    expect(deriveSurnameShort(['Коваленко', 'Ковальчук'])).toEqual({ value: 'К.' });
    // Стерте прізвище — це «немає значення», а не «не вдалось вивести»:
    // попередження тут вело б шукати поламані дані там, де їх немає.
    expect(deriveSurnameShort(['Коваленко', ''])).toEqual({ value: undefined });
    expect(deriveSurnameShort({ nested: { deep: true } }))
      .toEqual({ value: undefined, warning: 'UNRESOLVED_SURNAME' });
  });
});
