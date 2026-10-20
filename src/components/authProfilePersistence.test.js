import fs from 'fs';
import path from 'path';

describe('persistAccountProfile', () => {
  const source = fs.readFileSync(path.join(__dirname, 'authProfilePersistence.js'), 'utf8');

  // Анкета акаунта живе лише у вузлах RTDB: ні Firestore, ні повторного
  // «запасного» запису в ті самі вузли, який нічого не рятував.
  it('writes the profile nodes once and lets a failure reach the caller', () => {
    expect(source).toContain("await updateDataInRealtimeDB(userId, uploadedInfo, mode === 'set' ? undefined : 'update');");
    expect(source).not.toContain('updateDataInFiresoreDB');
    expect(source).not.toContain('updateProfileNodesInRTDB');
    expect(source).not.toContain('canonicalWriteFailed');
  });
});

describe('MyProfile phone autosave', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('keeps an incomplete phone prefix while editing and normalizes it on save', () => {
    expect(source).toContain("const updatedValue = name === 'phone' ? value : inputUpdateValue(value, field);");
    expect(source).toContain("? normalizePhoneValue(value)");
    // Решта полів на збереженні ще й приводиться до канонічного вигляду
    // (країна, область, місто, зріст) — `utils/profileNormalization`.
    expect(source).toContain(': normalizeProfileFieldInput(name, inputUpdateValue(value, field))');
  });

  it('reindexes every saved searchId field without replacing its accumulated history', () => {
    // Телефон тут був єдиним індексованим полем, і прізвище, набране в «Моєму
    // профілі», у `searchId` не потрапляло взагалі.
    expect(source).toContain('triggerAutosave(nextState, { searchIdFields: isSearchIdIndexedField(name) ? [name] : [] });');
    expect(source).not.toContain("searchIdFields: name === 'phone'");
    expect(source).toContain('await syncUserSearchIdIndex(targetUserId, existingData, uploadedInfo, searchIdFields);');

    const saveStateBody = source.slice(
      source.indexOf('const saveState = (nextState,'),
      source.indexOf('const triggerAutosave = (nextState, options)')
    );
    expect(saveStateBody).not.toContain('searchIdFields.forEach');
  });
});
