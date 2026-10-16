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
    expect(source).toContain("state.publish === true ? 'Опублікована' : (isLikedAudience ? 'Лише вподобаним' : 'Не опублікована')");
  });

  // Публікація «лише для вподобаних» — свідомий обмін анонімності на кількість
  // пропозицій, тож застереження стоїть поруч із кнопкою, а не тостом після.
  it('offers liked-only publication with the caveat next to the button', () => {
    const card = source.slice(source.indexOf('data-testid="publish-card"'), source.indexOf('</SubmitWrap>'));
    expect(card).toContain('canOfferLikedAudience ? (');
    // Кнопка не вмикає режим сама — спершу модалка з підтвердженням.
    expect(card).toContain('onClick={requestLikedAudiencePublication}');
    expect(card).toContain("'Опублікувати лише для тих, кого я вподобала'");
    expect(card).toContain('Так більше анонімності, але менше пропозицій');
    expect(card).toContain('Для всіх інших її не буде ні в стрічці, ні в пошуку.');
  });

  // Нові агенції, клініки й батьки анкети не бачать, доки донорка їх не
  // вподобає, — і це треба сказати до рішення, з явним «OK» або «Відмінити».
  it('asks to confirm liked-only publication and explains new agencies will not see it', () => {
    const modal = source.slice(source.indexOf('data-testid="liked-audience-confirm"'), source.indexOf(') : clearRoleTarget ? ('));
    expect(modal).toContain('Нові агенції, клініки й біологічні батьки зʼявляються в застосунку постійно.');
    expect(modal).toContain('доки ви самі їх не вподобаєте');
    expect(modal).toContain('час від часу заходьте в застосунок');
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

  it('keeps the failed login status for profiles without confirmed access', () => {
    expect(source).toContain("uiText('Логін не відбувся', language)");
  });
});
