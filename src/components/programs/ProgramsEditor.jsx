import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  MAX_PROGRAMS,
  PROGRAM_COVERAGE_OPTIONS,
  PROGRAM_CSECTION_OPTIONS,
  PROGRAM_KIDS_OPTIONS,
  PROGRAM_MARITAL_OPTIONS,
  PROGRAM_PAYMENT_FIELDS,
  PROGRAM_RH_OPTIONS,
  PROGRAM_TYPES,
  PROGRAM_TYPE_LABELS,
  createEmptyProgram,
  listPrograms,
  normalizeProgram,
  programsToRecord,
} from '../../utils/donorPrograms';
import { DEFAULT_PROGRAM_CURRENCY, formatProgramMoney } from '../../utils/programCurrency';
import { uiText } from '../../utils/uiTranslations';
import { MoneyInput } from './MoneyInput';
import { ProgramCard } from './ProgramsView';

/*
 * Програми агенції чи клініки в «Моєму профілі».
 *
 * Програм буває кілька — Україна й Грузія, різний вік, різні доплати, — і
 * кожна тут окрема картка. Згорнута вона каже одним рядком, що це за програма
 * й скільки платить; розгорнута — питає поля групами в тому порядку, у якому
 * їх читає донорка: кого шукаєте, де, вимоги, виплати, що покриваєте.
 * Під формою — та сама картка, яку побачить донорка (`ProgramCard`).
 *
 * Зберігається все саме, без кнопки: зміна лягає в анкету за мить після
 * останнього дотику (`SAVE_DELAY_MS`) і ще раз — коли редактор закривають.
 * «Копія» — найшвидший спосіб завести другу програму: здебільшого вони
 * відрізняються віком і сумою, а не всім.
 */

