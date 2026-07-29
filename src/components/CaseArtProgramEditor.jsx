// "Програма ДРТ" (case.artProgram editor) - the shared, once-only medical facts of a case's
// fertility program: diagnosis, genetic-material source, attending physician, the one embryo
// shipment, and the one relevant transfer attempt (carrying at most one hCG test and one
// ultrasound) - spec v5 §1.3/§1.4/§1.5. Every one of these is a singleton: no id, no array, no map,
// nothing else in the app ever selects one of several by id. The shipment's source (foreign) and
// destination (Ukrainian) clinics are the case's own relations (edited in PartiesPage's own
// relations block), never fields on the shipment itself.
//
// Self-contained (same reasoning as CaseChildbirthTransactionEditor's own header comment): no
// dependency on the host page's internals, so it drops into any --km-* scoped page as-is.
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { ref, set } from 'firebase/database';
import { database } from './config';
import {
  DOCUMENTS_CASES_PATH,
  isGeneticSourceDonorCode,
  normalizeIsoDate,
  removeEmptyCaseValues,
} from './documentsCatalogUtils';

const Section = styled.section`
  background: var(--km-card);
  border: 1px solid var(--km-border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
`;

const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-family: var(--km-font-display);
  font-size: 15px;
  letter-spacing: -0.01em;
`;

const SectionSubhead = styled.h3`
  margin: 12px 0 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--km-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

const RowLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const Select = styled.select`
  flex: 1;
  min-width: 160px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--km-text);
  border-radius: 6px;
  min-height: 30px;
  padding: 4px 8px;
  font-size: 12.5px;
  font-family: var(--km-font);
  cursor: pointer;

  &:hover {
    border-color: var(--km-border);
  }

  &:focus {
    outline: none;
    border-color: var(--km-accent);
    background: var(--km-card);
  }
`;

const DocRow = styled.div`
  border: 1px solid var(--km-border);
  border-radius: 8px;
  padding: 8px 10px;
  margin-top: 8px;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  margin-top: 10px;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--km-muted);
`;

const FieldInput = styled.input`
  border: 1px solid transparent;
  background: transparent;
  color: var(--km-text);
  border-radius: 6px;
  min-height: 28px;
  padding: 3px 8px;
  font-size: 12px;
  font-family: var(--km-font);

  &:hover {
    border-color: var(--km-border);
  }

  &:focus {
    outline: none;
    border-color: var(--km-accent);
    background: var(--km-card);
  }
`;

const PrimaryMiniButton = styled.button`
  border: none;
  color: #fff;
  background: linear-gradient(135deg, var(--km-accent) 0%, var(--km-accent-mid) 100%);
  border-radius: 6px;
  min-height: 30px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;

  &:hover {
    filter: brightness(1.05);
  }
`;

const describeSaveError = error => `${error?.code || error?.name || 'error'}: ${error?.message || String(error)}`.trim();

// Local UI mode for the oocyte/sperm source selector (spec §6.3) - never persisted itself, only
// used to decide which input to show; the backend always stores the plain scalar
// (`wife`/`husband`/the donor code string) with no separate mode field alongside it.
const GENETIC_SOURCE_MODE_ROLE = 'role';
const GENETIC_SOURCE_MODE_DONOR = 'donor';

const geneticSourceModeFor = value => (isGeneticSourceDonorCode(value) ? GENETIC_SOURCE_MODE_DONOR : GENETIC_SOURCE_MODE_ROLE);

const emptyArtProgramDraft = () => ({
  medicalIndicationsUk: '',
  oocyteSource: '',
  oocyteSourceMode: GENETIC_SOURCE_MODE_ROLE,
  spermSource: '',
  spermSourceMode: GENETIC_SOURCE_MODE_ROLE,
  physicianNameUk: '',
  embryoShipment: {
    ivfDate: '', plannedPeriod: { startDate: '', endDate: '' }, sentDate: '', receivedDate: '',
  },
  transferAttempt: {
    date: '', embryoCount: '', embryoStage: '', hcgTestDate: '', ultrasoundDate: '', fetusCount: '', gestationalAgeFrom: '', gestationalAgeTo: '',
  },
});

