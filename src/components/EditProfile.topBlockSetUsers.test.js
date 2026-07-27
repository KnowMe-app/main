import fs from 'fs';
import path from 'path';

// Regression test for: TopBlock's own actions (getInTouch date shortcuts,
// dislike/favorite reactions...) did not persist to the backend on their
// own when used inside EditProfile/ProfileForm. handleChange (smallCard/
// actions.js) only calls submitWithHistory/handleSubmit from *inside* the
// setUsers(prev => ...) updater it's given - that updater only runs if
// setUsers actually invokes it, the way a real state setter does. EditProfile
// passed setUsers={() => {}}, a stub that silently swallowed the updater, so
// nothing TopBlock did ever saved by itself; the change only appeared to
// save once some unrelated ProfileForm field happened to blur afterwards and
// swept up whatever was pending in local state.
describe('EditProfile gives TopBlock a real setUsers so its own actions actually persist', () => {
  const source = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');

  const topBlockUsage = source.slice(
    source.indexOf('<TopBlock'),
    source.indexOf('setShowInfoModal={() => {}}')
  );

  it('passes setState (a real, working updater) as setUsers, not a no-op stub', () => {
    expect(topBlockUsage).toContain('setUsers={setState}');
    expect(topBlockUsage).not.toContain('setUsers={() => {}}');
  });
});