const SAVE_DELAY_MS = 700;

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 0;
`;

const Intro = styled.p`
  margin: 0;
  font-size: 12.5px;
  color: var(--km-muted, #6f675f);
  line-height: 1.5;
`;

const ProgramBox = styled.div`
  border: 1px solid var(--km-border, #e7e1d8);
  border-radius: 14px;
  overflow: hidden;
`;

const ProgramHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--km-bg, #faf8f5);
`;

const HeadText = styled.button`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  b { font-size: 14px; }
  span { font-size: 12px; color: var(--km-muted, #6f675f); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
`;

const SmallButton = styled.button`
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 9px;
  border: 1px solid ${({ $danger }) => ($danger ? 'color-mix(in srgb, #C8483E 45%, transparent)' : 'var(--km-border, #e7e1d8)')};
  background: var(--km-card, #fff);
  color: ${({ $danger }) => ($danger ? '#C8483E' : 'inherit')};
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px;
`;

const Group = styled.fieldset`
  /* fieldset за замовчуванням не стискається нижче за вміст
     (min-inline-size: min-content), і перемикач валют вилазив за край
     картки, обрізаючи «₴». */
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;

  legend {
    padding: 0;
    margin-bottom: 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--km-muted, #6f675f);
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 8px;
`;

const SmallLabel = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--km-muted, #6f675f);
  min-width: 0;
`;

const TextInput = styled.input`
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--km-border, #e7e1d8);
  border-radius: 10px;
  background: var(--km-bg, #faf8f5);
  color: var(--km-text, inherit);
  font: inherit;
  font-size: 15px;
`;

const TextArea = styled.textarea`
  box-sizing: border-box;
  width: 100%;
  min-height: 64px;
  padding: 10px 12px;
  border: 1px solid var(--km-border, #e7e1d8);
  border-radius: 10px;
  background: var(--km-bg, #faf8f5);
  color: var(--km-text, inherit);
  font: inherit;
  font-size: 14px;
  resize: vertical;
`;

const Segments = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Segment = styled.button`
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid ${({ $on }) => ($on ? 'var(--km-accent, #E8791A)' : 'var(--km-border, #e7e1d8)')};
  background: ${({ $on }) => ($on ? 'color-mix(in srgb, var(--km-accent, #E8791A) 14%, transparent)' : 'transparent')};
  color: ${({ $on }) => ($on ? 'var(--km-accent, #E8791A)' : 'inherit')};
  font: inherit;
  font-size: 13px;
  font-weight: ${({ $on }) => ($on ? 700 : 500)};
  cursor: pointer;
`;

const OtherRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
  gap: 6px;
  align-items: start;

  @media (max-width: 480px) {
    grid-template-columns: minmax(0, 1fr) auto;
    > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; }
  }
`;

const AddButton = styled.button`
  min-height: 44px;
  border-radius: 12px;
  border: 1px dashed color-mix(in srgb, var(--km-accent, #E8791A) 50%, transparent);
  background: transparent;
  color: var(--km-accent, #E8791A);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
`;

const PreviewLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--km-muted, #6f675f);
`;

const Choice = ({ options, value, onChange, language }) => (
  <Segments>
    {options.map(option => (
      <Segment key={option.key} type="button" $on={value === option.key} aria-pressed={value === option.key} onClick={() => onChange(option.key)}>
        {uiText(option.label, language)}
      </Segment>
    ))}
  </Segments>
);

const summaryLine = (program, language) => {
  const pay = program.payments?.final;
  const amount = Number(pay?.amount);
  return [
    program.title,
    program.location,
    Number.isFinite(amount) && amount > 0 ? formatProgramMoney(amount, pay.currency) : uiText('виплату не вказано', language),
  ].filter(Boolean).join(' · ');
};

const ProgramForm = ({ program, onChange, language, rates }) => {
  const set = patch => onChange({ ...program, ...patch });
  const setReq = patch => onChange({ ...program, requirements: { ...program.requirements, ...patch } });
  const setPay = (key, money) => onChange({ ...program, payments: { ...program.payments, [key]: money } });
  const others = program.otherPayments || [];
  const setOther = (index, patch) => set({ otherPayments: others.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const idPrefix = `program-${program.id}`;
  const normalized = normalizeProgram(program, program.id);

  return (
    <Body>
      <Group>
        <legend>{uiText('Кого шукаєте', language)}</legend>
        <Choice
          language={language}
          value={program.type}
          onChange={type => set({ type })}
          options={PROGRAM_TYPES.map(key => ({ key, label: PROGRAM_TYPE_LABELS[key] }))}
        />
      </Group>

      <Group>
        <legend>{uiText('Програма', language)}</legend>
        <SmallLabel>
          {uiText('Назва (необовʼязково)', language)}
          <TextInput value={program.title || ''} placeholder={uiText('Наприклад: Донорство в Києві', language)} onChange={event => set({ title: event.target.value })} />
        </SmallLabel>
        <SmallLabel>
          {uiText('Де проходить', language)}
          <TextInput value={program.location || ''} placeholder={uiText('Наприклад: Київ; пологи в Грузії', language)} onChange={event => set({ location: event.target.value })} />
        </SmallLabel>
      </Group>

      <Group>
        <legend>{uiText('Вимоги', language)}</legend>
        <Grid>
          <SmallLabel>{uiText('Вік від', language)}<TextInput inputMode="numeric" value={program.requirements?.ageFrom ?? ''} onChange={event => setReq({ ageFrom: event.target.value })} /></SmallLabel>
          <SmallLabel>{uiText('Вік до', language)}<TextInput inputMode="numeric" value={program.requirements?.ageTo ?? ''} onChange={event => setReq({ ageTo: event.target.value })} /></SmallLabel>
          <SmallLabel>{uiText('ІМТ до', language)}<TextInput inputMode="decimal" value={program.requirements?.bmiMax ?? ''} onChange={event => setReq({ bmiMax: event.target.value })} /></SmallLabel>
          <SmallLabel>{uiText('Зріст від, см', language)}<TextInput inputMode="numeric" value={program.requirements?.heightFrom ?? ''} onChange={event => setReq({ heightFrom: event.target.value })} /></SmallLabel>
          <SmallLabel>{uiText('Пологів не більше', language)}<TextInput inputMode="numeric" value={program.requirements?.maxBirths ?? ''} onChange={event => setReq({ maxBirths: event.target.value })} /></SmallLabel>
        </Grid>
        <SmallLabel as="div">{uiText('Резус', language)}<Choice language={language} options={PROGRAM_RH_OPTIONS} value={program.requirements?.rh || 'any'} onChange={rh => setReq({ rh })} /></SmallLabel>
        <SmallLabel as="div">{uiText('Сімейний стан', language)}<Choice language={language} options={PROGRAM_MARITAL_OPTIONS} value={program.requirements?.marital || 'any'} onChange={marital => setReq({ marital })} /></SmallLabel>
        <SmallLabel as="div">{uiText('Власна дитина', language)}<Choice language={language} options={PROGRAM_KIDS_OPTIONS} value={program.requirements?.ownKids || 'any'} onChange={ownKids => setReq({ ownKids })} /></SmallLabel>
        <SmallLabel as="div">{uiText('Кесарів розтин', language)}<Choice language={language} options={PROGRAM_CSECTION_OPTIONS} value={program.requirements?.csectionMax || 'any'} onChange={csectionMax => setReq({ csectionMax })} /></SmallLabel>
      </Group>

      <Group>
        <legend>{uiText('Виплати', language)}</legend>
        {PROGRAM_PAYMENT_FIELDS[program.type].map(({ key, label }) => (
          <SmallLabel key={key} as="div">
            {uiText(label, language)}
            <MoneyInput id={`${idPrefix}-${key}`} language={language} rates={rates} value={program.payments?.[key]} onChange={money => setPay(key, money)} />
          </SmallLabel>
        ))}
        {others.map((item, index) => (
          <OtherRow key={`other-${index}`}>
            <TextInput value={item.label || ''} placeholder={uiText('За що', language)} aria-label={uiText('За що', language)} onChange={event => setOther(index, { label: event.target.value })} />
            <MoneyInput language={language} rates={rates} value={item} onChange={money => setOther(index, money)} />
            <SmallButton type="button" $danger aria-label={uiText('Прибрати доплату', language)} onClick={() => set({ otherPayments: others.filter((_, i) => i !== index) })}>✕</SmallButton>
          </OtherRow>
        ))}
        <SmallButton type="button" onClick={() => set({ otherPayments: [...others, { label: '', amount: '', currency: program.payments?.final?.currency || DEFAULT_PROGRAM_CURRENCY }] })}>
          + {uiText('Інша доплата', language)}
        </SmallButton>
      </Group>

      <Group>
        <legend>{uiText('Що покриваєте', language)}</legend>
        <Segments>
          {PROGRAM_COVERAGE_OPTIONS.map(option => {
            const on = (program.coverage || []).includes(option.key);
            return (
              <Segment
                key={option.key}
                type="button"
                $on={on}
                aria-pressed={on}
                onClick={() => set({ coverage: on ? program.coverage.filter(key => key !== option.key) : [...(program.coverage || []), option.key] })}
              >
                {uiText(option.label, language)}
              </Segment>
            );
          })}
        </Segments>
      </Group>

      <Group>
        <legend>{uiText('Ще', language)}</legend>
        <SmallLabel>
          {uiText('Тривалість і візити', language)}
          <TextInput value={program.duration || ''} placeholder={uiText('Наприклад: 3–4 тижні, 5 візитів', language)} onChange={event => set({ duration: event.target.value })} />
        </SmallLabel>
        <SmallLabel>
          {uiText('Примітка', language)}
          <TextArea value={program.note || ''} placeholder={uiText('Що ще важливо знати', language)} onChange={event => set({ note: event.target.value })} />
        </SmallLabel>
      </Group>

      {normalized ? (
        <>
          <PreviewLabel>{uiText('Так програму побачать у стрічці', language)}</PreviewLabel>
          <ProgramCard program={normalized} rates={rates} language={language} />
        </>
      ) : null}
    </Body>
  );
};

const nextProgramId = existing => {
  const taken = new Set(existing.map(program => program.id));
  let id = `p${Date.now().toString(36)}`;
  while (taken.has(id)) id = `${id}x`;
  return id;
};

export const ProgramsEditor = ({ programs, onSave, language, rates, defaultType = 'ed' }) => {
  const [draft, setDraft] = useState(() => listPrograms(programs).map(program => ({ ...program })));
  const [openId, setOpenId] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const timerRef = useRef(null);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const lastSavedRef = useRef(JSON.stringify(programsToRecord(programs)));

  // Анкета читається асинхронно, тож програми можуть приїхати вже після
  // монтування. Підхоплюється лише зміна **ззовні** — не відлуння власного
  // збереження: інакше нормалізоване значення («3» у віці — ще не вік)
  // перетирало б поле, яке людина саме набирає.
  const incoming = JSON.stringify(programsToRecord(programs));
  useEffect(() => {
    if (incoming === lastSavedRef.current || dirtyRef.current) return;
    lastSavedRef.current = incoming;
    const next = listPrograms(programs).map(program => ({ ...program }));
    draftRef.current = next;
    setDraft(next);
  }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const record = programsToRecord(draftRef.current);
    lastSavedRef.current = JSON.stringify(record);
    onSaveRef.current(Object.keys(record).length ? record : null);
  };

  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = next => {
    draftRef.current = next;
    dirtyRef.current = true;
    setDraft(next);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, SAVE_DELAY_MS);
  };

  const add = type => {
    const program = createEmptyProgram(type, nextProgramId(draft));
    update([...draft, program]);
    setOpenId(program.id);
  };

  const duplicate = program => {
    const copy = { ...program, id: nextProgramId(draft), title: program.title ? `${program.title} (${uiText('копія', language)})` : '' };
    update([...draft, copy]);
    setOpenId(copy.id);
  };

  return (
    <Wrap>
      <Intro>
        {uiText('Кожна програма — окремо: зі своїми вимогами й виплатами. Суми вводьте у валюті, у якій платите, — донорки побачать і еквівалент за курсом НБУ.', language)}
      </Intro>
      {draft.map(program => {
        const open = openId === program.id;
        return (
          <ProgramBox key={program.id} data-testid="program-editor">
            <ProgramHead>
              <HeadText type="button" aria-expanded={open} onClick={() => { flush(); setOpenId(open ? '' : program.id); }}>
                <b>{uiText(PROGRAM_TYPE_LABELS[program.type], language)}</b>
                <span>{summaryLine(program, language)}</span>
              </HeadText>
              {confirmDeleteId === program.id ? (
                <>
                  <SmallButton type="button" $danger onClick={() => { update(draft.filter(item => item.id !== program.id)); setConfirmDeleteId(''); }}>{uiText('Видалити', language)}</SmallButton>
                  <SmallButton type="button" onClick={() => setConfirmDeleteId('')}>{uiText('Ні', language)}</SmallButton>
                </>
              ) : (
                <>
                  <SmallButton type="button" onClick={() => duplicate(program)} disabled={draft.length >= MAX_PROGRAMS}>{uiText('Копія', language)}</SmallButton>
                  <SmallButton type="button" $danger aria-label={uiText('Видалити програму', language)} onClick={() => setConfirmDeleteId(program.id)}>✕</SmallButton>
                </>
              )}
            </ProgramHead>
            {open ? (
              <ProgramForm
                program={program}
                language={language}
                rates={rates}
                onChange={next => update(draft.map(item => (item.id === program.id ? next : item)))}
              />
            ) : null}
          </ProgramBox>
        );
      })}
      {draft.length < MAX_PROGRAMS ? (
        <Segments>
          <AddButton type="button" style={{ flex: 1 }} onClick={() => add(defaultType)}>
            + {uiText('Додати програму', language)}
          </AddButton>
        </Segments>
      ) : null}
    </Wrap>
  );
};

export default ProgramsEditor;
