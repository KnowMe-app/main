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

  // Приклад винагороди був один на всіх — донорський, «від 1000 $», — і
  // сурогатна мама бачила суму вдесятеро меншу за свою програму. Тепер
  // винагорода — сума й валюта, тож приклад — саме число.
  it('підказка винагороди відповідає анкеті, яку заповнюють', () => {
    expect(resolveMyProfileFieldText('reward', 'ed').placeholder).toBe('Наприклад: 1000');
    expect(resolveMyProfileFieldText('reward', 'sm').placeholder).toBe('Наприклад: 15000');
    expect(resolveMyProfileFieldText('reward', 'sm', ['ag', 'sm']).placeholder).toBe('Наприклад: 15000');
    // Поле одне на обидві особисті анкети — і пояснення теж на обидві, хоч
    // би яка з ролей стояла першою.
    expect(resolveMyProfileFieldText('reward', 'ed', ['sm', 'ed']).hint).toMatch(/донацію чи програму СМ/);
    expect(resolveMyProfileFieldText('reward', 'sm', ['ed', 'sm']).hint).toMatch(/донацію чи програму СМ/);
    expect(resolveMyProfileFieldText('reward', 'sm').label).toBe('Бажана винагорода');
    expect(resolveMyProfileFieldText('reward', 'ed').hint).toMatch(/^Орієнтир за всю програму/);
  });

  it('«Про себе» сурогатної мами питає про дітей і вагітності', () => {
    expect(resolveMyProfileFieldText('moreInfo_main', 'sm').placeholder).toMatch(/вагітності/);
    // Донорка й людина з обома анкетами лишаються на загальній підказці.
    expect(resolveMyProfileFieldText('moreInfo_main', 'ed').placeholder).toMatch(/^Наприклад: /);
    expect(resolveMyProfileFieldText('moreInfo_main', 'sm', ['ed', 'sm']).placeholder).toBe(resolveMyProfileFieldText('moreInfo_main', 'ed').placeholder);
  });

  // «Про себе» необовʼязкове, і підказка каже, що саме написати й скільки.
  it('«Про себе» донорки й СМ пояснює, що варто розповісти, а організації — ні', () => {
    const hint = 'Що майбутнім батькам або агентству варто знати про вас? Достатньо 2–3 речень.';
    expect(resolveMyProfileFieldText('moreInfo_main', 'ed').hint).toBe(hint);
    expect(resolveMyProfileFieldText('moreInfo_main', 'sm').hint).toBe(hint);
    ['ag', 'cl', 'ip'].forEach(role => expect(resolveMyProfileFieldText('moreInfo_main', role).hint).toBe(''));
  });

  // `ownKids` — усі пологи, а не власні діти.
  it('пологи питає всі, і свої, і за програмою', () => {
    expect(resolveMyProfileFieldText('ownKids', 'sm').label).toBe('Скільки всього було пологів?');
    expect(resolveMyProfileFieldText('ownKids', 'ed').hint).toMatch(/за програмою сурогатного материнства/);
    // Кесарів лишився з підписом довідника («Кесарів розтин») і числом у
    // «Своєму варіанті» — так вирішила власниця продукту.
    expect(resolveMyProfileFieldText('csection', 'sm').label).toBeUndefined();
    expect(resolveMyProfileFieldText('csection', 'sm').detailPlaceholder).toBe('Наприклад: 3');
    expect(resolveMyProfileFieldText('maritalStatus', 'ed').detailPlaceholder).toBe('Наприклад: у процесі розлучення');
  });

  it('поле «Детальніше» підказує, що описати, а не «свій варіант»', () => {
    ['healthComplications', 'surgeries', 'allergy', 'chronicDiseases', 'maritalStatus', 'smoking', 'alcohol', 'csection']
      .forEach(name => expect(resolveMyProfileFieldText(name, 'sm').detailPlaceholder).toMatch(/^Наприклад: /));
    expect(resolveMyProfileFieldText('eyeColor', 'ed').detailPlaceholder).toBeUndefined();
  });

  it('сурогатну маму медичний розділ питає про вагітності', () => {
    expect(resolveMyProfileSectionTitle('medical', 'sm', '🏥 Медична інформація')).toBe('🤰 Здоровʼя й вагітності');
    expect(resolveMyProfileSectionTitle('medical', 'ed', '🏥 Медична інформація')).toBe('🏥 Медична інформація');
  });
});
