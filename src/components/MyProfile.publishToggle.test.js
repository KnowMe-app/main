import fs from 'fs';
import path from 'path';
import {
  MATCHING_CARD_FEED_FIELD,
  buildMatchingCardProjection,
} from '../utils/matchingCardIndex';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

// Ці перевірки описують український бік екрана — мову задаємо явно.
applyUkrainianInterface();

describe('my-profile publication toggle', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('persists publish=false as a direct boolean when hiding the profile', () => {
    const hideProfileBody = source.slice(
      source.indexOf('const hideProfile = async () => {'),
      source.indexOf('const renderField = (name) => {')
    );

    expect(hideProfileBody).toContain('publish: false, publishAudience: null');
    expect(hideProfileBody).toContain("await saveState(nextState, { directFields: ['publish', 'publishAudience'] });");
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

  // «Зняти з публікації» — не головна дія: та сама кнопка з помаранчевим
  // градієнтом лишається за «Опублікувати», а зняття — рамкою.
  it('shows the action matching the current publication state', () => {
    const card = source.slice(source.indexOf('data-testid="publish-card"'), source.indexOf('</SubmitWrap>'));
    expect(card).toContain("<UnpublishBtn type=\"button\" onClick={hideProfile}>{uiText('Зняти з публікації', language)}</UnpublishBtn>");
    expect(card).toContain("<SubmitBtn type=\"button\" onClick={publishProfile}>{uiText('Опублікувати анкету', language)}</SubmitBtn>");
    expect(card).toContain('isPublished ? (');
  });

  it('uses the current publish state for the profile status marker', () => {
    expect(source).toContain('$published={state.publish === true || isLikedAudience}');
    expect(source).toContain("state.publish === true ? 'Опублікована' : (isLikedAudience ? 'Лише обраним' : 'Не опублікована')");
  });

  // Публікація «лише для вподобаних» — свідомий обмін анонімності на кількість
  // пропозицій, тож застереження стоїть поруч із кнопкою, а не тостом після.
  it('offers liked-only publication with the caveat next to the button', () => {
    const card = source.slice(source.indexOf('data-testid="publish-card"'), source.indexOf('</SubmitWrap>'));
    expect(card).toContain('canOfferLikedAudience ? (');
    // Кнопка не вмикає режим сама — спершу модалка з підтвердженням.
    expect(card).toContain('onClick={requestLikedAudiencePublication}');
    expect(card).toContain('isPublished ? likedTexts.restrictButton : likedTexts.publishButton');
    expect(card).toContain('uiText(likedTexts.offer, language)');
    expect(card).toContain('uiText(likedTexts.caveat, language)');
    // Слова — свої для кожного боку ринку, і в обох є ціна режиму.
    const texts = source.slice(source.indexOf('const LIKED_AUDIENCE_TEXTS'), source.indexOf('// Роль — перше рішення'));
    expect(texts).toContain("publishButton: 'Опублікувати лише для тих, кого я вподобала'");
    expect(texts).toContain('Так більше анонімності, але менше пропозицій');
    expect(texts).toContain('Для всіх інших її не буде ні в стрічці, ні в пошуку.');
    expect(texts).toContain('Анкету й програми побачать лише ті, кого ви вподобали');
    expect(texts).toContain('Так більше закритості, але менше звернень');
    expect(source).toContain('LIKED_AUDIENCE_TEXTS[resolveLikedAudienceKind(rolesList)]');
  });

  // Нові агенції, клініки й батьки анкети не бачать, доки донорка їх не
  // вподобає, — і це треба сказати до рішення, з явним «OK» або «Відмінити».
  it('asks to confirm liked-only publication and explains new agencies will not see it', () => {
    const modal = source.slice(source.indexOf('data-testid="liked-audience-confirm"'), source.indexOf(') : clearRoleTarget ? ('));
    expect(modal).toContain('uiText(likedTexts.modalNewcomers, language)');
    expect(modal).toContain('uiText(likedTexts.modalNewcomersResult, language)');
    expect(modal).toContain('час від часу заходьте в застосунок');
    const texts = source.slice(source.indexOf('const LIKED_AUDIENCE_TEXTS'), source.indexOf('// Роль — перше рішення'));
    expect(texts).toContain('Нові агенції, клініки й біологічні батьки зʼявляються в застосунку постійно.');
    expect(texts).toContain('Нові донори, сурогатні мами й біологічні батьки зʼявляються в застосунку постійно.');
    expect(texts).toContain('доки ви самі їх не вподобаєте');
    expect(modal).toContain('<ModalPrimaryButton type="button" onClick={publishToLikedAudience}>');
    expect(modal).toContain("uiText('Відмінити', language)");

    const request = source.slice(
      source.indexOf('const requestLikedAudiencePublication = async () => {'),
      source.indexOf('const publishToLikedAudience = async () => {'),
    );
    // Обовʼязкові поля — до модалки, а сам запис — лише після «OK».
    expect(request).toContain('prepareLikedAudiencePublication()');
    expect(request).toContain("setShowInfoModal('likedAudienceConfirm')");
    expect(request).not.toContain('saveState(');
  });

  it('liked-only publication hides the card from everyone in the same write', () => {
    const body = source.slice(
      source.indexOf('const publishToLikedAudience = async () => {'),
      source.indexOf('const closeLikedAudience = async () => {'),
    );
    expect(body).toContain('publish: false,');
    expect(body).toContain('publishAudience: LIKED_AUDIENCE,');
    expect(body).toContain("directFields: ['publish', 'publishAudience', 'hiddenRoles']");
    // Перевіряє, що база справді прийняла режим, і каже, коли ні.
    expect(body).toContain('readOwnCardLikedAudience(ownerUid)');
    expect(body).toContain('setOwnLikedAudienceEntries(ownerUid, true)');

    const savedState = { name: 'Олена', lastLogin2: '2026-08-19', publish: false, publishAudience: 'liked' };
    const projection = buildMatchingCardProjection('a'.repeat(28), savedState, { existingCard: { feedDate: '2026-08-19' } });
    expect(projection[MATCHING_CARD_FEED_FIELD]).toBe(false);
    expect(projection.audience).toBe('liked');
  });

  // Блок «Публікація» стоїть аж унизу, тож обмежене коло читачів нагадує
  // чіп під шапкою — і веде до того блоку.
  it('shows a chip at the top while the profile is visible to chosen ones only', () => {
    const header = source.slice(source.indexOf('<HeaderPanel>'), source.indexOf('</HeaderPanel>'));
    expect(header).toContain('isProfileAccessConfirmed && isLikedAudience ? (');
    expect(header).toContain('data-testid="liked-audience-chip" onClick={handleAuthBadgeClick}');
    expect(header).toContain("'Анкету бачать лише обрані'");
    expect(header).toContain('uiText(likedTexts.chipCount, language, { count: likedAudienceCount })');
    expect(header).toContain('$restricted={isProfileAccessConfirmed && isLikedAudience}');
  });

  // Одна анкета теж очищується з «Публікації»: кошик відкриває ту саму
  // модалку, що й меню «⋮», і стирає поля порожніми версіями.
  it('offers a trash button that clears the profile through the confirmation modal', () => {
    const single = source.slice(source.indexOf('<PublishSingleAction'), source.indexOf('</PublishSingleAction>'));
    expect(single).toContain('data-testid="publish-clear-profile"');
    expect(single).toContain("onClick={() => { setClearRoleTarget(''); setShowInfoModal('delConfirm'); }}");
    expect(single).toContain("aria-label={uiText('Очистити анкету', language)}");
    expect(source).toContain('<ModalDangerButton type="button" disabled={isClearingProfile} onClick={clearProfileFields}>');
  });

  it('keeps the heart symbol out of the liked-only texts', () => {
    const texts = source.slice(source.indexOf('const LIKED_AUDIENCE_TEXTS'), source.indexOf('// Роль — перше рішення'));
    expect(texts).not.toContain('♥');
  });

  it('keeps the failed login status for profiles without confirmed access', () => {
    expect(source).toContain("uiText('Логін не відбувся', language)");
  });
});
