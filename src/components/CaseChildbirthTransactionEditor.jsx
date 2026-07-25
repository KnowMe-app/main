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
  formatHcgTestOptionLabel,
  formatShipmentOptionLabel,
  formatShortNameUk,
  formatTransferOptionLabel,
  formatUltrasoundOptionLabel,
  getMaternityHospitalDisplayName,
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

// A notary select's option label - the short display name computed on the fly (never read from a
// stored `short` field, which no longer exists - spec §5/§13), falling back to the full nominative
// name, then the raw id for a record with no name at all.
const notaryOptionLabel = notary => {
  const nominative = notary?.name?.uk?.nominative || '';
  return formatShortNameUk(nominative) || nominative || notary?.id || '';
};

const CaseChildbirthTransactionEditor = ({ catalog, setCatalog, caseId, onSelectedChildIdChange }) => {
  const selectedCase = catalog.cases.find(item => String(item.id) === String(caseId)) || null;

  // Which of the selected case's childbirth.children[] documents are generated for ('' = default
  // to the first child - a case with just one child never needs this shown).
  const [selectedChildId, setSelectedChildId] = useState('');
  // Local editable copies of the selected case's childbirth/documents data - reset from the
  // backend record whenever the selected case changes, saved back explicitly via their own Save
  // buttons, same pattern as the per-document format draft in Documents Builder.
  const [childbirthDraft, setChildbirthDraft] = useState({ maternityHospitalId: '', children: [] });
  const [surrogacyAgreementDraft, setSurrogacyAgreementDraft] = useState({ number: { uk: '', en: '' }, date: '', notaryId: '' });
  const [birthRegistrationDraft, setBirthRegistrationDraft] = useState({ statementDate: '', notaryId: '' });
  const [maritalStatusDeclarationDraft, setMaritalStatusDeclarationDraft] = useState({ statementDate: '', notaryId: '' });
  const [legalServicesDisclaimerDraft, setLegalServicesDisclaimerDraft] = useState({ statementDate: '', notaryId: '' });
  // No notaryId field - this appendix isn't itself notarized (see TEMPLATE_DOCUMENT_CONFIG's
  // usesNotary: false for surrogacy-agreement-appendix-1).
  const [surrogacyAgreementAppendix1Draft, setSurrogacyAgreementAppendix1Draft] = useState({ date: '' });
  // Spec §4/§14: a fresh pick always writes `shipmentId` (resolved against case.artProgram.
  // embryoShipments); `legacyIvfDate`/`legacyShipmentPeriod` are read-only leftovers from a
  // not-yet-migrated record, carried through unedited on save so simply opening/saving this editor
  // (without touching the shipment dropdown) never destroys them.
  const [embryoOwnershipDraft, setEmbryoOwnershipDraft] = useState({ shipmentId: '', legacyIvfDate: '', legacyShipmentPeriod: null });
  const [geneticAffinityCertificateDraft, setGeneticAffinityCertificateDraft] = useState({
    transferAttemptId: '', hcgTestId: '', ultrasoundId: '', issueDate: '', outgoingNumber: '',
  });
  const [racssClinicLetterDraft, setRacssClinicLetterDraft] = useState({ transferAttemptId: '', ultrasoundId: '' });
  const [medicalServicesAgreementDraft, setMedicalServicesAgreementDraft] = useState({ date: '' });

  // Every artProgram-referencing dropdown reads from the same source: the selected case's own
  // shipments/transfer attempts (never converted to arrays for storage - see documentsCatalogUtils
  // - only here, transiently, for rendering <option>s).
  const artShipments = toArray(selectedCase?.artProgram?.embryoShipments);
  const artTransferAttempts = toArray(selectedCase?.artProgram?.transferAttempts);
  const certificateTransfer = artTransferAttempts.find(item => item.id === geneticAffinityCertificateDraft.transferAttemptId) || null;
  const certificateHcgTests = toArray(certificateTransfer?.hcgTests);
  const certificateUltrasounds = toArray(certificateTransfer?.ultrasounds);
  const letterTransfer = artTransferAttempts.find(item => item.id === racssClinicLetterDraft.transferAttemptId) || null;
  const letterUltrasounds = toArray(letterTransfer?.ultrasounds);

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
      notaryId: selectedCase?.documents?.surrogacyAgreement?.notaryId || '',
    });
    setBirthRegistrationDraft({
      statementDate: selectedCase?.documents?.birthRegistrationConsent?.statementDate || '',
      notaryId: selectedCase?.documents?.birthRegistrationConsent?.notaryId || '',
    });
    setMaritalStatusDeclarationDraft({
      statementDate: selectedCase?.documents?.maritalStatusDeclaration?.statementDate || '',
      notaryId: selectedCase?.documents?.maritalStatusDeclaration?.notaryId || '',
    });
    setLegalServicesDisclaimerDraft({
      statementDate: selectedCase?.documents?.legalServicesDisclaimer?.statementDate || '',
      notaryId: selectedCase?.documents?.legalServicesDisclaimer?.notaryId || '',
    });
    setSurrogacyAgreementAppendix1Draft({
      date: selectedCase?.documents?.surrogacyAgreementAppendix1?.date || '',
    });
    setEmbryoOwnershipDraft({
      shipmentId: selectedCase?.documents?.embryoOwnershipStatement?.shipmentId || '',
      legacyIvfDate: selectedCase?.documents?.embryoOwnershipStatement?.ivfDate || '',
      legacyShipmentPeriod: selectedCase?.documents?.embryoOwnershipStatement?.shipmentPeriod || null,
    });
    setGeneticAffinityCertificateDraft({
      transferAttemptId: selectedCase?.documents?.geneticAffinityCertificate?.transferAttemptId || '',
      hcgTestId: selectedCase?.documents?.geneticAffinityCertificate?.hcgTestId || '',
      ultrasoundId: selectedCase?.documents?.geneticAffinityCertificate?.ultrasoundId || '',
      issueDate: selectedCase?.documents?.geneticAffinityCertificate?.issueDate || '',
      outgoingNumber: selectedCase?.documents?.geneticAffinityCertificate?.outgoingNumber || '',
    });
    setRacssClinicLetterDraft({
      transferAttemptId: selectedCase?.documents?.racssClinicLetter?.transferAttemptId || '',
      ultrasoundId: selectedCase?.documents?.racssClinicLetter?.ultrasoundId || '',
    });
    setMedicalServicesAgreementDraft({
      date: selectedCase?.documents?.medicalServicesAgreement?.date || '',
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
    if (path === 'date' || path === 'notaryId') return { ...previous, [path]: value };
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

  const updateMaritalStatusDeclarationField = (field, value) => setMaritalStatusDeclarationDraft(previous => ({ ...previous, [field]: value }));

  // Never writes an empty `documents.maritalStatusDeclaration` service object - same rule as
  // surrogacyAgreement/birthRegistrationConsent above.
  const handleSaveMaritalStatusDeclaration = async () => {
    if (!selectedCase) return;
    const cleaned = removeEmptyCaseValues(maritalStatusDeclarationDraft);
    const nextValue = Object.keys(cleaned).length ? cleaned : null;
    try {
      await set(ref(database, `${DOCUMENTS_CASES_PATH}/${selectedCase.id}/documents/maritalStatusDeclaration`), nextValue);
      setCatalog(previous => ({
        ...previous,
        cases: previous.cases.map(item => {
          if (String(item.id) !== String(selectedCase.id)) return item;
          const documents = { ...(item.documents || {}) };
          if (nextValue) documents.maritalStatusDeclaration = nextValue;
          else delete documents.maritalStatusDeclaration;
          return { ...item, documents };
        }),
      }));
      toast.success('Marital status declaration details saved.');
    } catch (saveError) {
      console.error('Unable to save the marital status declaration details', saveError);
      toast.error(`Could not save the marital status declaration details: ${describeSaveError(saveError)}`);
    }
  };

  const updateLegalServicesDisclaimerField = (field, value) => setLegalServicesDisclaimerDraft(previous => ({ ...previous, [field]: value }));

  // Never writes an empty `documents.legalServicesDisclaimer` service object - same rule as every
  // other document section above.
  const handleSaveLegalServicesDisclaimer = async () => {
    if (!selectedCase) return;
    const cleaned = removeEmptyCaseValues(legalServicesDisclaimerDraft);
    const nextValue = Object.keys(cleaned).length ? cleaned : null;
    try {
      await set(ref(database, `${DOCUMENTS_CASES_PATH}/${selectedCase.id}/documents/legalServicesDisclaimer`), nextValue);
      setCatalog(previous => ({
        ...previous,
        cases: previous.cases.map(item => {
          if (String(item.id) !== String(selectedCase.id)) return item;
          const documents = { ...(item.documents || {}) };
          if (nextValue) documents.legalServicesDisclaimer = nextValue;
          else delete documents.legalServicesDisclaimer;
          return { ...item, documents };
        }),
      }));
      toast.success('Legal services disclaimer details saved.');
    } catch (saveError) {
      console.error('Unable to save the legal services disclaimer details', saveError);
      toast.error(`Could not save the legal services disclaimer details: ${describeSaveError(saveError)}`);
    }
  };

  const updateSurrogacyAgreementAppendix1Field = (field, value) => setSurrogacyAgreementAppendix1Draft(previous => ({ ...previous, [field]: value }));

  // Never writes an empty `documents.surrogacyAgreementAppendix1` service object - same rule as
  // every other document section above.
  const handleSaveSurrogacyAgreementAppendix1 = async () => {
    if (!selectedCase) return;
    const cleaned = removeEmptyCaseValues(surrogacyAgreementAppendix1Draft);
    const nextValue = Object.keys(cleaned).length ? cleaned : null;
    try {
      await set(ref(database, `${DOCUMENTS_CASES_PATH}/${selectedCase.id}/documents/surrogacyAgreementAppendix1`), nextValue);
      setCatalog(previous => ({
        ...previous,
        cases: previous.cases.map(item => {
          if (String(item.id) !== String(selectedCase.id)) return item;
          const documents = { ...(item.documents || {}) };
          if (nextValue) documents.surrogacyAgreementAppendix1 = nextValue;
          else delete documents.surrogacyAgreementAppendix1;
          return { ...item, documents };
        }),
      }));
      toast.success('Surrogacy agreement appendix 1 details saved.');
    } catch (saveError) {
      console.error('Unable to save the surrogacy agreement appendix 1 details', saveError);
      toast.error(`Could not save the surrogacy agreement appendix 1 details: ${describeSaveError(saveError)}`);
    }
  };

  const updateEmbryoOwnershipShipmentId = shipmentId => setEmbryoOwnershipDraft(previous => ({ ...previous, shipmentId }));

  // A generic "save one document sub-record" helper, shared by every document below - each just
  // supplies its own storage key and cleaned payload; never writes an empty `{}` service object,
  // same rule every document editor in this file already follows.
  const saveCaseDocument = async (storageKey, payload, successMessage, failureLabel) => {
    if (!selectedCase) return;
    const cleaned = removeEmptyCaseValues(payload);
    const nextValue = Object.keys(cleaned).length ? cleaned : null;
    try {
      await set(ref(database, `${DOCUMENTS_CASES_PATH}/${selectedCase.id}/documents/${storageKey}`), nextValue);
      setCatalog(previous => ({
        ...previous,
        cases: previous.cases.map(item => {
          if (String(item.id) !== String(selectedCase.id)) return item;
          const documents = { ...(item.documents || {}) };
          if (nextValue) documents[storageKey] = nextValue;
          else delete documents[storageKey];
          return { ...item, documents };
        }),
      }));
      toast.success(successMessage);
    } catch (saveError) {
      console.error(`Unable to save ${failureLabel}`, saveError);
      toast.error(`Could not save ${failureLabel}: ${describeSaveError(saveError)}`);
    }
  };

  // Spec §14: a fresh save always writes shipmentId once the admin has actually picked one from
  // the dropdown; only a case that's still untouched (no shipmentId chosen at all) keeps whatever
  // legacy ivfDate/shipmentPeriod it already had, so simply opening and saving this editor never
  // destroys not-yet-migrated data.
  const handleSaveEmbryoOwnership = () => {
    const payload = embryoOwnershipDraft.shipmentId
      ? { shipmentId: embryoOwnershipDraft.shipmentId }
      : {
        ivfDate: normalizeIsoDate(embryoOwnershipDraft.legacyIvfDate),
        shipmentPeriod: embryoOwnershipDraft.legacyShipmentPeriod,
      };
    return saveCaseDocument('embryoOwnershipStatement', payload, 'Embryo ownership statement details saved.', 'the embryo ownership statement details');
  };

  const updateGeneticAffinityCertificateField = (field, value) => setGeneticAffinityCertificateDraft(previous => {
    // Picking a different transfer attempt invalidates whatever hCG test/ultrasound was selected
    // from the previous one - they belong to a specific transfer, never shared across transfers.
    if (field === 'transferAttemptId') return { ...previous, transferAttemptId: value, hcgTestId: '', ultrasoundId: '' };
    return { ...previous, [field]: value };
  });

  const handleSaveGeneticAffinityCertificate = () => saveCaseDocument(
    'geneticAffinityCertificate',
    {
      transferAttemptId: geneticAffinityCertificateDraft.transferAttemptId,
      hcgTestId: geneticAffinityCertificateDraft.hcgTestId,
      ultrasoundId: geneticAffinityCertificateDraft.ultrasoundId,
      issueDate: normalizeIsoDate(geneticAffinityCertificateDraft.issueDate),
      outgoingNumber: geneticAffinityCertificateDraft.outgoingNumber,
    },
    'Genetic affinity certificate details saved.',
    'the genetic affinity certificate details',
  );

  const updateRacssClinicLetterField = (field, value) => setRacssClinicLetterDraft(previous => {
    if (field === 'transferAttemptId') return { ...previous, transferAttemptId: value, ultrasoundId: '' };
    return { ...previous, [field]: value };
  });

  const handleSaveRacssClinicLetter = () => saveCaseDocument(
    'racssClinicLetter',
    { transferAttemptId: racssClinicLetterDraft.transferAttemptId, ultrasoundId: racssClinicLetterDraft.ultrasoundId },
    'RACSS clinic letter details saved.',
    'the RACSS clinic letter details',
  );

  const handleSaveMedicalServicesAgreement = () => saveCaseDocument(
    'medicalServicesAgreement',
    { date: normalizeIsoDate(medicalServicesAgreementDraft.date) },
    'Medical services agreement details saved.',
    'the medical services agreement details',
  );

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
                {getMaternityHospitalDisplayName(hospital) || hospital.id}
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
        <Field>
          Нотаріус (договір)
          <Select value={surrogacyAgreementDraft.notaryId || ''} onChange={event => updateSurrogacyAgreementField('notaryId', event.target.value)}>
            <option value="">— не обрано —</option>
            {catalog.parties.notaries.map(notary => (
              <option key={notary.id} value={String(notary.id)}>
                {notaryOptionLabel(notary)}
              </option>
            ))}
          </Select>
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
                {notaryOptionLabel(notary)}
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

      <SectionSubhead style={{ marginTop: 14 }}>Заява СМ про відсутність шлюбу</SectionSubhead>
      <FieldGrid>
        <Field>
          Дата заяви (відсутність шлюбу)
          <FieldInput
            type="date"
            value={maritalStatusDeclarationDraft.statementDate || ''}
            onChange={event => updateMaritalStatusDeclarationField('statementDate', event.target.value)}
          />
        </Field>
        <Field>
          Нотаріус (відсутність шлюбу)
          <Select
            value={maritalStatusDeclarationDraft.notaryId || ''}
            onChange={event => updateMaritalStatusDeclarationField('notaryId', event.target.value)}
          >
            <option value="">— не обрано —</option>
            {catalog.parties.notaries.map(notary => (
              <option key={notary.id} value={String(notary.id)}>
                {notaryOptionLabel(notary)}
              </option>
            ))}
          </Select>
        </Field>
      </FieldGrid>
      <RowLine style={{ marginTop: 8 }}>
        <PrimaryMiniButton type="button" onClick={handleSaveMaritalStatusDeclaration}>
          Save marital status declaration
        </PrimaryMiniButton>
      </RowLine>

      <SectionSubhead style={{ marginTop: 14 }}>Заява про ненадання юридичних послуг клінікою</SectionSubhead>
      <FieldGrid>
        <Field>
          Дата заяви (юр. послуги)
          <FieldInput
            type="date"
            value={legalServicesDisclaimerDraft.statementDate || ''}
            onChange={event => updateLegalServicesDisclaimerField('statementDate', event.target.value)}
          />
        </Field>
        <Field>
          Нотаріус (юр. послуги)
          <Select
            value={legalServicesDisclaimerDraft.notaryId || ''}
            onChange={event => updateLegalServicesDisclaimerField('notaryId', event.target.value)}
          >
            <option value="">— не обрано —</option>
            {catalog.parties.notaries.map(notary => (
              <option key={notary.id} value={String(notary.id)}>
                {notaryOptionLabel(notary)}
              </option>
            ))}
          </Select>
        </Field>
      </FieldGrid>
      <RowLine style={{ marginTop: 8 }}>
        <PrimaryMiniButton type="button" onClick={handleSaveLegalServicesDisclaimer}>
          Save legal services disclaimer
        </PrimaryMiniButton>
      </RowLine>

      <SectionSubhead style={{ marginTop: 14 }}>Додаток №1 до договору про сурогатне материнство</SectionSubhead>
      <FieldGrid>
        <Field>
          Дата додатка
          <FieldInput
            type="date"
            value={surrogacyAgreementAppendix1Draft.date || ''}
            onChange={event => updateSurrogacyAgreementAppendix1Field('date', event.target.value)}
          />
        </Field>
      </FieldGrid>
      <RowLine style={{ marginTop: 8 }}>
        <PrimaryMiniButton type="button" onClick={handleSaveSurrogacyAgreementAppendix1}>
          Save appendix 1
        </PrimaryMiniButton>
      </RowLine>

      <SectionSubhead style={{ marginTop: 14 }}>Заява про належність ембріонів</SectionSubhead>
      <FieldGrid>
        <Field style={{ flex: 1, minWidth: 220 }}>
          Доставлення
          <Select value={embryoOwnershipDraft.shipmentId || ''} onChange={event => updateEmbryoOwnershipShipmentId(event.target.value)}>
            <option value="">— не обрано —</option>
            {artShipments.map(shipment => (
              <option key={shipment.id} value={shipment.id}>
                {formatShipmentOptionLabel(shipment, catalog.parties) || shipment.id}
              </option>
            ))}
          </Select>
        </Field>
      </FieldGrid>
      {!embryoOwnershipDraft.shipmentId && (embryoOwnershipDraft.legacyIvfDate || embryoOwnershipDraft.legacyShipmentPeriod?.uk) ? (
        <DocSubtitle style={{ marginTop: 6 }}>
          Мігровані дані (зберігаються без змін, поки не обрано доставлення):
          {' '}{embryoOwnershipDraft.legacyShipmentPeriod?.uk || ''} {embryoOwnershipDraft.legacyIvfDate || ''}
        </DocSubtitle>
      ) : null}
      <RowLine style={{ marginTop: 8 }}>
        <PrimaryMiniButton type="button" onClick={handleSaveEmbryoOwnership}>
          Save embryo ownership statement details
        </PrimaryMiniButton>
      </RowLine>

      <SectionSubhead style={{ marginTop: 14 }}>Довідка про генетичну спорідненість</SectionSubhead>
      <FieldGrid>
        <Field>
          Спроба переносу (довідка)
          <Select
            value={geneticAffinityCertificateDraft.transferAttemptId || ''}
            onChange={event => updateGeneticAffinityCertificateField('transferAttemptId', event.target.value)}
          >
            <option value="">— не обрано —</option>
            {artTransferAttempts.map(transferAttempt => (
              <option key={transferAttempt.id} value={transferAttempt.id}>
                {formatTransferOptionLabel(transferAttempt) || transferAttempt.id}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          ХГЧ (довідка)
          <Select
            value={geneticAffinityCertificateDraft.hcgTestId || ''}
            onChange={event => updateGeneticAffinityCertificateField('hcgTestId', event.target.value)}
            disabled={!certificateTransfer}
          >
            <option value="">— не обрано —</option>
            {certificateHcgTests.map(hcgTest => (
              <option key={hcgTest.id} value={hcgTest.id}>{formatHcgTestOptionLabel(hcgTest) || hcgTest.id}</option>
            ))}
          </Select>
        </Field>
        <Field>
          УЗД (довідка)
          <Select
            value={geneticAffinityCertificateDraft.ultrasoundId || ''}
            onChange={event => updateGeneticAffinityCertificateField('ultrasoundId', event.target.value)}
            disabled={!certificateTransfer}
          >
            <option value="">— не обрано —</option>
            {certificateUltrasounds.map(ultrasound => (
              <option key={ultrasound.id} value={ultrasound.id}>{formatUltrasoundOptionLabel(ultrasound) || ultrasound.id}</option>
            ))}
          </Select>
        </Field>
        <Field>
          Дата видачі
          <FieldInput
            type="date"
            value={geneticAffinityCertificateDraft.issueDate || ''}
            onChange={event => updateGeneticAffinityCertificateField('issueDate', event.target.value)}
          />
        </Field>
        <Field>
          Вихідний номер
          <FieldInput
            type="text"
            value={geneticAffinityCertificateDraft.outgoingNumber || ''}
            onChange={event => updateGeneticAffinityCertificateField('outgoingNumber', event.target.value)}
          />
        </Field>
      </FieldGrid>
      <RowLine style={{ marginTop: 8 }}>
        <PrimaryMiniButton type="button" onClick={handleSaveGeneticAffinityCertificate}>
          Save genetic affinity certificate details
        </PrimaryMiniButton>
      </RowLine>

      <SectionSubhead style={{ marginTop: 14 }}>Лист клініки до РАЦС</SectionSubhead>
      <FieldGrid>
        <Field>
          Спроба переносу (лист РАЦС)
          <Select
            value={racssClinicLetterDraft.transferAttemptId || ''}
            onChange={event => updateRacssClinicLetterField('transferAttemptId', event.target.value)}
          >
            <option value="">— не обрано —</option>
            {artTransferAttempts.map(transferAttempt => (
              <option key={transferAttempt.id} value={transferAttempt.id}>
                {formatTransferOptionLabel(transferAttempt) || transferAttempt.id}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          УЗД (лист РАЦС)
          <Select
            value={racssClinicLetterDraft.ultrasoundId || ''}
            onChange={event => updateRacssClinicLetterField('ultrasoundId', event.target.value)}
            disabled={!letterTransfer}
          >
            <option value="">— не обрано —</option>
            {letterUltrasounds.map(ultrasound => (
              <option key={ultrasound.id} value={ultrasound.id}>{formatUltrasoundOptionLabel(ultrasound) || ultrasound.id}</option>
            ))}
          </Select>
        </Field>
      </FieldGrid>
      <RowLine style={{ marginTop: 8 }}>
        <PrimaryMiniButton type="button" onClick={handleSaveRacssClinicLetter}>
          Save RACSS clinic letter details
        </PrimaryMiniButton>
      </RowLine>

      <SectionSubhead style={{ marginTop: 14 }}>Договір про медичні послуги</SectionSubhead>
      <FieldGrid>
        <Field>
          Дата договору про медичні послуги
          <FieldInput
            type="date"
            value={medicalServicesAgreementDraft.date || ''}
            onChange={event => setMedicalServicesAgreementDraft({ date: event.target.value })}
          />
        </Field>
      </FieldGrid>
      <RowLine style={{ marginTop: 8 }}>
        <PrimaryMiniButton type="button" onClick={handleSaveMedicalServicesAgreement}>
          Save medical services agreement details
        </PrimaryMiniButton>
      </RowLine>
    </Section>
  );
};

export default CaseChildbirthTransactionEditor;
