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

  it('називає фото, пропущені як не з теки анкети', () => {
    expect(describeFeedPhotoThumbsBackfill({ cards: 10, candidates: 2, already: 1, foreign: 3, written: ['a', 'b'], failed: [] }).message)
      .toBe('Карток: 10. Мініатюр створено: 2 з 2, уже були: 1, пропущено фото не з теки анкети: 3.');
  });
});
