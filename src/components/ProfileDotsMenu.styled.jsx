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

/*
 * Рядки меню — без рамок і заливок. Кожен пункт тут колись був рожевою
 * плашкою з рамкою, і нижня половина меню (очистити, видалити, вийти)
 * читалась суцільним попередженням: «Вийти» мало ту саму вагу, що й
 * «Видалити анкету». Тепер червоним лише текст і значок незворотного, а
 * вихід — звичайний рядок.
 */
export const MenuItem = styled.button`
  width: 100%;
  min-height: 52px;
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 0;
  border-radius: 12px;
  background: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'transparent')};
  color: ${({ $danger }) => ($danger ? 'var(--km-danger)' : 'var(--km-text)')};
  cursor: pointer;
  text-align: left;
  transition: background-color 0.18s ease;

  &:hover {
    background: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'var(--km-fill)')};
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${({ $danger }) => ($danger ? 'rgba(180, 35, 24, .14)' : 'var(--km-accent-ring)')};
  }

  /* Рядок, який зараз не натиснеш (пошта чекає на повторний лист),
   * мусить й виглядати ненатисканним. */
  &:disabled {
    cursor: default;
    opacity: 0.66;
  }

  &:disabled:hover {
    background: transparent;
  }
`;

export const ItemIcon = styled.span`
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ $danger }) => ($danger ? 'var(--km-danger)' : 'var(--km-muted)')};
  font-size: 17px;
`;

export const ItemLabel = styled.span`
  display: block;
  font-size: 15px;
  font-weight: 500;
`;

export const ItemDescription = styled.span`
  display: block;
  margin-top: 2px;
  color: var(--km-muted);
  font-size: 13px;
  line-height: 1.35;
`;
