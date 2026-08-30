const fs = require('fs');
const path = require('path');

const { updateCard } = require('utils/cardsStorage');
const { findCachedCardsByText } = require('utils/cardsStorage');
const { canShowMatchingUser } = require('utils/reactionPriority');

const matchingSource = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

const similarBlock = source => source.slice(
  source.indexOf('  const similarUsers = useMemo(() => {'),
  source.indexOf('  const feedSource = '),
);

// Локальний кеш — це історія пристрою, а не право показу. У ньому лежить усе,
// що застосунок колись читав, зокрема неопубліковані анкети, і вкладка «Схожі»
// віддавала цей кеш читачеві як є: картка, яку `canShowMatchingUser` забороняє,
// доїжджала до `feedSource` і малювалась із діагностичною плашкою замість того,
// щоб зникнути.
describe('приховані анкети не пробиваються в деку через локальний кеш', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('кешована неопублікована картка не проходить останній рубіж, а опублікована проходить', () => {
    updateCard('-PublishedCardId0001', { name: 'Surrogacy', surname: 'Kyiv', publish: true });
    updateCard('-HiddenCardId000001x', { name: 'Surrogacy', surname: 'Hidden', publish: false });

    const cached = findCachedCardsByText('surrogacy');
    expect(cached.map(card => card.userId).sort()).toEqual(
      ['-HiddenCardId000001x', '-PublishedCardId0001'],
    );

    const forReader = cached.filter(card => canShowMatchingUser(card, { isAdmin: false }));
    expect(forReader.map(card => card.userId)).toEqual(['-PublishedCardId0001']);

    const forAdmin = cached.filter(card => canShowMatchingUser(card, { isAdmin: true }));
    expect(forAdmin).toHaveLength(2);
  });

  it('вкладка «Схожі» проганяє кандидатів з кешу через canShowMatchingUser', () => {
    const similar = similarBlock(matchingSource());

    expect(similar).toContain('return candidates.filter(user => canShowMatchingUser(user, { isAdmin }));');
    expect(similar).toContain('}, [filteredUsers, isAdmin, isSearching, searchQuery]);');
    // Чіпи стрічки пошук так само не звужують — правило з попереднього фікса лишається.
    expect(similar).not.toContain('applyMatchingUiFiltersToUsers');
  });

  it('плашка з причиною відсіву показується лише в режимі діагностики', () => {
    const source = matchingSource();

    expect(source).toContain('const showDebugOverlay = Boolean(showDebugRejectReasons);');
    expect(source).toContain('{showDebugOverlay && (debugFilteredOutReason || debugReasons.length > 0) && (');
    expect(source).toContain(
      "style={showDebugOverlay && debugFilteredOutReason ? { opacity: 0.58, filter: 'grayscale(0.85)' } : undefined}",
    );
    expect(source).toContain('const debugDiagnosticsRows = showDebugOverlay && diagnostics ? [');
    expect(source).not.toContain('{(debugFilteredOutReason || (showDebugRejectReasons && debugReasons.length > 0)) && (');
  });
});
