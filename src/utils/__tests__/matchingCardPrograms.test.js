import {
  buildMatchingCardProjection,
  expandMatchingCard,
  parseHiddenRoles,
} from '../matchingCardIndex';
import { MATCHING_CARD_ALLOWED_FIELDS, resolveFieldOwnerNode } from '../profileNodeSchema';

const agency = {
  userId: 'AG1',
  name: 'Мрія Донорства',
  userRole: 'ag',
  programs: {
    p1: {
      type: 'ed',
      requirements: { ageFrom: 21, ageTo: 29 },
      payments: { final: { amount: 1600, currency: 'USD' } },
    },
  },
};

describe('картка стрічки агенції й батьків', () => {
  it('програм не несе — лише версію, яку переносить з попередньої картки', () => {
    const fresh = buildMatchingCardProjection('AG1', agency);
    expect(fresh.programsBrief).toBeUndefined();
    expect(fresh.programs).toBeUndefined();
    expect(fresh.programsAt).toBeUndefined();

    // Картку перебудовує кожне збереження анкети, а програми пише свій
    // писач — без переносу правка імені гасила б програми в стрічці.
    const rebuilt = buildMatchingCardProjection('AG1', agency, { existingCard: { programsAt: 1759200000000 } });
    expect(rebuilt.programsAt).toBe(1759200000000);
  });

  it('несе «кого шукаємо» біологічних батьків', () => {
    expect(buildMatchingCardProjection('IP1', { userRole: 'ip', seeking: 'both' }).seekingRole).toBe('both');
    expect(buildMatchingCardProjection('IP1', { userRole: 'ip', seeking: 'будь-кого' }).seekingRole).toBeUndefined();
  });

  it('розгорнута картка читає «кого шукаємо» під іменем анкети і лишає версію програм', () => {
    const expanded = expandMatchingCard('AG1', { name: 'X', seekingRole: 'sm', programsAt: 7 });
    expect(expanded.seeking).toBe('sm');
    expect(expanded.programsAt).toBe(7);
  });

  it('сховану роль картка не несе, а сховати всі не дає', () => {
    const both = { userId: 'ED1', name: 'Оля', userRole: ['ag', 'ed'], role: ['ag', 'ed'] };
    expect(buildMatchingCardProjection('ED1', both).role).toEqual(['ag', 'ed']);
    expect(buildMatchingCardProjection('ED1', { ...both, hiddenRoles: 'ag' }).role).toBe('ed');
    expect(buildMatchingCardProjection('ED1', { ...both, hiddenRoles: 'ag,ed' }).role).toEqual(['ag', 'ed']);
    expect(parseHiddenRoles(' AG, ed ,,')).toEqual(['ag', 'ed']);
  });

  it('поля анкети йдуть у profileDetails, а ключі картки — у matchingCards', () => {
    ['seeking', 'parentPreferences', 'hiddenRoles'].forEach(field => {
      expect(resolveFieldOwnerNode(field)).toBe('profileDetails');
    });
    ['programsAt', 'seekingRole'].forEach(field => {
      expect(MATCHING_CARD_ALLOWED_FIELDS).toContain(field);
    });
    ['programsBrief', 'serviceTags'].forEach(field => {
      expect(MATCHING_CARD_ALLOWED_FIELDS).not.toContain(field);
    });
  });
});
