import React from 'react';
import fs from 'fs';
import path from 'path';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MatchingFilterRail } from './MatchingFilterRail';
import { MATCHING_FILTER_GROUPS } from './SearchFilters';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

// Сюїта описує український бік екрана — мову задаємо явно.
applyUkrainianInterface();

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

const allOn = group => group.options.reduce((acc, option) => ({ ...acc, [option.val]: true }), {});
const defaultFilters = () => MATCHING_FILTER_GROUPS.reduce(
  (acc, group) => ({ ...acc, [group.filterName]: allOn(group) }),
  {},
);

const setup = (props = {}) => {
  const onOpenGroup = jest.fn();
  const onResetGroup = jest.fn();
  const onResetAll = jest.fn();
  const onApply = jest.fn();
  render(
    <MatchingFilterRail
      filters={props.filters || defaultFilters()}
      language="uk"
      openGroup={props.openGroup || null}
      onOpenGroup={onOpenGroup}
      onResetGroup={onResetGroup}
      onResetAll={onResetAll}
      onApply={onApply}
      applyCount={props.applyCount ?? 12}
      countsNote={props.countsNote || ''}
    >
      <div data-testid="filter-panel" />
    </MatchingFilterRail>,
  );
  return { onOpenGroup, onResetGroup, onResetAll, onApply };
};

describe('рейка фільтрів', () => {
  it('називає кожну групу, а не лише звужені', () => {
    // Ряд активних чіпів умів рівно одне — знімати групу. Що ще можна звузити,
    // було видно тільки у відкритій шухляді, тобто інструмент називав себе
    // лише тому, хто ним уже скористався.
    setup();
    MATCHING_FILTER_GROUPS.forEach(group => {
      expect(screen.getByText(group.label)).toBeTruthy();
    });
  });

  it('ставить звужені групи першими — ряд прокручується, і хвіст не видно', () => {
    const filters = defaultFilters();
    // Країна — остання група в переліку, тобто та, яку на екрані телефона
    // видно найменше.
    filters.country = { ...filters.country, other: false, unknown: false };
    setup({ filters });

    const labels = screen.getAllByRole('button')
      .map(button => button.textContent)
      .filter(text => text && text !== '✕');
    expect(labels[0]).toContain('Країна');
  });

  it('незаймана група не пропонує хрестика — знімати з неї нема чого', () => {
    setup();
    expect(screen.queryByTitle('Скинути групу «Вік»')).toBeNull();
  });

  it('звужена група показує підпис звуження і знімається хрестиком', () => {
    const filters = defaultFilters();
    filters.age = { ...filters.age, le25: false };
    const { onResetGroup } = setup({ filters });

    expect(screen.getByText('Вік: крім ≤25')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Скинути групу «Вік»'));
    expect(onResetGroup).toHaveBeenCalledWith('age');
  });

  it('«Скинути все» з’являється лише від двох звужених груп', () => {
    const one = defaultFilters();
    one.age = { ...one.age, le25: false };
    setup({ filters: one });
    expect(screen.queryByText('Скинути все')).toBeNull();
    cleanup();

    const two = defaultFilters();
    two.age = { ...two.age, le25: false };
    two.rh = { ...two.rh, '-': false };
    const { onResetAll } = setup({ filters: two });
    fireEvent.click(screen.getByText('Скинути все'));
    expect(onResetAll).toHaveBeenCalled();
  });

  it('тап по чіпу відкриває саме цю групу', () => {
    const { onOpenGroup } = setup();
    fireEvent.click(screen.getByTitle('Налаштувати: Вік'));
    expect(onOpenGroup).toHaveBeenCalledWith('age');
  });

  it('повторний тап по відкритій групі закриває її', () => {
    const { onOpenGroup } = setup({ openGroup: 'age' });
    fireEvent.click(screen.getByTitle('Налаштувати: Вік'));
    expect(onOpenGroup).toHaveBeenCalledWith(null);
  });

  it('закриття будь-яким шляхом застосовує набране, бо скасування тут немає', () => {
    const { onApply } = setup({ openGroup: 'age' });
    fireEvent.click(screen.getByText('Показати 12'));
    expect(onApply).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it('тримає панель фільтрів змонтованою й із закритим поповером', () => {
    // У ній живуть самі фільтри, їхнє сховище і перебір групи ролі при зміні
    // ролі читача: знята з дерева, вона б губила чернетку й ганяла ефект.
    setup();
    expect(screen.getByTestId('filter-panel')).toBeTruthy();
  });
});

/*
 * Зворотна лапка всередині шаблона `styled` мовчки зносить правила.
 *
 * Та сама родина пасток, що й `content: '\00A0·'` у `Fact`: у тегованому
 * шаблоні лапка закриває рядок — і навіть коли файл усе ще розбирається,
 * компонент приїжджає на сторінку без жодного свого правила. Ні збірка, ні
 * консоль про це не кажуть.
 */
describe('стилі рейки доїжджають до сторінки', () => {
  it('кожен шаблон рейки лишається цілим — без зворотних лапок усередині', () => {
    const styled = fs.readFileSync(path.join(__dirname, 'Matching.styled.jsx'), 'utf8');
    const rail = styled.slice(
      styled.indexOf('export const FilterRail = styled.div'),
      styled.indexOf('export const MatchingSearchStatusMessage'),
    );
    expect(rail.length).toBeGreaterThan(0);
    // У шаблонах цього блоку лапки стоять рівно парами: відкривають
    // і закривають шаблон, і жодної зайвої — ні в коментарі, ні в правилі.
    expect((rail.match(/`/g) || []).length % 2).toBe(0);
    expect(rail).toContain('border-radius: 999px;');
  });
});

describe('рейка фільтрів у Matching', () => {
  it('стоїть на першому екрані, а кнопки-лійки й шухляди немає', () => {
    const source = read('Matching.jsx');
    expect(source).toContain('<MatchingFilterRail');
    expect(source).not.toContain('FilterContainer');
    expect(source).not.toContain('FaFilter');
    expect(source).not.toContain('setShowFilters');
  });

  it('скидання фільтрів більше не зносить кеш карток', () => {
    // Єдина кнопка скидання в шухляді чистила кеш і тягла стрічку з бази
    // заново: за «покажіть усе» платили повним перезавантаженням. Скидання
    // кеша лишилось у меню трьох крапок, де воно й стояло другою копією.
    const source = read('Matching.jsx');
    const reset = source.slice(
      source.indexOf('const resetAllFilters = React.useCallback'),
      source.indexOf('const handleOpenFilterGroup'),
    );
    expect(reset).toContain('setFilterResetToken(previous => previous + 1);');
    expect(reset).not.toContain('clearMatchingCache');
  });
});
