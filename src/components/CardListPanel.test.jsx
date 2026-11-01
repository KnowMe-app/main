import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CardListPanel, describeCardListStatus } from './CardListPanel';
import { SearchFilters, ADMIN_FILTER_GROUPS, buildAdminFilterChips } from './SearchFilters';
import { getDefaultFilters } from './FilterPanel';
import { resolveCardListSelection } from 'utils/cardListCollections';

jest.mock('../hooks/useAppSettings', () => ({
  useAppSettings: () => ({ language: 'uk' }),
}));

// Панель «Списку» на `AddNewProfile`. Тут стояли ряд чіпів-добірок і шухляда
// «Сортування» з п'ятьма групами, а ті самі «Обрані» були трьома різними
// кнопками. Тест стереже, що на екрані три питання — що показати, порядок і
// фільтри — і кожна колекція стоїть рівно в одному місці.
const renderPanel = (props = {}) => {
  const onSelect = jest.fn();
  const onRefresh = jest.fn();
  const utils = render(
    <CardListPanel
      selection={resolveCardListSelection({ field: 'getInTouch' })}
      view="list"
      onSelect={onSelect}
      onRefresh={onRefresh}
      status={{ loading: false, count: 3, hasMore: false }}
      {...props}
    />,
  );
  return { ...utils, onSelect, onRefresh };
};

