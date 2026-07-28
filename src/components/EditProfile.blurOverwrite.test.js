import fs from 'fs';
import path from 'path';

// Regression test for: typing name/surname (or any other plain text field)
// into ProfileForm and blurring did not appear to save. handleClear and
// handleDelKeyValue both pass 'overwrite' to handleSubmit so a changed
// scalar field cleanly replaces the stored value; handleBlur - the normal
// "type and blur" path used by every text input - did not, so
// makeUploadedInfo's no-overwrite branch turned the edit into a
// [oldValue, newValue] array instead of just saving the new value.
describe('handleBlur passes overwrite so a changed scalar field replaces cleanly instead of becoming an array', () => {
  const source = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');

  const handleBlurBody = source.slice(
    source.indexOf('const handleBlur = async name => {'),
    source.indexOf('// handleSubmit (called below) does its own setState')
  );

  it('calls handleSubmit with the overwrite flag set', () => {
    expect(handleBlurBody).toContain(
      "await handleSubmit(normalizedState, 'overwrite', undefined, 'handleBlur');"
    );
    expect(handleBlurBody).not.toContain(
      'await handleSubmit(normalizedState, undefined, undefined, \'handleBlur\');'
    );
  });
});
