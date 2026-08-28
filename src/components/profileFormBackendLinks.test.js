import fs from 'fs';
import path from 'path';

import {
  buildRtdbConsoleLink,
  buildProfileFormBlockHeader,
  PROFILE_FORM_BLOCK_IDS,
} from './profileFormNodeBlocks';

/**
 * Посилання «де лежать ці дані» має відкривати саме той вузол, який називає.
 *
 * Консоль Firebase читає шлях як окремий сегмент URL — `/data/~2FprofileContacts…`.
 * Якщо слеш після `/data` загубився, адреса лишається валідною, консоль
 * відкриється, але покаже корінь бази: посилання мовчки веде не туди.
 */
describe('посилання в консоль Firebase', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('лишає /data окремим сегментом шляху, а не зліплює його з вузлом', () => {
    const href = buildRtdbConsoleLink(['profileContacts', 'AA3012']);

    expect(new URL(href).pathname).toMatch(/\/data\/~2FprofileContacts~2FAA3012$/);
    expect(href).not.toContain('/data~2F');
  });

  it('кодує слеші всередині шляху як ~2F', () => {
    expect(buildRtdbConsoleLink(['multiData', 'getInTouch', 'ADMIN']))
      .toMatch(/\/data\/~2FmultiData~2FgetInTouch~2FADMIN$/);
  });

  it('пропускає порожні сегменти й не лишає голого слеша без шляху', () => {
    expect(buildRtdbConsoleLink(['searchId', null, undefined, '']))
      .toMatch(/\/data\/~2FsearchId$/);
    expect(buildRtdbConsoleLink([])).toMatch(/\/data$/);
  });

  it('бере проєкт і базу з конфігурації, а не з константи', () => {
    process.env.REACT_APP_PROJECT_ID = 'knowme-staging';
    process.env.REACT_APP_DATABASE_URL = 'https://knowme-staging-eu.europe-west1.firebasedatabase.app';

    expect(buildRtdbConsoleLink(['searchId', 'phone_380503277413'])).toBe(
      'https://console.firebase.google.com/u/0/project/knowme-staging'
      + '/database/knowme-staging-eu/data/~2FsearchId~2Fphone_380503277413',
    );
  });

  it('падає назад на дефолтну базу проєкту, коли URL бази не заданий', () => {
    process.env.REACT_APP_PROJECT_ID = 'knowme-staging';
    delete process.env.REACT_APP_DATABASE_URL;

    expect(buildRtdbConsoleLink(['users', 'AA3012'])).toContain(
      '/project/knowme-staging/database/knowme-staging-default-rtdb/data/~2Fusers~2FAA3012',
    );
  });

  it('заголовок блоку веде рівно на той шлях, який показує', () => {
    const header = buildProfileFormBlockHeader(PROFILE_FORM_BLOCK_IDS.profileContacts, {
      profileId: 'AA3012',
    });

    expect(header.path).toBe('profileContacts/AA3012');
    expect(new URL(header.href).pathname)
      .toMatch(/\/data\/~2FprofileContacts~2FAA3012$/);
  });

  it('форма не тримає власної копії форматування посилання', () => {
    // Дві копії вже розійшлися: у формі слеш був, у заголовках блоків — ні.
    const source = fs.readFileSync(path.join(__dirname, 'ProfileForm.jsx'), 'utf8');

    expect(source).toContain('buildRtdbConsoleLink');
    expect(source).not.toContain('console.firebase.google.com');
  });
});
