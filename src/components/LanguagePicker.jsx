import React, { useEffect, useId, useRef, useState } from 'react';
import styled from 'styled-components';
import { FaCheck, FaChevronDown, FaGlobe } from 'react-icons/fa';
import { APP_LANGUAGES, getLanguageNativeName } from 'utils/locales';
import { uiText } from 'utils/uiTranslations';
import { revealCss } from 'styles/revealAnimation';
import { ItemDescription, ItemIcon, ItemLabel } from './ProfileDotsMenu.styled';

/*
 * Вибір мови в меню трьох крапок.
 *
 * Мов сім, і сегментований перемикач «UK · EN · …» на них уже не ліз у рядок.
 * Тож згорнутим вибір займає рівно один рядок, як «Тема»: підпис «Мова» і під
 * ним назва поточної мови її ж мовою. Дотик розгортає сітку з двох колонок —
 * кожна мова своїм іменем (`lang` на кнопці, щоб і екранний читач, і шрифт
 * знали мову напису), — і після вибору вона згортається.
 *
 * «Language» стоїть поруч завжди, коли мова інтерфейсу не англійська: людина,
 * яка ввімкнула незнайому мову, мусить знайти, де її вимкнути, не вміючи
 * прочитати жодного слова в меню.
 *
 * Варіанти — справжні радіокнопки: стрілки клавіатури, фокус і «обрано» для
 * екранного читача беруться від браузера, без власної логіки.
 */
const Row = styled.button`
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: 6px;
  padding: 10px;
  border: none;
  border-radius: var(--km-radius);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover { background: var(--km-bg); }
  &:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--km-accent-ring); }
`;

const Chevron = styled(FaChevronDown)`
  color: var(--km-muted);
  transition: transform 0.18s ease;
  transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
`;

const Options = styled.div`
  ${revealCss}
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin: 2px 10px 6px 54px;
`;

const Option = styled.label`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-border)')};
  border-radius: 10px;
  background: ${({ $active }) => ($active ? 'color-mix(in srgb, var(--km-accent) 10%, transparent)' : 'var(--km-card, transparent)')};
  color: ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-text)')};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  cursor: pointer;

  &:hover { border-color: var(--km-accent); }
  &:focus-within { box-shadow: 0 0 0 3px var(--km-accent-ring); }

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
`;

export const LanguagePicker = ({ language, setLanguage }) => {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const groupName = useId();
  const optionsRef = useRef(null);

  // Розгорнута сітка бере фокус на обрану мову: далі стрілки ходять по мовах.
  useEffect(() => {
    if (!open) return;
    optionsRef.current?.querySelector('input:checked')?.focus();
  }, [open]);

  const currentName = getLanguageNativeName(language);
  const hint = language === 'en' ? currentName : `${currentName} · Language`;

  const choose = code => {
    setLanguage(code);
    setOpen(false);
  };

  return (
    <div>
      <Row
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(value => !value)}
        data-testid="language-picker-toggle"
      >
        <ItemIcon><FaGlobe /></ItemIcon>
        <span>
          <ItemLabel>{uiText('Мова', language)}</ItemLabel>
          <ItemDescription>{hint}</ItemDescription>
        </span>
        <Chevron $open={open} aria-hidden="true" />
      </Row>
      {open && (
        <Options
          id={listId}
          ref={optionsRef}
          role="radiogroup"
          aria-label={uiText('Перемкнути мову', language)}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setOpen(false);
            }
          }}
        >
          {APP_LANGUAGES.map(item => (
            <Option key={item.code} $active={item.code === language} lang={item.code}>
              <input
                type="radio"
                name={groupName}
                value={item.code}
                checked={item.code === language}
                onChange={() => choose(item.code)}
                // Клік по вже обраній мові `change` не дає — і сітка не згорталась би.
                onClick={() => { if (item.code === language) setOpen(false); }}
              />
              <span>{item.nativeName}</span>
              {item.code === language ? <FaCheck size={11} aria-hidden="true" /> : null}
            </Option>
          ))}
        </Options>
      )}
    </div>
  );
};

export default LanguagePicker;
