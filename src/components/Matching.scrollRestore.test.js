import fs from 'fs';
import path from 'path';

// Повернення до стрічки має продовжувати перегляд, а не починати його заново.
//
// Відновлення позиції тут було й не працювало: одна спроба на першому ж
// рендері, у якому в деці є бодай одна картка. А дека повертається порціями —
// спершу те, що встиг віддати кеш, потім решта, — тож `scrollTo` по короткому
// ще списку впирався в його кінець, позначку «відновили» знімало назавжди, і
// людина, яка гортала до шістдесятої картки, поверталась на початок списку.
describe('стрічка повертається туди, де її лишили', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
  const rowSource = fs.readFileSync(path.join(__dirname, 'ProfileRow.jsx'), 'utf8');

  it('памʼятає картку, а не сам лише піксель', () => {
    expect(source).toContain("const SCROLL_ANCHOR_KEY = 'matchingScrollAnchorId';");
    expect(source).toContain('sessionStorage.setItem(SCROLL_ANCHOR_KEY, lastSeenCardIdRef.current);');
    // Якір ставиться на кожному виході, з якого читач може повернутись: дотик
    // до картки, олівець у рядку, редагування анкети адміном.
    expect(source).toContain("lastSeenCardIdRef.current = user?.userId || '';");
    expect(source).toContain('lastSeenCardIdRef.current = user.userId;');
  });

  it('шукає рядок якоря, доки той не з’явиться в DOM', () => {
    expect(source).toContain('const SCROLL_ANCHOR_MAX_ATTEMPTS = 40;');
    expect(source).toContain('if (savedAnchorId && attempts < SCROLL_ANCHOR_MAX_ATTEMPTS) {');
    expect(source).toContain("anchor.scrollIntoView({ block: 'center' });");
    // Піксель лишається запасним: анкету могли прибрати з деки — реакція,
    // звужений фільтр, — і тоді краще стати приблизно там, ніж угорі.
    expect(source).toContain('if (savedY !== null) window.scrollTo(0, Number(savedY));');
  });

  // Один жест — одна позначка: `loading` з умови знято навмисно. Поки він там
  // стояв, відновлення чекало кінця завантаження, хоч кеш уже намалював рядки,
  // а потім спрацьовувало по списку, який ще ріс.
  it('не чекає кінця завантаження й не витрачає спробу намарно', () => {
    expect(source).toContain('if (restoreRef.current || users.length === 0) return undefined;');
    expect(source).toContain('return () => cancelAnimationFrame(frame);');
  });

  it('рядок і плитка несуть той самий якір', () => {
    expect(rowSource).toContain('data-card-id={user?.userId}');
    expect(source).toContain('data-card-id={user?.userId}');
  });

  // Шар деталей стрічку не розмонтовує, але поки він відкритий, у неї могла
  // долягти чергова порція, а в рядках — догідратуватись фото. Піксель, знятий
  // на відкритті, після цього вказує вже не на ту картку.
  it('закриття відкритої картки теж стає на її рядок', () => {
    const closeEffect = source.slice(
      source.indexOf('  useLayoutEffect(() => {\n    if (detailOpen) return;'),
      source.indexOf('  const handleToggleRowExpand'),
    );
    expect(closeEffect).toContain('const anchor = findCardNodeById(anchorId);');
    expect(closeEffect).toContain('if (savedTop) window.scrollTo(0, savedTop);');
  });
});
