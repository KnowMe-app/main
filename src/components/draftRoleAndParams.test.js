const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

describe('чернетка питає роль і параметри', () => {
  const source = read('ProfileCreationWorkspace.jsx');

  it('має розділи «Хто це» й «Параметри»', () => {
    expect(source).toContain("{ key: 'role', title: 'Хто це', fields: ['role'], ownDraftOnly: true },");
    expect(source).toContain("{ key: 'params', title: 'Параметри', fields: ['height', 'weight', 'blood'] },");
  });

  it('роль не пропонує в доповненні чужої картки', () => {
    expect(source).toContain('!(section.ownDraftOnly && overlayTarget)');
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
