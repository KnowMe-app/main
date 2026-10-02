import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

// Повернення з картки чи форми доповнення не має чекати бекенду.
describe('повернення до стрічки', () => {
  // Роль читача приходить то масивом, то рядком через кому, і сирий підпис
  // давав два різні ключі списку — кеш стрічки не влучав ніколи.
  it('кладе в підпис кешу роль підписом, а не сирим значенням', () => {
    const signature = source.slice(source.indexOf('const buildFeedCacheSignature'), source.indexOf('const rememberFeedPagination'));
    expect(signature).toContain("viewerRole: viewerRoleSignature(donorRestrictionViewerRoleRef.current || ''),");
  });

  // Деку, яку щойно лишили, видно одразу, а `loadInitial` її не стирає.
  it('показує останню деку зі знімка вкладки й не стирає її на старті', () => {
    expect(source).toContain('const [users, setUsers] = useState(() => feedSnapshot?.users || []);');
    expect(source).toContain('if (restoredFeedSnapshotRef.current) restoredFeedSnapshotRef.current = false;');
    expect(source).toContain('if (!owner || lastFeedSnapshot.ownerId !== owner) return null;');
  });
});
