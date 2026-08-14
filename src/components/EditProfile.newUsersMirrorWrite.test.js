import fs from 'fs';
import path from 'path';

describe('long-userId cards no longer write anything to newUsers', () => {
  const editProfileSource = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');
  const actionsSource = fs.readFileSync(path.join(__dirname, 'smallCard/actions.js'), 'utf8');
  const mergeUtilSource = fs.readFileSync(path.join(__dirname, '../utils/mergeUserCollections.js'), 'utf8');
  const matchingSource = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('EditProfile no longer imports any newUsers-ownership field list', () => {
    expect(editProfileSource).not.toContain("from './formFields'");
    expect(editProfileSource).not.toContain('newUsersMirrorFieldNames');
    expect(editProfileSource).not.toContain('ppTechnicalInputFields');
    expect(editProfileSource).not.toContain('NEW_USERS_OWNED_FIELDS');
    expect(editProfileSource).not.toContain('fieldsForNewUsersOnly');
  });

  it('mergeUserCollections has no collection-ownership exception left', () => {
    expect(mergeUtilSource).not.toContain('NEW_USERS_OWNED_FIELDS');
  });

  it("remoteUpdate's users-storage branch never calls updateDataInNewUsersRTDB", () => {
    const remoteUpdateBody = editProfileSource.slice(
      editProfileSource.indexOf('async function remoteUpdate'),
      editProfileSource.indexOf('const enqueueProfileSync')
    );
    const usersStorageBranch = remoteUpdateBody.slice(
      remoteUpdateBody.indexOf("storageCollection === 'users'"),
      remoteUpdateBody.indexOf("} else if (storageCollection === 'newUsers')")
    );

    expect(usersStorageBranch).not.toContain('updateDataInNewUsersRTDB');
    expect(usersStorageBranch).toContain('updateDataInRealtimeDB(updatedState.userId, uploadedInfo');
  });

  it("persistCanonicalByRules' long-userId branch never calls updateDataInNewUsersRTDB", () => {
    const persistBody = editProfileSource.slice(
      editProfileSource.indexOf('const persistCanonicalByRules'),
      editProfileSource.indexOf('const effectiveCycleStatus')
    );
    const longUserIdBranch = persistBody.slice(0, persistBody.indexOf('return;\n    }'));

    expect(longUserIdBranch).not.toContain('updateDataInNewUsersRTDB');
    expect(longUserIdBranch).toContain('updateDataInRealtimeDB(mergedCard.userId, cleanedState');
  });

  it("handleSubmitAll's long-userId branch never calls updateDataInNewUsersRTDB", () => {
    const handleSubmitAllBody = actionsSource.slice(
      actionsSource.indexOf('export const handleSubmitAll'),
    );

    expect(handleSubmitAllBody).not.toContain('NEW_USERS_OWNED_FIELDS');
    expect(handleSubmitAllBody).not.toContain('fieldsForNewUsersOnly');
    expect(handleSubmitAllBody).not.toContain('fieldsKeptInBothCollections');

    const longUserIdBranch = handleSubmitAllBody.slice(
      handleSubmitAllBody.indexOf('userData?.userId?.length > 20'),
      handleSubmitAllBody.indexOf('} else {')
    );
    expect(longUserIdBranch).not.toContain('updateDataInNewUsersRTDB');
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
    expect(matchingSource).not.toContain('updateDataInNewUsersRTDB');
    expect(matchingSource).toContain(
      "updateDataInRealtimeDB(user.uid, sanitizeCardForBackend({ lastLogin2: todayDash }), 'update');"
    );
  });

  it('defaultFetchByLastActionRange queries both collections so lastAction sorting keeps working without the newUsers write', () => {
    const lastActionLoadSource = fs.readFileSync(path.join(__dirname, 'lastActionLoad.js'), 'utf8');
    expect(lastActionLoadSource).toContain("['newUsers', 'users'].map(collectionName =>");
  });
});
