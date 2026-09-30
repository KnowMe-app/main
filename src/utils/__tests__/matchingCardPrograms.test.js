import {
  areMatchingCardProjectionsEqual,
  buildMatchingCardProjection,
  expandMatchingCard,
} from '../matchingCardIndex';
import { MATCHING_CARD_ALLOWED_FIELDS, resolveFieldOwnerNode } from '../profileNodeSchema';

const agency = {
  userId: 'AG1',
  name: 'Мрія Донорства',
  userRole: 'ag',
  services: 'ed,sm,unknown',
  programs: {
    p1: {
      type: 'ed',
      requirements: { ageFrom: 21, ageTo: 29 },
      payments: { final: { amount: 1600, currency: 'USD' }, repeat: { amount: 1800, currency: 'USD' } },
      coverage: ['exams'],
      note: 'довга примітка',
    },
  },
};

describe('картка стрічки агенції й батьків', () => {
  it('несе стислі програми без доплат, покриття й приміток', () => {
    const card = buildMatchingCardProjection('AG1', agency);
    expect(card.programsBrief).toEqual({ p1: { type: 'ed', ageFrom: 21, ageTo: 29, pay: 1600, currency: 'USD' } });
    expect(card.serviceTags).toBe('ed,sm');
  });

  it('несе «кого шукаємо» біологічних батьків', () => {
    expect(buildMatchingCardProjection('IP1', { userRole: 'ip', seeking: 'both' }).seekingRole).toBe('both');
    expect(buildMatchingCardProjection('IP1', { userRole: 'ip', seeking: 'будь-кого' }).seekingRole).toBeUndefined();
  });

  it('розгорнута картка читає послуги й «кого шукаємо» під іменами анкети', () => {
    const expanded = expandMatchingCard('AG1', { name: 'X', serviceTags: 'ed', seekingRole: 'sm' });
    expect(expanded.services).toBe('ed');
    expect(expanded.seeking).toBe('sm');
  });

  it('помічає зміну вимоги всередині програми', () => {
    const before = buildMatchingCardProjection('AG1', agency);
    const after = buildMatchingCardProjection('AG1', {
      ...agency,
      programs: { p1: { ...agency.programs.p1, requirements: { ageFrom: 21, ageTo: 30 } } },
    });
    expect(areMatchingCardProjectionsEqual(before, after)).toBe(false);
    expect(areMatchingCardProjectionsEqual(before, buildMatchingCardProjection('AG1', agency))).toBe(true);
  });

  it('поля анкети йдуть у profileDetails, а ключі картки — у matchingCards', () => {
    ['programs', 'services', 'seeking', 'parentPreferences', 'workLocations', 'foundedYear'].forEach(field => {
      expect(resolveFieldOwnerNode(field)).toBe('profileDetails');
    });
    ['programsBrief', 'serviceTags', 'seekingRole'].forEach(field => {
      expect(MATCHING_CARD_ALLOWED_FIELDS).toContain(field);
    });
  });
});
