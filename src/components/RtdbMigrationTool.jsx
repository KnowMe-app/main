import React, { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import {
  MIGRATION_GROUPS,
  createMigrationState,
  resetMigrationState,
  planMigrationGroup,
  applyMigrationPlan,
  buildCollectionInventory,
  buildCombinedRootPatch,
  buildCleanedNewUsers,
  buildMigrationAudit,
  buildRemaindersExport,
} from 'utils/rtdbMigration';
import { PROFILE_NODES } from 'utils/profileNodeSchema';
import { auth } from './config';

/**
 * Локальний інструмент міграції RTDB.
 *
 * У нього немає жодного шляху до Firebase — ані на читання, ані на запис. Він
 * бере локальні `users.json` / `newUsers.json`, розкладає їх по нових вузлах у
 * памʼяті браузера і віддає файлами. У базу вони потрапляють ручним імпортом,
 * після того як людина подивилась на звіт.
 *
 * Так зроблено не з обережності взагалі, а через дві конкретні речі. По-перше,
 * міграція видаляє поля з `newUsers`, і помилка тут незворотна — тож між
 * рішенням скрипта і записом у базу стоїть людина. По-друге, це десятки тисяч
 * дрібних записів: одним імпортом вони проходять за секунди, а по одному з
 * браузера — за години, і будь-який обрив лишає базу напівмігрованою.
 *
 * Кожна кнопка спершу показує preview, і лише другий клік застосовує план.
 */

const styles = {
  page: { padding: 16, maxWidth: 1100, margin: '0 auto', fontSize: 14 },
  section: { border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 16 },
  heading: { margin: '0 0 8px', fontSize: 16 },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 },
  button: { padding: '6px 12px', borderRadius: 6, border: '1px solid #888', cursor: 'pointer', background: '#fff' },
  primary: { padding: '6px 12px', borderRadius: 6, border: '1px solid #2b6', background: '#2b6', color: '#fff', cursor: 'pointer' },
  danger: { padding: '6px 12px', borderRadius: 6, border: '1px solid #c33', background: '#fff', color: '#c33', cursor: 'pointer' },
  input: { padding: '6px 8px', borderRadius: 6, border: '1px solid #888', minWidth: 320 },
  pre: { background: '#f6f6f6', padding: 8, borderRadius: 6, maxHeight: 320, overflow: 'auto', fontSize: 12 },
  warn: { color: '#b40', fontWeight: 600 },
  critical: { color: '#c00', fontWeight: 700 },
  muted: { color: '#666' },
  table: { borderCollapse: 'collapse', width: '100%', fontSize: 12 },
  cell: { border: '1px solid #ddd', padding: '3px 6px', textAlign: 'left' },
};

const downloadJson = (filename, payload) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const readJsonFile = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      resolve(JSON.parse(String(reader.result)));
    } catch (error) {
      reject(error);
    }
  };
  reader.onerror = () => reject(reader.error);
  reader.readAsText(file);
});

/**
 * Файл може бути як вмістом вузла (`{ uid: {...} }`), так і експортом кореня
 * (`{ users: { uid: {...} } }`) — консоль Firebase віддає і те, і те залежно
 * від того, з якого рівня качали. Розгортати обгортку тут дешевше, ніж
 * пояснювати різницю в підказці до кнопки.
 */
const unwrapCollection = (parsed, collectionName) => {
  if (!parsed || typeof parsed !== 'object') return {};
  if (parsed[collectionName] && typeof parsed[collectionName] === 'object') return parsed[collectionName];
  return parsed;
};

const formatCount = value => new Intl.NumberFormat('uk-UA').format(value || 0);

