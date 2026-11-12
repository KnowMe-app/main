import fs from 'fs';
import path from 'path';
import {
  capturePendingProfileGenerations,
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
    expect(readPendingProfileEdits('u1')).toMatchObject({
      fields: { phone: '380501112233', programs: { a: 1 } },
      directFields: ['programs'],
      searchIdFields: ['phone'],
      generations: { phone: 1, programs: 2 },
    });
    expect(readPendingProfileEdits('u2').fields).toEqual({});
  });

  it('знімає записане, але лишає поле, змінене ще раз поки летів запис', () => {
    rememberPendingProfileEdit('u1', 'city', 'Київ');
    const firstSave = capturePendingProfileGenerations('u1');
    rememberPendingProfileEdit('u1', 'name', 'Оксана');
    // Перший запис ніс лише city; імʼя набрали вже після його виклику.
    settlePendingProfileEdits('u1', { city: 'Київ', name: 'Оксана' }, firstSave);
    expect(readPendingProfileEdits('u1').fields).toEqual({ name: 'Оксана' });
    settlePendingProfileEdits('u1', { name: 'Оксана' }, capturePendingProfileGenerations('u1'));
    expect(localStorage.getItem('km.myProfilePending.v1:u1')).toBeNull();
  });

  it('A → B → A: старий запис з тим самим значенням не знімає новішої правки', () => {
    rememberPendingProfileEdit('u1', 'city', 'A');
    const saveA = capturePendingProfileGenerations('u1');
    rememberPendingProfileEdit('u1', 'city', 'B');
    rememberPendingProfileEdit('u1', 'city', 'A');
    settlePendingProfileEdits('u1', { city: 'A' }, saveA);
    expect(readPendingProfileEdits('u1').fields).toEqual({ city: 'A' });
  });

  it('правка першої версії (без поколінь) знімається за значенням', () => {
    localStorage.setItem('km.myProfilePending.v1:u1', JSON.stringify({ fields: { city: 'Київ' }, directFields: [], searchIdFields: [] }));
    settlePendingProfileEdits('u1', { city: 'Київ' }, {});
    expect(readPendingProfileEdits('u1').fields).toEqual({});
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
      .toBeLessThan(saveState.indexOf('settlePendingProfileEdits(targetUserId, nextState, capturedPendingGenerations);'));
    // Покоління знімаються в мить виклику, а не після черги збережень.
    expect(saveState.indexOf('capturePendingProfileGenerations(targetUserId)'))
      .toBeLessThan(saveState.indexOf('saveQueueRef.current = saveQueueRef.current'));
  });

  it('незбережене накладається на анкету й дописується після свіжого читання', () => {
    expect(source).toContain('const nextState = { userRole: \'ed\', ...loadedData, ...pendingFields, userId: uid };');
    expect(source).toContain('if (nodesProfile && Object.keys(pending.fields).length) {');
    expect(source).toContain('saveStateRef.current?.(');
  });

  it('очищення пише стерте в незбережене, а відмова повертає попереднє', () => {
    const clear = source.slice(source.indexOf('const clearProfileFields = async'), source.indexOf('const listAnketaFields = '));
    expect(clear.indexOf('rememberClearedFields(clearableFields, nextState);')).toBeLessThan(clear.indexOf('await saveState('));
    expect(clear).toContain('rememberClearedFields(clearableFields, currentState);');
    const clearRole = source.slice(source.indexOf('const clearRoleFields = async'), source.indexOf('const commitChoice = '));
    expect(clearRole).toContain('rememberClearedFields(fields, nextState);');
    expect(clearRole).toContain('rememberClearedFields(fields, currentState);');
  });

  it('відповідь чіпом теж лягає в незбережене', () => {
    const choice = source.slice(source.indexOf('const commitChoice = '), source.indexOf('const followUpReset = '));
    expect(choice.indexOf('rememberPendingProfileEdit(')).toBeLessThan(choice.indexOf('triggerAutosave(nextState);'));
  });
});
