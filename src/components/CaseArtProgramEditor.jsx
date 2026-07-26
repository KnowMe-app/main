// "Програма ДРТ" (case.artProgram editor) - the shared, once-only medical facts of a case's
// fertility program: diagnosis/genetic material/attending physician, embryo shipments from a
// partner clinic, and transfer attempts (each carrying its own hCG tests and ultrasounds). Every
// document that references one of these events (embryoOwnershipStatement,
// geneticAffinityCertificate, racssClinicLetter - edited in CaseChildbirthTransactionEditor) only
// ever stores the id it points at, never a copy of the fact itself - editing an event here is
// instantly reflected in every document that references it.
//
// Self-contained (same reasoning as CaseChildbirthTransactionEditor's own header comment): no
// dependency on the host page's internals, so it drops into any --km-* scoped page as-is.
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { ref, set } from 'firebase/database';
import { FaPlus, FaTrash } from 'react-icons/fa';
import { database } from './config';
import {
  DOCUMENTS_CASES_PATH,
  formatShipmentOptionLabel,
  normalizeIsoDate,
  removeEmptyCaseValues,
  toArray,
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
  min-width: 200px;
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

const NestedRow = styled(DocRow)`
  background: var(--km-bg, transparent);
  margin-left: 4px;
`;

const DocRowHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const DocSubtitle = styled.div`
  color: var(--km-muted);
  font-size: 11px;
  font-weight: 400;
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

const MiniButton = styled.button`
  border: 1px solid var(--km-border);
  background: var(--km-card);
  color: var(--km-text);
  border-radius: 6px;
  min-height: 30px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.55 : 1)};
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;

  &:hover:not(:disabled) {
    border-color: var(--km-accent);
    color: var(--km-accent);
  }
`;

const PrimaryMiniButton = styled(MiniButton)`
  border: none;
  color: #fff;
  background: linear-gradient(135deg, var(--km-accent) 0%, var(--km-accent-mid) 100%);

  &:hover:not(:disabled) {
    color: #fff;
    filter: brightness(1.05);
  }
`;

const SmallButton = styled(MiniButton)`
  min-height: 24px;
  padding: 3px 9px;
  font-size: 10.5px;
  border-radius: 5px;
`;

const DangerButton = styled(SmallButton)`
  border-color: var(--km-danger-border);
  color: var(--km-danger);

  &:hover:not(:disabled) {
    border-color: var(--km-danger);
    color: var(--km-danger);
  }
`;

const describeSaveError = error => `${error?.code || error?.name || 'error'}: ${error?.message || String(error)}`.trim();

// The next `<prefix>-N` id for a freshly-added row (spec §8: "ID створювати автоматично") - the
// highest existing numeric suffix plus one, not just `items.length + 1`, so removing a middle row
// and adding a new one never collides with a still-referenced id (a document elsewhere may still
// point at "shipment-2" even after "shipment-1" was deleted).
const nextSequentialId = (prefix, items) => {
  const maxSuffix = (items || []).reduce((max, item) => {
    const match = /-(\d+)$/.exec(String(item?.id || ''));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${maxSuffix + 1}`;
};

// One transfer attempt per case (batch 24 §2) - only the successful attempt's data ever matters
// once the program is underway, so this is a single record, not a log of attempts.
const emptyTransferAttempt = () => ({
  shipmentId: '', date: '', embryoCount: '', embryoStage: '', hcgTests: [], ultrasounds: [],
});

const emptyArtProgramDraft = () => ({
  medicalIndication: { diagnosis: { uk: '' } },
  geneticMaterial: { oocyteSourcePartnerRole: '', spermSourcePartnerRole: '' },
  medicalTeam: { physician: { name: { uk: { nominative: '' } } } },
  embryoShipments: [],
  transferAttempt: emptyTransferAttempt(),
});

const PARTNER_ROLE_OPTIONS = [
  { value: '', label: '— не обрано —' },
  { value: 'wife', label: 'дружина' },
  { value: 'husband', label: 'чоловік' },
  { value: 'donor', label: 'донор' },
];

const TRI_STATE_OPTIONS = [
  { value: '', label: '— не вказано —' },
  { value: 'true', label: 'так' },
  { value: 'false', label: 'ні' },
];

// Firebase never stores these as arrays (spec §2/§12) - each list is converted back to a map keyed
// by its own `id` right before the write, whatever order the draft happens to hold it in.
const arrayToMap = items => (items || []).reduce((byId, item) => {
  if (item?.id) byId[item.id] = item;
  return byId;
}, {});

