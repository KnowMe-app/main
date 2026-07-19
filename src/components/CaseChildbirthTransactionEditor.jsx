// "Дані для заяви в РАЦС" (Childbirth + Transaction editor, Batch 18 §6 / Batch 19) - shared
// between Documents Builder (editing a case while preparing to generate its documents) and the
// Parties page (editing a case as part of assembling it), per the Parties spec: "reuse the ...
// form structure ... rather than duplicating it". Self-contained: owns its own drafts, resets them
// whenever the selected case changes, and persists additively to the same documentsBuilder/parties
// tree either host page already reads/writes.
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { ref, set, update } from 'firebase/database';
import { FaPlus, FaTrash } from 'react-icons/fa';
import { database } from './config';
import {
  BIRTH_REGISTRATION_TRANSACTION_TYPE,
  DOCUMENTS_PARTIES_PATH,
  createChildRecord,
  createTransaction,
  makeTransactionId,
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

const CaseChildbirthTransactionEditor = ({ catalog, setCatalog, caseId, onSelectedChildIdChange }) => {
  const selectedCase = catalog.parties.cases.find(item => String(item.id) === String(caseId)) || null;

  // Which of the selected case's childbirth.children[] documents are generated for ('' = default
  // to the first child - a case with just one child never needs this shown).
  const [selectedChildId, setSelectedChildId] = useState('');
  // Local editable copies of the selected case's childbirth/transaction data - reset from the
  // backend record whenever the selected case changes, saved back explicitly via their own Save
  // buttons, same pattern as the per-document format draft in Documents Builder.
  const [childbirthDraft, setChildbirthDraft] = useState({ maternityHospitalId: '', children: [] });
  const [transactionDraft, setTransactionDraft] = useState({ statementDate: '', notaryId: '', registryNumber: '' });

  useEffect(() => {
    // `childbirth.children` isn't re-validated by normalizeCaseRecord beyond "childbirth itself is
    // an object" - a case saved before this editor existed (or edited straight in the Firebase
    // console) can carry `children` as a Firebase gap-object instead of a real array, which crashed
    // every `.map()` below with no error boundary to catch it (blank page).
    setChildbirthDraft({
      maternityHospitalId: selectedCase?.childbirth?.maternityHospitalId || '',
      children: toArray(selectedCase?.childbirth?.children),
    });
    const transactionId = selectedCase?.registrations?.birth?.transactionId;
    const existingTransaction = transactionId
      ? catalog.parties.transactions.find(item => String(item.id) === String(transactionId))
      : null;
    setTransactionDraft(existingTransaction && existingTransaction.type === BIRTH_REGISTRATION_TRANSACTION_TYPE
      ? { statementDate: existingTransaction.statementDate || '', notaryId: existingTransaction.notaryId || '', registryNumber: existingTransaction.registryNumber || '' }
      : { statementDate: '', notaryId: '', registryNumber: '' });
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
      await set(ref(database, `${DOCUMENTS_PARTIES_PATH}/cases/${selectedCase.id}/childbirth`), childbirthDraft);
      setCatalog(previous => ({
        ...previous,
        parties: {
          ...previous.parties,
          cases: previous.parties.cases.map(item => (String(item.id) === String(selectedCase.id)
            ? { ...item, childbirth: childbirthDraft }
            : item)),
        },
      }));
      toast.success('Childbirth details saved.');
    } catch (saveError) {
      console.error('Unable to save childbirth details', saveError);
      toast.error('Could not save the childbirth details.');
    }
  };

  const updateTransactionField = (field, value) => setTransactionDraft(previous => ({ ...previous, [field]: value }));

  // Creates the case's birth-registration-surrogate-consent transaction the first time this is
  // saved, then only ever updates that same record afterward - a transaction keeps the couple/
  // surrogate mother it was originally signed for (batch 19), so an update never re-pulls those
  // ids from the case's current relations, only a brand-new transaction does.
  const handleSaveTransaction = async () => {
    if (!selectedCase) return;
    const existingTransactionId = selectedCase.registrations?.birth?.transactionId;
    const existingTransaction = existingTransactionId
      ? catalog.parties.transactions.find(item => String(item.id) === String(existingTransactionId))
      : null;
    const isReusableTransaction = Boolean(existingTransaction) && existingTransaction.type === BIRTH_REGISTRATION_TRANSACTION_TYPE;
    const transactionId = isReusableTransaction ? existingTransaction.id : makeTransactionId();
    const nextTransaction = createTransaction({
      transactionId,
      caseId: selectedCase.id,
      type: BIRTH_REGISTRATION_TRANSACTION_TYPE,
      coupleId: isReusableTransaction ? existingTransaction.coupleId : (selectedCase.relations?.coupleId || ''),
      surrogateMotherId: isReusableTransaction ? existingTransaction.surrogateMotherId : (selectedCase.relations?.surrogateMotherId || ''),
      notaryId: transactionDraft.notaryId,
      statementDate: transactionDraft.statementDate,
      registryNumber: transactionDraft.registryNumber,
    });
    try {
      await update(ref(database, DOCUMENTS_PARTIES_PATH), {
        [`transactions/${transactionId}`]: nextTransaction,
        [`cases/${selectedCase.id}/registrations/birth/transactionId`]: transactionId,
      });
      setCatalog(previous => ({
        ...previous,
        parties: {
          ...previous.parties,
          transactions: isReusableTransaction
            ? previous.parties.transactions.map(item => (String(item.id) === transactionId ? nextTransaction : item))
            : [...previous.parties.transactions, nextTransaction],
          cases: previous.parties.cases.map(item => (String(item.id) === String(selectedCase.id)
            ? { ...item, registrations: { ...(item.registrations || {}), birth: { ...(item.registrations?.birth || {}), transactionId } } }
            : item)),
        },
      }));
      toast.success('Transaction saved.');
    } catch (saveError) {
      console.error('Unable to save the transaction', saveError);
      toast.error('Could not save the transaction.');
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

      <SectionSubhead style={{ marginTop: 14 }}>Заява до РАЦС (транзакція)</SectionSubhead>
      <FieldGrid>
        <Field>
          Дата заяви
          <FieldInput
            type="date"
            value={transactionDraft.statementDate || ''}
            onChange={event => updateTransactionField('statementDate', event.target.value)}
          />
        </Field>
        <Field>
          Нотаріус
          <Select value={transactionDraft.notaryId || ''} onChange={event => updateTransactionField('notaryId', event.target.value)}>
            <option value="">— не обрано —</option>
            {catalog.parties.notaries.map(notary => (
              <option key={notary.id} value={String(notary.id)}>
                {notary.name?.uk?.short || notary.name?.uk?.nominative || notary.id}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          Номер реєстру
          <FieldInput
            type="text"
            value={transactionDraft.registryNumber || ''}
            onChange={event => updateTransactionField('registryNumber', event.target.value)}
          />
        </Field>
      </FieldGrid>
      <RowLine style={{ marginTop: 8 }}>
        <PrimaryMiniButton type="button" onClick={handleSaveTransaction}>
          Save transaction
        </PrimaryMiniButton>
      </RowLine>
    </Section>
  );
};

export default CaseChildbirthTransactionEditor;
