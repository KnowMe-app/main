import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import SearchBar from './SearchBar';
import { detectSearchRoleIntent } from 'utils/searchRoleIntent';

beforeAll(() => {
  window.IS_REACT_ACT_ENVIRONMENT = true;
});

const enabledSearchKeys = { name: true };
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

beforeEach(() => localStorage.clear());

const mountBar = async props => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => {
    root.render(React.createElement(SearchBar, props));
    await flush();
  });
  return { container, root };
};

// Кейс 14.11: «Сурогатна мати» йшло в `searchId` як імʼя й відповідало
// «Немає доступних профілів». Перехоплене екраном не читає ні кешу, ні бази.
describe('interceptQuery', () => {
  const baseProps = () => ({
    setSearch: jest.fn(),
    setUsers: jest.fn(),
    setState: jest.fn(),
    setUserNotFound: jest.fn(),
    onSearchCommitted: jest.fn(),
    enabledSearchKeys,
    searchOptions: { enabledSearchKeys, limitedFields: true },
    searchFunc: jest.fn(async () => ({})),
    interceptQuery: query => Boolean(detectSearchRoleIntent(query)),
  });

  it('назва категорії не запускає пошуку, а видача порожня', async () => {
    const props = baseProps();
    const { container } = await mountBar({ ...props, search: 'Сурогатна мати' });
    const field = container.querySelector('textarea');
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      field.focus();
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flush();
    });
    expect(props.searchFunc).not.toHaveBeenCalled();
    expect(props.setUsers).toHaveBeenCalledWith({});
    // Запит з наміром однаково лишається в історії (`searchQueries`).
    expect(props.onSearchCommitted).toHaveBeenCalledWith('Сурогатна мати');
  });

  it('імʼя з прізвищем шукається як раніше', async () => {
    const props = baseProps();
    await mountBar({ ...props, search: 'Олена Сурогатна' });
    expect(props.searchFunc).toHaveBeenCalledWith({ name: 'Олена Сурогатна' }, expect.anything());
  });
});
