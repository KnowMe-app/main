/**
 * Глибина заливки має збігатися з глибиною, на якій правила бази дають запис.
 *
 * Це не абстрактна акуратність: `.write` у цій базі стоїть на записі
 * (`matchingCards/$uid`, `multiData/getInTouch/$ownerId/$userId`), а на корені
 * колекції його немає взагалі. Тож `set` на колекцію отримав би
 * PERMISSION_DENIED, а `update` не тією порцією — теж. Помилка на одиницю в
 * `uploadDepth` ловиться саме тут, а не після години заливки з телефона.
 */
import fs from 'fs';
import path from 'path';

import { EXPORT_TARGETS } from './RtdbMigrationTool';

jest.mock('./config', () => ({ auth: { currentUser: { uid: 'admin-uid' } }, database: {} }));

const rules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'database.rules.json'), 'utf8'),
).rules;

const resolvePath = nodePath => nodePath.split('/').reduce(
  (node, segment) => (node ? node[segment] : undefined),
  rules,
);

/** Спуститись на один рівень записів — тобто в єдиний вайлдкард вузла. */
const descendWildcard = node => {
  const wildcard = Object.keys(node || {}).find(key => key.startsWith('$'));
  return wildcard ? node[wildcard] : undefined;
};

const uploadTargets = EXPORT_TARGETS.filter(target => target.uploadDepth);

describe('кнопка «Залити»', () => {
  it('є в кожного новоствореного вузла', () => {
    expect(uploadTargets.map(target => target.label)).toEqual([
      'profileDetails',
      'profileContacts',
      'profileWorkflow',
      'profileTechnical',
      'matchingCards',
      'multiData-getInTouch',
      'multiData-writer',
      'multiData-stimulationSchedule',
    ]);
  });

  it('немає там, де запис у базу означав би видалення', () => {
    const withoutUpload = EXPORT_TARGETS
      .filter(target => !target.uploadDepth)
      .map(target => target.label);

    expect(withoutUpload).toEqual(['cleaned-newUsers', 'cleaned-collections']);
  });

  it.each(uploadTargets.map(target => [target.label, target]))(
    '%s: правила дають запис саме на глибині uploadDepth',
    (label, target) => {
      let node = resolvePath(target.importPath);
      expect(node).toBeDefined();
      // На корені колекції запису немає — тому заливка й не робить `set`.
      expect(node['.write']).toBeUndefined();

      for (let level = 1; level <= target.uploadDepth; level += 1) {
        node = descendWildcard(node);
        expect(node).toBeDefined();
      }

      expect(typeof node['.write']).toBe('string');
    },
  );
});
