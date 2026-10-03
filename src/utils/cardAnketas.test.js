import { listCardAnketaRoles } from './cardAnketas';

describe('listCardAnketaRoles', () => {
  it('розкладає донорку-агентку на дві анкети в порядку ролей', () => {
    expect(listCardAnketaRoles({ role: ['ed', 'ag'] })).toEqual(['ed', 'ag']);
    expect(listCardAnketaRoles({ userRole: 'ag', role: 'ed' })).toEqual(['ag', 'ed']);
  });

  it('не розщеплює картку з однією роллю чи з двома особистими', () => {
    expect(listCardAnketaRoles({ role: 'ed' })).toEqual([]);
    expect(listCardAnketaRoles({ role: ['ed', 'sm'] })).toEqual([]);
    expect(listCardAnketaRoles({ role: ['ag', 'cl'] })).toEqual([]);
  });
});
