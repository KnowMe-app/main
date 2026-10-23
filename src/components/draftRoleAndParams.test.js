const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

describe('чернетка питає роль і параметри', () => {
  const source = read('ProfileCreationWorkspace.jsx');

  it('має розділи «Хто це» й «Параметри»', () => {
    expect(source).toContain("{ key: 'role', title: 'Хто це', fields: ['role'], ownDraftOnly: true },");
    expect(source).toContain("{ key: 'params', title: 'Параметри', fields: ['height', 'weight', 'blood'], personOnly: true },");
  });

  it('параметри питає лише в людини', () => {
    const { offersSectionForCard } = require('./ProfileCreationWorkspace');
    const params = { personOnly: true, fields: ['height', 'weight', 'blood'] };
    expect(offersSectionForCard(params, {})).toBe(true);
    expect(offersSectionForCard(params, { role: 'ed' })).toBe(true);
    expect(offersSectionForCard(params, { role: 'ag' })).toBe(false);
    expect(offersSectionForCard(params, { role: 'ag', height: '170' })).toBe(true);
  });

  it('роль не пропонує ні в доповненні чужої картки, ні в спільній чернетці', () => {
    expect(source).toContain('!(section.ownDraftOnly && (overlayTarget || editingSharedDraft))');
  });

  it('чипи ролі — група, підписана заголовком розділу', () => {
    // eslint-disable-next-line no-template-curly-in-string
    expect(source).toContain("{ hideLabel: true, labelledBy: `create-section-${section.key}` }");
    expect(source).toContain('aria-labelledby={labelledBy}');
  });
});

describe('нижня панель вкладок не стрибає', () => {
  it('клавіатура лягає поверх сторінки, а не стискає її', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');
    expect(html).toContain('interactive-widget=resizes-visual');
  });

  it('висота панелі — число, а не змінна, яку ставить глобальний стиль', () => {
    const nav = read('PrimaryNavigation.jsx');
    // eslint-disable-next-line no-template-curly-in-string
    expect(nav).toContain('height: ${BOTTOM_NAV_HEIGHT}px;');
    expect(nav).not.toContain('height: var(--km-bottom-nav-h);');
  });
});

// Картка агенції, клініки чи батьків питала «ПІБ і дата народження» з
// прикладом «Марія» — тобто підказка жила в анкеті людини, а не в тій, яку
// заповнюють.
describe('чернетка організації чи батьків питає себе мовою своєї ролі', () => {
  const {
    resolveDraftAnketaRole,
    offersCreateFieldForCard,
    orderPersonalFieldsForCard,
  } = require('./ProfileCreationWorkspace');
  const personal = ['surname', 'name', 'fathersname', 'birth'];

  it('впізнає анкету за ролями картки, людина серед ролей — людська анкета', () => {
    expect(resolveDraftAnketaRole({})).toBe('');
    expect(resolveDraftAnketaRole({ role: 'sm' })).toBe('');
    expect(resolveDraftAnketaRole({ role: ['ag', 'ed'] })).toBe('');
    expect(resolveDraftAnketaRole({ role: 'ag' })).toBe('ag');
    expect(resolveDraftAnketaRole({ role: 'cl' })).toBe('cl');
    expect(resolveDraftAnketaRole({ role: ['ip', 'ag'] })).toBe('ag');
    expect(resolveDraftAnketaRole({ role: 'ip' })).toBe('ip');
  });

  it('не питає в агенції дати народження й по батькові, у батьків — ще й прізвища', () => {
    const agency = { role: 'ag' };
    expect(personal.filter(name => offersCreateFieldForCard(name, agency))).toEqual(['surname', 'name']);
    expect(personal.filter(name => offersCreateFieldForCard(name, { role: 'ip' }))).toEqual(['name']);
    expect(personal.filter(name => offersCreateFieldForCard(name, { role: 'sm' }))).toEqual(personal);
    // Записане значення поле лишає — інакше його не було б де стерти.
    expect(offersCreateFieldForCard('birth', { role: 'ag', birth: '1980-01-01' })).toBe(true);
  });

  it('назва організації стоїть першою, ПІБ людини — у звичному порядку', () => {
    expect(orderPersonalFieldsForCard(personal, { role: 'ag' })).toEqual(['name', 'surname', 'fathersname', 'birth']);
    expect(orderPersonalFieldsForCard(personal, { role: 'ed' })).toEqual(personal);
  });

  it('підпис, приклад і назва розділу — ті самі, що в «Моєму профілі»', () => {
    const source = read('ProfileCreationWorkspace.jsx');
    expect(source).toContain('resolveMyProfileFieldText(fieldName, draftAnketaRole)');
    expect(source).toContain("resolveMyProfileSectionTitle('personal', draftAnketaRole, section.title)");
  });
});
