import { describeAvatarCacheControlBackfill, describeFeedPhotoThumbsBackfill } from './photoBackfillReport';

describe('звіти разових робіт над фото', () => {
  it('успіх кеша фото називає числа', () => {
    expect(describeAvatarCacheControlBackfill({ folders: 3, files: 7, updated: 7, failed: [] })).toEqual({
      tone: 'success',
      message: 'Анкет із фото: 3, файлів: 7. Кеш на рік поставлено: 7.',
    });
  });

  // Інспектор бачить панель, але писати в Storage не може: «оновлено 0» без
  // причини коштувало б розбору.
  it('відмова в правах називає причину', () => {
    const report = describeAvatarCacheControlBackfill({ folders: 1, files: 2, updated: 0, failed: [{ permissionDenied: true }] });
    expect(report.tone).toBe('error');
    expect(report.message).toContain('Потрібен повний адмін');
    expect(describeAvatarCacheControlBackfill({ listError: { message: 'denied', permissionDenied: true } }).message)
      .toContain('Потрібен повний адмін');
  });

  it('мініатюри: створені, кандидати й уже наявні', () => {
    expect(describeFeedPhotoThumbsBackfill({ cards: 10, candidates: 4, already: 5, written: ['a', 'b', 'c', 'd'], failed: [] })).toEqual({
      tone: 'success',
      message: 'Карток: 10. Мініатюр створено: 4 з 4, уже були: 5.',
    });
    expect(describeFeedPhotoThumbsBackfill({ cards: 10, candidates: 4, written: ['a'], failed: [{}, {}, {}] }).message)
      .toBe('Карток: 10. Мініатюр створено: 1 з 4, уже були: 0, помилок: 3.');
  });

  it('пропущені фото — поза Storage окремо від чужої теки', () => {
    // Перший прогін на проді: усі 310 «не з теки анкети» були посиланнями на
    // Google Drive, а не спробою видати картці чуже фото.
    expect(describeFeedPhotoThumbsBackfill({
      cards: 10, candidates: 2, already: 1, external: 3, externalHosts: { 'drive.google.com': 3 }, written: ['a', 'b'], failed: [],
    }).message).toBe('Карток: 10. Мініатюр створено: 2 з 2, уже були: 1, пропущено фото поза Storage: 3 (drive.google.com).');
    expect(describeFeedPhotoThumbsBackfill({
      cards: 10, candidates: 0, external: 3, externalHosts: { 'drive.google.com': 2, 't.me': 1 }, foreign: 1, written: [], failed: [],
    }).message).toBe('Карток: 10. Мініатюр створено: 0 з 0, уже були: 0, пропущено фото поза Storage: 3 (drive.google.com 2, t.me 1), пропущено фото з чужої теки: 1.');
  });

  it('файл, якого вже немає, — не помилка роботи, а картки з id', () => {
    const report = describeFeedPhotoThumbsBackfill({
      cards: 21642, candidates: 2, already: 262, external: 310, externalHosts: { 'drive.google.com': 310 },
      written: [], failed: [], missing: [{ id: 'cardA' }, { id: 'cardB' }],
    });
    expect(report).toEqual({
      tone: 'warning',
      message: 'Карток: 21642. Мініатюр створено: 0 з 2, уже були: 262, пропущено фото поза Storage: 310 (drive.google.com).'
        + ' Фото, якого вже немає в Storage, — у 2: cardA, cardB.',
    });
    const many = describeFeedPhotoThumbsBackfill({ candidates: 7, written: [], failed: [], missing: 'abcdefg'.split('').map(id => ({ id })) });
    expect(many.message).toContain('— у 7: a, b, c, d, e і ще 2.');
  });

  it('помилка називає першу причину словами', () => {
    const report = describeFeedPhotoThumbsBackfill({
      cards: 3, candidates: 1, written: [], failed: [{ id: 'X1', message: 'Firebase Storage: Max retry time exceeded' }],
    });
    expect(report.tone).toBe('error');
    expect(report.message).toBe('Карток: 3. Мініатюр створено: 0 з 1, уже були: 0, помилок: 1. Перша (X1): Firebase Storage: Max retry time exceeded.');
  });
});
