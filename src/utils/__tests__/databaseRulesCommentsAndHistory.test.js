import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..', '..');
const rules = JSON.parse(fs.readFileSync(path.join(repoRoot, 'database.rules.json'), 'utf8')).rules;

const ADMIN_UIDS = ['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2'];

/**
 * Межі доступу перевіряє емулятор (`npm run test:rules`). Тут стережеться сама
 * форма умови: обидві властивості нижче ламаються одним необережним рухом і не
 * падають — просто тихо зачиняють потрібне.
 */
describe('публічні коментарі в database.rules.json', () => {
  const comment = rules.comments.$profileId.$commentId;

  it('автор лишається єдиним, хто пише свій запис', () => {
    expect(comment['.write']).toContain("newData.child('authorId').val() === auth.uid");
  });

  it('адмін дістає право правити і знімати чужий запис', () => {
    ADMIN_UIDS.forEach(uid => {
      expect(comment['.write']).toContain(uid);
      expect(rules.comments.$profileId['.write']).toContain(uid);
    });
  });

  it('авторство запису лишається незмінним — навіть для адміна', () => {
    // Інакше правка адміна або впала б на валідації, або переписала б автора
    // на себе, і публічний запис перестав би бути підписаним.
    expect(comment.authorId['.validate'])
      .toBe("newData.isString() && (data.exists() ? data.val() === newData.val() : newData.val() === auth.uid)");
  });
});

describe('історія пошуку в database.rules.json', () => {
  const entry = rules.multiData.searchQueries.$ownerId.$queryId;

  it('пише історію лише сам власник (або адмін)', () => {
    expect(entry['.write']).toContain('auth.uid == $ownerId');
  });

  it('приймає і нову форму ряду, і старий рядок', () => {
    expect(entry['.validate']).toContain('newData.isString() ?');
    expect(entry['.validate']).toContain("newData.hasChildren(['query', 'updatedAt'])");
  });

  it('не пускає в ряд історії жодного зайвого поля', () => {
    expect(entry.$field['.validate'])
      .toBe("$field == 'query' || $field == 'createdAt' || $field == 'updatedAt' || $field == 'count'");
  });
});
