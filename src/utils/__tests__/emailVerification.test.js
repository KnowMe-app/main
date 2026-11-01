import { sendEmailVerification } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  VERIFICATION_FUNCTION_NAME,
  VERIFICATION_FUNCTION_REGION,
  applyAuthEmailLanguage,
  requestVerificationEmail,
  toFirebaseEmailLanguage,
} from '../emailVerification';

const fs = require('fs');
const path = require('path');

jest.mock('firebase/auth', () => ({ sendEmailVerification: jest.fn(() => Promise.resolve()) }));
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({ name: 'functions' })),
  httpsCallable: jest.fn(),
}));

const user = { uid: 'u1', email: 'a@example.com' };
const makeAuth = () => ({ app: { name: '[DEFAULT]' }, languageCode: null });

/*
 * Лист підтвердження: спершу власний (функція), стандартний Firebase — запас.
 * Без запасу реєстрація лишалась би без листа щоразу, коли функцію не
 * розгорнуто чи поштовий сервіс відмовив.
 */
describe('requestVerificationEmail', () => {
  let warn;
  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('кличе функцію в її регіоні й не шле стандартного листа, коли вона відповіла', async () => {
    const call = jest.fn(() => Promise.resolve({ data: { status: 'sent' } }));
    httpsCallable.mockReturnValue(call);
    const auth = makeAuth();

    const result = await requestVerificationEmail(user, { auth, language: 'uk', role: 'ag' });

    expect(result).toEqual({ via: 'knowme', status: 'sent' });
    expect(getFunctions).toHaveBeenCalledWith(auth.app, VERIFICATION_FUNCTION_REGION);
    expect(httpsCallable.mock.calls[0][1]).toBe(VERIFICATION_FUNCTION_NAME);
    expect(call).toHaveBeenCalledWith({ language: 'uk', role: 'ag' });
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it('уже підтверджена пошта — теж відповідь, без запасного листа', async () => {
    httpsCallable.mockReturnValue(() => Promise.resolve({ data: { status: 'already-verified' } }));
    const result = await requestVerificationEmail(user, { auth: makeAuth(), language: 'en' });
    expect(result).toEqual({ via: 'knowme', status: 'already-verified' });
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it('функція не відповіла — стандартний лист мовою інтерфейсу', async () => {
    const failure = Object.assign(new Error('internal'), { code: 'functions/internal' });
    httpsCallable.mockReturnValue(() => Promise.reject(failure));
    const auth = makeAuth();

    const result = await requestVerificationEmail(user, { auth, language: 'zh' });

    expect(result).toEqual({ via: 'firebase', status: 'sent' });
    expect(sendEmailVerification).toHaveBeenCalledWith(user);
    expect(auth.languageCode).toBe('zh-CN');
  });

  it('межа відправок функції — це не збій: запасного листа немає, код той самий, що у Firebase', async () => {
    const limit = Object.assign(new Error('limit'), { code: 'functions/resource-exhausted' });
    httpsCallable.mockReturnValue(() => Promise.reject(limit));

    await expect(requestVerificationEmail(user, { auth: makeAuth(), language: 'uk' }))
      .rejects.toMatchObject({ code: 'auth/too-many-requests' });
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it('без користувача не шле нічого', async () => {
    await expect(requestVerificationEmail(null, { auth: makeAuth() })).rejects.toThrow('no signed-in user');
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it('мова листів Firebase — код інтерфейсу, китайська з регіоном', () => {
    expect(toFirebaseEmailLanguage('uk')).toBe('uk');
    expect(toFirebaseEmailLanguage('zh')).toBe('zh-CN');
    expect(toFirebaseEmailLanguage('')).toBe('uk');
    const auth = makeAuth();
    applyAuthEmailLanguage(auth, 'de');
    expect(auth.languageCode).toBe('de');
    applyAuthEmailLanguage(auth, '');
    expect(auth.languageCode).toBe('de');
  });

  it('регіон збігається з регіоном функції', () => {
    const config = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'functions', 'config.js'), 'utf8');
    expect(config).toContain(`REGION: '${VERIFICATION_FUNCTION_REGION}'`);
    const index = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'functions', 'index.js'), 'utf8');
    expect(index).toContain(`exports.${VERIFICATION_FUNCTION_NAME} = onCall(`);
  });

  it('жоден екран не шле стандартний лист повз цю функцію', () => {
    const components = path.join(__dirname, '..', '..', 'components');
    const offenders = fs.readdirSync(components)
      .filter(name => /\.jsx?$/.test(name) && !/\.test\./.test(name))
      .filter(name => /\bsendEmailVerification\b/.test(fs.readFileSync(path.join(components, name), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
