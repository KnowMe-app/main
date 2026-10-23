import fs from 'fs';
import path from 'path';
import { utilCalculateAge } from 'components/smallCard/utilCalculateAge';
import {
  DEFAULT_PROFILE_SHARE_OPTIONS,
  PROFILE_SHARE_CARD_FIELDS,
  PROFILE_SHARE_GROUP_KEYS,
  PROFILE_SHARE_MAX_PHOTOS,
  PROFILE_SHARE_SLOT_COUNT,
  buildProfileShareCard,
  buildProfileShareUrl,
  canShareProfileCard,
  expandProfileShareCard,
  findFreeProfileShareSlot,
  generateProfileShareToken,
  isProfileShareExpired,
  isProfileShareToken,
  isSameProfileShareCard,
  listShareableProfileRoles,
  profileShareFieldLimit,
  resolveProfileShareExpiresAt,
  selectProfileSharePhotos,
} from '../profileShare';

const TODAY = new Date(2026, 9, 23);

const profile = {
  name: ['Олена', 'Оксана'],
  surname: ['Коваленко', 'Марчук'],
  birth: '1999-05-12',
  city: 'Київ',
  country: 'Україна',
  height: 168,
  weight: '57',
  blood: '2+',
  eyeColor: 'Brown',
  maritalStatus: 'No',
  ownKids: '2',
  cSection: '1',
  moreInfo_main: 'Люблю гори.',
  phone: ['+380501112233', '+380671112233'],
  telegram: ['@old', ''],
  email: 'oksana@example.com',
  photos: ['https://firebasestorage.googleapis.com/v0/b/x/o/avatar%2Fu%2F1.jpg', 'https://firebasestorage.googleapis.com/v0/b/x/o/avatar%2Fu%2F2.jpg'],
  // Поля, яких знімок не несе ніколи.
  accessLevel: 'matching:view',
  lastAction: 'дзвінок',
  allergy: 'пеніцилін',
  getInTouch: '2026-11-01',
  role: ['ag', 'ed'],
};

describe('знімок анкети за посиланням', () => {
  it('бере лише поточне значення поля, а не історію версій', () => {
    const card = buildProfileShareCard(profile, { role: 'ed', options: { contacts: true }, today: TODAY });
    expect(card.name).toBe('Оксана');
    expect(card.phone).toBe('+380671112233');
    // Стертий телеграм не дістається з попередньої версії.
    expect(card).not.toHaveProperty('telegram');
  });

  it('несе вік на день знімка замість дати народження', () => {
    const card = buildProfileShareCard(profile, { role: 'ed', today: TODAY });
    expect(card).not.toHaveProperty('birth');
    expect(card.age).toBe(utilCalculateAge('1999-05-12'));
    expect(card.ageAt).toBe('2026-10-23');
  });

  it('прізвище — ініціалом за замовчуванням, повністю чи ніяк', () => {
    expect(buildProfileShareCard(profile, { role: 'ed' }).surname).toBe('М.');
    expect(buildProfileShareCard(profile, { role: 'ed', options: { surname: 'full' } }).surname).toBe('Марчук');
    expect(buildProfileShareCard(profile, { role: 'ed', options: { surname: 'none' } })).not.toHaveProperty('surname');
  });

  it('контакти вимкнені за замовчуванням', () => {
    const card = buildProfileShareCard(profile, { role: 'ed' });
    expect(DEFAULT_PROFILE_SHARE_OPTIONS.contacts).toBe(false);
    ['phone', 'email', 'telegram'].forEach(field => expect(card).not.toHaveProperty(field));
  });

  it('вимкнена група не потрапляє в знімок', () => {
    const card = buildProfileShareCard(profile, { role: 'ed', options: { body: false, location: false } });
    ['height', 'weight', 'blood', 'eyeColor', 'city', 'country'].forEach(field => expect(card).not.toHaveProperty(field));
    expect(card.maritalStatus).toBe('No');
  });

  it('не несе нічого поза переліком полів', () => {
    const card = buildProfileShareCard(profile, { role: 'ed', options: { contacts: true }, photos: ['https://copy'] });
    Object.keys(card).forEach(key => expect(PROFILE_SHARE_CARD_FIELDS).toContain(key));
    ['accessLevel', 'lastAction', 'allergy', 'getInTouch', 'birth'].forEach(field => expect(card).not.toHaveProperty(field));
  });

  it('зводить кесарів зі старих імен поля до одного', () => {
    expect(buildProfileShareCard(profile, { role: 'ed' }).csection).toBe('1');
  });

  it('фото в картці — лише передані копії, а не адреси оригіналів', () => {
    expect(buildProfileShareCard(profile, { role: 'ed' })).not.toHaveProperty('photos');
    expect(buildProfileShareCard(profile, { role: 'ed', photos: ['https://copy/0'] }).photos).toEqual(['https://copy/0']);
  });

  it('вибір фото: усі (до стелі), головне або жодного', () => {
    const many = { photos: Array.from({ length: 9 }, (_, index) => `https://f/${index}.jpg`) };
    expect(selectProfileSharePhotos(many, { photos: 'all' })).toHaveLength(PROFILE_SHARE_MAX_PHOTOS);
    expect(selectProfileSharePhotos(many, { photos: 'main' })).toEqual(['https://f/0.jpg']);
    expect(selectProfileSharePhotos(many, { photos: 'none' })).toEqual([]);
  });

  it('довгий текст обрізається до межі правил', () => {
    const card = buildProfileShareCard({ ...profile, moreInfo_main: 'а'.repeat(5000) }, { role: 'ed' });
    expect(card.moreInfo_main.length).toBeLessThanOrEqual(profileShareFieldLimit('moreInfo_main'));
  });

  it('без імені поділитись нема чим, і лише особистою анкетою', () => {
    expect(canShareProfileCard(buildProfileShareCard({ city: 'Київ' }, { role: 'ed' }))).toBe(false);
    expect(canShareProfileCard(buildProfileShareCard(profile, { role: 'ag' }))).toBe(false);
    expect(canShareProfileCard(buildProfileShareCard(profile, { role: 'sm' }))).toBe(true);
    expect(listShareableProfileRoles(profile)).toEqual(['ed']);
    expect(listShareableProfileRoles({ role: ['ed', 'sm'] }, 'sm')).toEqual(['sm', 'ed']);
  });
});

