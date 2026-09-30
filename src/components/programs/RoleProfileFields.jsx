import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  AGENCY_SERVICE_OPTIONS,
  PARENT_SEEKING_OPTIONS,
  PARENT_VIA_OPTIONS,
} from '../../utils/donorPrograms';
import { normalizeServiceTags } from '../../utils/matchingCardIndex';
import { uiText } from '../../utils/uiTranslations';

/*
 * Те, чим агенція, клініка й біологічні батьки представляють себе в
 * «Моєму профілі» — поза програмами.
 *
 * Текстові поля пишуться на blur, вибір — одразу: так само, як решта форми.
 * Батьки бачать лише ті побажання, які стосуються того, кого вони шукають:
 * «колір очей донорки» тим, хто шукає сурогатну маму, нічого не каже.
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

const Hint = styled.span`
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
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

export const AgencyProfileFields = ({ state, onCommit, language, role }) => {
  const services = normalizeServiceTags(state.services).split(',').filter(Boolean);
  const toggleService = key => {
    const next = services.includes(key) ? services.filter(item => item !== key) : [...services, key];
    onCommit('services', next.length ? normalizeServiceTags(next) : null);
  };
  const place = role === 'cl' ? 'клініка' : 'агенція';
  return (
    <Stack>
      <FieldLabel as="div">
        {uiText('Послуги', language)}
        <Choice multiple language={language} options={AGENCY_SERVICE_OPTIONS} value={services} onChange={toggleService} />
      </FieldLabel>
      <FieldLabel>
        {uiText('Де працюєте', language)}
        <BlurInput value={state.workLocations} placeholder={uiText('Наприклад: Київ, Львів, Грузія', language)} onCommit={value => onCommit('workLocations', value || null)} />
      </FieldLabel>
      <FieldLabel>
        {uiText('Сайт', language)}
        <BlurInput value={Array.isArray(state.website) ? state.website[state.website.length - 1] : state.website} inputMode="url" placeholder="https://" onCommit={value => onCommit('website', value || null)} />
      </FieldLabel>
      <Grid>
        <FieldLabel>
          {uiText('Працюєте з року', language)}
          <BlurInput value={state.foundedYear} inputMode="numeric" placeholder={uiText('Наприклад: 2016', language)} onCommit={value => onCommit('foundedYear', value || null)} />
        </FieldLabel>
        <FieldLabel>
          {uiText('Програм проведено', language)}
          <BlurInput value={state.programsCompleted} inputMode="numeric" placeholder={uiText('Наприклад: 120', language)} onCommit={value => onCommit('programsCompleted', value || null)} />
        </FieldLabel>
      </Grid>
      <Hint>{uiText(`Instagram, Telegram і Facebook — у розділі «Соцмережі». Програми, які пропонує ${place}, — у розділі «Програми».`, language)}</Hint>
    </Stack>
  );
};

const PREFS_DONOR = [
  { key: 'blood', label: 'Група крові', placeholder: 'Наприклад: 1+, 2+' },
  { key: 'eyeColor', label: 'Колір очей', placeholder: 'Наприклад: блакитні, зелені' },
  { key: 'hairColor', label: 'Колір волосся', placeholder: 'Наприклад: русяве' },
  { key: 'heightFrom', label: 'Зріст від, см', placeholder: '165', inputMode: 'numeric' },
  { key: 'education', label: 'Освіта', placeholder: 'Наприклад: вища' },
];

const PREFS_SURROGATE = [
  { key: 'ageTo', label: 'Вік до', placeholder: '35', inputMode: 'numeric' },
  { key: 'location', label: 'Де програма для СМ', placeholder: 'Наприклад: Україна або Грузія' },
];

export const ParentProfileFields = ({ state, onCommit, language }) => {
  const seeking = String(state.seeking || '');
  const prefs = state.parentPreferences && typeof state.parentPreferences === 'object' ? state.parentPreferences : {};
  const wantsDonor = seeking === 'ed' || seeking === 'both';
  const wantsSurrogate = seeking === 'sm' || seeking === 'both';
  const setPref = (group, key, value) => {
    const nextGroup = { ...(prefs[group] || {}), [key]: value };
    if (!value) delete nextGroup[key];
    const next = { ...prefs, [group]: nextGroup };
    if (!Object.keys(nextGroup).length) delete next[group];
    onCommit('parentPreferences', Object.keys(next).length ? next : null);
  };
  const renderPrefs = (group, fields) => (
    <Grid>
      {fields.map(field => (
        <FieldLabel key={field.key}>
          {uiText(field.label, language)}
          <BlurInput value={prefs[group]?.[field.key]} inputMode={field.inputMode} placeholder={uiText(field.placeholder, language)} onCommit={value => setPref(group, field.key, value)} />
        </FieldLabel>
      ))}
    </Grid>
  );

  return (
    <Stack>
      <FieldLabel as="div">
        {uiText('Кого шукаєте', language)}
        <Choice language={language} options={PARENT_SEEKING_OPTIONS} value={seeking} onChange={key => onCommit('seeking', key)} />
      </FieldLabel>
      {wantsDonor ? (
        <>
          <SubTitle>{uiText('Побажання до донорки ооцитів', language)}</SubTitle>
          {renderPrefs('donor', PREFS_DONOR)}
        </>
      ) : null}
      {wantsSurrogate ? (
        <>
          <SubTitle>{uiText('Побажання до сурогатної мами', language)}</SubTitle>
          {renderPrefs('surrogate', PREFS_SURROGATE)}
        </>
      ) : null}
      <FieldLabel>
        {uiText('Де програма', language)}
        <BlurInput value={state.programLocation} placeholder={uiText('Наприклад: клініка в Києві', language)} onCommit={value => onCommit('programLocation', value || null)} />
      </FieldLabel>
      <FieldLabel as="div">
        {uiText('Як шукаєте', language)}
        <Choice language={language} options={PARENT_VIA_OPTIONS} value={String(state.parentVia || '')} onChange={key => onCommit('parentVia', key)} />
      </FieldLabel>
    </Stack>
  );
};
