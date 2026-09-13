import React from 'react';
import styled from 'styled-components';
import { FaChevronLeft } from 'react-icons/fa';

/**
 * Кругла стрілка «назад» — той самий візуал, що вже стоїть у шарі деталей
 * стрічки (`DetailCloseButton` у `Matching.styled.jsx`): 35 px, коло, шеврон
 * ліворуч. Повторена окремим компонентом навмисно — щоб екрани поза стрічкою
 * не заводили собі третій вигляд повернення, а читач упізнавав жест, не
 * читаючи підпису.
 *
 * Палітра тут `--km-*`: саме її визначають сторінки анкет, і саме на них цей
 * компонент стоїть. Значення за замовчуванням тримають кнопку видимою навіть
 * там, де змінних ще немає.
 */
const Button = styled.button`
  width: 35px;
  height: 35px;
  flex: 0 0 35px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--km-border, #d9d2c2);
  border-radius: 50%;
  background: var(--km-card, #fff);
  color: var(--km-muted, #7a7266);
  font-size: 15px;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;

  &:hover {
    background: var(--km-accent-light, rgba(162, 121, 63, 0.12));
    border-color: var(--km-accent, #a2793f);
    color: var(--km-accent, #a2793f);
  }

  &:focus-visible {
    outline: 3px solid var(--km-accent-ring, rgba(162, 121, 63, 0.2));
    outline-offset: 2px;
    border-color: var(--km-accent, #a2793f);
  }
`;

export const BackButton = ({ onClick, label = 'Назад', className }) => (
  <Button type="button" onClick={onClick} aria-label={label} title={label} className={className}>
    <FaChevronLeft aria-hidden="true" />
  </Button>
);

export default BackButton;