describe('показ знімка гостеві', () => {
  afterEach(() => jest.useRealTimers());

  it('показує той самий вік, хоч дати народження в знімку немає', () => {
    jest.useFakeTimers().setSystemTime(TODAY);
    const card = buildProfileShareCard(profile, { role: 'ed', photos: ['https://copy/0'], today: TODAY });
    const user = expandProfileShareCard(card);
    expect(utilCalculateAge(user.birth)).toBe(card.age);
    expect(user.photos).toEqual(['https://copy/0']);
    expect(user.userRole).toBe('ed');
  });

  it('фото з бази, що приїхали обʼєктом, стають списком', () => {
    expect(expandProfileShareCard({ role: 'ed', name: 'А', photos: { 0: 'https://a', 1: 'https://b' } }).photos)
      .toEqual(['https://a', 'https://b']);
  });
});

describe('службове', () => {
  it('токен — 22 знаки base64url, щоразу новий', () => {
    // У jsdom цього Jest немає `crypto` — береться той самий Web Crypto з Node.
    const { webcrypto } = require('crypto');
    const first = generateProfileShareToken(webcrypto);
    expect(first).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(isProfileShareToken(first)).toBe(true);
    expect(generateProfileShareToken(webcrypto)).not.toBe(first);
    expect(isProfileShareToken('коротко')).toBe(false);
  });

  it('посилання веде на маршрут /p/ під basename застосунку', () => {
    expect(buildProfileShareUrl('abc', 'https://knowme-app.github.io')).toBe('https://knowme-app.github.io/main/p/abc');
  });

  it('вільний слот — перший незайнятий з п\'яти', () => {
    expect(findFreeProfileShareSlot({})).toBe('0');
    expect(findFreeProfileShareSlot({ 0: {}, 1: {} })).toBe('2');
    const full = Object.fromEntries(Array.from({ length: PROFILE_SHARE_SLOT_COUNT }, (_, index) => [index, {}]));
    expect(findFreeProfileShareSlot(full)).toBeNull();
  });

  it('строк: днів — у мітку часу, 0 — без строку', () => {
    expect(resolveProfileShareExpiresAt(7, 1000)).toBe(1000 + 7 * 86400000);
    expect(resolveProfileShareExpiresAt(0, 1000)).toBeNull();
    expect(isProfileShareExpired({ expiresAt: 999 }, 1000)).toBe(true);
    expect(isProfileShareExpired({}, 1000)).toBe(false);
  });

  it('новий день сам по собі знімка не переписує', () => {
    expect(isSameProfileShareCard({ name: 'А', age: 27, ageAt: '2026-10-23' }, { age: 27, name: 'А', ageAt: '2026-10-24' })).toBe(true);
    expect(isSameProfileShareCard({ name: 'А', age: 27 }, { name: 'А', age: 28 })).toBe(false);
  });
});

