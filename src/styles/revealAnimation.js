import { css, keyframes } from 'styled-components';

/*
 * Розгорнуте зʼявляється, а не вистрибує — одна анімація на всі розкривні
 * блоки анкети: програми (розділ, виплата, деталі), рядок стрічки
 * («Детальніше»), форма адміна, форма доповнення, прев'ю «Мого профілю».
 * Коротко й без зміни висоти: анімація висоти смикала б прокрутку під
 * пальцем. Ставиться лише на те, що монтується саме розгортанням, — інакше
 * блимала б уся форма на першому показі.
 */
const revealIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
`;

export const revealCss = css`
  animation: ${revealIn} 0.18s ease-out;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