const InventoryTable = ({ title, inventory }) => {
  if (!inventory) return null;
  return (
    <details style={{ marginTop: 8 }}>
      <summary>
        {title}: {formatCount(inventory.recordCount)} записів, {formatCount(inventory.uniqueFieldCount)} унікальних полів
      </summary>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.cell}>поле</th>
            <th style={styles.cell}>к-сть</th>
            <th style={styles.cell}>типи</th>
            <th style={styles.cell}>статус</th>
          </tr>
        </thead>
        <tbody>
          {inventory.fields.map(entry => (
            <tr key={entry.field}>
              <td style={styles.cell}>{entry.field}</td>
              <td style={styles.cell}>{formatCount(entry.count)}</td>
              <td style={styles.cell}>
                {Object.entries(entry.types).map(([type, count]) => `${type}:${count}`).join(', ')}
              </td>
              <td style={styles.cell}>
                {entry.excluded ? 'не мігрується' : (entry.mapped ? 'у мапінгу' : 'невідоме')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
};

const PlanSummary = ({ plan }) => {
  if (!plan) return null;
  if (plan.blocked === 'MISSING_GET_IN_TOUCH_OWNER') {
    return <p style={styles.warn}>Потрібен Legacy getInTouch owner UID.</p>;
  }

  const { counters } = plan;
  return (
    <div style={styles.pre}>
      <div>анкет переглянуто: {formatCount(counters.profilesScanned)}</div>
      <div>скопійовано з users: {formatCount(counters.fieldsCopiedFromUsers)}</div>
      <div>перенесено з newUsers: {formatCount(counters.fieldsMovedFromNewUsers)}</div>
      <div>похідних створено: {formatCount(counters.derivedValuesCreated)}</div>
      <div>вже було в цілі: {formatCount(counters.alreadyPresent)}</div>
      <div>пропущено порожніх: {formatCount(counters.skippedEmpty)}</div>
      <div style={counters.conflicts ? styles.warn : undefined}>
        конфліктів: {formatCount(counters.conflicts)}
      </div>
      <div style={counters.unsafeKeys ? styles.warn : undefined}>
        непридатних ключів: {formatCount(counters.unsafeKeys)}
      </div>
      <div style={counters.errors ? styles.warn : undefined}>
        блокуючих помилок: {formatCount(counters.errors)}
      </div>
      <div>буде видалено з newUsers: {formatCount(counters.deletionsFromNewUsers)}</div>
      {Object.keys(plan.warningsByCode).length > 0 && (
        <div style={{ marginTop: 6 }}>
          попередження:{' '}
          {Object.entries(plan.warningsByCode).map(([code, count]) => `${code}×${count}`).join(', ')}
        </div>
      )}
    </div>
  );
};

/**
 * Куди саме їде кожен файл.
 *
 * Імпорт у консолі Firebase — це `set`, а не `update`: він замінює вузол цілком.
 * Тому шлях імпорту вказаний поруч із кнопкою, а не в інструкції збоку: один
 * рівень вище — і замість оновлення одного вузла ви зносите його сусідів.
 */
const EXPORT_TARGETS = [
  {
    label: 'matchingCards',
    importPath: 'matchingCards',
    effect: 'замінює всі картки стрічки',
    build: state => state.targets[PROFILE_NODES.matchingCards],
  },
  {
    label: 'profileDetails',
    importPath: 'profileDetails',
    effect: 'замінює всі деталі анкет',
    build: state => state.targets[PROFILE_NODES.profileDetails],
  },
  {
    label: 'profileContacts',
    importPath: 'profileContacts',
    effect: 'замінює всі контакти',
    build: state => state.targets[PROFILE_NODES.profileContacts],
  },
  {
    label: 'profileWorkflow',
    importPath: 'profileWorkflow',
    effect: 'замінює всі робочі позначки',
    build: state => state.targets[PROFILE_NODES.profileWorkflow],
  },
  {
    label: 'profileTechnical',
    importPath: 'profileTechnical',
    effect: 'замінює всі технічні дані',
    build: state => state.targets[PROFILE_NODES.profileTechnical],
  },
  {
    // Саме `multiData/getInTouch`, а не `multiData`: на рівень вище лежать
    // обране, коментарі, правки й історія — імпорт туди зніс би їх усі.
    label: 'multiData-getInTouch',
    importPath: 'multiData/getInTouch',
    effect: 'замінює позначки «звʼязатись» усіх власників',
    build: state => state.targets.multiDataPatch.getInTouch,
  },
  {
    label: 'cleaned-newUsers',
    importPath: 'newUsers',
    effect: 'і є видаленням: замінює newUsers версією без перенесених полів',
    build: state => buildCleanedNewUsers(state),
  },
];

export const RtdbMigrationTool = () => {
  const stateRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [usersInventory, setUsersInventory] = useState(null);
  const [newUsersInventory, setNewUsersInventory] = useState(null);
  const [existingCards, setExistingCards] = useState(null);
  // Legacy `getInTouch` був фактично одним значенням від одного адміна, і цей
  // адмін — той, хто зараз запустив інструмент. Тож поле заповнюється його
  // UID: типовий випадок не має вимагати копіювання ідентифікатора з консолі.
  // Замінити його вручну можна — перенести чужі позначки теж буває треба.
  const [ownerUid, setOwnerUid] = useState(() => auth?.currentUser?.uid || '');
  const [plans, setPlans] = useState({});
  const [audit, setAudit] = useState(null);
  // Робочий стан живе в ref, а не в state: він великий і мутується на місці.
  // Лічильник — єдиний спосіб сказати React, що з нього треба перечитати.
  const [, bumpRevision] = useState(0);

  const pendingRef = useRef({ users: null, newUsers: null });

  const refreshAudit = useCallback(() => {
    if (!stateRef.current) return;
    setAudit(buildMigrationAudit(stateRef.current));
    bumpRevision(value => value + 1);
  }, []);

  const rebuildState = useCallback(() => {
    stateRef.current = createMigrationState({
      users: pendingRef.current.users || {},
      newUsers: pendingRef.current.newUsers || {},
    });
    setPlans({});
    setLoaded(true);
    refreshAudit();
  }, [refreshAudit]);

  const handleFile = useCallback(async (event, collectionName) => {
    const file = event.target.files?.[0];
    // Скидається одразу, щоб той самий файл можна було вибрати вдруге після Reset.
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = unwrapCollection(await readJsonFile(file), collectionName);
      if (collectionName === 'matchingCards') {
        // Тільки для порівняння у звіті — джерелом істини наявний вузол не є.
        setExistingCards(parsed);
        toast.success(`matchingCards.json прочитано: ${formatCount(Object.keys(parsed).length)} карток (лише для звірки)`);
        return;
      }

      pendingRef.current[collectionName] = parsed;
      const inventory = buildCollectionInventory(parsed);
      if (collectionName === 'users') setUsersInventory(inventory);
      else setNewUsersInventory(inventory);

      rebuildState();
      toast.success(`${collectionName}.json прочитано: ${formatCount(inventory.recordCount)} записів`);
    } catch (error) {
      console.error('[RtdbMigrationTool] не вдалося прочитати файл', error);
      toast.error(`Не вдалося прочитати ${file.name}: ${error?.message || 'некоректний JSON'}`);
    }
  }, [rebuildState]);

  const handlePreview = useCallback(group => {
    if (!stateRef.current) return;
    const plan = planMigrationGroup(stateRef.current, group, { getInTouchOwnerUid: ownerUid });
    setPlans(current => ({ ...current, [group]: plan }));
  }, [ownerUid]);

  const handleApply = useCallback(group => {
    if (!stateRef.current) return;
    const plan = plans[group] || planMigrationGroup(stateRef.current, group, { getInTouchOwnerUid: ownerUid });
    if (plan.blocked) {
      toast.error('Потрібен Legacy getInTouch owner UID');
      return;
    }

    const confirmed = window.confirm(
      `Застосувати «${MIGRATION_GROUPS.find(entry => entry.id === group)?.label}»?\n\n`
      + `Записів у цілі: ${plan.writes.length + plan.getInTouchWrites.length}\n`
      + `Полів буде видалено з локального newUsers: ${plan.deletions.length}\n`
      + `Конфліктів: ${plan.counters.conflicts}\n\n`
      + 'У Firebase нічого не пишеться — зміни лише в локальній копії.',
    );
    if (!confirmed) return;

    applyMigrationPlan(stateRef.current, plan);
    // Після застосування план перераховується: тепер він має бути порожній —
    // це і є видима перевірка ідемпотентності.
    const after = planMigrationGroup(stateRef.current, group, { getInTouchOwnerUid: ownerUid });
    setPlans(current => ({ ...current, [group]: after }));
    refreshAudit();
    toast.success(`${group}: застосовано`);
  }, [ownerUid, plans, refreshAudit]);

  const handleReset = useCallback(() => {
    if (!stateRef.current) return;
    if (!window.confirm('Повернути робочий стан до завантажених файлів?')) return;
    stateRef.current = resetMigrationState(stateRef.current);
    setPlans({});
    refreshAudit();
    toast.success('Робочий стан повернуто до вихідних файлів');
  }, [refreshAudit]);

  // Штамп береться в момент завантаження, а не рендера: у назві файлу має
  // стояти час, коли його справді викачали.
  const download = useCallback((label, payload) => {
    if (!stateRef.current) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadJson(`${label}-${stamp}.json`, payload());
  }, []);

  const cardsComparison = (() => {
    if (!existingCards || !stateRef.current) return null;
    const built = stateRef.current.targets[PROFILE_NODES.matchingCards];
    const builtIds = Object.keys(built);
    const existingIds = Object.keys(existingCards);
    return {
      built: builtIds.length,
      existing: existingIds.length,
      onlyInExisting: existingIds.filter(id => !built[id]).length,
      onlyInBuilt: builtIds.filter(id => !existingCards[id]).length,
    };
  })();

  return (
    <div style={styles.page}>
      <h2 style={styles.heading}>Локальна міграція RTDB</h2>
      <p style={styles.muted}>
        Інструмент не звертається до Firebase. Він читає локальні JSON-копії, розкладає їх по нових
        вузлах і віддає файли для ручного імпорту. Локальний <code>users</code> не змінюється взагалі;
        поле зникає з локального <code>newUsers</code> лише після того, як звіт підтвердив успіх саме
        для нього.
      </p>

      <section style={styles.section}>
        <h3 style={styles.heading}>1. Вхідні файли</h3>
        <div style={styles.row}>
          <label style={styles.button}>
            Load users.json
            <input type="file" accept="application/json,.json" hidden onChange={event => handleFile(event, 'users')} />
          </label>
          <label style={styles.button}>
            Load newUsers.json
            <input type="file" accept="application/json,.json" hidden onChange={event => handleFile(event, 'newUsers')} />
          </label>
          <label style={styles.button}>
            Load matchingCards.json (звірка)
            <input type="file" accept="application/json,.json" hidden onChange={event => handleFile(event, 'matchingCards')} />
          </label>
        </div>
        <div style={styles.row}>
          <label htmlFor="get-in-touch-owner">Legacy getInTouch owner UID:</label>
          <input
            id="get-in-touch-owner"
            style={styles.input}
            value={ownerUid}
            onChange={event => setOwnerUid(event.target.value)}
            placeholder="UID адміна, чиї getInTouch переносимо"
          />
          {auth?.currentUser?.uid && auth.currentUser.uid !== ownerUid && (
            <button
              type="button"
              style={styles.button}
              onClick={() => setOwnerUid(auth.currentUser.uid)}
            >
              Мій UID
            </button>
          )}
        </div>
        <p style={styles.muted}>
          `getInTouch` — це персональна позначка адміна, а не поле анкети: у новій структурі вона
          лежить під тим, хто її поставив (<code>multiData/getInTouch/{ownerUid || '{ownerId}'}/значення/анкета</code>).
        </p>
        <InventoryTable title="users" inventory={usersInventory} />
        <InventoryTable title="newUsers" inventory={newUsersInventory} />
        {cardsComparison && (
          <p style={styles.muted}>
            Звірка з наявним matchingCards: зібрано {formatCount(cardsComparison.built)},
            у файлі {formatCount(cardsComparison.existing)},
            тільки у файлі {formatCount(cardsComparison.onlyInExisting)},
            тільки зібрано {formatCount(cardsComparison.onlyInBuilt)}.
          </p>
        )}
      </section>

      {audit?.securityWarnings?.length > 0 && (
        <section style={{ ...styles.section, borderColor: '#c00' }}>
          <h3 style={{ ...styles.heading, ...styles.critical }}>
            CRITICAL: у даних знайдено {formatCount(audit.securityWarnings.length)} полів «password»
          </h3>
          <p style={styles.muted}>
            Значення не показані і не переносяться в жоден новий вузол. Перелік адрес — у
            migration-audit.json.
          </p>
        </section>
      )}

      <section style={styles.section}>
        <h3 style={styles.heading}>2. Кнопки міграції</h3>
        {!loaded && <p style={styles.muted}>Спершу завантажте users.json або newUsers.json.</p>}
        {loaded && MIGRATION_GROUPS.map(group => (
          <div key={group.id} style={{ marginBottom: 12 }}>
            <div style={styles.row}>
              <strong>{group.label}</strong>
              <button type="button" style={styles.button} onClick={() => handlePreview(group.id)}>
                Preview
              </button>
              <button type="button" style={styles.primary} onClick={() => handleApply(group.id)}>
                Apply
              </button>
              {audit?.groups?.[group.id] && (
                <span style={styles.muted}>
                  застосовано {audit.groups[group.id].runCount}×, залишок ключів у newUsers:{' '}
                  {formatCount(audit.groups[group.id].remainingNewUsersKeys)}
                </span>
              )}
            </div>
            <PlanSummary plan={plans[group.id]} />
          </div>
        ))}
        {loaded && (
          <div style={styles.row}>
            <button type="button" style={styles.danger} onClick={handleReset}>
              Reset to original files
            </button>
          </div>
        )}
      </section>

      {loaded && (
        <section style={styles.section}>
          <h3 style={styles.heading}>3. Експорт</h3>

          {/*
            Кожен файл — це ВМІСТ одного вузла, а імпорт у консолі Firebase
            замінює вузол цілком. Тобто шлях імпорту — не подробиця, а половина
            операції: той самий файл, залитий на рівень вище, зносить сусідні
            гілки. Тому шлях стоїть на самій кнопці.
          */}
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.cell}>файл</th>
                <th style={styles.cell}>імпортувати рівно в</th>
                <th style={styles.cell}>що станеться</th>
              </tr>
            </thead>
            <tbody>
              {EXPORT_TARGETS.map(target => (
                <tr key={target.label}>
                  <td style={styles.cell}>
                    <button
                      type="button"
                      style={styles.button}
                      onClick={() => download(target.label, () => target.build(stateRef.current))}
                    >
                      {target.label}.json
                    </button>
                  </td>
                  <td style={styles.cell}><code>{target.importPath}</code></td>
                  <td style={styles.cell}>{target.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={styles.row}>
            <button
              type="button"
              style={styles.button}
              onClick={() => download('migration-audit', () => buildMigrationAudit(stateRef.current))}
            >
              Download migration-audit.json
            </button>
            <button
              type="button"
              style={styles.button}
              onClick={() => download('combined-root-patch', () => buildCombinedRootPatch(stateRef.current))}
            >
              Download combined-root-patch.json
            </button>
            <button
              type="button"
              style={styles.button}
              onClick={() => download('migration-remainders', () => buildRemaindersExport(stateRef.current))}
            >
              Download migration-remainders.json
            </button>
          </div>

          {/*
            Залишок — це не «нічого не сталось», а список того, що міграція
            свідомо не взяла: конфлікти, порожні значення, поля поза жодним
            allowlist. Побачити його треба до того, як `cleaned-newUsers`
            поїде в базу, бо після імпорту питати вже нема в кого.
          */}
          <p style={styles.muted}>
            migration-remainders.json — рештки обох колекцій в одному файлі: що з{' '}
            <code>users</code> і <code>newUsers</code> не переїхало у нові вузли, плюс
            підсумок по полях. Це звіт, а не патч: у базу він не імпортується, паролі в
            ньому заміщені позначкою. З <code>users</code> при цьому нічого не видаляється —
            там позначається лише те, що вже скопійовано.
          </p>

          <p style={{ ...styles.muted, ...styles.warn }}>
            combined-root-patch.json — тільки для очей. Не імпортуйте його в корінь: імпорт
            замінює вузол цілком, а в цьому файлі немає ані <code>users</code>, ані{' '}
            <code>searchKey</code>, ані решти <code>multiData</code> — вони просто зникнуть.
            У базу файли їдуть поодинці, кожен у свій шлях із таблиці вище.
          </p>
          <p style={styles.muted}>
            <code>cleaned-newUsers.json</code> — це і є видалення: він замінює вузол
            <code> newUsers</code> версією без перенесених полів. Замінює <b>цілком</b>, тож усе,
            що записали в <code>newUsers</code> після викачування вихідних файлів, буде втрачено.
            Тож качайте, мігруйте і заливайте одним заходом, а не через день.
          </p>
        </section>
      )}

      {audit && (
        <section style={styles.section}>
          <h3 style={styles.heading}>4. Звіт</h3>
          <div style={styles.pre}>
            <div>
              залишок у newUsers: {formatCount(audit.remainingNewUsers.recordCount)} записів,{' '}
              {formatCount(audit.remainingNewUsers.keyCount)} ключів
            </div>
            <div>конфліктів у звіті: {formatCount(audit.conflicts.length)}</div>
            <div>
              незмаплені поля:{' '}
              {Object.entries(audit.unmappedFieldStats.unknown || {})
                .sort((a, b) => b[1] - a[1])
                .map(([field, count]) => `${field}×${count}`)
                .join(', ') || '—'}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default RtdbMigrationTool;
