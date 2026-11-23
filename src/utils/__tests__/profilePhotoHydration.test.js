import fs from 'fs';
import path from 'path';
import { PHOTO_HYDRATION_SOURCE, hasProfileContentBeyondPhotos } from '../profilePhotoHydration';

/**
 * Картка з Telegram-сповіщення (`/edit/{id}`) стартує з `{ userId }`, а фото
 * верхнього блоку часто приходять раніше за анкету. Поки дописані фото
 * рахувались правкою, відповідь бази відкидалась, і нова анкета стояла з фото
 * й без жодного поля (23.11, відтворено наживо на прод-збірці).
 */
describe('фото, дочитані застосунком, — не правка', () => {
  it('заглушка з самими фото ще не має змісту анкети', () => {
    expect(hasProfileContentBeyondPhotos({ userId: 'u1' })).toBe(false);
    expect(hasProfileContentBeyondPhotos({ userId: 'u1', photos: ['a'], __photosHydrated: true })).toBe(false);
    expect(hasProfileContentBeyondPhotos(null)).toBe(false);
  });

  it('будь-яке поле анкети — це вже зміст', () => {
    expect(hasProfileContentBeyondPhotos({ userId: 'u1', name: 'Liudmila' })).toBe(true);
    expect(hasProfileContentBeyondPhotos({ userId: 'u1', photos: ['a'], phone: '+380' })).toBe(true);
  });

  const read = file => fs.readFileSync(path.join(__dirname, '..', '..', 'components', file), 'utf8');

  it('верхній блок пише фото з цим джерелом, а форма його не рахує', () => {
    expect(read('smallCard/renderTopBlock.js')).toContain('source: PHOTO_HYDRATION_SOURCE');
    const form = read('AddNewProfile.jsx');
    expect(form).toContain('if (debug.source !== PHOTO_HYDRATION_SOURCE) profileSnapshotVersionRef.current += 1;');
    expect(form).toContain('hasProfileContentBeyondPhotos(latestState)');
    expect(PHOTO_HYDRATION_SOURCE).toBe('photoHydration');
  });
});
