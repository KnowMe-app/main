import fs from 'fs';
import path from 'path';

describe('my-profile publication toggle', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('persists publish=false as a direct boolean when hiding the profile', () => {
    const hideProfileBody = source.slice(
      source.indexOf('const hideProfile = async () => {'),
      source.indexOf('const renderField = (name) => {')
    );

    expect(hideProfileBody).toContain('publish: false');
    expect(hideProfileBody).toContain("await saveState(nextState, { directFields: ['publish'] });");
  });

  it('shows the action matching the current publication state', () => {
    expect(source).toContain('onClick={state.publish ? hideProfile : publishProfile}');
    expect(source).toContain("{state.publish ? 'Приховати анкету' : 'Опублікувати анкету'}");
  });
});
