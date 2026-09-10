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
    // на себе, і публічний запис перестав би бути підписаним. Умова саме на
    // гілці `data.exists()`: незмінність стосується вже наявного запису.
    expect(comment.authorId['.validate'])
      .toContain('data.exists() ? data.val() === newData.val()');
  });

  // Відгуки, зібрані до появи застосунку (картки `TG0001` і подібні), писали
  // люди без акаунта: справжнього uid у них немає. Підписати такий відгук
  // адміном, який запускає перенос, означало б приписати йому чужі слова, тому
  // на створенні адмін — і тільки він — може назвати чужого автора.
  it('адмін заводить запис від імені автора, якого в базі немає', () => {
    const createBranch = comment.authorId['.validate'].split('data.exists() ?')[1];
    expect(createBranch).toContain("newData.val() === auth.uid");
    ADMIN_UIDS.forEach(uid => expect(createBranch).toContain(uid));
  });

  it('звичайний користувач і далі підписує лише себе', () => {
    // Право назвати чужого автора не розлазиться на всіх: у гілці створення
    // немає ані рівня доступу, ані делегування — самі лише два uid адмінів.
    expect(comment.authorId['.validate']).not.toContain('accessLevel');
    expect(comment.authorId['.validate']).not.toContain('canCreateProfiles');
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