const CaseArtProgramEditor = ({ catalog, setCatalog, caseId }) => {
  const selectedCase = catalog.cases.find(item => String(item.id) === String(caseId)) || null;
  const [draft, setDraft] = useState(emptyArtProgramDraft());

  useEffect(() => {
    const artProgram = selectedCase?.artProgram || {};
    setDraft({
      medicalIndication: { diagnosis: { uk: artProgram.medicalIndication?.diagnosis?.uk || '' } },
      geneticMaterial: {
        oocyteSourcePartnerRole: artProgram.geneticMaterial?.oocyteSourcePartnerRole || '',
        spermSourcePartnerRole: artProgram.geneticMaterial?.spermSourcePartnerRole || '',
      },
      medicalTeam: {
        physician: { name: { uk: { nominative: artProgram.medicalTeam?.physician?.name?.uk?.nominative || '' } } },
      },
      // toArray tolerates a Firebase map-with-gaps the same way every other reader in this app does
      // (see documentsCatalogUtils.toArray) - never assumes the backend snapshot is a real Array.
      embryoShipments: toArray(artProgram.embryoShipments),
      transferAttempt: {
        ...emptyTransferAttempt(),
        ...artProgram.transferAttempt,
        hcgTests: toArray(artProgram.transferAttempt?.hcgTests),
        ultrasounds: toArray(artProgram.transferAttempt?.ultrasounds),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const updateDiagnosis = value => setDraft(previous => ({ ...previous, medicalIndication: { diagnosis: { uk: value } } }));
  const updateGeneticMaterial = (field, value) => setDraft(previous => ({
    ...previous,
    geneticMaterial: { ...previous.geneticMaterial, [field]: value },
  }));
  const updatePhysicianName = value => setDraft(previous => ({
    ...previous,
    medicalTeam: { physician: { name: { uk: { nominative: value } } } },
  }));

  // --- Embryo shipments ------------------------------------------------------------------------

  const addShipment = () => setDraft(previous => ({
    ...previous,
    embryoShipments: [...previous.embryoShipments, {
      id: nextSequentialId('shipment', previous.embryoShipments),
      sourceClinicId: '',
      destinationClinicId: '',
      ivfDate: '',
      plannedPeriod: { startDate: '', endDate: '' },
      receivedDate: '',
    }],
  }));

  const removeShipment = shipmentId => setDraft(previous => ({
    ...previous,
    embryoShipments: previous.embryoShipments.filter(shipment => shipment.id !== shipmentId),
  }));

  const updateShipmentField = (shipmentId, field, value) => setDraft(previous => ({
    ...previous,
    embryoShipments: previous.embryoShipments.map(shipment => (shipment.id === shipmentId ? { ...shipment, [field]: value } : shipment)),
  }));

  // A migrated shipment may still carry `plannedPeriod.text` (spec §6) - preserved untouched here
  // (spread first) since there's no input for it; only startDate/endDate are ever edited.
  const updateShipmentPeriodField = (shipmentId, field, value) => setDraft(previous => ({
    ...previous,
    embryoShipments: previous.embryoShipments.map(shipment => (shipment.id === shipmentId
      ? { ...shipment, plannedPeriod: { ...(shipment.plannedPeriod || {}), [field]: value } }
      : shipment)),
  }));

  // --- The one transfer attempt + its nested hCG tests/ultrasounds ------------------------------

  const updateTransferField = (field, value) => setDraft(previous => ({
    ...previous,
    transferAttempt: { ...previous.transferAttempt, [field]: value },
  }));

  const updateTransferList = (listKey, updater) => setDraft(previous => ({
    ...previous,
    transferAttempt: { ...previous.transferAttempt, [listKey]: updater(previous.transferAttempt[listKey]) },
  }));

  const addHcgTest = () => updateTransferList('hcgTests', hcgTests => [...hcgTests, {
    id: nextSequentialId('hcg', hcgTests), date: '', positive: '', value: '', unit: '',
  }]);
  const removeHcgTest = hcgTestId => updateTransferList('hcgTests', hcgTests => hcgTests.filter(item => item.id !== hcgTestId));
  const updateHcgTestField = (hcgTestId, field, value) => updateTransferList(
    'hcgTests',
    hcgTests => hcgTests.map(item => (item.id === hcgTestId ? { ...item, [field]: value } : item)),
  );

  const addUltrasound = () => updateTransferList('ultrasounds', ultrasounds => [...ultrasounds, {
    id: nextSequentialId('ultrasound', ultrasounds), date: '', pregnancyConfirmed: '', fetusCount: '', gestationalAgeWeeks: { from: '', to: '' },
  }]);
  const removeUltrasound = ultrasoundId => updateTransferList(
    'ultrasounds',
    ultrasounds => ultrasounds.filter(item => item.id !== ultrasoundId),
  );
  const updateUltrasoundField = (ultrasoundId, field, value) => updateTransferList(
    'ultrasounds',
    ultrasounds => ultrasounds.map(item => (item.id === ultrasoundId ? { ...item, [field]: value } : item)),
  );
  const updateUltrasoundGestField = (ultrasoundId, field, value) => updateTransferList(
    'ultrasounds',
    ultrasounds => ultrasounds.map(item => (item.id === ultrasoundId
      ? { ...item, gestationalAgeWeeks: { ...(item.gestationalAgeWeeks || {}), [field]: value } }
      : item)),
  );

  // --- Save --------------------------------------------------------------------------------------

  const parseTriState = value => (value === 'true' ? true : (value === 'false' ? false : undefined));
  const parseNumberOrBlank = value => (value === '' || value === undefined || value === null ? undefined : Number(value));

  const handleSave = async () => {
    if (!selectedCase) return;
    const payload = {
      medicalIndication: draft.medicalIndication,
      geneticMaterial: draft.geneticMaterial,
      medicalTeam: draft.medicalTeam,
      embryoShipments: arrayToMap(draft.embryoShipments.map(shipment => ({
        ...shipment,
        ivfDate: normalizeIsoDate(shipment.ivfDate),
        receivedDate: normalizeIsoDate(shipment.receivedDate),
        plannedPeriod: {
          ...(shipment.plannedPeriod || {}),
          startDate: normalizeIsoDate(shipment.plannedPeriod?.startDate),
          endDate: normalizeIsoDate(shipment.plannedPeriod?.endDate),
        },
      }))),
      transferAttempt: {
        ...draft.transferAttempt,
        date: normalizeIsoDate(draft.transferAttempt.date),
        embryoCount: parseNumberOrBlank(draft.transferAttempt.embryoCount),
        hcgTests: arrayToMap(draft.transferAttempt.hcgTests.map(hcgTest => ({
          ...hcgTest,
          date: normalizeIsoDate(hcgTest.date),
          positive: parseTriState(hcgTest.positive),
          value: parseNumberOrBlank(hcgTest.value),
        }))),
        ultrasounds: arrayToMap(draft.transferAttempt.ultrasounds.map(ultrasound => ({
          ...ultrasound,
          date: normalizeIsoDate(ultrasound.date),
          pregnancyConfirmed: parseTriState(ultrasound.pregnancyConfirmed),
          fetusCount: parseNumberOrBlank(ultrasound.fetusCount),
          gestationalAgeWeeks: {
            from: parseNumberOrBlank(ultrasound.gestationalAgeWeeks?.from),
            to: parseNumberOrBlank(ultrasound.gestationalAgeWeeks?.to),
          },
        }))),
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
      toast.success('ART program details saved.');
    } catch (saveError) {
      console.error('Unable to save the ART program details', saveError);
      toast.error(`Could not save the ART program details: ${describeSaveError(saveError)}`);
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
          Діагноз
          <FieldInput type="text" value={draft.medicalIndication.diagnosis.uk} onChange={event => updateDiagnosis(event.target.value)} />
        </Field>
        <Field>
          Джерело яйцеклітин
          <Select
            value={draft.geneticMaterial.oocyteSourcePartnerRole}
            onChange={event => updateGeneticMaterial('oocyteSourcePartnerRole', event.target.value)}
          >
            {PARTNER_ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        <Field>
          Джерело сперматозоїдів
          <Select
            value={draft.geneticMaterial.spermSourcePartnerRole}
            onChange={event => updateGeneticMaterial('spermSourcePartnerRole', event.target.value)}
          >
            {PARTNER_ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        <Field>
          Лікар програми
          <FieldInput
            type="text"
            value={draft.medicalTeam.physician.name.uk.nominative}
            onChange={event => updatePhysicianName(event.target.value)}
          />
        </Field>
      </FieldGrid>

      <SectionSubhead style={{ marginTop: 14 }}>Доставлення ембріонів</SectionSubhead>
      {draft.embryoShipments.map((shipment, index) => (
        <DocRow key={shipment.id}>
          <DocRowHead>
            <DocSubtitle style={{ fontWeight: 700 }}>{shipment.id || `Доставлення ${index + 1}`}</DocSubtitle>
            <DangerButton type="button" onClick={() => removeShipment(shipment.id)} title="Remove this shipment">
              <FaTrash />
            </DangerButton>
          </DocRowHead>
          <FieldGrid>
            <Field>
              Клініка-відправник
              <Select value={shipment.sourceClinicId || ''} onChange={event => updateShipmentField(shipment.id, 'sourceClinicId', event.target.value)}>
                <option value="">— не обрано —</option>
                {catalog.parties.partnerClinics.map(partnerClinic => (
                  <option key={partnerClinic.id} value={String(partnerClinic.id)}>{partnerClinic.name?.uk || partnerClinic.id}</option>
                ))}
              </Select>
            </Field>
            <Field>
              Клініка-отримувач
              <Select
                value={shipment.destinationClinicId || ''}
                onChange={event => updateShipmentField(shipment.id, 'destinationClinicId', event.target.value)}
              >
                <option value="">— не обрано —</option>
                {catalog.parties.clinics.map(clinic => (
                  <option key={clinic.id} value={String(clinic.id)}>{clinic.name?.uk || clinic.medicalCenterName?.uk || clinic.id}</option>
                ))}
              </Select>
            </Field>
            <Field>
              Дата ЗІВ
              <FieldInput type="date" value={shipment.ivfDate || ''} onChange={event => updateShipmentField(shipment.id, 'ivfDate', event.target.value)} />
            </Field>
            <Field>
              Запланований період — початок
              <FieldInput
                type="date"
                value={shipment.plannedPeriod?.startDate || ''}
                onChange={event => updateShipmentPeriodField(shipment.id, 'startDate', event.target.value)}
              />
            </Field>
            <Field>
              Запланований період — кінець
              <FieldInput
                type="date"
                value={shipment.plannedPeriod?.endDate || ''}
                onChange={event => updateShipmentPeriodField(shipment.id, 'endDate', event.target.value)}
              />
            </Field>
            <Field>
              Дата фактичного отримання
              <FieldInput
                type="date"
                value={shipment.receivedDate || ''}
                onChange={event => updateShipmentField(shipment.id, 'receivedDate', event.target.value)}
              />
            </Field>
          </FieldGrid>
          {shipment.plannedPeriod?.text?.uk || shipment.plannedPeriod?.text?.en ? (
            <DocSubtitle style={{ marginTop: 6 }}>
              Мігрований текстовий період: {shipment.plannedPeriod.text.uk || shipment.plannedPeriod.text.en}
            </DocSubtitle>
          ) : null}
        </DocRow>
      ))}
      <RowLine style={{ marginTop: 8 }}>
        <SmallButton type="button" onClick={addShipment}>
          <FaPlus /> Add shipment
        </SmallButton>
      </RowLine>

      {/* One record only (batch 24 §2) - the successful transfer attempt's data, filled in once its
          outcome is known. No add/remove: this is an edit form for that one record, not a list. */}
      <SectionSubhead style={{ marginTop: 14 }}>Спроба переносу</SectionSubhead>
      <DocRow>
        <FieldGrid>
          <Field>
            Доставлення
            <Select value={draft.transferAttempt.shipmentId || ''} onChange={event => updateTransferField('shipmentId', event.target.value)}>
              <option value="">— не обрано —</option>
              {draft.embryoShipments.map(shipment => (
                <option key={shipment.id} value={shipment.id}>
                  {formatShipmentOptionLabel(shipment, catalog.parties) || shipment.id}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            Дата переносу
            <FieldInput type="date" value={draft.transferAttempt.date || ''} onChange={event => updateTransferField('date', event.target.value)} />
          </Field>
          <Field>
            Кількість ембріонів
            <FieldInput
              type="number"
              min="0"
              value={draft.transferAttempt.embryoCount ?? ''}
              onChange={event => updateTransferField('embryoCount', event.target.value)}
            />
          </Field>
          <Field>
            Стадія ембріонів
            <FieldInput
              type="text"
              list="art-embryo-stage-options"
              placeholder="blastocyst"
              value={draft.transferAttempt.embryoStage || ''}
              onChange={event => updateTransferField('embryoStage', event.target.value)}
            />
          </Field>
        </FieldGrid>

        <SectionSubhead style={{ marginTop: 10, fontSize: 10.5 }}>Аналізи ХГЧ</SectionSubhead>
        {draft.transferAttempt.hcgTests.map((hcgTest, hcgIndex) => (
          <NestedRow key={hcgTest.id}>
            <DocRowHead>
              <DocSubtitle style={{ fontWeight: 700 }}>{hcgTest.id || `ХГЧ ${hcgIndex + 1}`}</DocSubtitle>
              <DangerButton type="button" onClick={() => removeHcgTest(hcgTest.id)} title="Remove this hCG test">
                <FaTrash />
              </DangerButton>
            </DocRowHead>
            <FieldGrid>
              <Field>
                Дата
                <FieldInput
                  type="date"
                  value={hcgTest.date || ''}
                  onChange={event => updateHcgTestField(hcgTest.id, 'date', event.target.value)}
                />
              </Field>
              <Field>
                Результат
                <Select
                  value={hcgTest.positive === true ? 'true' : (hcgTest.positive === false ? 'false' : '')}
                  onChange={event => updateHcgTestField(hcgTest.id, 'positive', event.target.value)}
                >
                  {TRI_STATE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </Field>
              <Field>
                Значення
                <FieldInput
                  type="number"
                  value={hcgTest.value ?? ''}
                  onChange={event => updateHcgTestField(hcgTest.id, 'value', event.target.value)}
                />
              </Field>
              <Field>
                Одиниці вимірювання
                <FieldInput
                  type="text"
                  value={hcgTest.unit || ''}
                  onChange={event => updateHcgTestField(hcgTest.id, 'unit', event.target.value)}
                />
              </Field>
            </FieldGrid>
          </NestedRow>
        ))}
        <RowLine style={{ marginTop: 8 }}>
          <SmallButton type="button" onClick={addHcgTest}>
            <FaPlus /> Add hCG test
          </SmallButton>
        </RowLine>

        <SectionSubhead style={{ marginTop: 10, fontSize: 10.5 }}>УЗД</SectionSubhead>
        {draft.transferAttempt.ultrasounds.map((ultrasound, ultrasoundIndex) => (
          <NestedRow key={ultrasound.id}>
            <DocRowHead>
              <DocSubtitle style={{ fontWeight: 700 }}>{ultrasound.id || `УЗД ${ultrasoundIndex + 1}`}</DocSubtitle>
              <DangerButton type="button" onClick={() => removeUltrasound(ultrasound.id)} title="Remove this ultrasound">
                <FaTrash />
              </DangerButton>
            </DocRowHead>
            <FieldGrid>
              <Field>
                Дата
                <FieldInput
                  type="date"
                  value={ultrasound.date || ''}
                  onChange={event => updateUltrasoundField(ultrasound.id, 'date', event.target.value)}
                />
              </Field>
              <Field>
                Вагітність підтверджена
                <Select
                  value={ultrasound.pregnancyConfirmed === true ? 'true' : (ultrasound.pregnancyConfirmed === false ? 'false' : '')}
                  onChange={event => updateUltrasoundField(ultrasound.id, 'pregnancyConfirmed', event.target.value)}
                >
                  {TRI_STATE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </Field>
              <Field>
                Кількість плодів
                <FieldInput
                  type="number"
                  min="0"
                  value={ultrasound.fetusCount ?? ''}
                  onChange={event => updateUltrasoundField(ultrasound.id, 'fetusCount', event.target.value)}
                />
              </Field>
              <Field>
                Строк вагітності — від (тижнів)
                <FieldInput
                  type="number"
                  min="0"
                  value={ultrasound.gestationalAgeWeeks?.from ?? ''}
                  onChange={event => updateUltrasoundGestField(ultrasound.id, 'from', event.target.value)}
                />
              </Field>
              <Field>
                Строк вагітності — до (тижнів)
                <FieldInput
                  type="number"
                  min="0"
                  value={ultrasound.gestationalAgeWeeks?.to ?? ''}
                  onChange={event => updateUltrasoundGestField(ultrasound.id, 'to', event.target.value)}
                />
              </Field>
            </FieldGrid>
          </NestedRow>
        ))}
        <RowLine style={{ marginTop: 8 }}>
          <SmallButton type="button" onClick={addUltrasound}>
            <FaPlus /> Add ultrasound
          </SmallButton>
        </RowLine>
      </DocRow>

      <datalist id="art-embryo-stage-options">
        <option value="blastocyst" />
      </datalist>

      <RowLine style={{ marginTop: 14 }}>
        <PrimaryMiniButton type="button" onClick={handleSave}>
          Save ART program
        </PrimaryMiniButton>
      </RowLine>
    </Section>
  );
};

export default CaseArtProgramEditor;
