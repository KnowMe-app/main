import fs from 'fs';
import path from 'path';
import {
  clearPendingProfileEdits,
  readPendingProfileEdits,
  rememberPendingProfileEdit,
  settlePendingProfileEdits,
} from './myProfilePendingEdits';

beforeEach(() => localStorage.clear());

describe('незбережені правки «Мого профілю»', () => {
  it('запамʼятовує поле з позначками напрямку й індексу', () => {
    rememberPendingProfileEdit('u1', 'phone', '380501112233', { searchId: true });
    rememberPendingProfileEdit('u1', 'programs', { a: 1 }, { direct: true });
    expect(readPendingProfileEdits('u1')).toEqual({
      fields: { phone: '380501112233', programs: { a: 1 } },
      directFields: ['programs'],
      searchIdFields: ['phone'],
    });
    expect(readPendingProfileEdits('u2').fields).toEqual({});
  });

  it('знімає записане, але лишає поле, змінене ще раз поки летів запис', () => {
    rememberPendingProfileEdit('u1', 'city', 'Київ');
    rememberPendingProfileEdit('u1', 'name', 'Оксана');
    // Запис ніс city = Київ і старе імʼя.
    settlePendingProfileEdits('u1', { city: 'Київ', name: 'Олена' });
    expect(readPendingProfileEdits('u1').fields).toEqual({ name: 'Оксана' });
    settlePendingProfileEdits('u1', { name: 'Оксана' });
    expect(localStorage.getItem('km.myProfilePending.v1:u1')).toBeNull();
  });

  it('вихід стирає правки всіх читачів пристрою', () => {
    rememberPendingProfileEdit('u1', 'city', 'Київ');
    rememberPendingProfileEdit('u2', 'city', 'Львів');
    clearPendingProfileEdits();
    expect(readPendingProfileEdits('u1').fields).toEqual({});
    expect(readPendingProfileEdits('u2').fields).toEqual({});
  });
});

describe('MyProfile дописує незбережене', () => {
  const source = fs.readFileSync(path.join(__dirname, '../components/MyProfile.jsx'), 'utf8');

  it('правка лягає на пристрій до запису і знімається після нього', () => {
    const saveField = source.slice(source.indexOf('const saveFieldValue = '), source.indexOf('const clearFieldValue = '));
    expect(saveField.indexOf('rememberPendingProfileEdit(')).toBeLessThan(saveField.indexOf('triggerAutosave('));
    const saveState = source.slice(source.indexOf('const saveState = '), source.indexOf('saveStateRef.current = saveState;'));
    expect(saveState.indexOf("await persistUserProfile(targetUserId, uploadedInfo, 'check');"))
      .toBeLessThan(saveState.indexOf('settlePendingProfileEdits(targetUserId, nextState);'));
  });

  it('незбережене накладається на анкету й дописується після свіжого читання', () => {
    expect(source).toContain('const nextState = { userRole: \'ed\', ...loadedData, ...pendingFields, userId: uid };');
    expect(source).toContain('if (nodesProfile && Object.keys(pending.fields).length) {');
    expect(source).toContain('saveStateRef.current?.(');
  });
});
