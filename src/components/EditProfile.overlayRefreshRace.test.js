import fs from 'fs';
import path from 'path';
import vm from 'vm';

// Regression test for: an admin opens a profile card and immediately edits a
// plain text field (name/surname/city/...) - the very first edit of the
// session. refreshOverlays() also runs on mount (and again after every
// submit) to pull in canonical/overlay data; its snapshot is captured at the
// start of that specific async call. If that mount-triggered fetch is still
// in flight when the user's edit lands, its eventual setState used to
// unconditionally spread the (pre-edit) fetched data over the current draft,
// silently reverting the just-typed value back to the old one - no error,
// no toast, matching reports of a scalar edit "not appearing on the
// backend" on the very first edit after opening a card.
//
// mergeCardStatePreservingKnownFields must only let incoming data win for
// fields that haven't diverged from the last confirmed sync locally.
describe('mergeCardStatePreservingKnownFields does not let a stale background refresh clobber a fresher local edit', () => {
  const source = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');
  const fnSource = source.slice(
    source.indexOf('const mergeCardStatePreservingKnownFields'),
    source.indexOf('const getCanonicalCardFromCache')
  );

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${fnSource}\nthis.mergeCardStatePreservingKnownFields = mergeCardStatePreservingKnownFields;`, sandbox);
  const mergeCardStatePreservingKnownFields = sandbox.mergeCardStatePreservingKnownFields;

  it('preserves a field the user edited locally, even though the incoming (stale) snapshot still has the old value', () => {
    const lastSyncedSnapshot = { userId: 'abc', city: 'OldCity', name: 'Марія' };
    // The user typed 'NewCity'; prevState now differs from lastSyncedSnapshot for 'city'.
    const prevState = { userId: 'abc', city: 'NewCity', name: 'Марія' };
    // The background refresh started before the edit, so it still reports the old value.
    const nextCardState = { userId: 'abc', city: 'OldCity', name: 'Марія' };

    const result = mergeCardStatePreservingKnownFields(prevState, nextCardState, lastSyncedSnapshot);

    expect(result.city).toBe('NewCity');
  });

  it('still applies incoming data for fields the user has not touched locally', () => {
    const lastSyncedSnapshot = { userId: 'abc', city: 'OldCity', name: 'Марія' };
    const prevState = { userId: 'abc', city: 'OldCity', name: 'Марія' };
    // Another editor's overlay changed 'name' server-side.
    const nextCardState = { userId: 'abc', city: 'OldCity', name: 'Оксана' };

    const result = mergeCardStatePreservingKnownFields(prevState, nextCardState, lastSyncedSnapshot);

    expect(result.name).toBe('Оксана');
  });

  it('can apply consecutive remote changes when the accepted value advances the baseline', () => {
    const firstBaseline = { userId: 'abc', name: 'Марія' };
    const firstResult = mergeCardStatePreservingKnownFields(
      { userId: 'abc', name: 'Марія' },
      { userId: 'abc', name: 'Оксана' },
      firstBaseline
    );

    const secondResult = mergeCardStatePreservingKnownFields(
      firstResult,
      { userId: 'abc', name: 'Ірина' },
      { ...firstBaseline, name: 'Оксана' }
    );

    expect(secondResult.name).toBe('Ірина');
  });

  it('falls back to a full overwrite when there is no lastSyncedSnapshot yet', () => {
    const prevState = { userId: 'abc', city: 'NewCity' };
    const nextCardState = { userId: 'abc', city: 'OldCity' };

    const result = mergeCardStatePreservingKnownFields(prevState, nextCardState, null);

    expect(result.city).toBe('OldCity');
  });
});
