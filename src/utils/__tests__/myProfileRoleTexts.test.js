import { resolveMyProfileFieldText, resolveMyProfileSectionTitle } from '../myProfileRoleTexts';

describe('«Мій профіль» говорить мовою ролі', () => {
  it('агенція вписує назву, а не імʼя, і контактну особу, а не прізвище', () => {
    expect(resolveMyProfileFieldText('name', 'ag').label).toBe('Назва агенції');
    expect(resolveMyProfileFieldText('surname', 'ag').label).toBe('Контактна особа');
    expect(resolveMyProfileFieldText('name', 'cl').label).toBe('Назва клініки');
  });

  it('біологічні батьки пишуть, кого шукають', () => {
    expect(resolveMyProfileFieldText('moreInfo_main', 'ip').label).toBe('Кого шукаєте');
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
});
