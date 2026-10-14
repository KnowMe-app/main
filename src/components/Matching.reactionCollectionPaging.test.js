import fs from 'fs';
import path from 'path';

// Колекції «Обрані» й «Не цікаві» гортаються сторінками, і питати базу вони
// мають рівно про сторінку. Доти перед першою порцією класифікація читала
// `matchingCards/{id}/feedDate` кожного вподобаного id (в адміна ~490 запитів
// заради шістнадцяти карток), а пул спільних реакцій гідратував усі картки
// інших власників разом.
describe('reaction collections read only the shown page', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
  const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

  it('builds the collection list from the reaction map, without reads', () => {
    const initialBody = slice('const loadReactionCards = React.useCallback', 'const switchMatchingMode');
    expect(initialBody).toContain('const safeReactionIds = orderReactionIdsByRecency(reactionMap);');
    expect(initialBody).not.toContain('getAccessibleReactionIds(');
    expect(initialBody).not.toContain('classifyReactionIdsByStorage(');

    const loadMoreBody = slice('const loadMore = React.useCallback', 'const baseExclude = new Set([');
    expect(loadMoreBody).toContain('orderReactionIdsByRecency(reactionMap)');
    expect(loadMoreBody).not.toContain('getAccessibleReactionIds(');
    expect(loadMoreBody).not.toContain('classifyReactionIdsByStorage(');
  });

  it('checks access per page with the cards that page already read', () => {
    const pageBody = slice('const loadReactionCardsPage = React.useCallback', 'const loadReactionCards = React.useCallback');
    expect(pageBody).toContain('const cardsById = await fetchReactionCardsByIds(pageIds);');
    expect(pageBody).toContain('await getAccessibleReactionIds(pageIds, accessSnapshot, cardsById)');
    expect(pageBody).not.toContain('compareUsersByLastLogin2');

    const classifyBody = slice('const classifyReactionIdsByStorage = React.useCallback', 'const fetchReactionCardsByIds');
    expect(classifyBody).toContain('const knownCard = knownCards?.[id];');
    expect(classifyBody).toContain('await readReactionFeedDateMemo(id)');
  });

  it('does not hydrate the shared reaction pool outside pagination', () => {
    const sharedBody = slice('const loadSharedReactionCandidates = React.useCallback', '  useEffect(() => {');
    expect(sharedBody).not.toContain('fetchReactionCardsByIds(');
    expect(sharedBody).not.toContain('getAccessibleReactionIds(');
  });

  it('shows the collection in the order its pages are read', () => {
    const tabBody = slice('const reactionTabUsers = useMemo', 'const reactionTabUsersRef');
    expect(tabBody).toContain('...orderReactionIdsByRecency(reactionMap),');
    expect(tabBody).not.toContain('.sort(compareUsersByLastLogin2)');
  });

  it('writes a like as a timestamp, like a dislike', () => {
    expect(source).toContain('      fullValue: Date.now(),');
    expect(source).not.toContain('fullValue: isFavorite ? true : Date.now()');
  });
});

describe('reaction collection refill counts shown cards', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  // Відсіяний id пагінації — не показана картка: інакше дозаповнення бачило
  // «завантажено більше, ніж показано» назавжди й дочитувало колекцію до кінця.
  it('fills loadedIdsRef with the page users, not every processed id', () => {
    expect(source).not.toContain('loadedIdsRef.current = new Set(loadedIds);');
    expect(source).toContain('...page.users.map(user => user.userId),');
  });
});
