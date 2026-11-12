import fs from 'fs';
import path from 'path';

// Публічний відгук, записаний до появи `hasPublicReview` (або перенесений
// імпортом), прапорця в картці не має. Стрічка читає відгуки лише за
// прапорцем, тож у видачі пошуку така картка показувала порожню доріжку
// «Додати публічну нотатку», а відкрита — сам відгук.
describe('видача пошуку читає публічні відгуки без прапорця', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('питає відгуки про кожну показану знайдену картку', () => {
    expect(source).toContain('if (!ownerId || !isSearching) return;');
    expect(source).toContain(
      'feedSourceWithoutOwnEdits.forEach(user => requestPublicComments(user?.userId));',
    );
  });

  it('стрічка й далі читає лише за прапорцем', () => {
    // За прапорцем — або за версією відгуків картки (`reviewsAt`): картка з
    // версією без прапорця — відгуки зняли, і список треба перечитати.
    expect(source).toContain('if (flagged || version) requestPublicComments(user.userId, { version, expected: flagged });');
  });
});
