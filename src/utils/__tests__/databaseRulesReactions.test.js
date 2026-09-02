import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..', '..');
const rules = JSON.parse(fs.readFileSync(path.join(repoRoot, 'database.rules.json'), 'utf8')).rules;

const ADMIN_UIDS = ['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2'];

/**
 * Самі межі перевіряє емулятор (`npm run test:rules`) — тут стережеться форма
 * умови, бо ламається вона тихо. Адмінського винятку в цих двох вузлах не було
 * зовсім: AddNewProfile просив `multiData/favorites/$чужий`, база відмовляла,
 * `fetchFavoriteUsers` ковтав відмову і повертав `{}` — список «Like/Dislike»
 * на чужій картці виглядав порожнім, хоча реакції в базі були.
 */
describe('реакції в database.rules.json', () => {
  ['favorites', 'dislikes'].forEach(node => {
    const owner = rules.multiData[node].$ownerId;

    it(`${node}: власник читає свої реакції`, () => {
      expect(owner['.read']).toContain('auth.uid == $ownerId');
    });

    it(`${node}: адмін читає чужі реакції`, () => {
      ADMIN_UIDS.forEach(uid => {
        expect(owner['.read']).toContain(uid);
      });
    });

    it(`${node}: делегований читач лишається на місці`, () => {
      expect(owner['.read'])
        .toContain("root.child('profileTechnical').child(auth.uid).child('multiDataSourceUserIds').child($ownerId).val() == true");
    });

    // Читання — не запис: адмін бачить чужі симпатії, але не проставляє їх за
    // власницю, інакше історія реакцій перестала б бути її власною.
    it(`${node}: пише реакцію лише сам власник`, () => {
      expect(owner.$userId['.write']).toBe('auth != null && auth.uid == $ownerId');
    });

    // Рівень `matching` дає стрічку, а не чужі особисті списки.
    it(`${node}: службовий рівень доступу сюди не пускає`, () => {
      expect(owner['.read']).not.toContain('accessLevel');
    });
  });
});
