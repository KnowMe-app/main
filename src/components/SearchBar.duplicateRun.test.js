import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import SearchBar from './SearchBar';

beforeAll(() => {
  window.IS_REACT_ACT_ENVIRONMENT = true;
});

const enabledSearchKeys = { name: true };
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

beforeEach(() => localStorage.clear());

// Заміряно наживо 13.11: набір + Enter запускали той самий пошук двічі (Enter
// одразу, а таймер debounce — слідом), і другий, як новіший, читав усі
// знайдені картки заново: «Ольга» коштувала 1026 читань і 30 с замість 538.
describe('той самий запит не шукається двічі', () => {
  it('Enter, таймер debounce і blur дають один пошук у бекенді', async () => {
    let resolveSearch;
    const searchFunc = jest.fn(() => new Promise(resolve => { resolveSearch = resolve; }));
    const props = {
      setSearch: jest.fn(),
      setUsers: jest.fn(),
      setState: jest.fn(),
      setUserNotFound: jest.fn(),
      enabledSearchKeys,
      searchOptions: { enabledSearchKeys, limitedFields: true },
      debounceMs: 10,
      searchFunc,
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.render(React.createElement(SearchBar, { ...props, search: '' }));
    });
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.render(React.createElement(SearchBar, { ...props, search: 'Ольга' }));
    });
    const field = container.querySelector('textarea');
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      field.focus();
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flush();
    });
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      await wait(40);
      field.blur();
      await flush();
    });

    expect(searchFunc).toHaveBeenCalledTimes(1);
    expect(searchFunc).toHaveBeenCalledWith({ name: 'Ольга' }, expect.anything());

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      resolveSearch({ a1: { userId: 'a1', name: 'Ольга' }, b2: { userId: 'b2', name: 'Ольга' } });
      await flush();
    });
    expect(props.setUsers).toHaveBeenCalledWith(expect.objectContaining({ a1: expect.anything(), b2: expect.anything() }));

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => root.unmount());
    document.body.removeChild(container);
  });
});
