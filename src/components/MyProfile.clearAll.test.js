import fs from 'fs';
import path from 'path';
import { makeUploadedInfo } from './makeUploadedInfo';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

// Ці перевірки описують український бік екрана — мову задаємо явно.
applyUkrainianInterface();

/**
 * Дві дії з анкетою цілком, і вони різні.
 *
 * «Видалити анкету» — самовидалення одним дотиком з підтвердженням (Cloud
 * Function `deleteOwnAccount`), а лист на пошту лишився запасом: без входу й
 * коли функція не відповіла. Пункт цей із меню колись зник (`ProfileDotsMenu` малює секцію «Анкета»,
 * лише коли йому передали `onDeleteProfile`), і разом з ним зникла єдина
 * звідси дорога до видалення.
 *
 * «Очистити все» відповідає на інше питання — «я більше не хочу, щоб про мене
 * це знали»: поля забиваються порожніми рядками, анкета йде зі стрічки.
 *
 * Третього пункту в тій секції більше немає: «Переглянути анкету» відкривало
 * інструкцію «встановіть застосунок у Google Play», а мобільного застосунку
 * вже немає.
 */
describe('my-profile: видалення і очищення анкети', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('повертає в меню пункт «Видалити анкету» й не кличе в застосунок', () => {
    expect(source).toContain("setShowInfoModal(isProfileAccessConfirmed ? 'deleteAccount' : 'delProfile');");
    expect(source).not.toContain('viewProfile');
  });

  // Видалення — лише після модалки, і автозбереження в дорозі дочікуємо до
  // виклику: інакше воно записало б анкету назад після того, як сервер її стер.
  it('видаляє профіль лише з модалки й після черги автозбереження', () => {
    const modal = source.slice(source.indexOf('data-testid="delete-account-confirm"'), source.indexOf("showInfoModal === 'roleChange' && roleChangeTarget ? ("));
    expect(modal).toContain('onClick={deleteOwnAccount}');
    const handler = source.slice(source.indexOf('const deleteOwnAccount = async'), source.indexOf('const handleExit = async'));
    expect(handler.indexOf('saveQueueRef.current')).toBeLessThan(handler.indexOf('requestOwnAccountDeletion'));
    expect(handler).toContain('await signOut(auth)');
  });

  // Незворотна дія стояла кнопкою просто під «Опублікувати» — на відстані
  // одного промаху. Тепер вона в меню «⋮», поруч із «Видалити анкету».
  // «Очистити анкету» стоїть і в кінці «Публікації» (на прохання власниці
  // продукту), окремим рядком під способами показу й лише через модалку: один
  // промах пальцем не стирає анкету. Меню «⋮» лишається.
  it('очищує всю анкету з меню й кнопкою в кінці «Публікації» — лише через модалку', () => {
    const submitWrap = source.slice(source.indexOf('data-testid="publish-card"'), source.indexOf('</SubmitWrap>'));
    expect(submitWrap).toContain('onClick={publishProfile}');
    const clearButton = submitWrap.slice(submitWrap.indexOf('data-testid="publish-clear-profile"'), submitWrap.indexOf('</ClearAnketaList>'));
    expect(clearButton).toContain("onClick={() => { setClearRoleTarget(''); setShowInfoModal('delConfirm'); }}");
    expect(clearButton).not.toContain('clearProfileFields');

    const menu = source.slice(source.indexOf('const dotsMenu = ({ close } = {}) => ('), source.indexOf('const fieldsMap = useMemo('));
    expect(menu).toContain("onClearProfile={isProfileAccessConfirmed ? () => { setClearRoleTarget(''); setShowInfoModal('delConfirm'); } : undefined}");
  });

  it('питає підтвердження перед стиранням', () => {
    expect(source).toContain("uiText('Очистити анкету?', language)");
    expect(source).toContain('Пошта й доступ до акаунта лишаються.');
    expect(source).not.toContain('щоб видалити профіль, скористайтесь');
    expect(source).toContain('onClick={clearProfileFields}');
  });

  it('стирає поля й одночасно знімає публікацію', () => {
    const body = source.slice(
      source.indexOf('const clearProfileFields = async () => {'),
      source.indexOf('const renderField = (name) => {'),
    );

    expect(body).toContain('publish: false');
    expect(body).toContain("OBJECT_PROFILE_FIELDS.has(name) ? null : ''");
    // `publish` мусить доїхати до писача навіть будучи `false` — саме він
    // перебудовує проєкцію стрічки. Програми агенції знімаються цілком і теж
    // напряму: порожній рядок в обʼєкті — не позначка стирання, а битий запис.
    expect(body).toContain("await saveState(nextState, { directFields: ['publish', 'publishAudience', ...objectFields] });");
  });

  it('не стирає пошту — це логін, а не поле анкети', () => {
    const body = source.slice(
      source.indexOf('const clearProfileFields = async () => {'),
      source.indexOf('const renderField = (name) => {'),
    );

    expect(body).toContain('CLEAR_ALL_PROTECTED_FIELDS.has(name)');
    expect(source).toMatch(/CLEAR_ALL_PROTECTED_FIELDS = new Set\(\[[^)]*'email'/);
  });

  it('порожній рядок їде позначкою стирання, а не заміною історії', () => {
    // Саме тому стерті поля не потрапляють у `directFields`: звичайний шлях
    // збереження дописує '' останньою версією, і картка стрічки цю позначку
    // доносить (див. `projectionValue`).
    expect(makeUploadedInfo({ name: ['Оксана'] }, { name: '' }))
      .toEqual({ name: ['Оксана', ''] });
    expect(makeUploadedInfo({ city: 'Київ' }, { city: '' }))
      .toEqual({ city: ['Київ', ''] });
  });
});
