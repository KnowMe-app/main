// "Дані для заяви в РАЦС" (childbirth + documents editor) - shared between Documents Builder
// (editing a case while preparing to generate its documents) and the Parties page (editing a case
// as part of assembling it), so the form structure isn't duplicated. Self-contained: owns its own
// drafts, resets them whenever the selected case changes, and persists additively to the
// documentsBuilder/cases/{caseId} tree either host page already reads/writes. The case's
// `documents` branch only ever holds structured input data (surrogacyAgreement, birth-registration
// statement date/notary) - never a stored/overridden rendering of a document.
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { ref, set } from 'firebase/database';
import { FaPlus, FaTrash } from 'react-icons/fa';
import { database } from './config';
import {
  DOCUMENTS_CASES_PATH,
  createChildRecord,
  normalizeIsoDate,
  removeEmptyCaseValues,
  toArray,
} from './documentsCatalogUtils';

// Self-contained styled primitives (DocumentsPage's Section/FieldGrid idiom - see design-tasks
// notes there) rather than importing DocumentsPage's, so this component has no dependency on that
// page's internals and can be dropped into any --km-* scoped page (Documents, Parties) as-is.
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

// A generic "Could not save." toast leaves an admin stuck with no way to tell a permission-rules
// rejection from a network blip from a real bug - none of which show up anywhere on a phone (no
// devtools console to check). Every save handler below folds the real Firebase error code/message
// into the toast itself, same idea as DocumentsPage's describeStorageError for Storage failures.
const describeSaveError = error => `${error?.code || error?.name || 'error'}: ${error?.message || String(error)}`.trim();

