import fs from 'fs';
import path from 'path';
import { buildAuthProfilePayload, buildAuthSessionPayload } from './authProfilePersistence';

jest.mock('./config', () => ({
  updateDataInFiresoreDB: jest.fn(),
  updateProfileNodesInRTDB: jest.fn(),
  updateDataInRealtimeDB: jest.fn(),
}));

describe('MyProfile account isolation', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');
  const authBody = source.slice(
    source.indexOf('const handleAuthConfirm = async () => {'),
    source.indexOf('const saveState = (nextState')
  );
  const existingAccountBranch = authBody.slice(
    authBody.indexOf('if (methods.length > 0) {'),
    authBody.indexOf('} else {')
  );

  it('builds a minimal login payload that cannot contain another profile\'s fields', () => {
    expect(buildAuthSessionPayload({ todayDays: '28.07.2026', todayDash: '2026-07-28' })).toEqual({
      lastLogin: '28.07.2026',
      lastLogin2: '2026-07-28',
    });
  });

  it('keeps draft profile fields for registration', () => {
    expect(buildAuthProfilePayload({
      email: 'new@example.com',
      userId: 'new-user',
      todayDays: '28.07.2026',
      todayDash: '2026-07-28',
      isRegistration: true,
      extraProfileData: { name: 'New profile' },
    })).toMatchObject({
      email: 'new@example.com',
      userId: 'new-user',
      name: 'New profile',
      registrationDate: '28.07.2026',
    });
  });

  it('never sends the current form draft when signing into an existing account', () => {
    expect(existingAccountBranch).toContain('resetAuthenticatedProfileState();');
    expect(existingAccountBranch).toContain('buildAuthSessionPayload({ todayDays, todayDash })');
    expect(existingAccountBranch).not.toContain('draftProfileData');
    expect(existingAccountBranch).not.toContain('buildAuthProfilePayload');
  });

  it('invalidates profile state and queued saves when the auth identity changes', () => {
    expect(source).toContain('authSessionGenerationRef.current += 1;');
    expect(source).toContain("editedFieldsRef.current = new Set();");
    expect(source).toContain('auth.currentUser?.uid !== targetUserId');
  });

  it('clears a local draft before exposing an initially authenticated profile', () => {
    expect(source).toContain('const hasLocalProfileState = Object.keys(stateRef.current || {}).length > 0;');
    expect(source).toContain('activeAuthUidRef.current !== uid && (activeAuthUidRef.current || hasLocalProfileState)');
  });

  it('explicitly reloads an existing account after sign-in', () => {
    expect(existingAccountBranch).toContain('await loadAuthenticatedProfile(userCredential.user.uid)');
  });

  it('flushes queued autosaves before invalidating the logout session', () => {
    const logoutBody = source.slice(
      source.indexOf('const handleExit = async () => {'),
      source.indexOf('const dotsMenu = () => (')
    );
    expect(logoutBody.indexOf('await saveQueueRef.current')).toBeLessThan(logoutBody.indexOf('resetAuthenticatedProfileState();'));
  });
});
