const React = require('react');
const ReactDOMServer = require('react-dom/server');
require('@testing-library/jest-dom');

// Mock unrelated components to isolate fieldContacts rendering
jest.mock('../btnDel', () => ({ btnDel: () => null }));
jest.mock('../btnExport', () => ({ btnExport: () => null }));
jest.mock('../fieldDeliveryInfo', () => ({ fieldDeliveryInfo: () => null }));
jest.mock('../fieldWritter', () => ({ fieldWriter: () => null }));
jest.mock('../fieldGetInTouch', () => ({ fieldGetInTouch: () => null }));
jest.mock('../fieldRole', () => ({ fieldRole: () => null }));
jest.mock('../fieldLastCycle', () => ({ fieldLastCycle: () => null }));
jest.mock('../FieldComment', () => ({ FieldComment: () => null }));
jest.mock('../btnToast', () => ({ BtnToast: () => null }));
jest.mock('../fieldBirth', () => ({ fieldBirth: () => null }));
jest.mock('../fieldBlood', () => ({ fieldBlood: () => null }));
jest.mock('../fieldMaritalStatus', () => ({ fieldMaritalStatus: () => null }));
jest.mock('../fieldIMT', () => ({ fieldIMT: () => null }));
jest.mock('components/inputValidations', () => ({ formatDateToDisplay: () => null }));
jest.mock('../../normalizeLocation', () => ({ normalizeRegion: () => null }));

const { renderTopBlock } = require('../renderTopBlock');

describe('renderTopBlock contact icons', () => {
  it('renders TikTok and VK icons when corresponding links are provided', () => {
    const userData = {
      userId: '1',
      userRole: 'ag',
      tiktok: 'toktok',
      vk: 'vkuser',
    };

    const html = ReactDOMServer.renderToString(
      renderTopBlock(
        userData,
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        false,
        {},
        jest.fn(),
        {},
        jest.fn(),
        null,
        jest.fn(),
        false,
        jest.fn()
      )
    );

    const container = document.createElement('div');
    container.innerHTML = html;

    const tiktokLink = container.querySelector('a[href="https://www.tiktok.com/@toktok"]');
    const vkLink = container.querySelector('a[href="https://vk.com/vkuser"]');

    expect(tiktokLink).not.toBeNull();
    expect(vkLink).not.toBeNull();
    expect(tiktokLink?.closest('div')?.querySelector('strong svg')).not.toBeNull();
    expect(vkLink?.closest('div')?.querySelector('strong svg')).not.toBeNull();
  });
});
