import fs from 'fs';
import path from 'path';

// Regression test for: editing a text field or picking a chip option on
// my-profile overwrote the stored value instead of accumulating it into a
// [oldValue, newValue, ...] array. Root cause: commit cb744069 ("Save My
// Profile changes only to users") added `directFields: [name]` to
// triggerAutosave for saveFieldValue and the chip onClick handler. That
// forces saveState's own directFields loop to overwrite the actively-edited
// field's value directly, bypassing makeUploadedInfo's default
// accumulate-into-array behavior entirely for exactly the field the user
// just changed - the opposite of the intended "preserve every value ever
// entered" design (see MyProfile.saveHistory.test.js / normalizeProfileData,
// which only ever displays the last array element).
//
// publishProfile's own directFields: ['publish'] is untouched by this fix:
// it predates cb744069 and 'publish' is a boolean workflow flag, not
// user-entered profile data - it should never become a history array.
describe('editing a field on my-profile does not force it through as a plain overwrite', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('saveFieldValue (used by every plain text/textarea input) calls triggerAutosave without directFields', () => {
    const fnBody = source.slice(
      source.indexOf('const saveFieldValue = (name, value, field) => {'),
      source.indexOf('const clearFieldValue = (name, field) => {')
    );
    expect(fnBody).toContain('triggerAutosave(nextState);');
    expect(fnBody).not.toContain('directFields');
  });

  it('the chip-select onClick handler calls triggerAutosave without directFields', () => {
    const chipOnClickStart = source.indexOf("onClick={() => {\n                  setCustomOptionMode(prev => ({ ...prev, [name]: false }));");
    expect(chipOnClickStart).toBeGreaterThan(-1);
    const chipOnClickBody = source.slice(chipOnClickStart, source.indexOf('}}', chipOnClickStart));
    expect(chipOnClickBody).toContain('triggerAutosave(nextState);');
    expect(chipOnClickBody).not.toContain('directFields');
  });

  it('publishProfile still forces publish through as a plain scalar (it is a workflow flag, not history-tracked data)', () => {
    const publishBody = source.slice(
      source.indexOf('const publishProfile = async () => {'),
      source.indexOf('const renderField = (name) => {')
    );
    expect(publishBody).toContain("await saveState(nextState, { directFields: ['publish'] });");
  });
});
