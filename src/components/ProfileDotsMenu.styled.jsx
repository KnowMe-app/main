import styled from 'styled-components';

/*
 * Рядок меню трьох крапок — значок, підпис, пояснення.
 *
 * Жили ці примітиви всередині `ProfileDotsMenu.jsx`, і через це кнопка
 * підтвердження пошти — єдиний рядок меню з іншого файлу — малювала себе
 * по-своєму: суцільна жовтогаряча плашка на всю ширину серед білих рядків зі
 * значками. І не лише вигляд: вона стояла в обгортці, тож сусідський селектор
 * `& + &`, який розсуває рядки, до наступного рядка не досягав уже ніколи —
 * і «Вийти» ліплось просто під кнопкою без відступу. Тепер перелік одних і тих
 * самих `MenuItem`, і відступ між ними ставиться сам.
 */

export const MenuItem = styled.button`
  width: 100%;
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid ${({ $active, $danger }) => ($danger ? 'var(--km-danger-border)' : $active ? 'var(--km-accent)' : 'transparent')};
  border-radius: var(--km-radius);
  background: ${({ $active, $danger }) => ($danger ? 'var(--km-danger-bg)' : $active ? 'var(--km-accent-light)' : 'var(--km-card)')};
  color: ${({ $danger }) => ($danger ? 'var(--km-danger)' : 'var(--km-text)')};
  cursor: pointer;
  text-align: left;
  transition: transform 0.18s ease, border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;

  & + & {
    margin-top: 6px;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ $danger }) => ($danger ? 'var(--km-danger-border)' : 'var(--km-accent-mid)')};
    background: ${({ $danger }) => ($danger ? 'var(--km-danger-bg)' : 'var(--km-accent-light)')};
    box-shadow: 0 8px 22px rgba(26, 26, 26, 0.08);
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ $danger }) => ($danger ? 'var(--km-danger)' : 'var(--km-accent)')};
    box-shadow: 0 0 0 3px ${({ $danger }) => ($danger ? 'rgba(180, 35, 24, .14)' : 'var(--km-accent-ring)')};
  }

  &:active {
    transform: scale(0.99);
  }

  /* Рядок, який зараз не натиснеш (пошта чекає на повторний лист),
   * мусить й виглядати ненатисканним, а не підстрибувати під пальцем. */
  &:disabled {
    cursor: default;
    opacity: 0.66;
  }

  &:disabled:hover {
    transform: none;
    box-shadow: none;
  }
`;

export const ItemIcon = styled.span`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: ${({ $danger }) => ($danger ? 'var(--km-danger-bg)' : 'var(--km-accent-light)')};
  color: ${({ $danger }) => ($danger ? 'var(--km-danger)' : 'var(--km-accent)')};
  font-size: 15px;
`;

export const ItemLabel = styled.span`
  display: block;
  font-size: 14px;
  font-weight: 800;
`;

export const ItemDescription = styled.span`
  display: block;
  margin-top: 2px;
  color: var(--km-muted);
  font-size: 11px;
  line-height: 1.35;
`;

