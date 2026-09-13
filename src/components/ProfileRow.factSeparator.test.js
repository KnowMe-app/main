import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import * as S from './MatchingHiddenList.styled';

/**
 * Правила стилів мусять доїхати до сторінки — а це не саме собою.
 *
 * У `Fact` стояв `content: '\00A0·'`, тобто вісімкова escape-послідовність
 * усередині тегованого шаблона. JS віддає на такий шматок `undefined`,
 * styled-components порожній шматок відкидає — і **весь** набір правил
 * компонента мовчки зникав: ні розділювача між фактами, ні решти рядків.
 * Жодного попередження при цьому не було ні в збірці, ні в консолі, тож
 * помітити це можна було тільки очима на екрані.
 *
 * Тест питає саме те, що зламалось: чи є в аркуші правила для класу компонента.
 */
const cssFor = element => {
  const classes = element.className.split(' ').filter(Boolean);
  return Array.from(document.styleSheets)
    .flatMap(sheet => Array.from(sheet.cssRules).map(rule => rule.cssText))
    .filter(rule => classes.some(name => rule.includes(`.${name}`)))
    .join('\n');
};

describe('стилі рядка метрик доїжджають до сторінки', () => {
  it('факт має власні правила, а не порожній клас', () => {
    render(<S.Fact data-testid="fact">172/59</S.Fact>);
    expect(cssFor(screen.getByTestId('fact'))).toContain('white-space: nowrap');
  });

  it('між фактами стоїть вертикальна риска', () => {
    render(<S.Fact data-testid="fact">172/59</S.Fact>);
    const rules = cssFor(screen.getByTestId('fact'));

    // Риска — намальована, а не текстова: ширина в піксель і власний фон.
    expect(rules).toMatch(/::after/);
    expect(rules).toContain('width: 1px');
    // Останньому факту в рядку відділяти нема від чого.
    expect(rules).toMatch(/:last-child::after\s*\{[^}]*display: none/);
  });
});
