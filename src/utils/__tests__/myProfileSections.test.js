import { buildParentRoleSections, listRequiredSectionFields } from '../myProfileSections';

describe('анкета біологічних батьків у «Моєму профілі»', () => {
  it('публікацію тримає лише «кого шукаєте»; програми, «як шукаєте» й «Про нас» — за бажанням', () => {
    const [search, programs] = buildParentRoleSections({ parentOnly: true, ownsPrograms: true });
    expect(search.fields).toEqual(['seeking', 'parentVia', 'moreInfo_main']);
    expect(listRequiredSectionFields(search)).toEqual(['seeking']);
    expect(programs.fields).toEqual(['programs']);
    expect(listRequiredSectionFields(programs)).toEqual([]);
  });

  // «Де програма» тепер у самій програмі: форма показує лише записане.
  it('«Де програма» — лише коли воно вже записане, і публікацію не тримає', () => {
    expect(buildParentRoleSections({ parentOnly: true })[0].fields).not.toContain('programLocation');
    const [search] = buildParentRoleSections({ parentOnly: true, showProgramLocation: true });
    expect(search.fields).toContain('programLocation');
    expect(listRequiredSectionFields(search)).toEqual(['seeking']);
  });

  it('програми батьків стоять лише там, де немає агенції чи клініки', () => {
    expect(buildParentRoleSections({ parentOnly: true, ownsPrograms: false })).toHaveLength(1);
  });

  it('«Про нас» лишається в анкеті людини, коли поруч є її власна роль', () => {
    const [search] = buildParentRoleSections({ parentOnly: false });
    expect(search.fields).toEqual(['seeking', 'parentVia']);
    expect(search.extraFields).toEqual([]);
  });

  it('спільно необовʼязкові поля читача теж не тримають публікацію', () => {
    const personal = { key: 'personal', fields: ['name', 'phone', 'country', 'region', 'city'] };
    expect(listRequiredSectionFields(personal, { optional: new Set(['region']) })).toEqual(['name', 'phone', 'country', 'city']);
  });
});
