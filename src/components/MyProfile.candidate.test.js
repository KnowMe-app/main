import fs from 'fs';
import path from 'path';

// Донорки й СМ за посиланням `/anketa` починають анкету з реєстрації прямо в
// ній: роль (СМ чи донор), пошта й пароль. Раніше так працював сам
// `/my-profile`, доки межа входу (`RequireAuth`) не почала відвозити гостя на
// `/login`, і СМ не розуміла, що їй робити.
describe('«Мій профіль» як посилання для кандидаток', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');
  const confirmBody = source.slice(source.indexOf('const handleAuthConfirm = async () => {'), source.indexOf('const saveState = ('));

  it('вмикається пропом, лише для гостя й лише українською', () => {
    expect(source).toContain('export const MyProfile = ({ candidate = false } = {}) => {');
    expect(source).toContain('const candidateGuest = candidate && !isProfileAccessConfirmed;');
    expect(source).toContain("const language = candidate ? 'uk' : appLanguage;");
  });

  // Одна сторінка: роль, пошта й пароль угорі, анкета під ними, внизу одна
  // кнопка «Зберегти анкету» замість фото й публікації.
  it('ставить реєстрацію й анкету на одну сторінку з кнопкою внизу', () => {
    expect(source).toContain('{candidateGuest ? <>{candidateRoleCard}{guestAuthCard}{candidateExistingDialog}</> : <RoleCard');
    expect(source).toContain('{CANDIDATE_ANKETA_ROLES.map(role => (');
    expect(source).toContain('{candidateGuest && !candidateRole ? null : visibleSections.map(section => {');
    expect(source).toContain('{candidateGuest ? null : <PhotoSection');
    expect(source).toContain("{candidateGuest ? (candidateRole ? candidateSaveCard : null) : <SubmitWrap id={sectionAnchorId('publish')}");
  });

  // Без ролі й пошти тут вилазило два тости один над одним, а тост ролі
  // (без id) ще й множився з кожним дотиком.
  it('нагадує одним тостом, чого бракує для збереження', () => {
    expect(confirmBody).toContain("toast.error(candidateAuthReminder(miss, normalizedEmail, { telegram: Boolean(candidateTelegramNonce) }), { id: 'candidate-auth-reminder' });");
    expect(confirmBody).toContain('} else if (candidate && (miss.email || miss.password || miss.terms)) {');
    expect(source).not.toMatch(/toast\.error\(uiText\('Оберіть, ким ви хочете стати: сурогатною мамою чи донором ооцитів', language\)\);/);
  });

  // Telegram у тості — лише коли є його кнопка (збірка знає бота).
  it('не називає Telegram, якого на сторінці немає', () => {
    expect(source).toContain("const providers = telegram ? 'Telegram чи Google' : 'Google';");
    expect(source).not.toContain('увійдіть угорі через Telegram чи Google');
  });

  // «Умови» в тій самій вкладці знімали галочку згоди й стирали пароль.
  it('відкриває умови в новій вкладці', () => {
    expect(source).toContain('<TermsButton as="a" href="/policy" target="_blank" rel="noopener noreferrer"');
    expect(source).not.toContain("navigate('/policy')");
  });

  // Набране кандидаткою не губиться й тоді, коли пошта вже мала акаунт, але
  // наявних полів не переписує.
  it('у наявному акаунті дописує лише порожні поля', () => {
    expect(confirmBody).toContain('rememberCandidateDraftForExistingAccount(userCredential.user.uid, persistedProfileRef.current?.data, draftProfileData);');
  });

  // Вхід — у самій анкеті: пояснення навіщо, Telegram, Google, пошта з
  // паролем і «Продовжити» після згоди; «Зберегти анкету» внизу робить те саме.
  it('пропонує три способи входу з поясненням і кнопку «Продовжити»', () => {
    expect(source).toContain('Вхід потрібен, щоб потім виправити чи видалити свою анкету.');
    expect(source).toContain('data-testid="candidate-telegram"');
    expect(source).toContain('data-testid="candidate-google"');
    expect(source).toContain('onClick={handleAuthConfirm} disabled={authSubmitting} data-testid="candidate-continue"');
  });

  it('Google і Telegram вимагають ролі й згоди так само, як пошта', () => {
    const google = source.slice(source.indexOf('const handleCandidateGoogle = async () => {'));
    expect(google).toContain('if (authSubmitting || !checkCandidateReadyForSignIn()) return;');
    const telegram = source.slice(source.indexOf('const handleCandidateTelegram = event => {'));
    expect(telegram).toContain('if (!checkCandidateReadyForSignIn()) {');
    expect(telegram).toContain('markCandidateSignup(candidateRole);');
  });

  it('не пускає далі без ролі', () => {
    expect(confirmBody).toContain('if (candidate && !candidateRole) {');
  });

  // Наявна пошта — це вхід, а не помилка: і коли Firebase каже про метод
  // входу, і коли мовчить (захист від перебору) та відмовляє реєстрації.
  it('реєструє автоматично, а наявну пошту одразу відкриває входом', () => {
    expect(confirmBody).toContain("if (createError?.code !== 'auth/email-already-in-use') throw createError;");
    expect(confirmBody).toContain('if (accountExists) {');
    expect(confirmBody).toContain('extraProfileData: draftProfileData,');
  });

  it('на чужий пароль показує попап «анкета вже є»', () => {
    expect(confirmBody).toContain('setCandidateExistingEmail(normalizedEmail);');
    expect(source).toContain('Анкета з цією поштою вже є');
  });

  // Після входу — звичайний «Мій профіль» з меню, і лише після запису анкети.
  it('після входу веде в «Мій профіль»', () => {
    const persistAt = confirmBody.indexOf("await persistUserProfile(userCredential.user.uid, uploadedInfo, 'set');");
    const navigateAt = confirmBody.indexOf("navigate('/my-profile', { replace: true });");
    expect(persistAt).toBeGreaterThan(-1);
    expect(navigateAt).toBeGreaterThan(persistAt);
  });
});

// Telegram завершує вхід у формі входу. Наявний акаунт там раніше просто
// входив, і `markAuthSession` стирав чернетку з набраним на `/anketa`.
describe('вхід кандидатки наявним акаунтом через Telegram', () => {
  const login = fs.readFileSync(path.join(__dirname, 'LoginScreen.jsx'), 'utf8');
  const telegram = login.slice(login.indexOf('const completeTelegramAuth = async'), login.indexOf('const handleGoogleClick = async'));

  it('доливає набране в порожні поля до того, як стерти чернетку', () => {
    const rememberAt = telegram.indexOf('if (existing) rememberCandidateDraftForExistingAccount(uid, existing, candidateDraft);');
    const sessionAt = telegram.indexOf("markAuthSession({ email: '', userId: uid });");
    expect(rememberAt).toBeGreaterThan(-1);
    expect(sessionAt).toBeGreaterThan(rememberAt);
  });
});
