import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..', '..');
const rules = JSON.parse(fs.readFileSync(path.join(repoRoot, 'database.rules.json'), 'utf8')).rules;

const ADMIN_UIDS = ['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2'];

// Три вузли однакової форми: власник накопичує під своїм UID, читають він,
// делегат і адмін. `contactViews` — не реакція, а журнал «чиї контакти
// відкривали», але межа доступу в нього та сама.
const OWNER_SCOPED_NODES = ['favorites', 'dislikes', 'contactViews'];

/**
 * Самі межі перевіряє емулятор (`npm run test:rules`) — тут стережеться форма
 * умови, бо ламається вона тихо. Адмінського винятку в цих вузлах не було
 * зовсім: AddNewProfile просив `multiData/favorites/$чужий`, база відмовляла,
 * `fetchFavoriteUsers` ковтав відмову і повертав `{}` — список «Like/Dislike»
 * на чужій картці виглядав порожнім, хоча реакції в базі були.
 */
describe('особисті вузли власника в database.rules.json', () => {
  OWNER_SCOPED_NODES.forEach(node => {
    const owner = rules.multiData[node].$ownerId;

    it(`${node}: власник читає своє`, () => {
      expect(owner['.read']).toContain('auth.uid == $ownerId');
    });

    it(`${node}: адмін читає чуже`, () => {
      ADMIN_UIDS.forEach(uid => {
        expect(owner['.read']).toContain(uid);
      });
    });

    it(`${node}: делегований читач лишається на місці`, () => {
      expect(owner['.read'])
        .toContain("root.child('profileTechnical').child(auth.uid).child('multiDataSourceUserIds').child($ownerId).val() == true");
    });

    // Читання — не запис: адмін бачить чужі симпатії й перегляди, але не
    // проставляє їх за власницю, інакше запис перестав би бути її власним.
    it(`${node}: пише лише сам власник`, () => {
      expect(owner.$userId['.write']).toBe('auth != null && auth.uid == $ownerId');
    });

    // Рівень `matching` дає стрічку, а не чужі особисті списки.
    it(`${node}: службовий рівень доступу сюди не пускає`, () => {
      expect(owner['.read']).not.toContain('accessLevel');
    });
  });
});