/*
 * Правила бази й цей модуль описують знімок двічі, і розійтись вони не
 * мусять: поле, якого правила не знають, відкинуло б знімок цілком
 * (`$other: false`), а поле, яке правила знають, а писач ні, — це дірка, у яку
 * клієнт поза застосунком поклав би що завгодно.
 */
describe('контракт знімка з database.rules.json', () => {
  const { rules } = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../database.rules.json'), 'utf8'));
  const share = rules.profileShares.$token;
  const card = share.card;

  it('перелік полів картки той самий', () => {
    const ruleFields = Object.keys(card).filter(key => !key.startsWith('.') && key !== '$other');
    expect(ruleFields.sort()).toEqual([...PROFILE_SHARE_CARD_FIELDS].sort());
    expect(card.$other['.validate']).toBe(false);
    expect(share.$other['.validate']).toBe(false);
  });

  it('межі довжини ті самі', () => {
    Object.keys(card)
      .filter(key => !key.startsWith('.') && !['$other', 'role', 'age', 'ageAt', 'photos'].includes(key))
      .forEach(field => {
        const match = /length <= (\d+)/.exec(card[field]['.validate']);
        expect([field, Number(match?.[1])]).toEqual([field, profileShareFieldLimit(field)]);
      });
  });

  it('стеля фото й слотів та сама', () => {
    expect(card.photos.$index['.validate']).toContain(`/^[0-${PROFILE_SHARE_MAX_PHOTOS - 1}]$/`);
    expect(share.slot['.validate']).toContain(`/^[0-${PROFILE_SHARE_SLOT_COUNT - 1}]$/`);
  });

  it('налаштування слоту — ті самі групи', () => {
    const options = rules.multiData.profileShareSlots.$uid.$slot.options;
    const keys = Object.keys(options).filter(key => key !== '$other');
    expect(keys.sort()).toEqual(['photos', 'surname', ...PROFILE_SHARE_GROUP_KEYS].sort());
  });

  // `contains` сам по собі пропускав потрібний шматок, захований у рядку
  // запиту, — тобто чужий аватар. Тож адреса звіряється цілком.
  it('фото — копія в теці саме цього знімка, а не будь-яка адреса з потрібним шматком', () => {
    const rule = card.photos.$index['.validate'];
    const [, source] = /matches\((\/\^https.*?\$\/)\)/.exec(rule);
    const pattern = new RegExp(source.slice(1, -1));
    const token = 'shareTokenAAAAAAAAAAAAAA';
    const fits = url => pattern.test(url) && url.includes(`/o/profileShares%2F${token}%2F`);
    expect(fits(`https://firebasestorage.googleapis.com/v0/b/webringitapp.appspot.com/o/profileShares%2F${token}%2F0-mh4k2x1.jpg?alt=media&token=1f0e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b`)).toBe(true);
    expect(fits(`https://firebasestorage.googleapis.com/v0/b/b/o/avatar%2Fu%2F1.jpg?alt=media&token=t&x=/o/profileShares%2F${token}%2F`)).toBe(false);
    expect(fits(`https://firebasestorage.googleapis.com/v0/b/b/o/profileShares%2F${token}%2F..%2Favatar%2Fu.jpg?alt=media&token=t`)).toBe(false);
    expect(fits(`https://firebasestorage.googleapis.com/v0/b/b/o/profileShares%2FotherTokenBBBBBBBBBBBBBB%2F0.jpg?alt=media&token=t`)).toBe(false);
  });

  it('без входу читається лише картка знімка, а не вузол', () => {
    expect(card['.read']).not.toContain('auth');
    expect(share['.read']).toContain('auth != null');
    expect(rules.profileShares['.read']).toContain('auth != null');
  });
});
