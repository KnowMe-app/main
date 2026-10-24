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

const mount = () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return {
    container,
    root,
    cleanup: async () => {
      // eslint-disable-next-line testing-library/no-unnecessary-act
      await act(async () => root.unmount());
      document.body.removeChild(container);
    },
  };
};

const baseProps = overrides => ({
  setSearch: jest.fn(),
  setUsers: jest.fn(),
  setState: jest.fn(),
  setUserNotFound: jest.fn(),
  enabledSearchKeys,
  // Обмежений пошук не ходить у кеш карток: тест про чергу запитів, а не про кеш.
  searchOptions: { enabledSearchKeys, limitedFields: true },
  ...overrides,
});

beforeEach(() => localStorage.clear());

describe('запит, який стерли', () => {
  it('відповідь на запит, стертий ззовні, до екрана не доходить', async () => {
    let resolveSearch;
    const searchFunc = jest.fn(() => new Promise(resolve => { resolveSearch = resolve; }));
    const props = baseProps({ searchFunc });
    const { container, root, cleanup } = mount();

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.render(React.createElement(SearchBar, { ...props, search: 'Харків' }));
    });
    const field = container.querySelector('textarea');

    // Так робить «Показати анкети» з картки міста: стирає запит і в тому ж
    // жесті знімає фокус, а `onBlur` ще бачить старий рядок і шукає його.
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      field.focus();
      field.blur();
      root.render(React.createElement(SearchBar, { ...props, search: '' }));
    });
    expect(searchFunc).toHaveBeenCalledWith({ name: 'Харків' }, expect.anything());
    props.setUsers.mockClear();

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      resolveSearch({ abc: { userId: 'abc', name: 'Харків' } });
      await flush();
    });
    // Доти ця видача приїжджала вже після повернення стрічки й перемикала
    // екран назад у пошук.
    expect(props.setUsers).not.toHaveBeenCalled();
    await cleanup();
  });

  it('порожній рядок таймер не шукає, а той самий запит, набраний знову, шукає', async () => {
    const searchFunc = jest.fn(async () => ({}));
    const props = baseProps({ searchFunc, debounceMs: 5 });
    const { root, cleanup } = mount();
    const renderWith = async search => {
      // eslint-disable-next-line testing-library/no-unnecessary-act
      await act(async () => {
        root.render(React.createElement(SearchBar, { ...props, search }));
      });
      // Таймер ставить ефект, а ефекти виконуються на виході з першого `act`.
      // eslint-disable-next-line testing-library/no-unnecessary-act
      await act(async () => {
        await wait(30);
        await flush();
      });
    };

    await renderWith('');
    await renderWith('Київ');
    expect(searchFunc).toHaveBeenCalledWith({ name: 'Київ' }, expect.anything());

    searchFunc.mockClear();
    props.setUsers.mockClear();
    props.setUserNotFound.mockClear();
    await renderWith('');
    // «Пошук» порожнього рядка віддавав порожню видачу, і стрічка
    // перемикалась у режим пошуку без жодного результату.
    expect(searchFunc).not.toHaveBeenCalled();
    expect(props.setUsers).not.toHaveBeenCalled();
    expect(props.setUserNotFound).not.toHaveBeenCalledWith(true);

    await renderWith('Київ');
    expect(searchFunc).toHaveBeenCalledWith({ name: 'Київ' }, expect.anything());
    await cleanup();
  });
});