describe('CardListPanel', () => {
  it('показує колекцію, її пояснення й скільки карток', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Кому дзвонити' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('card-list-summary'))
      .toHaveTextContent('Дата дзвінка вже настала — сьогодні або раніше. Усього 3 картки.');
  });

  it('нова колекція відкривається зі своїми умовчаннями, а відкрита — оновлюється', () => {
    const { onSelect, onRefresh } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Обрані' }));
    expect(onSelect).toHaveBeenCalledWith({ collection: 'favorites' });
    fireEvent.click(screen.getByRole('button', { name: 'Кому дзвонити' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('з дублікатів чи пошуку дотик повертає ту саму колекцію з її порядком', () => {
    const selection = resolveCardListSelection({ field: 'favorite', direction: 'asc' });
    const { onSelect, onRefresh } = renderPanel({ view: 'duplicates', selection });
    fireEvent.click(screen.getByRole('button', { name: 'Обрані' }));
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(selection);
  });

  it('порядок і період — лише ті, що має колекція', () => {
    const { onSelect } = renderPanel({ selection: resolveCardListSelection({ field: 'lastAction' }) });
    const order = screen.getByRole('radiogroup', { name: 'Порядок' });
    expect(within(order).getAllByRole('radio').map(radio => radio.textContent))
      .toEqual(['Остання дія', 'Давно без дій', 'Нові акаунти', 'Останній вхід', 'Початок циклу', 'За ID картки']);
    fireEvent.click(within(order).getByRole('radio', { name: 'Нові акаунти' }));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ collection: 'all', order: 'registered' }));

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Період' })).getByRole('radio', { name: 'За 7 днів' }));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ period: 'last7' }));
  });

  it('колекція без вибору порядку не малює порожньої доріжки', () => {
    renderPanel({ selection: resolveCardListSelection({ field: 'getInTouch', missing: 'only' }) });
    expect(screen.queryByRole('radiogroup', { name: 'Порядок' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Період' })).toBeNull();
    // Неголовна колекція називає себе на кнопці «Ще», а не стоїть другим чіпом.
    expect(screen.getByRole('button', { name: /Без дати дзвінка/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('у «Ще» — лише те, чого немає на виду, з поясненнями', () => {
    const special = jest.fn();
    renderPanel({
      specialViews: [
        { key: 'cycle', label: 'Цикл', hint: 'Анкети в стимуляції.', primary: true, onSelect: jest.fn() },
        { key: 'overlays', label: 'Доповнення', hint: 'Дописане читачами.', onSelect: special },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /^Ще/ }));
    const more = screen.getByTestId('card-list-more');
    expect(within(more).queryByText('Кому дзвонити')).toBeNull();
    expect(within(more).queryByText('Цикл')).toBeNull();
    expect(within(more).getByText('Заплановані')).toBeInTheDocument();
    expect(within(more).getByText('Дата дзвінка ще попереду.')).toBeInTheDocument();
    fireEvent.click(within(more).getByText('Доповнення'));
    expect(special).toHaveBeenCalled();
  });

  it('видача пошуку не підсвічує колекцію', () => {
    renderPanel({ view: 'search', searchText: 'Марина' });
    expect(screen.getByRole('button', { name: 'Кому дзвонити' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('card-list-summary')).toHaveTextContent('Результати пошуку «Марина».');
    expect(screen.queryByRole('radiogroup', { name: 'Порядок' })).toBeNull();
  });

  it('діючий фільтр видно чіпом, і ✕ його знімає', () => {
    const onRemoveFilter = jest.fn();
    renderPanel({
      filterChips: [{ filterName: 'age', text: 'Вік: 26–30' }],
      onRemoveFilter,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Зняти фільтр «Вік: 26–30»' }));
    expect(onRemoveFilter).toHaveBeenCalledWith('age');
  });

  it('стан словами', () => {
    expect(describeCardListStatus({ loading: true, count: 0 })).toBe('Завантажуємо…');
    expect(describeCardListStatus({ count: 0, hasMore: false })).toBe('Карток немає.');
    expect(describeCardListStatus({ count: 0, hasMore: true })).toBe('На цій сторінці нічого — далі є ще.');
    expect(describeCardListStatus({ count: 40, hasMore: true })).toBe('Завантажено 40 — є ще.');
    expect(describeCardListStatus({ count: 21 })).toBe('Усього 21 картка.');
    expect(describeCardListStatus({ count: 12 })).toBe('Усього 12 карток.');
  });
});

describe('фільтри картотеки адміна', () => {
  it('підписані українською, без кодів', () => {
    const labels = ADMIN_FILTER_GROUPS.flatMap(group => [group.label, ...group.options.map(option => option.label)]);
    ['LA', 'IMT', 'C-section', 'cs2+', 'pp', '∅', 'unknown format', 'Все інше', '?', 'no']
      .forEach(code => expect(labels).not.toContain(code));
  });

  it('ключі опцій збігаються з умовчаннями: збережений стан і `filterMain` їх читають', () => {
    const defaults = getDefaultFilters();
    ADMIN_FILTER_GROUPS.forEach(group => {
      expect(Object.keys(defaults[group.filterName]).sort()).toEqual(group.options.map(option => option.val).sort());
    });
  });

  it('дотик обирає те, що шукають, а не вимикає його', () => {
    const onChange = jest.fn();
    render(<SearchFilters filters={getDefaultFilters()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Група крові: 2' }));
    const next = onChange.mock.calls[0][0];
    expect(next.bloodGroup).toEqual({ 1: false, 2: true, 3: false, 4: false, other: false, empty: false });
  });

  it('службові групи згорнуті, доки в них нічого не звужено', () => {
    const { rerender } = render(<SearchFilters filters={getDefaultFilters()} onChange={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Є контакт: Телефон' })).toBeNull();
    const narrowed = { ...getDefaultFilters(), fields: { le5: true, f6_10: false, f11_20: false, f20_plus: false } };
    rerender(<SearchFilters filters={narrowed} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Заповнено полів: ≤5' })).toBeInTheDocument();
  });

  it('чіпи діючих фільтрів кажуть коротше з «кого» і «крім кого»', () => {
    const filters = {
      ...getDefaultFilters(),
      age: { ...getDefaultFilters().age, le25: false, '26_30': true, '31_33': false, '34_36': false, '37_42': false, '43_plus': false, other: false, empty: false },
      role: { ...getDefaultFilters().role, ag: false },
      rh: { ...getDefaultFilters().rh, other: false, empty: false },
    };
    expect(buildAdminFilterChips(filters).map(chip => chip.text))
      .toEqual(['Роль: крім Агенція', 'Вік: 26–30', 'Резус: лише заповнені']);
    expect(buildAdminFilterChips(getDefaultFilters())).toEqual([]);
  });
});
