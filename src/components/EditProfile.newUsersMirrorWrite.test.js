import fs from 'fs';
import path from 'path';
import { NEW_USERS_OWNED_FIELDS } from '../utils/mergeUserCollections';

describe('long-userId cards stop duplicating fields into newUsers', () => {
  const editProfileSource = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');
  const actionsSource = fs.readFileSync(path.join(__dirname, 'smallCard/actions.js'), 'utf8');
  const mergeUtilSource = fs.readFileSync(path.join(__dirname, '../utils/mergeUserCollections.js'), 'utf8');

  it('EditProfile no longer imports the newUsers mirror field list', () => {
    expect(editProfileSource).not.toContain("from './formFields'");
    expect(editProfileSource).not.toContain('newUsersMirrorFieldNames');
    expect(editProfileSource).not.toContain('ppTechnicalInputFields');
  });

  it('NEW_USERS_OWNED_FIELDS only lists fields never written to users at all (no duplication)', () => {
    expect(NEW_USERS_OWNED_FIELDS).toEqual(['role', 'lastCycle', 'myComment', 'writer']);
    expect(mergeUtilSource).not.toContain("'cycleStatus',\n  'stimulationSchedule',");
  });

  it('remoteUpdate sends only newUsers-owned fields to newUsers for long-userId cards', () => {
    const remoteUpdateBody = editProfileSource.slice(
      editProfileSource.indexOf('async function remoteUpdate'),
      editProfileSource.indexOf('const enqueueProfileSync')
    );

    expect(remoteUpdateBody).toContain(
      "Object.entries(updatedState).filter(([key]) => fieldsForNewUsersOnly.includes(key))"
    );
  });

  it('persistCanonicalByRules sends only newUsers-owned fields to newUsers for long-userId cards', () => {
    const persistBody = editProfileSource.slice(
      editProfileSource.indexOf('const persistCanonicalByRules'),
      editProfileSource.indexOf('const effectiveCycleStatus')
    );

    expect(persistBody).toContain(
      "Object.entries(mergedCard).filter(([key]) => fieldsForNewUsersOnly.includes(key))"
    );
  });

  it('handleSubmitAll no longer mirrors contact/date fields into newUsers, except lastAction/lastLogin2', () => {
    const handleSubmitAllBody = actionsSource.slice(
      actionsSource.indexOf('export const handleSubmitAll'),
    );

    expect(handleSubmitAllBody).not.toContain('ppTechnicalInputFields');
    expect(handleSubmitAllBody).toContain('NEW_USERS_OWNED_FIELDS');
    expect(handleSubmitAllBody).toContain(
      "[...fieldsForNewUsersOnly, ...fieldsKeptInBothCollections].includes(key)"
    );
    expect(handleSubmitAllBody).toContain("fieldsKeptInBothCollections = ['lastAction', 'lastLogin2']");
    expect(handleSubmitAllBody).not.toContain("'getInTouch'");
    expect(handleSubmitAllBody).not.toContain("'lastDelivery'");
    expect(handleSubmitAllBody).not.toContain("'ownKids'");
  });

  it('handleSubmit (the newUsers-only quick-edit path with no userId length branch) is left untouched', () => {
    const handleSubmitBody = actionsSource.slice(
      actionsSource.indexOf('export const handleSubmit ='),
      actionsSource.indexOf('export const handleSubmitAll')
    );

    expect(handleSubmitBody).toContain('ppTechnicalInputFields');
    expect(handleSubmitBody).not.toContain('userId?.length > 20');
  });

  it('Matching.jsx writes the login timestamp straight to users instead of routing through newUsers', () => {
    const matchingSource = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
    expect(matchingSource).not.toContain('updateDataInNewUsersRTDB');
    expect(matchingSource).toContain(
      "updateDataInRealtimeDB(user.uid, sanitizeCardForBackend({ lastLogin2: todayDash }), 'update');"
    );
  });
});
