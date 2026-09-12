import fs from 'fs';
import path from 'path';

// Знайдена картка мусить пропонувати рівно те, чого від неї хочуть: спитати про
// людину (відгуки), дописати про неї (оверлей) або завести нову. Досі другий і
// третій шляхи вели на екран пошуку — той самий, з якого читач щойно прийшов.
describe('Matching: продовження пошуку без другого пошуку', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('веде «Створити нову» просто у форму нової картки, з набраним і станом видачі', () => {
    expect(source).toContain("state: { createFromQuery: searchQuery.trim(), queryMatchedCards: visibleUsers.length }");
    expect(source).not.toContain("state: { query: searchQuery.trim() }");
  });

  it('дає рядку кнопку доповнення, яка несе лише id картки', () => {
    expect(source).toContain("navigate('/matching/create-profile', { state: { enrichCardId: user.userId } })");
    // Адмін правит картку олівцем, тож другої кнопки з тим самим наслідком
    // у його рядку немає.
    expect(source).toContain('onEnrich={!isAdmin && access.canCreateProfiles ? handleRowEnrichProfile : undefined}');
    expect(source).toContain("user.__profileMutationOperation === 'create'");
    expect(source).toContain('onEnrich={!isAdmin && access.canCreateProfiles ? handleRowEnrichProfile : undefined}');
  });

  it('не читає картку наперед заради цієї кнопки', () => {
    // Анкету складає воронка на тому боці (`readProfileFromNodes`) — і лише
    // після натискання. Стрічка про це читання не платить.
    const handler = source.slice(
      source.indexOf('const handleRowEnrichProfile'),
      source.indexOf('const handleRowEditProfile'),
    );
    expect(handler).toContain('saveScrollPosition();');
    expect(handler).not.toContain('await ');
    expect(handler).not.toContain('fetchUserById');
  });
});
