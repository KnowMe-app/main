const { makeUploadedInfo } = require('./makeUploadedInfo');

// Regression test for: typing a new value into a ProfileForm text input
// (name, surname, email, phone...) and blurring silently failed to save.
// Root cause: makeUploadedInfo, when called with a falsy `overwrite`, turns
// a changed scalar field into a `[oldValue, newValue]` array instead of
// replacing it - so the edit *was* written, but as an array rather than the
// plain value the UI expects, making it look like nothing was saved.
describe('makeUploadedInfo overwrite behaviour for a scalar field that differs from the server copy', () => {
  it('with overwrite truthy, cleanly replaces the scalar value (no array)', () => {
    const existingData = { userId: 'abc', name: 'Old Name' };
    const state = { userId: 'abc', name: 'New Name' };

    const result = makeUploadedInfo(existingData, state, 'overwrite');

    expect(result.name).toBe('New Name');
  });

  it('without overwrite, turns the differing scalar into a [old, new] array', () => {
    const existingData = { userId: 'abc', name: 'Old Name' };
    const state = { userId: 'abc', name: 'New Name' };

    const result = makeUploadedInfo(existingData, state, undefined);

    expect(result.name).toEqual(['Old Name', 'New Name']);
  });
});

// Мапа мініатюр фото — не історія версій. Автозбереження «Мого профілю»
// порівнює весь стан форми з базою, і поки мапа йшла загальним шляхом, перше ж
// збереження іншого поля після завантаження фото писало `[стара, нова]`.
describe('makeUploadedInfo: мапа мініатюр фото перезаписується цілком', () => {
  it('нова мапа заміщає стару, а не дописується до неї', () => {
    const existingData = { userId: 'abc', photoThumbs: { a_jpg: 'thumb-a' } };
    const state = { userId: 'abc', photoThumbs: { a_jpg: 'thumb-a', b_jpg: 'thumb-b' } };

    expect(makeUploadedInfo(existingData, state, undefined).photoThumbs)
      .toEqual({ a_jpg: 'thumb-a', b_jpg: 'thumb-b' });
  });

  it('та сама мапа іншим обʼєктом лишається мапою', () => {
    const existingData = { userId: 'abc', photoThumbs: { a_jpg: 'thumb-a' } };
    const state = { userId: 'abc', photoThumbs: { a_jpg: 'thumb-a' } };

    expect(makeUploadedInfo(existingData, state, undefined).photoThumbs).toEqual({ a_jpg: 'thumb-a' });
  });

  it('стерта мапа (останнє фото видалено) пишеться як null', () => {
    const existingData = { userId: 'abc', photoThumbs: { a_jpg: 'thumb-a' } };
    const state = { userId: 'abc', photoThumbs: null };

    expect(makeUploadedInfo(existingData, state, undefined).photoThumbs).toBeNull();
  });
});
