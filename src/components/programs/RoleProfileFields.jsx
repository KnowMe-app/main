import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  PARENT_SEEKING_OPTIONS,
  PARENT_VIA_OPTIONS,
  parseSeekingRoles,
  toggleSeekingRole,
} from '../../utils/donorPrograms';
import {
  HIGHER_EDUCATION_WISH,
  PARENT_DONOR_WISH_FIELDS,
  isHigherEducationWish,
  isWishSelected,
  listParentWishItems,
  listWishChoices,
  resolveParentWishGroups,
  toggleWish,
} from '../../utils/parentWishes';
import { getOptionLabel } from '../formFields';
import { uiText } from '../../utils/uiTranslations';

/*
 * Те, чим біологічні батьки представляють себе в «Моєму профілі».
 *
 * Агенція й клініка мали тут ще блок «Послуги й досвід» (послуги, міста,
 * рік, кількість програм) — його не заповнював ніхто, і його прибрано; сайт
 * переїхав у «Соцмережі», а решту кажуть програми.
 *
 * Текстові поля пишуться на blur, вибір — одразу: так само, як решта форми.
 * Батьки бачать лише ті побажання, які стосуються того, кого вони шукають:
 * «колір очей донорки» тим, хто шукає сурогатну маму, нічого не каже. Уже
 * записане про іншого не губиться й не висить у картці: воно стоїть окремо,
 * з кнопкою «Стерти» (`SET_ASIDE_WISHES`).
 */

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 0;
`;

const FieldLabel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--km-muted, #6f675f);
`;

const TextInput = styled.input`
  box-sizing: border-box;
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid var(--km-border, #e7e1d8);
  border-radius: 10px;
  background: var(--km-bg, #faf8f5);
  color: var(--km-text, inherit);
  font: inherit;
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
`;

const Segments = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Segment = styled.button`
  min-height: 36px;
  padding: 0 13px;
  border-radius: 999px;
  border: 1px solid ${({ $on }) => ($on ? 'var(--km-accent, #E8791A)' : 'var(--km-border, #e7e1d8)')};
  background: ${({ $on }) => ($on ? 'color-mix(in srgb, var(--km-accent, #E8791A) 14%, transparent)' : 'transparent')};
  color: ${({ $on }) => ($on ? 'var(--km-accent, #E8791A)' : 'var(--km-text, inherit)')};
  font: inherit;
  font-size: 13px;
  font-weight: ${({ $on }) => ($on ? 700 : 500)};
  letter-spacing: 0;
  text-transform: none;
  cursor: pointer;
`;

const SubTitle = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: var(--km-text, inherit);
`;

/** Текстове поле, що пише на blur, а не на кожну літеру. */
const BlurInput = ({ value, onCommit, ...rest }) => {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);
  return (
    <TextInput
      {...rest}
      value={draft}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => { if (String(draft) !== String(value ?? '')) onCommit(String(draft).trim()); }}
    />
  );
};

const Choice = ({ options, value, onChange, language, multiple = false }) => (
  <Segments>
    {options.map(option => {
      const on = multiple ? value.includes(option.key) : value === option.key;
      return (
        <Segment key={option.key} type="button" $on={on} aria-pressed={on} onClick={() => onChange(option.key)}>
          {uiText(option.label, language)}
        </Segment>
      );
    })}
  </Segments>
);

const SetAsideList = styled.p`
  margin: 0;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: var(--km-text, inherit);
