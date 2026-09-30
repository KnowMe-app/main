import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import ProfileRow from './ProfileRow';
import { MatchingThemeScope } from './Matching.styled';
import { useAppSettings } from '../hooks/useAppSettings';
import { uiText } from '../utils/uiTranslations';

/*
 * «Так вашу картку бачать у стрічці» — угорі «Мого профілю».
 *
 * Картка та сама, що в стрічці (`ProfileRow`), і зібрана з того, що людина
 * щойно набрала: інакше «як мене побачать» доводилось би вгадувати, а
 * агенція, яка заповнила програми, не бачила б, що донорка з них прочитає
 * одним рядком. Нотаток і ряду рішень у прев'ю немає (`preview`): на себе не
 * реагують. Згорнути блок можна — вибір памʼятає браузер.
 */

const COLLAPSED_KEY = 'myProfileCardPreviewCollapsed';

const Wrap = styled.section`
  margin: 0 20px 16px;
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
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .6px;
  text-transform: uppercase;
  cursor: pointer;
`;

const Caret = styled.span`
  display: inline-block;
  transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
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

export const MyProfileCardPreview = ({ card, language, rates, displayCurrency, onDisplayCurrencyChange }) => {
  const { themeMode } = useAppSettings();
  const [open, setOpen] = useState(() => !readCollapsed());
  const programsContext = useMemo(() => ({
    viewerType: '',
    facts: null,
    rates,
    displayCurrency,
    onDisplayCurrencyChange,
  }), [displayCurrency, onDisplayCurrencyChange, rates]);

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
        <span>{uiText('Так вашу картку бачать у стрічці', language)}</span>
        <Caret $open={open} aria-hidden="true">▼</Caret>
      </Head>
      {open ? (
        <Frame $themeMode={themeMode}>
          <ProfileRow user={card} programsContext={programsContext} preview canViewContacts={false} />
        </Frame>
      ) : null}
    </Wrap>
  );
};

export default MyProfileCardPreview;
