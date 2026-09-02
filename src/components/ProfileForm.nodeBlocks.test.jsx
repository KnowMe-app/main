import { fireEvent, render, screen } from '@testing-library/react';

/**
 * Форма анкети малює поля блоками — по вузлу бекенду, у якому вони лежать.
 *
 * Перевіряється тут те, що видно на екрані, а не текст модуля: блок згортається,
 * підписаний він адресою вузла (без id анкети — він однаковий у всіх блоків),
 * той самий вузол не з'являється двічі, а прізвище стоїть під імʼям.
 */
jest.mock('./config', () => ({
  auth: { currentUser: { uid: 'admin-uid' } },
  database: {},
}));

jest.mock('firebase/database', () => ({
  get: jest.fn(async () => ({ exists: () => false, val: () => null })),
  ref: jest.fn(() => ({})),
}));

jest.mock('./smallCard/actions', () => ({ removeField: jest.fn() }));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const { ProfileForm } = require('./ProfileForm');

// Форма скидає стан оверлеїв ефектом, залежним від самого обʼєкта правок, тож
// новий `{}` на кожен рендер зациклив би її. Тут він один на всі рендери.
const NO_OVERLAY_ADDITIONS = {};

const renderForm = (props = {}) => render(
  <ProfileForm
    state={{ userId: 'AC00042', name: 'Анна', surname: 'Коваленко', ...props.state }}
    overlayFieldAdditions={NO_OVERLAY_ADDITIONS}
    setState={jest.fn()}
    handleBlur={jest.fn()}
    handleSubmit={jest.fn()}
    handleClear={jest.fn()}
    handleDelKeyValue={jest.fn()}
    isAdmin
    {...props}
  />,
);

const blockToggles = () => screen.getAllByRole('button', { expanded: true })
  .concat(screen.getAllByRole('button', { expanded: false }));

const blockNames = () => blockToggles().map(toggle => toggle.textContent.replace(/\d+$/, ''));

const fieldNames = () => screen.getAllByRole('textbox').map(input => input.getAttribute('name'));

const hasField = name => fieldNames().includes(name);

describe('блоки форми анкети', () => {
  beforeEach(() => localStorage.clear());

  it('підписує блок вузлом без id анкети', () => {
    renderForm();

    const names = blockNames();
    expect(names).toContain('▾profileContacts');
    expect(names.some(name => name.includes('AC00042'))).toBe(false);
    // Назви словами більше немає: підпис у блоку один, і це адреса вузла.
    expect(screen.queryByText('Контакти')).toBeNull();
  });

  it('не малює profileTechnical двічі — права доступу живуть у тому самому вузлі', () => {
    renderForm({ canManageAccessLevel: true });

    const technicalBlocks = blockNames().filter(name => name.includes('profileTechnical'));
    expect(technicalBlocks).toHaveLength(1);
  });

  it('ставить прізвище під імʼям, а не в іншому блоці', () => {
    renderForm();

    expect(fieldNames().filter(name => ['name', 'surname'].includes(name)))
      .toEqual(['name', 'surname']);
    // Інпут стоїть у картці стрічки, а значення лежить у `profileDetails` —
    // і поле про це каже саме над собою, окремим підписом (не заголовком блоку).
    expect(screen.getByText('profileDetails', { selector: 'p' })).toBeTruthy();
  });

  it('згортає блок і лишає вибір на наступне відкриття форми', () => {
    const { unmount } = renderForm();

    const contactsToggle = blockToggles().find(toggle => toggle.textContent.includes('profileContacts'));
    expect(hasField('phone')).toBe(true);

    fireEvent.click(contactsToggle);
    expect(hasField('phone')).toBe(false);

    unmount();
    renderForm();
    expect(hasField('phone')).toBe(false);
  });

  it('розгортає згорнутий блок, коли в ньому є чужа пропозиція', () => {
    renderForm();
    fireEvent.click(blockToggles().find(toggle => toggle.textContent.includes('profileContacts')));
    expect(hasField('phone')).toBe(false);

    renderForm({ overlayFieldAdditions: { phone: '+380671112233' } });
    expect(hasField('phone')).toBe(true);
  });
});
