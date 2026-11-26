import fs from 'fs';
import path from 'path';

// Донорки й СМ за посиланням `/anketa` заповнюють анкету без форми входу, а
// акаунт створюють у кінці. Раніше так працював сам `/my-profile`, доки межа
// входу (`RequireAuth`) не почала відвозити гостя на `/login`: кандидатка
// бачила «реєстрацію й паролі» замість анкети й кидала посилання.
describe('«Мій профіль» як гостьова анкета для кандидаток', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('вмикається пропом і лише для гостя', () => {
    expect(source).toContain('export const MyProfile = ({ candidate = false } = {}) => {');
    expect(source).toContain('const candidateGuest = candidate && !isProfileAccessConfirmed;');
  });

  it('питає спершу, ким людина хоче стати, і лише з двох ролей', () => {
    expect(source).toContain('{candidateGuest ? candidateRoleCard : <RoleCard');
    expect(source).toContain('{CANDIDATE_ANKETA_ROLES.map(role => (');
    // Поки роль не обрано, питань анкети немає: вони залежать від ролі.
    expect(source).toContain('{candidateGuest && !candidateRole ? null : visibleSections.map(section => {');
  });

  // Гість не має акаунта: фото не завантажиш (Storage пускає лише власника
  // теки), а публікувати нема чого. Крок збереження стоїть замість публікації.
  it('ставить «Зберегти анкету» в кінець замість фото й публікації', () => {
    expect(source).toContain('{candidate ? null : guestAuthCard}');
    expect(source).toContain('{candidateGuest ? null : <PhotoSection');
    expect(source).toContain("{candidateGuest ? (candidateRole ? guestAuthCard : null) : <SubmitWrap id={sectionAnchorId('publish')}");
  });

  // Набране їде в нову анкету тим самим кроком, що й завжди: чернетка
  // (`draftProfileData`) — у `buildAuthProfilePayload` разом з роллю.
  it('зберігає набране тим самим `handleAuthConfirm`', () => {
    const confirmBody = source.slice(source.indexOf('const handleAuthConfirm = async () => {'), source.indexOf('const saveState = ('));
    expect(confirmBody).toContain('extraProfileData: draftProfileData,');
    expect(source).toContain('onClick={handleAuthConfirm} data-testid="my-profile-auth-submit"');
  });
});
