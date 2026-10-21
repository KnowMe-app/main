const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

describe('чернетка питає роль і параметри', () => {
  const source = read('ProfileCreationWorkspace.jsx');

  it('має розділи «Хто це» й «Параметри»', () => {
    expect(source).toContain("{ key: 'role', title: 'Хто це', fields: ['role'], ownDraftOnly: true },");
    expect(source).toContain("{ key: 'params', title: 'Параметри', fields: ['height', 'weight', 'blood'] },");
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
