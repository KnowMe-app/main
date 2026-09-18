import fs from 'fs';
import path from 'path';
import { makeUploadedInfo } from './makeUploadedInfo';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

// Ці перевірки описують український бік екрана — мову задаємо явно.
applyUkrainianInterface();

/**
 * Дві дії з анкетою цілком, і вони різні.
 *
 * «Видалити анкету» — це лист на пошту: акаунт і сліди в чужих списках знімає
 * людина. Пункт цей із меню зник (`ProfileDotsMenu` малює секцію «Анкета»,
 * лише коли йому передали `onDeleteProfile`), і разом з ним зникла єдина
 * звідси дорога до видалення.
 *
 * «Очистити все» відповідає на інше питання — «я більше не хочу, щоб про мене
 * це знали»: поля забиваються порожніми рядками, анкета йде зі стрічки.
 */
describe('my-profile: видалення і очищення анкети', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('повертає в меню пункти «Переглянути анкету» й «Видалити анкету»', () => {
    expect(source).toContain("onDeleteProfile={() => setShowInfoModal('delProfile')}");
    expect(source).toContain("onViewProfile={() => setShowInfoModal('viewProfile')}");
  });

  it('ставить «Очистити все» поруч з «Приховати анкету», а не в меню', () => {
    const submitWrap = source.slice(source.indexOf('<SubmitWrap>'), source.indexOf('</SubmitWrap>'));

    expect(submitWrap).toContain('onClick={state.publish ? hideProfile : publishProfile}');
    expect(submitWrap).toContain("setShowInfoModal('delConfirm')");
  });

  it('питає підтвердження перед стиранням', () => {
    expect(source).toContain("uiText('Очистити анкету?', language)");
    expect(source).toContain('onClick={clearProfileFields}');
  });

  it('стирає поля й одночасно знімає публікацію', () => {
    const body = source.slice(
      source.indexOf('const clearProfileFields = async () => {'),
      source.indexOf('const renderField = (name) => {'),
    );

    expect(body).toContain('publish: false');
    expect(body).toContain("nextState[name] = ''");
    // `publish` мусить доїхати до писача навіть будучи `false` — саме він
    // перебудовує проєкцію стрічки.
    expect(body).toContain("await saveState(nextState, { directFields: ['publish'] });");
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
