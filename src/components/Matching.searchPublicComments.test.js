import fs from 'fs';
import path from 'path';

// Видача пошуку колись читала відгуки про кожну знайдену картку: відгуки,
// записані до появи `hasPublicReview`, прапорця не мали. 13.11 звірено наживо:
// усі картки з відгуками прапорець мають, а тригер `syncPublicReviewFlag`
// тримає його на кожному записі. Тож пошук питає відгуки так само, як стрічка,
// і порція видачі не коштує десяти зайвих читань.
describe('видача пошуку читає публічні відгуки за прапорцем, як стрічка', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('окремого читання на кожну знайдену картку немає', () => {
    expect(source).not.toContain(
      'feedSourceWithoutOwnEdits.forEach(user => requestPublicComments(user?.userId));',
    );
  });

  it('усі картки — і стрічки, і видачі — читаються за прапорцем або версією відгуків', () => {
    // За прапорцем — або за версією відгуків картки (`reviewsAt`): картка з
    // версією без прапорця — відгуки зняли, і список треба перечитати.
    expect(source).toContain('if (flagged || version) requestPublicComments(user.userId, { version, expected: flagged });');
  });
});
