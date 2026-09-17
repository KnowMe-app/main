const fs = require('fs');
const path = require('path');

const { updateCard } = require('utils/cardsStorage');
const { findCachedCardsByText } = require('utils/cardsStorage');
const { canShowMatchingUser } = require('utils/reactionPriority');

const matchingSource = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

// Локальний кеш — це історія пристрою, а не право показу. У ньому лежить усе,
// що застосунок колись читав, зокрема неопубліковані анкети, і вкладка «Схожі»
// віддавала цей кеш читачеві як є: картка, яку `canShowMatchingUser` забороняє,
// доїжджала до `feedSource` і малювалась із діагностичною плашкою замість того,
// щоб зникнути. Саму вкладку прибрано — видача пошуку тепер одна, — але
// правило лишається за самим кешем: усе, що з нього беруть, проходить рубіж.
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

  it('другої видачі з локального кеша в матчингу більше немає', () => {
    // Вкладка «Схожі» пропонувала другу відповідь на той самий запит — з того
    // самого кеша, який правом показу не є. Пішла вкладка — пішов і шлях,
    // яким кеш потрапляв у деку повз відповідь бекенду.
    const source = matchingSource();

    expect(source).not.toContain('similarUsers');
    expect(source).not.toContain('findCachedCardsByText');
  });

  it('тимчасова діагностична плашка більше не входить до картки', () => {
    const source = matchingSource();

    expect(source).not.toContain('showDebugRejectReasons');
    expect(source).not.toContain('debugFilteredOutReason');
    expect(source).not.toContain('debugDiagnosticsRows');
    expect(source).not.toContain('DEBUG: normally hidden');
  });
});
