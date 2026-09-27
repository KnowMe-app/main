import { buildRoleDivergencePlan } from '../roleDivergence';

/**
 * Роль, переписана формою входу, повертається до ролі картки.
 */
describe('buildRoleDivergencePlan', () => {
  it('називає акаунт, у якого вхід переписав роль у Firestore, і повертає роль картки', () => {
    const plan = buildRoleDivergencePlan({
      cards: { parent: { role: 'ip' } },
      firestoreRoles: { parent: { userRole: 'ag', role: 'ip' } },
    });
    expect(plan.mismatched).toEqual([{ id: 'parent', cardRole: 'ip', firestoreRole: 'ag, ip' }]);
    expect(plan.updates).toEqual({ parent: { userRole: 'ip', role: 'ip' } });
  });

  it('не чіпає акаунт, у якого обидва записи вже збігаються', () => {
    const plan = buildRoleDivergencePlan({
      cards: { donor: { role: 'ed' } },
      firestoreRoles: { donor: { userRole: 'ed', role: 'ed' } },
    });
    expect(plan.mismatched).toEqual([]);
    expect(plan.updates).toEqual({});
  });

  it('картку з кількома ролями лише називає — котра правдива, вирішує людина', () => {
    const plan = buildRoleDivergencePlan({
      cards: { mixed: { role: ['ip', 'ag'] } },
      firestoreRoles: { mixed: { userRole: 'ag' } },
    });
    expect(plan.multiRole).toEqual([{ id: 'mixed', roles: ['ip', 'ag'] }]);
    expect(plan.updates).toEqual({});
  });

  it('пропускає акаунти без картки чи без ролі в ній', () => {
    const plan = buildRoleDivergencePlan({
      cards: { empty: {} },
      firestoreRoles: { empty: { userRole: 'ag' }, missing: { userRole: 'ed' } },
    });
    expect(plan.mismatched).toEqual([]);
    expect(plan.multiRole).toEqual([]);
  });
});
