import React, { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import { revealCss } from '../styles/revealAnimation';
import ProfileRow from './ProfileRow';
import { MatchingThemeScope } from './Matching.styled';
import { useAppSettings } from '../hooks/useAppSettings';
import { uiText } from '../utils/uiTranslations';

/*
 * «Так вас бачать у стрічці» — угорі «Мого профілю».
 *
 * Картка та сама, що в стрічці (`ProfileRow`), і зібрана з того, що людина
 * щойно набрала: інакше «як мене побачать» доводилось би вгадувати, а
 * агенція, яка заповнила програми, не бачила б, що донорка з них прочитає
 * одним рядком. Нотаток і ряду рішень у прев'ю немає (`preview`): на себе не
 * реагують.
 *
 * Ролей буває дві, і кожна в стрічці — окрема картка (`previews`). Тут вони
 * стоять перемикачем, а не одна під одною: дві картки з фото на всю ширину
 * ставили саму форму на два екрани нижче. Згорнути блок можна — вибір
 * памʼятає браузер.
 */

const COLLAPSED_KEY = 'myProfileCardPreviewCollapsed';

const Wrap = styled.section`
  margin: 0 var(--page-gutter, 20px) 16px;
`;

const Head = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 10px;
  margin-bottom: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted, var(--km-muted));
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
`;

const Caret = styled.span`
  display: inline-block;
  transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
`;

// Перемикач, яку з анкет показати, — доріжка з білим вибраним сегментом,
// та сама, що в колекціях стрічки: це вибір «яку з», а не ще одна роль.
const Tabs = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-bottom: 10px;
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
  margin: 0 auto;
  border-radius: 18px;
`;

const readCollapsed = () => {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
};

// Розгорнуте прев'ю зʼявляється тією самою анімацією, що й решта розкривних
// блоків анкети (`styles/revealAnimation`).
const Reveal = styled.div`
  ${revealCss}
`;

export const MyProfileCardPreview = ({ previews = [], language, rates, displayCurrency, onDisplayCurrencyChange }) => {
  const { themeMode } = useAppSettings();
  const [open, setOpen] = useState(() => !readCollapsed());
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

  const toggle = () => {
    setOpen(previous => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, previous ? '1' : '0');
      } catch {
        // приватне вікно: вибір живе до перезавантаження
      }
      return !previous;
    });
  };

  return (
    <Wrap data-testid="my-profile-card-preview">
      <Head type="button" aria-expanded={open} onClick={toggle}>
        <span>{uiText('Так вас бачать у стрічці', language)}</span>
        <Caret $open={open} aria-hidden="true">▼</Caret>
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
