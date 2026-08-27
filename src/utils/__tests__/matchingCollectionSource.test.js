import { resolveLegacyCollectionForId } from '../matchingDataProvider';

const LONG_ID = 'vtDxkDMjCwYuTDqTUnZsO29bpQr1';
const SHORT_ID = 'mQ7x2';

/**
 * Колекція у вебі одна, і стрічка більше нічого не питає про джерело картки.
 * Питання лишилось одне, і воно не про показ: коли анкету треба віддзеркалити
 * назад у мобільну базу, куди саме писати — `users` чи `newUsers`.
 */
describe('legacy-колекція визначається форматом id', () => {
  it('довгий id (UID Firebase Auth) — це users', () => {
    expect(resolveLegacyCollectionForId(undefined, LONG_ID)).toBe('users');
  });

  it('короткий id (push-ключ) — це newUsers', () => {
    expect(resolveLegacyCollectionForId(undefined, SHORT_ID)).toBe('newUsers');
  });

  it('явно вказане джерело точніше за здогадку по id', () => {
    // Анкету прочитали прямо з колекції — вона знає, звідки прийшла, і
    // здогадуватись тут нема потреби.
    expect(resolveLegacyCollectionForId('newUsers', LONG_ID)).toBe('newUsers');
    expect(resolveLegacyCollectionForId('users', SHORT_ID)).toBe('users');
  });

  it('сміттєве джерело ігнорується — вирішує формат id', () => {
    expect(resolveLegacyCollectionForId('хтозна', LONG_ID)).toBe('users');
    expect(resolveLegacyCollectionForId(null, '')).toBe('newUsers');
    expect(resolveLegacyCollectionForId(undefined, undefined)).toBe('newUsers');
  });

  it('межа — рівно 20 символів: push-ключ довший за неї не буває', () => {
    expect(resolveLegacyCollectionForId(undefined, 'a'.repeat(20))).toBe('newUsers');
    expect(resolveLegacyCollectionForId(undefined, 'a'.repeat(21))).toBe('users');
  });
});
