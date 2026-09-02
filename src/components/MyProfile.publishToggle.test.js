import fs from 'fs';
import path from 'path';
import {
  MATCHING_CARD_FEED_FIELD,
  buildMatchingCardProjection,
} from '../utils/matchingCardIndex';

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

  // Сховати анкету — це не лише `publish: false` в самій анкеті: у стрічці її
  // тримає `matchingCards/{id}/feedDate`, і саме він мусить стати `false`.
  // Записує його не цей екран, а писач, який після кожного збереження
  // перебудовує проєкцію — тож перевіряється сама проєкція на тому стані, який
  // цей екран зберігає.
  it('turns the feed key into false so the card leaves both the feed and search', () => {
    const savedState = { name: 'Олена', lastLogin2: '2026-08-19', publish: false };
    const projection = buildMatchingCardProjection('a'.repeat(28), savedState);

    expect(projection[MATCHING_CARD_FEED_FIELD]).toBe(false);
    // А публікація повертає дату — той самий ключ, інше значення.
    expect(buildMatchingCardProjection('a'.repeat(28), { ...savedState, publish: true }))
      .toHaveProperty(MATCHING_CARD_FEED_FIELD, '2026-08-19');
  });

  it('shows the action matching the current publication state', () => {
    expect(source).toContain('onClick={state.publish ? hideProfile : publishProfile}');
    expect(source).toContain("{state.publish ? 'Приховати анкету' : 'Опублікувати анкету'}");
  });

  it('uses the current publish state for the profile status marker', () => {
    expect(source).toContain('$published={state.publish === true}');
    expect(source).toContain("state.publish === true ? 'Опублікована' : 'Прихована'");
  });

  it('keeps the failed login status for profiles without confirmed access', () => {
    expect(source).toContain(": 'Логін не відбувся'");
  });
});
