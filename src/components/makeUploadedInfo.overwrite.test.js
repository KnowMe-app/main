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