`;

const Hint = styled.p`
  margin: 0;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.45;
  letter-spacing: 0;
  text-transform: none;
  color: var(--km-muted, #6f675f);
`;

// Записане до того, як групу крові, зріст, вік і місце стали задавати
// програмою. Форма їх більше не питає, але й не ховає: поки значення лежить
// в анкеті, його видно й можна стерти — а стерте зникає з форми.
const LEGACY_DONOR_PREFS = [
  { key: 'blood', label: 'Група крові', placeholder: 'Наприклад: 1+, 2+' },
  { key: 'heightFrom', label: 'Зріст від, см', placeholder: '165', inputMode: 'numeric' },
];

const LEGACY_SURROGATE_PREFS = [
  { key: 'ageTo', label: 'Вік до', placeholder: '35', inputMode: 'numeric' },
  { key: 'location', label: 'Де програма для СМ', placeholder: 'Наприклад: Україна або Грузія' },
];

// Побажання до того, кого батьки вже не шукають: картка їх не показує
// (`resolveParentWishGroups`), а форма — показує окремо, щоб їх було видно й
// можна було стерти. Зміна «кого шукаєте» їх не стирає сама: один дотик повз
// потрібний варіант коштував би всіх побажань.
const SET_ASIDE_WISHES = [
  { group: 'donor', title: 'Бажано у донорки', hint: 'Ви зараз не шукаєте донорку, тож у картці цього не видно.' },
  { group: 'surrogate', title: 'Бажано у сурогатної мами', hint: 'Ви зараз не шукаєте сурогатну маму, тож у картці цього не видно.' },
];

/**
 * «Кого шукаєте» біологічних батьків.
 *
 * Програма однакова для всіх і несе суму, вимоги (вік, ІМТ, зріст, група
 * крові), покриття й місце — тут лише те, чого вона не вміє: кого шукають,
 * як шукають і побажання до зовнішності донорки. Побажання — вибір з тих
 * самих довідників, що й в анкеті донорки (`utils/parentWishes`), а не
 * вільний текст: так картка може сказати донорці «✓ як у вас».
 *
 * `showProgramLocation` — «Де програма» лише тоді, коли воно вже записане:
 * нове місце задається в самій програмі, а записане видно, доки його не
 * стерли.
 */
export const ParentProfileFields = ({ state, onCommit, language, showProgramLocation = false }) => {
  const seeking = String(state.seeking || '');
  const seekingKeys = parseSeekingRoles(seeking);
  const via = String(state.parentVia || '');
  const prefs = state.parentPreferences && typeof state.parentPreferences === 'object' ? state.parentPreferences : {};
  const wantsDonor = seekingKeys.includes('ed');
  // Чиї побажання зараз показує картка — решта записаного стоїть нижче
  // окремо (`SET_ASIDE_WISHES`).
  const shownGroups = resolveParentWishGroups(seeking);
  const donorWishItems = listParentWishItems(prefs, 'donor', language);
  const setPref = (group, key, value) => {
    const nextGroup = { ...(prefs[group] || {}), [key]: value };
    if (!value) delete nextGroup[key];
    const next = { ...prefs, [group]: nextGroup };
    if (!Object.keys(nextGroup).length) delete next[group];
    onCommit('parentPreferences', Object.keys(next).length ? next : null);
  };
  const clearPrefsGroup = group => {
    const next = { ...prefs };
    delete next[group];
    onCommit('parentPreferences', Object.keys(next).length ? next : null);
  };
  const renderLegacy = (group, fields) => {
    const recorded = fields.filter(field => String(prefs[group]?.[field.key] ?? '').trim());
    if (!recorded.length) return null;
    return (
      <Grid>
        {recorded.map(field => (
          <FieldLabel key={field.key}>
            {uiText(field.label, language)}
            <BlurInput value={prefs[group]?.[field.key]} inputMode={field.inputMode} placeholder={uiText(field.placeholder, language)} onCommit={value => setPref(group, field.key, value)} />
          </FieldLabel>
        ))}
      </Grid>
    );
  };
  const legacyDonor = shownGroups.donor ? renderLegacy('donor', LEGACY_DONOR_PREFS) : null;
  const legacySurrogate = shownGroups.surrogate ? renderLegacy('surrogate', LEGACY_SURROGATE_PREFS) : null;
  const donorPrefs = prefs.donor || {};
  // «Кого шукаєте» ще не вибрано, а побажання до донорки вже записані — картка
  // їх показує, тож і форма мусить дати їх правити.
  const showDonorWishes = wantsDonor || (shownGroups.donor && donorWishItems.length > 0);
  const setAside = SET_ASIDE_WISHES
    .filter(({ group }) => !shownGroups[group])
    .map(entry => ({ ...entry, items: listParentWishItems(prefs, entry.group, language) }))
    .filter(entry => entry.items.length > 0);

  return (
    <Stack>
      <FieldLabel as="div">
        {uiText('Кого шукаєте', language)}
        {/* Кількох одразу: батьки, які ще нічого не знають, шукають і
            донорку, і агенцію чи клініку, що допоможе. */}
        <Choice
          language={language}
          multiple
          options={PARENT_SEEKING_OPTIONS}
          value={seekingKeys}
          onChange={key => onCommit('seeking', toggleSeekingRole(seeking, key) || null)}
        />
        <Hint>{uiText('Можна кількох. Агенції й клініки побачать це у вашій картці й зможуть написати вам самі.', language)}</Hint>
      </FieldLabel>
      {/* Необовʼязкове: повторний дотик знімає вибір. */}
      <FieldLabel as="div">
        {uiText('Як шукаєте', language)}
        <Choice language={language} options={PARENT_VIA_OPTIONS} value={via} onChange={key => onCommit('parentVia', key === via ? null : key)} />
      </FieldLabel>
      {showProgramLocation ? (
        <FieldLabel>
          {uiText('Де програма', language)}
          <BlurInput value={state.programLocation} placeholder={uiText('Наприклад: клініка в Києві', language)} onCommit={value => onCommit('programLocation', value || null)} />
          <Hint>{uiText('Тепер це «Місце програми» в самій програмі', language)}</Hint>
        </FieldLabel>
      ) : null}
      {showDonorWishes ? (
        <>
          <SubTitle>{uiText('Бажано у донорки', language)}</SubTitle>
          {PARENT_DONOR_WISH_FIELDS.map(field => (
            <FieldLabel as="div" key={field.key} data-testid={`parent-wish-${field.key}`}>
              {uiText(field.label, language)}
              <Segments>
                {listWishChoices(donorPrefs[field.key], field).map(option => {
                  const on = isWishSelected(donorPrefs[field.key], field, option);
                  return (
                    <Segment
                      key={option.placeholder}
                      type="button"
                      $on={on}
                      aria-pressed={on}
                      onClick={() => setPref('donor', field.key, toggleWish(donorPrefs[field.key], field, option))}
                    >
                      {option.recorded ? option.placeholder : getOptionLabel(option, language)}
                    </Segment>
                  );
                })}
              </Segments>
            </FieldLabel>
          ))}
          <FieldLabel as="div" data-testid="parent-wish-education">
            {uiText('Освіта', language)}
            <Segments>
              {(() => {
                const on = isHigherEducationWish(donorPrefs.education);
                return (
                  <Segment
                    type="button"
                    $on={on}
                    aria-pressed={on}
                    onClick={() => setPref('donor', 'education', on ? '' : HIGHER_EDUCATION_WISH)}
                  >
                    {uiText('Вища освіта', language)}
                  </Segment>
                );
              })()}
            </Segments>
          </FieldLabel>
          <Hint>{uiText('Побажання не відсіюють донорок — лише підказують, кого ви шукаєте. Вік, ІМТ, групу крові задайте у програмі: там донорка одразу бачить, чи підходить.', language)}</Hint>
        </>
      ) : null}
      {legacyDonor || legacySurrogate ? (
        <>
          <SubTitle>{uiText('Записано раніше — тепер це вимоги програми', language)}</SubTitle>
          {legacyDonor}
          {legacySurrogate}
        </>
      ) : null}
      {setAside.map(entry => (
        <FieldLabel as="div" key={entry.group} data-testid={`parent-set-aside-${entry.group}`}>
          {uiText(entry.title, language)}
          <Hint>{uiText(entry.hint, language)}</Hint>
          <SetAsideList>{entry.items.map(item => (item.label ? `${item.label}: ${item.text}` : item.text)).join(' · ')}</SetAsideList>
          <Segments>
            <Segment type="button" onClick={() => clearPrefsGroup(entry.group)}>{uiText('Стерти', language)}</Segment>
          </Segments>
        </FieldLabel>
      ))}
    </Stack>
  );
};
