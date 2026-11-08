import React from 'react';
import styled, { keyframes } from 'styled-components';

// Єдиний знак очікування застосунку — лейбл «KnowMe.» зі смужкою під ним,
// той самий, що й заставка в `public/index.html`. Кружальця-спінера тут більше
// немає ніде (08.11, на прохання власниці продукту): після лейбла заставки
// він читався як другий, інший екран очікування. Новий «зачекайте» — цей
// компонент, а не свій `rotate(360deg)`.

const run = keyframes`
  from { transform: translateX(-100%); }
  to { transform: translateX(260%); }
`;

// Розміри: `screen` — на весь екран (геометрія заставки), `compact` — у
// модалці чи панелі, `inline` — у рядку тексту або на кнопці.
const SIZES = {
  screen: { font: 32, bar: 112, height: 3, gap: 18 },
  compact: { font: 20, bar: 72, height: 3, gap: 10 },
  inline: { font: 13, bar: 40, height: 2, gap: 4 },
};

const Wrap = styled.span`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ $size }) => SIZES[$size].gap}px;
  line-height: 1;
  vertical-align: middle;
`;

const Mark = styled.span`
  font-family: 'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: ${({ $size }) => SIZES[$size].font}px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: ${({ $onAccent }) => ($onAccent ? 'currentColor' : 'var(--km-text, #1a1a1a)')};

  span {
    color: ${({ $onAccent }) => ($onAccent ? 'currentColor' : 'var(--km-accent, #c9600f)')};
  }
`;

export const LoadingBar = styled.span`
  display: block;
  width: ${({ $size = 'screen' }) => SIZES[$size].bar}px;
  height: ${({ $size = 'screen' }) => SIZES[$size].height}px;
  border-radius: 3px;
  background: ${({ $onAccent }) =>
    $onAccent
      ? 'color-mix(in srgb, currentColor 30%, transparent)'
      : 'color-mix(in srgb, var(--km-accent, #c9600f) 16%, transparent)'};
  overflow: hidden;

  &::after {
    content: '';
    display: block;
    width: 40%;
    height: 100%;
    border-radius: inherit;
    background: ${({ $onAccent }) => ($onAccent ? 'currentColor' : 'var(--km-accent, #c9600f)')};
    animation: ${run} 1.1s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      width: 100%;
      opacity: 0.5;
      animation: none;
    }
  }
`;

/**
 * Лейбл очікування. `size`: 'screen' | 'compact' | 'inline'. `onAccent` —
 * на кнопці акцентного кольору (бере колір тексту кнопки). `label` —
 * текст для читачів екрана; без нього знак декоративний (`aria-hidden`),
 * і роль `status` тоді несе обгортка, що його показує.
 */
const BrandLoader = ({ size = 'screen', onAccent = false, label, className, ...rest }) => (
  <Wrap
    $size={size}
    className={className}
    data-testid="brand-loader"
    {...(label ? { role: 'status', 'aria-label': label } : { 'aria-hidden': true })}
    {...rest}
  >
    <Mark $size={size} $onAccent={onAccent}>
      KnowMe<span>.</span>
    </Mark>
    <LoadingBar $size={size} $onAccent={onAccent} />
  </Wrap>
);

export default BrandLoader;
