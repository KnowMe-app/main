import { describeReviewsState } from './ProfileRow';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

// Без звʼязку з базою читання відгуків висить, а не падає, тож «Шукаємо
// відгуки…» тривало б вічно — рядок мусить назвати причину.
applyUkrainianInterface();

describe('статус відгуків без звʼязку', () => {
  it('називає відсутній звʼязок замість вічного «Шукаємо»', () => {
    expect(describeReviewsState({ loading: true, offline: true }, 'uk')).toContain('Немає звʼязку');
    expect(describeReviewsState({ loading: true }, 'uk')).toBe('Шукаємо відгуки…');
  });
});