const CaseChildbirthTransactionEditor = ({ catalog, setCatalog, caseId, onSelectedChildIdChange }) => {
  const selectedCase = catalog.cases.find(item => String(item.id) === String(caseId)) || null;

  // Which of the selected case's childbirth.children[] documents are generated for ('' = default
  // to the first child - a case with just one child never needs this shown).
  const [selectedChildId, setSelectedChildId] = useState('');
  // Local editable copies of the selected case's childbirth/documents data - reset from the
  // backend record whenever the selected case changes, saved back explicitly via their own Save
  // buttons, same pattern as the per-document format draft in Documents Builder.
  const [childbirthDraft, setChildbirthDraft] = useState({ maternityHospitalId: '', children: [] });
  const [surrogacyAgreementDraft, setSurrogacyAgreementDraft] = useState({ number: { uk: '', en: '' }, date: '' });
  const [birthRegistrationDraft, setBirthRegistrationDraft] = useState({ statementDate: '', notaryId: '' });
  const [embryoOwnershipDraft, setEmbryoOwnershipDraft] = useState({ shipmentPeriod: { uk: '', en: '' }, ivfDate: '' });

  useEffect(() => {
    // `childbirth.children` isn't guaranteed to be a real array - a case edited straight in the
    // Firebase console can carry it as a gap-object, which crashed every `.map()` below with no
    // error boundary to catch it (blank page).
    setChildbirthDraft({
      maternityHospitalId: selectedCase?.childbirth?.maternityHospitalId || '',
      children: toArray(selectedCase?.childbirth?.children),
    });
    setSurrogacyAgreementDraft({
      number: {
        uk: selectedCase?.documents?.surrogacyAgreement?.number?.uk || '',
        en: selectedCase?.documents?.surrogacyAgreement?.number?.en || '',
      },
      date: selectedCase?.documents?.surrogacyAgreement?.date || '',
    });
    setBirthRegistrationDraft({
      statementDate: selectedCase?.documents?.birthRegistrationConsent?.statementDate || '',
      notaryId: selectedCase?.documents?.birthRegistrationConsent?.notaryId || '',
    });
    setEmbryoOwnershipDraft({
      shipmentPeriod: {
        uk: selectedCase?.documents?.embryoOwnershipStatement?.shipmentPeriod?.uk || '',
        en: selectedCase?.documents?.embryoOwnershipStatement?.shipmentPeriod?.en || '',
      },
      // `<input type="date">` only ever shows/emits ISO - a still-legacy `DD.MM.YYYY` import (spec
      // §6) has to be read into ISO here or the field would just render blank.
      ivfDate: normalizeIsoDate(selectedCase?.documents?.embryoOwnershipStatement?.ivfDate || ''),
    });
    setSelectedChildId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  useEffect(() => {
    onSelectedChildIdChange?.(selectedChildId);
  }, [selectedChildId, onSelectedChildIdChange]);

  const updateChildbirthField = (field, value) => setChildbirthDraft(previous => ({ ...previous, [field]: value }));

  const updateChildField = (childId, field, value) => setChildbirthDraft(previous => ({
    ...previous,
    children: previous.children.map(child => (child.id === childId ? { ...child, [field]: value } : child)),
  }));

  const updateChildNestedField = (childId, group, field, value) => setChildbirthDraft(previous => ({
    ...previous,
    children: previous.children.map(child => (child.id === childId
      ? { ...child, [group]: { ...(child[group] || {}), [field]: value } }
      : child)),
  }));

  const handleAddChild = () => setChildbirthDraft(previous => ({
    ...previous,
    children: [...previous.children, createChildRecord()],
  }));

  // Removing the currently-selected child falls back to the default (first child) rather than
  // pointing the document generator at an id that no longer exists.
  const handleRemoveChild = childId => {
    setChildbirthDraft(previous => ({
      ...previous,
      children: previous.children.filter(child => child.id !== childId),
    }));
    setSelectedChildId(previous => (previous === childId ? '' : previous));
  };

  const handleSaveChildbirth = async () => {
    if (!selectedCase) return;
    try {
      await set(ref(database, `${DOCUMENTS_CASES_PATH}/${selectedCase.id}/childbirth`), childbirthDraft);
      setCatalog(previous => ({
        ...previous,
        cases: previous.cases.map(item => (String(item.id) === String(selectedCase.id)
          ? { ...item, childbirth: childbirthDraft }
          : item)),
      }));
      toast.success('Childbirth details saved.');
    } catch (saveError) {
      console.error('Unable to save childbirth details', saveError);
      toast.error(`Could not save the childbirth details: ${describeSaveError(saveError)}`);
    }
  };

  const updateSurrogacyAgreementField = (path, value) => setSurrogacyAgreementDraft(previous => {
    if (path === 'date') return { ...previous, date: value };
    return { ...previous, number: { ...previous.number, [path]: value } };
  });

  const updateBirthRegistrationField = (field, value) => setBirthRegistrationDraft(previous => ({ ...previous, [field]: value }));

  // Never writes an empty `documents.surrogacyAgreement`/`documents.birthRegistrationConsent`
  // service object - clearing every field in a section and saving removes that node entirely
  // instead of leaving `{}` behind.
  const handleSaveSurrogacyAgreement = async () => {
    if (!selectedCase) return;
    const cleaned = removeEmptyCaseValues(surrogacyAgreementDraft);
    const nextValue = Object.keys(cleaned).length ? cleaned : null;
    try {
      await set(ref(database, `${DOCUMENTS_CASES_PATH}/${selectedCase.id}/documents/surrogacyAgreement`), nextValue);
      setCatalog(previous => ({
        ...previous,
        cases: previous.cases.map(item => {
          if (String(item.id) !== String(selectedCase.id)) return item;
          const documents = { ...(item.documents || {}) };
          if (nextValue) documents.surrogacyAgreement = nextValue;
          else delete documents.surrogacyAgreement;
          return { ...item, documents };
        }),
      }));
      toast.success('Surrogacy agreement saved.');
    } catch (saveError) {
      console.error('Unable to save the surrogacy agreement', saveError);
      toast.error(`Could not save the surrogacy agreement: ${describeSaveError(saveError)}`);
    }
  };

  const handleSaveBirthRegistration = async () => {
    if (!selectedCase) return;
    const cleaned = removeEmptyCaseValues(birthRegistrationDraft);
    const nextValue = Object.keys(cleaned).length ? cleaned : null;
    try {
      await set(ref(database, `${DOCUMENTS_CASES_PATH}/${selectedCase.id}/documents/birthRegistrationConsent`), nextValue);
      setCatalog(previous => ({
        ...previous,
        cases: previous.cases.map(item => {
          if (String(item.id) !== String(selectedCase.id)) return item;
          const documents = { ...(item.documents || {}) };
          if (nextValue) documents.birthRegistrationConsent = nextValue;
          else delete documents.birthRegistrationConsent;
          return { ...item, documents };
        }),
      }));
      toast.success('Birth registration details saved.');
    } catch (saveError) {
      console.error('Unable to save the birth registration details', saveError);
      toast.error(`Could not save the birth registration details: ${describeSaveError(saveError)}`);
    }
  };

  const updateEmbryoOwnershipField = (path, value) => setEmbryoOwnershipDraft(previous => {
    if (path === 'ivfDate') return { ...previous, ivfDate: value };
    return { ...previous, shipmentPeriod: { ...previous.shipmentPeriod, [path]: value } };
  });

  // Every save normalizes ivfDate to ISO (spec §6: "під час наступного збереження нормалізувати
  // дату до ISO") - a no-op once the field is already ISO, since normalizeIsoDate is idempotent,
  // and the source `<input type="date">` already only ever emits ISO itself.
  const handleSaveEmbryoOwnership = async () => {
    if (!selectedCase) return;
    const cleaned = removeEmptyCaseValues({
      shipmentPeriod: embryoOwnershipDraft.shipmentPeriod,
      ivfDate: normalizeIsoDate(embryoOwnershipDraft.ivfDate),
    });
    const nextValue = Object.keys(cleaned).length ? cleaned : null;
    try {
      await set(ref(database, `${DOCUMENTS_CASES_PATH}/${selectedCase.id}/documents/embryoOwnershipStatement`), nextValue);
      setCatalog(previous => ({
        ...previous,
        cases: previous.cases.map(item => {
          if (String(item.id) !== String(selectedCase.id)) return item;
          const documents = { ...(item.documents || {}) };
          if (nextValue) documents.embryoOwnershipStatement = nextValue;
          else delete documents.embryoOwnershipStatement;
          return { ...item, documents };
        }),
      }));
      toast.success('Embryo ownership statement details saved.');
    } catch (saveError) {
      console.error('Unable to save the embryo ownership statement details', saveError);
      toast.error(`Could not save the embryo ownership statement details: ${describeSaveError(saveError)}`);
    }
  };

  if (!selectedCase) return null;

  return (
    <Section>
      <SectionHead>
        <SectionTitle>Дані для заяви в РАЦС</SectionTitle>
      </SectionHead>

      <SectionSubhead>Пологи</SectionSubhead>
      <RowLine style={{ marginTop: 6 }}>
        <Field style={{ flex: 1, minWidth: 220 }}>
          Пологовий будинок
          <Select
            value={childbirthDraft.maternityHospitalId || ''}
            onChange={event => updateChildbirthField('maternityHospitalId', event.target.value)}
          >
            <option value="">— не обрано —</option>
            {catalog.parties.maternityHospitals.map(hospital => (
              <option key={hospital.id} value={String(hospital.id)}>
                {hospital.shortName?.uk || hospital.name?.uk || hospital.id}
              </option>
            ))}
          </Select>
        </Field>
      </RowLine>

      {childbirthDraft.children.map((child, childIndex) => (
        <DocRow key={child.id}>
          <DocRowHead>
            <DocSubtitle style={{ fontWeight: 700 }}>Дитина {childIndex + 1}</DocSubtitle>
            <DangerButton
              type="button"
              onClick={() => handleRemoveChild(child.id)}
              title="Remove this child"
            >
              <FaTrash />
            </DangerButton>
          </DocRowHead>
          <FieldGrid>
            <Field>
              Стать
              <Select value={child.sex || ''} onChange={event => updateChildField(child.id, 'sex', event.target.value)}>
                <option value="">— не обрано —</option>
                <option value="female">жіноча</option>
                <option value="male">чоловіча</option>
              </Select>
            </Field>
            <Field>
              Дата народження
              <FieldInput
                type="date"
                value={child.birthDate || ''}
                onChange={event => updateChildField(child.id, 'birthDate', event.target.value)}
              />
            </Field>
            <Field>
              Місце народження (укр)
              <FieldInput
                type="text"
                value={child.birthPlace?.uk || ''}
                onChange={event => updateChildNestedField(child.id, 'birthPlace', 'uk', event.target.value)}
              />
            </Field>
            <Field>
              Місце народження (eng)
              <FieldInput
                type="text"
                value={child.birthPlace?.en || ''}
                onChange={event => updateChildNestedField(child.id, 'birthPlace', 'en', event.target.value)}
              />
            </Field>
            <Field>
              № медичного висновку
              <FieldInput
                type="text"
                value={child.medicalConclusion?.number || ''}
                onChange={event => updateChildNestedField(child.id, 'medicalConclusion', 'number', event.target.value)}
              />
            </Field>
            <Field>
              Дата медичного висновку
              <FieldInput
                type="date"
                value={child.medicalConclusion?.date || ''}
                onChange={event => updateChildNestedField(child.id, 'medicalConclusion', 'date', event.target.value)}
              />
            </Field>
          </FieldGrid>
        </DocRow>
      ))}

      <RowLine style={{ marginTop: 8 }}>
        <SmallButton type="button" onClick={handleAddChild}>
          <FaPlus /> Add child
        </SmallButton>
        <PrimaryMiniButton type="button" onClick={handleSaveChildbirth}>
          Save childbirth details
        </PrimaryMiniButton>
      </RowLine>

      {childbirthDraft.children.length > 1 ? (
        <RowLine style={{ marginTop: 10 }}>
          <Field style={{ flex: 1, minWidth: 220 }}>
            Дитина для документа
            <Select value={selectedChildId} onChange={event => setSelectedChildId(event.target.value)}>
              {childbirthDraft.children.map((child, childIndex) => (
                <option key={child.id} value={child.id}>
                  Дитина {childIndex + 1}{child.sex ? ` (${child.sex === 'female' ? 'дівчинка' : 'хлопчик'})` : ''}
                </option>
              ))}
            </Select>
          </Field>
        </RowLine>
      ) : null}

      <SectionSubhead style={{ marginTop: 14 }}>Договір сурогатного материнства</SectionSubhead>
      <FieldGrid>
        <Field>
          Номер (укр)
          <FieldInput
            type="text"
            value={surrogacyAgreementDraft.number.uk || ''}
            onChange={event => updateSurrogacyAgreementField('uk', event.target.value)}
          />
        </Field>
        <Field>
          Номер (eng)
          <FieldInput
            type="text"
            value={surrogacyAgreementDraft.number.en || ''}
            onChange={event => updateSurrogacyAgreementField('en', event.target.value)}
          />
        </Field>
        <Field>
          Дата договору
          <FieldInput
            type="date"
            value={surrogacyAgreementDraft.date || ''}
            onChange={event => updateSurrogacyAgreementField('date', event.target.value)}
          />
        </Field>
      </FieldGrid>
      <RowLine style={{ marginTop: 8 }}>
        <PrimaryMiniButton type="button" onClick={handleSaveSurrogacyAgreement}>
          Save surrogacy agreement
        </PrimaryMiniButton>
      </RowLine>

      <SectionSubhead style={{ marginTop: 14 }}>Заява до РАЦС</SectionSubhead>
      <FieldGrid>
        <Field>
          Дата заяви
          <FieldInput
            type="date"
            value={birthRegistrationDraft.statementDate || ''}
            onChange={event => updateBirthRegistrationField('statementDate', event.target.value)}
          />
        </Field>
        <Field>
          Нотаріус
          <Select value={birthRegistrationDraft.notaryId || ''} onChange={event => updateBirthRegistrationField('notaryId', event.target.value)}>
            <option value="">— не обрано —</option>
            {catalog.parties.notaries.map(notary => (
              <option key={notary.id} value={String(notary.id)}>
                {notary.name?.uk?.short || notary.name?.uk?.nominative || notary.id}
              </option>
            ))}
          </Select>
        </Field>
      </FieldGrid>
      <RowLine style={{ marginTop: 8 }}>
        <PrimaryMiniButton type="button" onClick={handleSaveBirthRegistration}>
          Save birth registration details
        </PrimaryMiniButton>
      </RowLine>

      <SectionSubhead style={{ marginTop: 14 }}>Приналежність ембріонів</SectionSubhead>
      <FieldGrid>
        <Field>
          Період передачі ембріонів (укр)
          <FieldInput
            type="text"
            value={embryoOwnershipDraft.shipmentPeriod.uk || ''}
            onChange={event => updateEmbryoOwnershipField('uk', event.target.value)}
          />
        </Field>
        <Field>
          Період передачі ембріонів (eng)
          <FieldInput
            type="text"
            value={embryoOwnershipDraft.shipmentPeriod.en || ''}
            onChange={event => updateEmbryoOwnershipField('en', event.target.value)}
          />
        </Field>
        <Field>
          Дата програми ЗІВ
          <FieldInput
            type="date"
            value={embryoOwnershipDraft.ivfDate || ''}
            onChange={event => updateEmbryoOwnershipField('ivfDate', event.target.value)}
          />
        </Field>
      </FieldGrid>
      <RowLine style={{ marginTop: 8 }}>
        <PrimaryMiniButton type="button" onClick={handleSaveEmbryoOwnership}>
          Save embryo ownership statement details
        </PrimaryMiniButton>
      </RowLine>
    </Section>
  );
};

export default CaseChildbirthTransactionEditor;