const CaseArtProgramEditor = ({ catalog, setCatalog, caseId }) => {
  const selectedCase = catalog.cases.find(item => String(item.id) === String(caseId)) || null;
  const [draft, setDraft] = useState(emptyArtProgramDraft());

  useEffect(() => {
    const artProgram = selectedCase?.artProgram || {};
    const shipment = artProgram.embryoShipment || {};
    const transferAttempt = artProgram.transferAttempt || {};
    const oocyteSourceMode = geneticSourceModeFor(artProgram.oocyteSource);
    const spermSourceMode = geneticSourceModeFor(artProgram.spermSource);
    setDraft({
      medicalIndicationsUk: artProgram.medicalIndications?.uk || '',
      // The mode selector never offers a blank/unset option (spec §6.3: "Дружина/Донор",
      // "Чоловік/Донор") - whichever option it displays is what a save commits, so an untouched
      // case with no oocyteSource/spermSource yet still shows (and would save) the reserved role
      // value, exactly like a two-option radio group defaults to its first option.
      oocyteSource: oocyteSourceMode === GENETIC_SOURCE_MODE_DONOR ? artProgram.oocyteSource : 'wife',
      oocyteSourceMode,
      spermSource: spermSourceMode === GENETIC_SOURCE_MODE_DONOR ? artProgram.spermSource : 'husband',
      spermSourceMode,
      physicianNameUk: artProgram.medicalTeam?.physician?.name?.uk?.nominative || '',
      embryoShipment: {
        ivfDate: shipment.ivfDate || '',
        plannedPeriod: {
          startDate: shipment.plannedPeriod?.startDate || '',
          endDate: shipment.plannedPeriod?.endDate || '',
        },
        sentDate: shipment.sentDate || '',
        receivedDate: shipment.receivedDate || '',
      },
      transferAttempt: {
        date: transferAttempt.date || '',
        embryoCount: transferAttempt.embryoCount ?? '',
        embryoStage: transferAttempt.embryoStage || '',
        hcgTestDate: transferAttempt.hcgTest?.date || '',
        ultrasoundDate: transferAttempt.ultrasound?.date || '',
        fetusCount: transferAttempt.ultrasound?.fetusCount ?? '',
        gestationalAgeFrom: transferAttempt.ultrasound?.gestationalAgeWeeks?.from ?? '',
        gestationalAgeTo: transferAttempt.ultrasound?.gestationalAgeWeeks?.to ?? '',
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const updateField = (field, value) => setDraft(previous => ({ ...previous, [field]: value }));

  const updateGeneticSourceMode = (field, modeField, mode) => setDraft(previous => ({
    ...previous,
    [modeField]: mode,
    // Switching back to Дружина/Чоловік writes the reserved role value immediately; switching to
    // Донор clears the value so the admin has to type the actual donor code, never leaves the
    // previous role value silently in place under a "donor" label.
    [field]: mode === GENETIC_SOURCE_MODE_DONOR ? '' : (field === 'oocyteSource' ? 'wife' : 'husband'),
  }));

  const updateShipmentField = (field, value) => setDraft(previous => ({
    ...previous,
    embryoShipment: { ...previous.embryoShipment, [field]: value },
  }));
  const updateShipmentPeriodField = (field, value) => setDraft(previous => ({
    ...previous,
    embryoShipment: { ...previous.embryoShipment, plannedPeriod: { ...previous.embryoShipment.plannedPeriod, [field]: value } },
  }));
  const updateTransferField = (field, value) => setDraft(previous => ({
    ...previous,
    transferAttempt: { ...previous.transferAttempt, [field]: value },
  }));

  const parseNumberOrBlank = value => (value === '' || value === undefined || value === null ? undefined : Number(value));

  const handleSave = async () => {
    if (!selectedCase) return;
    const { transferAttempt: transferDraft, embryoShipment: shipmentDraft } = draft;

    const hcgTest = transferDraft.hcgTestDate ? { date: normalizeIsoDate(transferDraft.hcgTestDate) } : undefined;
    const ultrasound = transferDraft.ultrasoundDate || transferDraft.fetusCount || transferDraft.gestationalAgeFrom || transferDraft.gestationalAgeTo
      ? {
        date: normalizeIsoDate(transferDraft.ultrasoundDate),
        fetusCount: parseNumberOrBlank(transferDraft.fetusCount),
        gestationalAgeWeeks: {
          from: parseNumberOrBlank(transferDraft.gestationalAgeFrom),
          to: parseNumberOrBlank(transferDraft.gestationalAgeTo),
        },
      }
      : undefined;

    const payload = {
      medicalIndications: { uk: draft.medicalIndicationsUk },
      oocyteSource: draft.oocyteSource,
      spermSource: draft.spermSource,
      medicalTeam: { physician: { name: { uk: { nominative: draft.physicianNameUk } } } },
      embryoShipment: {
        ivfDate: normalizeIsoDate(shipmentDraft.ivfDate),
        plannedPeriod: {
          startDate: normalizeIsoDate(shipmentDraft.plannedPeriod.startDate),
          endDate: normalizeIsoDate(shipmentDraft.plannedPeriod.endDate),
        },
        sentDate: normalizeIsoDate(shipmentDraft.sentDate),
        receivedDate: normalizeIsoDate(shipmentDraft.receivedDate),
      },
      transferAttempt: {
        date: normalizeIsoDate(transferDraft.date),
        embryoCount: parseNumberOrBlank(transferDraft.embryoCount),
        embryoStage: transferDraft.embryoStage,
        hcgTest,
        ultrasound,
      },
    };
    const cleaned = removeEmptyCaseValues(payload);
    const nextValue = Object.keys(cleaned).length ? cleaned : null;
    try {
      await set(ref(database, `${DOCUMENTS_CASES_PATH}/${selectedCase.id}/artProgram`), nextValue);
      setCatalog(previous => ({
        ...previous,
        cases: previous.cases.map(item => {
          if (String(item.id) !== String(selectedCase.id)) return item;
          if (nextValue) return { ...item, artProgram: nextValue };
          const { artProgram, ...rest } = item;
          return rest;
        }),
      }));
      toast.success('Дані програми ДРТ збережено.');
    } catch (saveError) {
      console.error('Unable to save the ART program details', saveError);
      toast.error(`Не вдалося зберегти дані програми ДРТ: ${describeSaveError(saveError)}`);
    }
  };

  if (!selectedCase) return null;

  return (
    <Section>
      <SectionHead>
        <SectionTitle>Програма ДРТ</SectionTitle>
      </SectionHead>

      <SectionSubhead>Медичні дані</SectionSubhead>
      <FieldGrid>
        <Field style={{ gridColumn: '1 / -1' }}>
          Медичні показання
          <FieldInput type="text" value={draft.medicalIndicationsUk} onChange={event => updateField('medicalIndicationsUk', event.target.value)} />
        </Field>
        <Field>
          Джерело яйцеклітин
          <RowLine>
            <Select value={draft.oocyteSourceMode} onChange={event => updateGeneticSourceMode('oocyteSource', 'oocyteSourceMode', event.target.value)}>
              <option value={GENETIC_SOURCE_MODE_ROLE}>Дружина</option>
              <option value={GENETIC_SOURCE_MODE_DONOR}>Донор</option>
            </Select>
            {draft.oocyteSourceMode === GENETIC_SOURCE_MODE_DONOR ? (
              <FieldInput
                type="text"
                placeholder="Код донора"
                value={draft.oocyteSource}
                onChange={event => updateField('oocyteSource', event.target.value)}
              />
            ) : null}
          </RowLine>
        </Field>
        <Field>
          Джерело сперматозоїдів
          <RowLine>
            <Select value={draft.spermSourceMode} onChange={event => updateGeneticSourceMode('spermSource', 'spermSourceMode', event.target.value)}>
              <option value={GENETIC_SOURCE_MODE_ROLE}>Чоловік</option>
              <option value={GENETIC_SOURCE_MODE_DONOR}>Донор</option>
            </Select>
            {draft.spermSourceMode === GENETIC_SOURCE_MODE_DONOR ? (
              <FieldInput
                type="text"
                placeholder="Код донора"
                value={draft.spermSource}
                onChange={event => updateField('spermSource', event.target.value)}
              />
            ) : null}
          </RowLine>
        </Field>
        <Field>
          Лікар програми
          <FieldInput type="text" value={draft.physicianNameUk} onChange={event => updateField('physicianNameUk', event.target.value)} />
        </Field>
      </FieldGrid>

      {/* One shipment only (spec §1.4: "one case = one partner clinic = one shipment") - an edit
          form for that one record, not a list; no id, and no clinic pickers of its own - the
          source/destination clinics are the case's own relations, edited alongside the other
          relations in PartiesPage. */}
      <SectionSubhead style={{ marginTop: 14 }}>Транспортування ембріонів</SectionSubhead>
      <DocRow>
        <FieldGrid>
          <Field>
            Дата ЗІВ
            <FieldInput
              type="date"
              value={draft.embryoShipment.ivfDate}
              onChange={event => updateShipmentField('ivfDate', event.target.value)}
            />
          </Field>
          <Field>
            Запланований період — початок
            <FieldInput
              type="date"
              value={draft.embryoShipment.plannedPeriod.startDate}
              onChange={event => updateShipmentPeriodField('startDate', event.target.value)}
            />
          </Field>
          <Field>
            Запланований період — кінець
            <FieldInput
              type="date"
              value={draft.embryoShipment.plannedPeriod.endDate}
              onChange={event => updateShipmentPeriodField('endDate', event.target.value)}
            />
          </Field>
          <Field>
            Дата відправлення
            <FieldInput
              type="date"
              value={draft.embryoShipment.sentDate}
              onChange={event => updateShipmentField('sentDate', event.target.value)}
            />
          </Field>
          <Field>
            Дата фактичного отримання
            <FieldInput
              type="date"
              value={draft.embryoShipment.receivedDate}
              onChange={event => updateShipmentField('receivedDate', event.target.value)}
            />
          </Field>
        </FieldGrid>
      </DocRow>

      {/* One record only - the actual successful transfer attempt, filled in once its outcome is
          known (spec §1.4/§1.5). Its hCG test/ultrasound are single nested sub-forms, not lists -
          there is nothing left to add/remove/select by id, which also removes the old dropdown
          preselection bug in CaseChildbirthTransactionEditor. */}
      <SectionSubhead style={{ marginTop: 14 }}>Актуальний успішний перенос</SectionSubhead>
      <DocRow>
        <FieldGrid>
          <Field>
            Дата переносу
            <FieldInput type="date" value={draft.transferAttempt.date} onChange={event => updateTransferField('date', event.target.value)} />
          </Field>
          <Field>
            Кількість ембріонів
            <FieldInput
              type="number"
              min="0"
              value={draft.transferAttempt.embryoCount}
              onChange={event => updateTransferField('embryoCount', event.target.value)}
            />
          </Field>
          <Field>
            Стадія ембріонів
            <FieldInput
              type="text"
              list="art-embryo-stage-options"
              placeholder="blastocyst"
              value={draft.transferAttempt.embryoStage}
              onChange={event => updateTransferField('embryoStage', event.target.value)}
            />
          </Field>
        </FieldGrid>

        <SectionSubhead style={{ marginTop: 10, fontSize: 10.5 }}>ХГЛ</SectionSubhead>
        <FieldGrid>
          <Field>
            Дата аналізу
            <FieldInput
              type="date"
              value={draft.transferAttempt.hcgTestDate}
              onChange={event => updateTransferField('hcgTestDate', event.target.value)}
            />
          </Field>
        </FieldGrid>

        <SectionSubhead style={{ marginTop: 10, fontSize: 10.5 }}>УЗД</SectionSubhead>
        <FieldGrid>
          <Field>
            Дата УЗД
            <FieldInput
              type="date"
              value={draft.transferAttempt.ultrasoundDate}
              onChange={event => updateTransferField('ultrasoundDate', event.target.value)}
            />
          </Field>
          <Field>
            Кількість плодів
            <FieldInput
              type="number"
              min="0"
              value={draft.transferAttempt.fetusCount}
              onChange={event => updateTransferField('fetusCount', event.target.value)}
            />
          </Field>
          <Field>
            Строк вагітності — від (тижнів)
            <FieldInput
              type="number"
              min="0"
              value={draft.transferAttempt.gestationalAgeFrom}
              onChange={event => updateTransferField('gestationalAgeFrom', event.target.value)}
            />
          </Field>
          <Field>
            Строк вагітності — до (тижнів)
            <FieldInput
              type="number"
              min="0"
              value={draft.transferAttempt.gestationalAgeTo}
              onChange={event => updateTransferField('gestationalAgeTo', event.target.value)}
            />
          </Field>
        </FieldGrid>
      </DocRow>

      <datalist id="art-embryo-stage-options">
        <option value="blastocyst" />
      </datalist>

      <RowLine style={{ marginTop: 14 }}>
        <PrimaryMiniButton type="button" onClick={handleSave}>
          Зберегти
        </PrimaryMiniButton>
      </RowLine>
    </Section>
  );
};

export default CaseArtProgramEditor;
