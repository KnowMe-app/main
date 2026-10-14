import { resolveMyProfileFieldText, resolveMyProfileSectionTitle } from '../myProfileRoleTexts';

describe('«Мій профіль» говорить мовою ролі', () => {
  it('агенція вписує назву, а не імʼя, і контактну особу, а не прізвище', () => {
    expect(resolveMyProfileFieldText('name', 'ag').label).toBe('Назва агенції');
    expect(resolveMyProfileFieldText('surname', 'ag').label).toBe('Контактна особа');
    expect(resolveMyProfileFieldText('name', 'cl').label).toBe('Назва клініки');
  });

  // Поле стоїть усередині розділу «Кого шукаєте», тож назва розділу в його
  // підписі не повторюється: «Кого шукаєте» двічі поспіль і було дублем.
  // Побажання до зовнішності тепер чіпи, а група крові й зріст — вимоги
  // програми, тож вільний текст батьків — це «Про нас».
  it('біологічні батьки пишуть «Про нас» у розділі «Кого шукаєте»', () => {
    expect(resolveMyProfileFieldText('moreInfo_main', 'ip').label).toBe('Про нас');
    expect(resolveMyProfileSectionTitle('lifestyle', 'ip', '🌿 Спосіб життя')).toBe('📝 Кого шукаєте');
  });

  it('підказки не схожі на введене значення', () => {
    expect(resolveMyProfileFieldText('name', 'ed').placeholder).toMatch(/^Наприклад: /);
    expect(resolveMyProfileFieldText('phone', 'ag').placeholder).toMatch(/^Наприклад: /);
    expect(resolveMyProfileFieldText('name', 'ed').label).toBeUndefined();
  });

  it('донорка бачить свої розділи як були', () => {
    expect(resolveMyProfileSectionTitle('lifestyle', 'ed', '🌿 Спосіб життя')).toBe('🌿 Спосіб життя');
    expect(resolveMyProfileSectionTitle('lifestyle', '', '🌿 Спосіб життя')).toBe('🌿 Спосіб життя');
  });

  it('в інших ролях «Спосіб життя» з одним «Про себе» зветься «Про себе»', () => {
    expect(resolveMyProfileSectionTitle('lifestyle', 'sm', '🌿 Спосіб життя')).toBe('📝 Про себе');
    expect(resolveMyProfileSectionTitle('personal', 'sm', '👤 Особисті дані')).toBe('👤 Особисті дані');
  });

  it('сурогатну маму медичний розділ питає про вагітності', () => {
    expect(resolveMyProfileSectionTitle('medical', 'sm', '🏥 Медична інформація')).toBe('🤰 Здоровʼя й вагітності');
    expect(resolveMyProfileSectionTitle('medical', 'ed', '🏥 Медична інформація')).toBe('🏥 Медична інформація');
  });
});
