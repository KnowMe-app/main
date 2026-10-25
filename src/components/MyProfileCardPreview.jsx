import React, { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import { FiChevronDown, FiEye } from 'react-icons/fi';
import { revealCss } from '../styles/revealAnimation';
import ProfileRow from './ProfileRow';
import { MatchingThemeScope } from './Matching.styled';
import { useAppSettings } from '../hooks/useAppSettings';
import { uiText } from '../utils/uiTranslations';

/*
 * «Переглянути мою анкету» — у блоці «Публікація», над кнопкою «Опублікувати».
 *
 * Картка та сама, що в стрічці (`ProfileRow`), і зібрана з того, що людина
 * щойно набрала: інакше «як мене побачать» доводилось би вгадувати, а
 * агенція, яка заповнила програми, не бачила б, що донорка з них прочитає
 * одним рядком. Нотаток і ряду рішень у прев'ю немає (`preview`): на себе не
 * реагують.
 *
 * Ролей буває дві, і кожна в стрічці — окрема картка (`previews`). Тут вони
 * стоять перемикачем, а не одна під одною: дві картки з фото на всю ширину
 * ставили саму форму на два екрани нижче.
 *
 * Стояла картка угорі сторінки й розгорнутою: на телефоні вона займала весь
 * перший екран ще до першого питання, а людина, яка відкрила «Мій профіль»
 * дописати поле, гортала повз власні фото. Тепер вона згорнута під кнопку і
 * стоїть там, де вона справді потрібна, — перед публікацією: подивитись, як
 * анкету побачать, і лише тоді її випустити (на прохання власниці продукту).
 * Розгортається щоразу наново, а не з памʼяті браузера: відкрита картка над
 * кнопкою «Опублікувати» знову відсувала б саму дію.
 */

const Wrap = styled.section`
  margin: 16px 0 0;
`;

// Тиха кнопка на всю ширину: головна дія блоку — «Опублікувати», а перегляд
// лише допомагає до неї дійти.
const Head = styled.button`
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
  gap: 10px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: var(--km-fill);
  color: var(--text, var(--km-text));
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;

  > span { flex: 1 1 auto; }
  &:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--km-accent-ring); }
`;

// Лінійний шеврон, як у решти розкривних блоків: символ «▼» шрифту був
// єдиним суцільним трикутником на екрані й стояв жирнішим за сам підпис.
const Caret = styled(FiChevronDown)`
  flex: 0 0 auto;
  transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
`;

// Перемикач, яку з анкет показати, — доріжка з білим вибраним сегментом,
// та сама, що в колекціях стрічки: це вибір «яку з», а не ще одна роль.
const Tabs = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  margin: 12px 0 0;
  padding: 3px;
  border-radius: 12px;
  background: var(--km-fill);
`;

const Tab = styled.button`
  min-height: 34px;
  padding: 0 12px;
  border-radius: 9px;
  border: 0;
  background: ${({ $active }) => ($active ? 'var(--card, var(--km-card))' : 'transparent')};
  box-shadow: ${({ $active }) => ($active ? '0 1px 2px rgba(28, 27, 26, 0.12)' : 'none')};
  color: ${({ $active }) => ($active ? 'var(--text, var(--km-text))' : 'var(--muted, var(--km-muted))')};
  font: inherit;
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  cursor: pointer;
`;

const Frame = styled(MatchingThemeScope)`
  max-width: 460px;
  margin: 12px auto 0;
  border-radius: 18px;
`;

// Розгорнуте прев'ю зʼявляється тією самою анімацією, що й решта розкривних
// блоків анкети (`styles/revealAnimation`).
const Reveal = styled.div`
  ${revealCss}
`;

export const MyProfileCardPreview = ({ previews = [], language, rates, displayCurrency, onDisplayCurrencyChange }) => {
  const { themeMode } = useAppSettings();
  const [open, setOpen] = useState(false);
  const [activeRole, setActiveRole] = useState('');
  // «Детальніше» в прев'ю розгортає ту саму анкету, що й у стрічці.
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setExpanded(previous => !previous), []);
  const programsContext = useMemo(() => ({
    viewerType: '',
    facts: null,
    rates,
    displayCurrency,
    onDisplayCurrencyChange,
  }), [displayCurrency, onDisplayCurrencyChange, rates]);
  const active = previews.find(item => item.role === activeRole) || previews[0];
  if (!active) return null;

  return (
    <Wrap data-testid="my-profile-card-preview">
      <Head type="button" aria-expanded={open} onClick={() => setOpen(previous => !previous)}>
        <FiEye size={18} aria-hidden="true" />
        <span>{uiText(open ? 'Сховати перегляд анкети' : 'Переглянути мою анкету', language)}</span>
        <Caret $open={open} size={18} aria-hidden="true" />
      </Head>
      {open ? (
        <Reveal>
          {previews.length > 1 ? (
            <Tabs role="tablist">
              {previews.map(item => (
                <Tab
                  key={item.role}
                  type="button"
                  role="tab"
                  aria-selected={item.role === active.role}
                  $active={item.role === active.role}
                  onClick={() => setActiveRole(item.role)}
                >
                  {uiText(item.label, language)}
                </Tab>
              ))}
            </Tabs>
          ) : null}
          <Frame $themeMode={themeMode}>
            <ProfileRow
              key={active.role}
              user={active.card}
              programsContext={programsContext}
              preview
              canViewContacts={false}
              expanded={expanded}
              onToggleExpand={toggleExpanded}
            />
          </Frame>
        </Reveal>
      ) : null}
    </Wrap>
  );
};

export default MyProfileCardPreview;
