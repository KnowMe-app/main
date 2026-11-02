import { sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  PASSWORD_RESET_FUNCTION_NAME,
  VERIFICATION_FUNCTION_NAME,
  VERIFICATION_FUNCTION_REGION,
  applyAuthEmailLanguage,
  requestPasswordResetEmail,
  requestVerificationEmail,
  toFirebaseEmailLanguage,
} from '../emailVerification';

const fs = require('fs');
const path = require('path');

jest.mock('firebase/auth', () => ({
  sendEmailVerification: jest.fn(() => Promise.resolve()),
  sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
}));
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
    expect(index).toContain(`exports.${PASSWORD_RESET_FUNCTION_NAME} = onCall(`);
  });

  it('жоден екран не шле стандартний лист повз цю функцію', () => {
    const components = path.join(__dirname, '..', '..', 'components');
    const offenders = fs.readdirSync(components)
      .filter(name => /\.jsx?$/.test(name) && !/\.test\./.test(name))
      .filter(name => /\b(sendEmailVerification|sendPasswordResetEmail)\b/.test(fs.readFileSync(path.join(components, name), 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('requestPasswordResetEmail', () => {
  let warn;
  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('шле брендований лист функцією й не чіпає стандартного', async () => {
    const call = jest.fn(() => Promise.resolve({ data: { status: 'sent' } }));
    httpsCallable.mockReturnValue(call);

    const result = await requestPasswordResetEmail('a@example.com', { auth: makeAuth(), language: 'uk' });

    expect(result).toEqual({ via: 'knowme', status: 'sent' });
    expect(httpsCallable.mock.calls[0][1]).toBe(PASSWORD_RESET_FUNCTION_NAME);
    expect(call).toHaveBeenCalledWith({ email: 'a@example.com', language: 'uk' });
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('функція не відповіла — стандартний лист Firebase мовою інтерфейсу', async () => {
    httpsCallable.mockReturnValue(() => Promise.reject(Object.assign(new Error('x'), { code: 'functions/unavailable' })));
    const auth = makeAuth();

    const result = await requestPasswordResetEmail('a@example.com', { auth, language: 'de' });

    expect(result).toEqual({ via: 'firebase', status: 'sent' });
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(auth, 'a@example.com');
    expect(auth.languageCode).toBe('de');
  });

  it('межа й невалідна адреса — ті самі коди, що в Firebase, без запасного листа', async () => {
    httpsCallable.mockReturnValue(() => Promise.reject(Object.assign(new Error('x'), { code: 'functions/resource-exhausted' })));
    await expect(requestPasswordResetEmail('a@example.com', { auth: makeAuth() })).rejects.toMatchObject({ code: 'auth/too-many-requests' });

    httpsCallable.mockReturnValue(() => Promise.reject(Object.assign(new Error('x'), { code: 'functions/invalid-argument' })));
    await expect(requestPasswordResetEmail('nope', { auth: makeAuth() })).rejects.toMatchObject({ code: 'auth/invalid-email' });

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
