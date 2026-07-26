import fs from 'fs';
import path from 'path';

describe('long-userId cards stop mirroring contact fields into newUsers', () => {
  const editProfileSource = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');
  const actionsSource = fs.readFileSync(path.join(__dirname, 'smallCard/actions.js'), 'utf8');

  it('EditProfile no longer imports the newUsers mirror field list', () => {
    expect(editProfileSource).not.toContain("from './formFields'");
    expect(editProfileSource).not.toContain('newUsersMirrorFieldNames');
    expect(editProfileSource).not.toContain('ppTechnicalInputFields');
  });

  it('remoteUpdate only sends newUsers-owned fields to newUsers for long-userId cards', () => {
    const remoteUpdateBody = editProfileSource.slice(
      editProfileSource.indexOf('async function remoteUpdate'),
      editProfileSource.indexOf('const enqueueProfileSync')
    );

    expect(remoteUpdateBody).toContain(
      "[...fieldsForNewUsersOnly, 'getInTouch', 'lastDelivery', 'ownKids'].includes(key)"
    );
  });

  it('persistCanonicalByRules only sends newUsers-owned fields to newUsers for long-userId cards', () => {
    const persistBody = editProfileSource.slice(
      editProfileSource.indexOf('const persistCanonicalByRules'),
      editProfileSource.indexOf('const effectiveCycleStatus')
    );

    expect(persistBody).toContain(
      "[...fieldsForNewUsersOnly, 'getInTouch', 'lastDelivery', 'ownKids'].includes(key)"
    );
  });

  it('handleSubmitAll no longer mirrors contact fields into newUsers for long-userId cards', () => {
    const handleSubmitAllBody = actionsSource.slice(
      actionsSource.indexOf('export const handleSubmitAll'),
    );

    expect(handleSubmitAllBody).not.toContain('ppTechnicalInputFields');
    expect(handleSubmitAllBody).toContain(
      '[...fieldsForNewUsersOnly, ...commonFields].includes(key)'
    );
  });

  it('handleSubmit (the newUsers-only quick-edit path with no userId length branch) is left untouched', () => {
    const handleSubmitBody = actionsSource.slice(
      actionsSource.indexOf('export const handleSubmit ='),
      actionsSource.indexOf('export const handleSubmitAll')
    );

    expect(handleSubmitBody).toContain('ppTechnicalInputFields');
    expect(handleSubmitBody).not.toContain('userId?.length > 20');
  });
});
