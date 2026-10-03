import { expandMatchingCard, MATCHING_CARD_RETIRED_FIELDS } from '../matchingCardIndex';
import { mergeProfileNodes } from '../profileNodeMerge';
import { buildProfileSummaryRows } from '../../components/ProfileFacts';

/*
 * Картка, записана тоді, коли стрічка ще несла структуру волосся. Перестати
 * писати поле мало: таку картку ніхто не перебудовує, доки анкету не збережуть,
 * а розгортання віддає далі все, чого не впізнало.
 */
const legacyCard = {
  name: 'Олена',
  hairColor: 'Fair',
  hairStructure: 'Wavy',
  feedDate: '2026-04-09',
  role: 'ed',
};

describe('поля, яких картка стрічки більше не несе', () => {
  it('структура волосся серед них', () => {
    expect(MATCHING_CARD_RETIRED_FIELDS).toContain('hairStructure');
  });

  it('розгорнута стара картка структури волосся не несе', () => {
    const card = expandMatchingCard('donor-1', legacyCard);
    expect(card.hairStructure).toBeUndefined();
    expect(card.hairColor).toBe('Fair');
    // Згорнутий рядок каже лише колір — структуру дописує повна анкета.
    const appearance = buildProfileSummaryRows(card, 'uk').find(row => row.key === 'appearance');
    expect(appearance.value).toBe('русяве волосся');
  });

  it('повна анкета бере структуру волосся зі своїх вузлів, а не з картки', () => {
    const withDetails = mergeProfileNodes({ userId: 'donor-1', card: legacyCard, details: { hairStructure: 'Straight' } });
    expect(withDetails.hairStructure).toBe('Straight');
    // Стерта в анкеті структура не воскресає з картки.
    const erased = mergeProfileNodes({ userId: 'donor-1', card: legacyCard, details: { surname: 'Ляшенко' } });
    expect(erased.hairStructure).toBeUndefined();
  });
});
