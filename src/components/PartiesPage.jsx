// Parties - the single admin page to view and edit every party record (couples, surrogate
// mothers, representatives, clinics, maternity hospitals, notaries) and assemble them into cases.
// Third sibling of Invoice Builder / Documents Builder: same React + Firebase approach, same
// page-scoped --km-* palette, reachable from the shared PageNavMenu. Reads/writes the exact same
// documentsBuilder/parties tree Documents Builder already owns - this page is the manual-editing
// counterpart to that page's JSON paste-and-parse path, not a separate data store.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { get, ref, set, update } from 'firebase/database';
import { FaPlus, FaTrash, FaUpload } from 'react-icons/fa';
import designTokens from '../data/designTokens.json';
import { auth, database } from './config';
import { isInvoiceBuilderUid } from 'utils/accessLevel';
import PageNavMenu from './PageNavMenu';
import CaseChildbirthTransactionEditor from './CaseChildbirthTransactionEditor';
import {
  DOCUMENTS_PARTIES_PATH,
  DOCUMENTS_TEMPLATES_PATH,
  PARTY_COLLECTIONS,
  buildCaseLabel,
  createEmptyCase,
  createEmptyClinic,
  createEmptyCouple,
  createEmptyMaternityHospital,
  createEmptyNotary,
  createEmptyPartner,
  createEmptyRepresentative,
  createEmptySurrogateMother,
  emptyDocumentsCatalog,
  findPartyReferences,
  getValueByPath,
  isPlainObject,
  makeCaseId,
  mergeDocumentsCatalog,
  normalizeDocumentsCatalog,
  orderRecordsByRecentIds,
  parseDocumentsTechnicalInput,
  resolveMergedRecordsForPersistence,
  toArray,
  upsertRecentId,
} from './documentsCatalogUtils';

const PARTIES_SETTINGS_PATH = 'documentsBuilder/partiesSettings';

// --- Layout shell (same skeleton/palette as Invoice Builder & Documents Builder) ----------------

const Page = styled.main`
  --km-bg: #EFE9DD;
  --km-card: ${designTokens.color.paper};
  --km-text: ${designTokens.color.docInk};
  --km-muted: ${designTokens.color.inkSoft};
  --km-border: ${designTokens.color.docLine};
  --km-accent: ${designTokens.color.bronze};
  --km-accent-mid: #C6A671;
  --km-accent-light: rgba(162, 121, 63, 0.12);
  --km-danger: #B3523F;
  --km-danger-border: rgba(179, 82, 63, 0.35);
  --km-font: 'Inter', sans-serif;
  --km-font-display: 'Fraunces', serif;

  min-height: 100vh;
  background: var(--km-bg);
  color: var(--km-text);
  padding: 16px 12px 72px;
  font-family: var(--km-font);
  font-size: 13px;
`;

const Shell = styled.div`
  width: min(100%, 880px);
  margin: 0 auto;
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  @media (max-width: 560px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const Eyebrow = styled.div`
  color: var(--km-accent);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  margin-bottom: 2px;
  text-transform: uppercase;
`;

const Title = styled.h1`
  margin: 0;
  font-family: var(--km-font-display);
  font-size: clamp(20px, 4vw, 27px);
  line-height: 1.05;
  letter-spacing: -0.02em;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;

  @media (max-width: 560px) {
    width: 100%;
    justify-content: flex-start;
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

const StateCard = styled.div`
  padding: 20px;
  border-radius: 10px;
  background: var(--km-card);
  border: 1px solid var(--km-border);
  color: var(--km-muted);
  font-size: 13px;
`;

// --- Group panel + collapsed summary row (Beneficiary/Payer pattern from Invoice Builder) -------
// Collapsed by default; header shows a count. Each record inside is itself a collapsed row that
// expands to its editable fields - same two-level "tap to expand" interaction throughout.

const Panel = styled.section`
  margin-top: 10px;
  border: 1px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-card);
  padding: 12px 14px;
`;

const CompactSection = styled.div`
  border: 1px solid var(--km-border);
  border-radius: 8px;
  background: var(--km-bg);
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  cursor: pointer;
`;

const CompactInfo = styled.div`
  flex: 1 1 auto;
  min-width: 0;
`;

const CompactLabel = styled.div`
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--km-accent);
`;

const CompactValue = styled.div`
  margin-top: 2px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--km-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CompactChevron = styled.span`
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  color: var(--km-accent);
`;

const RecordBlock = styled.div`
  margin-top: 8px;
`;

const RecordBody = styled.div`
  margin-top: 6px;
  padding: 8px 10px 10px;
  border: 1px solid var(--km-border);
  border-radius: 8px;
  background: var(--km-card);
`;

const SectionSubhead = styled.h3`
  margin: 10px 0 0;
  font-size: 11px;
  font-weight: 800;
  color: var(--km-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;

  &:first-child {
    margin-top: 0;
  }
`;

const RowLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

// Plain-text convention: every field reads as editable text - borderless/background-free until
// hovered or focused (same rule the case editor's own Field/FieldInput already follow).
const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  margin-top: 8px;
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

const PickerList = styled.div`
  margin-top: 6px;
  max-height: 190px;
  overflow-y: auto;
  display: grid;
  gap: 4px;
`;

const PickerButton = styled.button`
  border: 1px solid ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-border)')};
  background: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'var(--km-card)')};
  color: ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-text)')};
  border-radius: 8px;
  padding: 6px 9px;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;

  &:hover {
    border-color: var(--km-accent);
    color: var(--km-accent);
  }
`;

const TechnicalTextarea = styled.textarea`
  width: 100%;
  min-height: 120px;
  margin-top: 8px;
  border: 1px solid var(--km-border);
  border-radius: 8px;
  background: var(--km-bg);
  color: var(--km-text);
  font-family: 'SFMono-Regular', Menlo, monospace;
  font-size: 11.5px;
  padding: 8px;
  resize: vertical;
`;

// --- Path-based field helpers ---------------------------------------------------------------
// Every record editor below is driven off a small `{ label, path, type }` list plus these two
// generic helpers, rather than one bespoke component per field - the six party types differ only
// in which fields they carry, never in how a field is read, drafted, or committed.

const setValueAtPath = (obj, path, value) => {
  const [key, ...rest] = String(path).split('.');
  if (!rest.length) return { ...obj, [key]: value };
  const child = isPlainObject(obj?.[key]) ? obj[key] : {};
  return { ...obj, [key]: setValueAtPath(child, rest.join('.'), value) };
};

// Resyncs from the backend value on every change, unless the field currently has focus (so an
// in-progress keystroke never gets clobbered by a re-render triggered by an unrelated commit) -
// same guard the Invoice Builder's plain fields use.
const useFieldDraft = externalValue => {
  const [draft, setDraft] = useState(externalValue ?? '');
  const editingRef = useRef(false);
  useEffect(() => {
    if (!editingRef.current) setDraft(externalValue ?? '');
  }, [externalValue]);
  return [draft, setDraft, editingRef];
};

const RecordFieldInput = ({ label, value, type, onCommit }) => {
  const [draft, setDraft, editingRef] = useFieldDraft(value || '');
  return (
    <Field>
      {label}
      <FieldInput
        type={type || 'text'}
        value={draft}
        aria-label={label}
        onFocus={() => { editingRef.current = true; }}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => {
          editingRef.current = false;
          if (draft !== (value || '')) onCommit(draft);
        }}
      />
    </Field>
  );
};

const RecordFieldsGrid = ({ record, fieldDefs, onFieldChange }) => (
  <FieldGrid>
    {fieldDefs.map(({ label, path, type }) => (
      <RecordFieldInput
        key={path}
        label={label}
        type={type}
        value={getValueByPath(record, path)}
        onCommit={value => onFieldChange(path, value)}
      />
    ))}
  </FieldGrid>
);

// --- Display names (collapsed-row summary text) ----------------------------------------------

const nameFormOf = value => {
  if (isPlainObject(value)) {
    if (typeof value.uk === 'string' && value.uk) return value.uk;
    if (isPlainObject(value.uk)) return value.uk.nominative || value.uk.short || '';
    if (typeof value.en === 'string' && value.en) return value.en;
    if (isPlainObject(value.en)) return value.en.full || value.en.short || '';
    return '';
  }
  return value || '';
};

const partyDisplayName = record => nameFormOf(record?.name) || record?.id;
const maternityDisplayName = record => nameFormOf(record?.name) || nameFormOf(record?.shortName) || record?.id;
const coupleDisplayName = record => {
  const names = toArray(record?.partners).map(partner => nameFormOf(partner?.name)).filter(Boolean);
  return names.length ? names.join(' & ') : record?.id;
};

// --- Field definitions per party type ----------------------------------------------------------

const PARTNER_FIELDS = [
  { label: 'Name (uk, nominative)', path: 'name.uk.nominative' },
  { label: 'Name (uk, genitive)', path: 'name.uk.genitive' },
  { label: 'Name (en)', path: 'name.en' },
  { label: 'Birth date', path: 'birthDate', type: 'date' },
  { label: 'Citizenship (uk)', path: 'citizenship.uk' },
  { label: 'Citizenship (en)', path: 'citizenship.en' },
  { label: 'Passport number', path: 'passport.number' },
  { label: 'Passport issued by (uk)', path: 'passport.issuedBy.uk' },
  { label: 'Passport issued by (en)', path: 'passport.issuedBy.en' },
  { label: 'Passport issue date', path: 'passport.issueDate', type: 'date' },
];

const MARRIAGE_AND_ADDRESS_FIELDS = [
  { label: 'Marriage certificate number', path: 'marriage.certificateNumber' },
  { label: 'Marriage certificate date', path: 'marriage.certificateDate', type: 'date' },
  { label: 'Address (uk)', path: 'address.uk' },
  { label: 'Address (en)', path: 'address.en' },
];

const SURROGATE_MOTHER_FIELDS = [
  { label: 'Name (uk, nominative)', path: 'name.uk.nominative' },
  { label: 'Name (uk, genitive)', path: 'name.uk.genitive' },
  { label: 'Name (en)', path: 'name.en' },
  { label: 'Birth date', path: 'birthDate', type: 'date' },
  { label: 'Passport number', path: 'passport.number' },
  { label: 'Passport issue date', path: 'passport.issueDate', type: 'date' },
  { label: 'Tax ID', path: 'taxId' },
  { label: 'Address (uk)', path: 'address.uk' },
  { label: 'Address (en)', path: 'address.en' },
];

const REPRESENTATIVE_FIELDS = [
  { label: 'Name (uk, nominative)', path: 'name.uk.nominative' },
  { label: 'Name (uk, genitive)', path: 'name.uk.genitive' },
  { label: 'Name (en)', path: 'name.en' },
  { label: 'Passport number', path: 'passport.number' },
  { label: 'Power of attorney date', path: 'powerOfAttorney.date', type: 'date' },
  { label: 'Power of attorney apostille', path: 'powerOfAttorney.apostille' },
];

const CLINIC_FIELDS = [
  { label: 'Name (uk)', path: 'name.uk' },
  { label: 'Name (en)', path: 'name.en' },
  { label: 'Legal name (uk)', path: 'legalName.uk' },
  { label: 'Legal name (en)', path: 'legalName.en' },
  { label: 'Medical center name (uk)', path: 'medicalCenterName.uk' },
  { label: 'Medical center name (en)', path: 'medicalCenterName.en' },
  { label: 'Address (uk)', path: 'address.uk' },
  { label: 'Address (en)', path: 'address.en' },
  { label: 'Phone', path: 'phone' },
  { label: 'Email', path: 'email' },
  { label: 'EDRPOU', path: 'edrpou' },
  { label: 'Tax ID', path: 'taxId' },
  { label: 'VAT certificate number', path: 'vatCertificateNumber' },
  { label: 'Bank account', path: 'bank.account' },
  { label: 'Bank MFO', path: 'bank.mfo' },
  { label: 'Bank name (uk)', path: 'bank.name.uk' },
  { label: 'Bank name (en)', path: 'bank.name.en' },
  { label: 'Bank address (uk)', path: 'bank.address.uk' },
  { label: 'Bank address (en)', path: 'bank.address.en' },
  { label: 'License number', path: 'license.number' },
  { label: 'License date', path: 'license.date', type: 'date' },
  { label: 'License issued by (uk)', path: 'license.issuedBy.uk' },
  { label: 'License issued by (en)', path: 'license.issuedBy.en' },
  { label: 'Medical director (uk, nominative)', path: 'medicalDirector.name.uk.nominative' },
  { label: 'Medical director (uk, genitive)', path: 'medicalDirector.name.uk.genitive' },
  { label: 'Medical director (uk, short)', path: 'medicalDirector.name.uk.short' },
  { label: 'Medical director (en, full)', path: 'medicalDirector.name.en.full' },
  { label: 'Medical director (en, short)', path: 'medicalDirector.name.en.short' },
  { label: 'Director authority type (uk)', path: 'medicalDirector.authority.type.uk' },
  { label: 'Director authority type (en)', path: 'medicalDirector.authority.type.en' },
  { label: 'Director authority number', path: 'medicalDirector.authority.number' },
  { label: 'Director authority date', path: 'medicalDirector.authority.date', type: 'date' },
];

const MATERNITY_HOSPITAL_FIELDS = [
  { label: 'Name (uk)', path: 'name.uk' },
  { label: 'Name (en)', path: 'name.en' },
  { label: 'Short name (uk)', path: 'shortName.uk' },
  { label: 'Short name (en)', path: 'shortName.en' },
  { label: 'EDRPOU', path: 'edrpou' },
  { label: 'Address (uk)', path: 'address.uk' },
  { label: 'Address (en)', path: 'address.en' },
];

const NOTARY_FIELDS = [
  { label: 'Name (uk, nominative)', path: 'name.uk.nominative' },
  { label: 'Name (uk, genitive)', path: 'name.uk.genitive' },
  { label: 'Name (uk, short)', path: 'name.uk.short' },
  { label: 'Name (uk, instrumental)', path: 'name.uk.instrumental' },
  { label: 'Name (en, full)', path: 'name.en.full' },
  { label: 'Name (en, short)', path: 'name.en.short' },
  { label: 'Title (uk)', path: 'title.uk' },
  { label: 'Title (en)', path: 'title.en' },
  { label: 'City (uk)', path: 'city.uk' },
  { label: 'City (en)', path: 'city.en' },
];

const PROGRAM_FIELDS = [
  { label: 'Program ID', path: 'programId' },
  { label: 'Program type', path: 'program.type' },
  { label: 'Agreement number (uk)', path: 'program.agreement.number.uk' },
  { label: 'Agreement number (en)', path: 'program.agreement.number.en' },
  { label: 'Agreement date', path: 'program.agreement.date', type: 'date' },
];

// --- One party-type group (couples/surrogateMothers/representatives/clinics/maternityHospitals/
// notaries) ---------------------------------------------------------------------------------------

const SimplePartyGroup = ({
  title, collection, records, fieldDefs, displayName, createEmpty, catalog, setCatalog, expandedKeys, toggleRecord, groupOpen, onToggleGroup,
}) => {
  const handleAdd = async () => {
    const record = createEmpty();
    try {
      await set(ref(database, `${DOCUMENTS_PARTIES_PATH}/${collection}/${record.id}`), record);
      setCatalog(previous => ({
        ...previous,
        parties: { ...previous.parties, [collection]: [...previous.parties[collection], record] },
      }));
      toggleRecord(collection, record.id, true);
      toast.success('Added.');
    } catch (addError) {
      console.error(`Unable to add ${collection} record`, addError);
      toast.error('Could not add the record.');
    }
  };

  const handleFieldChange = async (record, path, value) => {
    const dbPath = `${DOCUMENTS_PARTIES_PATH}/${collection}/${record.id}/${path.split('.').join('/')}`;
    try {
      await set(ref(database, dbPath), value);
      setCatalog(previous => ({
        ...previous,
        parties: {
          ...previous.parties,
          [collection]: previous.parties[collection].map(item => (
            String(item.id) === String(record.id) ? setValueAtPath(item, path, value) : item
          )),
        },
      }));
    } catch (updateError) {
      console.error(`Unable to save ${collection} field`, updateError);
      toast.error('Could not save.');
    }
  };

  const handleDelete = async record => {
    const references = findPartyReferences(catalog, collection, record.id);
    const label = displayName(record) || record.id;
    const suffix = references.length ? ` Used in ${references.join(', ')}.` : '';
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${label}"?${suffix}`)) return;
    try {
      await set(ref(database, `${DOCUMENTS_PARTIES_PATH}/${collection}/${record.id}`), null);
      setCatalog(previous => ({
        ...previous,
        parties: { ...previous.parties, [collection]: previous.parties[collection].filter(item => String(item.id) !== String(record.id)) },
      }));
      toast.success('Deleted.');
    } catch (deleteError) {
      console.error(`Unable to delete ${collection} record`, deleteError);
      toast.error('Could not delete.');
    }
  };

  return (
    <Panel>
      <CompactSection onClick={onToggleGroup} role="button" aria-expanded={groupOpen}>
        <CompactInfo>
          <CompactLabel>{title}</CompactLabel>
          <CompactValue>{records.length} record{records.length === 1 ? '' : 's'}</CompactValue>
        </CompactInfo>
        <CompactChevron>{groupOpen ? 'Hide ›' : 'Show ›'}</CompactChevron>
      </CompactSection>
      {groupOpen ? (
        <>
          {records.map(record => {
            const expanded = Boolean(expandedKeys[`${collection}:${record.id}`]);
            return (
              <RecordBlock key={record.id}>
                <CompactSection onClick={() => toggleRecord(collection, record.id)} role="button" aria-expanded={expanded}>
                  <CompactInfo>
                    <CompactValue>{displayName(record) || record.id}</CompactValue>
                  </CompactInfo>
                  <CompactChevron>{expanded ? 'Hide ›' : 'Edit ›'}</CompactChevron>
                </CompactSection>
                {expanded ? (
                  <RecordBody>
                    <RecordFieldsGrid record={record} fieldDefs={fieldDefs} onFieldChange={(path, value) => handleFieldChange(record, path, value)} />
                    <RowLine style={{ marginTop: 8 }}>
                      <DangerButton type="button" onClick={() => handleDelete(record)}>
                        <FaTrash /> Delete
                      </DangerButton>
                    </RowLine>
                  </RecordBody>
                ) : null}
              </RecordBlock>
            );
          })}
          <RowLine style={{ marginTop: 10 }}>
            <SmallButton type="button" onClick={handleAdd}>
              <FaPlus /> Add
            </SmallButton>
          </RowLine>
        </>
      ) : null}
    </Panel>
  );
};

// --- Couples group (partners[wife/husband] special-cased, plus marriage/address) ----------------

const CouplesGroup = ({ catalog, setCatalog, expandedKeys, toggleRecord, groupOpen, onToggleGroup }) => {
  const collection = 'couples';
  const records = catalog.parties.couples;

  const handleAdd = async () => {
    const record = createEmptyCouple();
    try {
      await set(ref(database, `${DOCUMENTS_PARTIES_PATH}/couples/${record.id}`), record);
      setCatalog(previous => ({ ...previous, parties: { ...previous.parties, couples: [...previous.parties.couples, record] } }));
      toggleRecord(collection, record.id, true);
      toast.success('Added.');
    } catch (addError) {
      console.error('Unable to add couple', addError);
      toast.error('Could not add the record.');
    }
  };

  const handlePartnerFieldChange = async (couple, role, path, value) => {
    const partners = toArray(couple.partners);
    const index = partners.findIndex(partner => partner.role === role);
    const basePartner = index === -1 ? createEmptyPartner({ role }) : partners[index];
    const nextPartner = setValueAtPath(basePartner, path, value);
    const nextPartners = index === -1 ? [...partners, nextPartner] : partners.map((partner, i) => (i === index ? nextPartner : partner));
    try {
      await set(ref(database, `${DOCUMENTS_PARTIES_PATH}/couples/${couple.id}/partners`), nextPartners);
      setCatalog(previous => ({
        ...previous,
        parties: {
          ...previous.parties,
          couples: previous.parties.couples.map(item => (String(item.id) === String(couple.id) ? { ...item, partners: nextPartners } : item)),
        },
      }));
    } catch (updateError) {
      console.error('Unable to save partner field', updateError);
      toast.error('Could not save.');
    }
  };

  const handleFieldChange = async (couple, path, value) => {
    const dbPath = `${DOCUMENTS_PARTIES_PATH}/couples/${couple.id}/${path.split('.').join('/')}`;
    try {
      await set(ref(database, dbPath), value);
      setCatalog(previous => ({
        ...previous,
        parties: {
          ...previous.parties,
          couples: previous.parties.couples.map(item => (String(item.id) === String(couple.id) ? setValueAtPath(item, path, value) : item)),
        },
      }));
    } catch (updateError) {
      console.error('Unable to save couple field', updateError);
      toast.error('Could not save.');
    }
  };

  const handleDelete = async couple => {
    const references = findPartyReferences(catalog, collection, couple.id);
    const label = coupleDisplayName(couple);
    const suffix = references.length ? ` Used in ${references.join(', ')}.` : '';
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${label}"?${suffix}`)) return;
    try {
      await set(ref(database, `${DOCUMENTS_PARTIES_PATH}/couples/${couple.id}`), null);
      setCatalog(previous => ({
        ...previous,
        parties: { ...previous.parties, couples: previous.parties.couples.filter(item => String(item.id) !== String(couple.id)) },
      }));
      toast.success('Deleted.');
    } catch (deleteError) {
      console.error('Unable to delete couple', deleteError);
      toast.error('Could not delete.');
    }
  };

  return (
    <Panel>
      <CompactSection onClick={onToggleGroup} role="button" aria-expanded={groupOpen}>
        <CompactInfo>
          <CompactLabel>Couples</CompactLabel>
          <CompactValue>{records.length} record{records.length === 1 ? '' : 's'}</CompactValue>
        </CompactInfo>
        <CompactChevron>{groupOpen ? 'Hide ›' : 'Show ›'}</CompactChevron>
      </CompactSection>
      {groupOpen ? (
        <>
          {records.map(couple => {
            const expanded = Boolean(expandedKeys[`${collection}:${couple.id}`]);
            const partners = toArray(couple.partners);
            const wife = partners.find(partner => partner.role === 'wife') || createEmptyPartner({ role: 'wife' });
            const husband = partners.find(partner => partner.role === 'husband') || createEmptyPartner({ role: 'husband' });
            return (
              <RecordBlock key={couple.id}>
                <CompactSection onClick={() => toggleRecord(collection, couple.id)} role="button" aria-expanded={expanded}>
                  <CompactInfo>
                    <CompactValue>{coupleDisplayName(couple)}</CompactValue>
                  </CompactInfo>
                  <CompactChevron>{expanded ? 'Hide ›' : 'Edit ›'}</CompactChevron>
                </CompactSection>
                {expanded ? (
                  <RecordBody>
                    <SectionSubhead>Wife</SectionSubhead>
                    <RecordFieldsGrid record={wife} fieldDefs={PARTNER_FIELDS} onFieldChange={(path, value) => handlePartnerFieldChange(couple, 'wife', path, value)} />
                    <SectionSubhead>Husband</SectionSubhead>
                    <RecordFieldsGrid record={husband} fieldDefs={PARTNER_FIELDS} onFieldChange={(path, value) => handlePartnerFieldChange(couple, 'husband', path, value)} />
                    <SectionSubhead>Marriage &amp; address</SectionSubhead>
                    <RecordFieldsGrid record={couple} fieldDefs={MARRIAGE_AND_ADDRESS_FIELDS} onFieldChange={(path, value) => handleFieldChange(couple, path, value)} />
                    <RowLine style={{ marginTop: 8 }}>
                      <DangerButton type="button" onClick={() => handleDelete(couple)}>
                        <FaTrash /> Delete
                      </DangerButton>
                    </RowLine>
                  </RecordBody>
                ) : null}
              </RecordBlock>
            );
          })}
          <RowLine style={{ marginTop: 10 }}>
            <SmallButton type="button" onClick={handleAdd}>
              <FaPlus /> Add
            </SmallButton>
          </RowLine>
        </>
      ) : null}
    </Panel>
  );
};

// --- Cases group (the assembly layer) -----------------------------------------------------------

// A relation slot (Couple / Clinic / Surrogate mother): shows the currently linked party, tap to
// pick from the existing records of that type, most-recently-used first - same "pick from saved
// variants" interaction as the Invoice Builder's Beneficiary/Payer picker, generalized here to
// every relation a case can hold.
const RelationSlot = ({ label, records, valueId, displayName, onPick }) => {
  const [open, setOpen] = useState(false);
  const current = records.find(record => String(record.id) === String(valueId));
  return (
    <div style={{ marginTop: 6 }}>
      <CompactSection onClick={() => setOpen(previous => !previous)} role="button" aria-expanded={open} aria-label={`${label} slot`}>
        <CompactInfo>
          <CompactLabel>{label}</CompactLabel>
          <CompactValue>{current ? displayName(current) : '— not set —'}</CompactValue>
        </CompactInfo>
        <CompactChevron>{open ? 'Hide ›' : 'Pick ›'}</CompactChevron>
      </CompactSection>
      {open ? (
        <PickerList>
          <PickerButton type="button" onClick={() => { onPick(''); setOpen(false); }}>— None —</PickerButton>
          {records.map(record => (
            <PickerButton
              key={record.id}
              type="button"
              $active={String(record.id) === String(valueId)}
              onClick={() => { onPick(record.id); setOpen(false); }}
            >
              {displayName(record) || record.id}
            </PickerButton>
          ))}
        </PickerList>
      ) : null}
    </div>
  );
};

// Representatives is the one multi-value relation (relations.representativeIds[]) - same MRU
// picker shell as RelationSlot, but each row toggles membership instead of replacing a single id.
const RepresentativesSlot = ({ records, valueIds, onToggle }) => {
  const [open, setOpen] = useState(false);
  const selected = toArray(valueIds).map(String);
  const selectedRecords = records.filter(record => selected.includes(String(record.id)));
  return (
    <div style={{ marginTop: 6 }}>
      <CompactSection onClick={() => setOpen(previous => !previous)} role="button" aria-expanded={open}>
        <CompactInfo>
          <CompactLabel>Representatives</CompactLabel>
          <CompactValue>{selectedRecords.length ? selectedRecords.map(partyDisplayName).join(', ') : '— none —'}</CompactValue>
        </CompactInfo>
        <CompactChevron>{open ? 'Hide ›' : 'Pick ›'}</CompactChevron>
      </CompactSection>
      {open ? (
        <PickerList>
          {records.map(record => {
            const isSelected = selected.includes(String(record.id));
            return (
              <PickerButton key={record.id} type="button" $active={isSelected} onClick={() => onToggle(record.id, !isSelected)}>
                {isSelected ? '✓ ' : ''}{partyDisplayName(record) || record.id}
              </PickerButton>
            );
          })}
        </PickerList>
      ) : null}
    </div>
  );
};

const CasesGroup = ({ catalog, setCatalog, expandedKeys, toggleRecord, groupOpen, onToggleGroup, recentIds, recordPartyUsage }) => {
  const cases = catalog.parties.cases;
  const orderedCouples = orderRecordsByRecentIds(catalog.parties.couples, recentIds.couples);
  const orderedClinics = orderRecordsByRecentIds(catalog.parties.clinics, recentIds.clinics);
  const orderedSurrogateMothers = orderRecordsByRecentIds(catalog.parties.surrogateMothers, recentIds.surrogateMothers);
  const orderedRepresentatives = orderRecordsByRecentIds(catalog.parties.representatives, recentIds.representatives);

  const handleAddCase = async () => {
    const caseId = makeCaseId();
    const record = createEmptyCase({ caseId });
    try {
      await set(ref(database, `${DOCUMENTS_PARTIES_PATH}/cases/${caseId}`), record);
      setCatalog(previous => ({ ...previous, parties: { ...previous.parties, cases: [...previous.parties.cases, record] } }));
      toggleRecord('cases', caseId, true);
      toast.success('Case created.');
    } catch (addError) {
      console.error('Unable to create case', addError);
      toast.error('Could not create the case.');
    }
  };

  const updateCaseField = async (caseId, path, value) => {
    const dbPath = `${DOCUMENTS_PARTIES_PATH}/cases/${caseId}/${path.split('.').join('/')}`;
    try {
      await set(ref(database, dbPath), value);
      setCatalog(previous => ({
        ...previous,
        parties: {
          ...previous.parties,
          cases: previous.parties.cases.map(item => (String(item.id) === String(caseId) ? setValueAtPath(item, path, value) : item)),
        },
      }));
    } catch (updateError) {
      console.error('Unable to save case field', updateError);
      toast.error('Could not save.');
    }
  };

  const handleToggleRepresentative = (caseRecord, repId, include) => {
    const current = toArray(caseRecord.relations?.representativeIds).map(String);
    const next = include ? [...current, String(repId)] : current.filter(id => id !== String(repId));
    updateCaseField(caseRecord.id, 'relations.representativeIds', next);
    if (include) recordPartyUsage('representatives', repId);
  };

  const handleDeleteCase = async caseRecord => {
    const label = buildCaseLabel(catalog, caseRecord) || caseRecord.id;
    if (typeof window !== 'undefined' && !window.confirm(`Delete case "${label}"? Party records stay in the catalog.`)) return;
    try {
      await set(ref(database, `${DOCUMENTS_PARTIES_PATH}/cases/${caseRecord.id}`), null);
      setCatalog(previous => ({
        ...previous,
        parties: { ...previous.parties, cases: previous.parties.cases.filter(item => String(item.id) !== String(caseRecord.id)) },
      }));
      toast.success('Case deleted.');
    } catch (deleteError) {
      console.error('Unable to delete case', deleteError);
      toast.error('Could not delete the case.');
    }
  };

  return (
    <Panel>
      <CompactSection onClick={onToggleGroup} role="button" aria-expanded={groupOpen}>
        <CompactInfo>
          <CompactLabel>Cases</CompactLabel>
          <CompactValue>{cases.length} record{cases.length === 1 ? '' : 's'}</CompactValue>
        </CompactInfo>
        <CompactChevron>{groupOpen ? 'Hide ›' : 'Show ›'}</CompactChevron>
      </CompactSection>
      {groupOpen ? (
        <>
          {cases.map(caseRecord => {
            const expanded = Boolean(expandedKeys[`cases:${caseRecord.id}`]);
            const relations = caseRecord.relations || {};
            return (
              <RecordBlock key={caseRecord.id}>
                <CompactSection onClick={() => toggleRecord('cases', caseRecord.id)} role="button" aria-expanded={expanded}>
                  <CompactInfo>
                    <CompactValue>{buildCaseLabel(catalog, caseRecord) || caseRecord.id}</CompactValue>
                  </CompactInfo>
                  <CompactChevron>{expanded ? 'Hide ›' : 'Edit ›'}</CompactChevron>
                </CompactSection>
                {expanded ? (
                  <RecordBody>
                    <SectionSubhead>Relations</SectionSubhead>
                    <RelationSlot
                      label="Couple"
                      records={orderedCouples}
                      valueId={relations.coupleId}
                      displayName={coupleDisplayName}
                      onPick={id => { updateCaseField(caseRecord.id, 'relations.coupleId', id); recordPartyUsage('couples', id); }}
                    />
                    <RelationSlot
                      label="Clinic"
                      records={orderedClinics}
                      valueId={relations.clinicId}
                      displayName={partyDisplayName}
                      onPick={id => { updateCaseField(caseRecord.id, 'relations.clinicId', id); recordPartyUsage('clinics', id); }}
                    />
                    <RelationSlot
                      label="Surrogate mother"
                      records={orderedSurrogateMothers}
                      valueId={relations.surrogateMotherId}
                      displayName={partyDisplayName}
                      onPick={id => { updateCaseField(caseRecord.id, 'relations.surrogateMotherId', id); recordPartyUsage('surrogateMothers', id); }}
                    />
                    <RepresentativesSlot
                      records={orderedRepresentatives}
                      valueIds={relations.representativeIds}
                      onToggle={(repId, include) => handleToggleRepresentative(caseRecord, repId, include)}
                    />

                    <SectionSubhead>Program</SectionSubhead>
                    <RecordFieldsGrid record={caseRecord} fieldDefs={PROGRAM_FIELDS} onFieldChange={(path, value) => updateCaseField(caseRecord.id, path, value)} />

                    <CaseChildbirthTransactionEditor catalog={catalog} setCatalog={setCatalog} caseId={caseRecord.id} />

                    <RowLine style={{ marginTop: 8 }}>
                      <DangerButton type="button" onClick={() => handleDeleteCase(caseRecord)}>
                        <FaTrash /> Delete case
                      </DangerButton>
                    </RowLine>
                  </RecordBody>
                ) : null}
              </RecordBlock>
            );
          })}
          <RowLine style={{ marginTop: 10 }}>
            <SmallButton type="button" onClick={handleAddCase}>
              <FaPlus /> New case
            </SmallButton>
          </RowLine>
        </>
      ) : null}
    </Panel>
  );
};

// --- Technical input (paste-and-parse), same additive multi-location merge Documents Builder
// already uses - the manual editors above and this JSON path both write to the same tree. -------

const TechnicalSection = ({ catalog, setCatalog }) => {
  const [technicalInput, setTechnicalInput] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef(null);

  const applyTechnical = async overrideText => {
    const sourceText = typeof overrideText === 'string' ? overrideText : technicalInput;
    let incoming;
    try {
      incoming = parseDocumentsTechnicalInput(sourceText);
    } catch (parseError) {
      toast.error(parseError.message);
      return;
    }
    setIsApplying(true);
    try {
      const { catalog: merged, summary } = mergeDocumentsCatalog(catalog, incoming);
      const partiesPatch = {};
      PARTY_COLLECTIONS.forEach(collection => {
        resolveMergedRecordsForPersistence(
          catalog.parties[collection],
          merged.parties[collection],
          incoming.parties[collection],
        ).forEach(mergedRecord => {
          partiesPatch[`${collection}/${mergedRecord.id}`] = mergedRecord;
        });
      });
      const templatesPatch = {};
      resolveMergedRecordsForPersistence(catalog.documents, merged.documents, incoming.documents).forEach(mergedRecord => {
        templatesPatch[mergedRecord.id] = mergedRecord;
      });
      if (Object.keys(partiesPatch).length) await update(ref(database, DOCUMENTS_PARTIES_PATH), partiesPatch);
      if (Object.keys(templatesPatch).length) await update(ref(database, DOCUMENTS_TEMPLATES_PATH), templatesPatch);
      setCatalog(merged);
      setTechnicalInput('');
      toast.success(`Merged: ${summary.added} added, ${summary.updated} updated.`);
    } catch (applyError) {
      console.error('Unable to merge parties data', applyError);
      toast.error('Could not save the parsed data to the backend.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleFileChange = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      applyTechnical(text);
    };
    reader.onerror = () => toast.error('Could not read the file.');
    reader.readAsText(file);
  };

  return (
    <Panel>
      <CompactSection onClick={() => setOpen(previous => !previous)} role="button" aria-expanded={open}>
        <CompactInfo>
          <CompactLabel>Technical</CompactLabel>
          <CompactValue>Paste or upload JSON</CompactValue>
        </CompactInfo>
        <CompactChevron>{open ? 'Hide ›' : 'Show ›'}</CompactChevron>
      </CompactSection>
      {open ? (
        <>
          <RowLine style={{ marginTop: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <SmallButton type="button" onClick={() => fileInputRef.current?.click()} disabled={isApplying}>
              <FaUpload /> {isApplying ? 'Merging…' : 'Upload file'}
            </SmallButton>
            <SmallButton type="button" onClick={() => applyTechnical()} disabled={isApplying || !technicalInput.trim()}>
              {isApplying ? 'Merging…' : 'Parse & merge'}
            </SmallButton>
          </RowLine>
          <TechnicalTextarea
            value={technicalInput}
            onChange={event => setTechnicalInput(event.target.value)}
            placeholder='Paste the exported documentsBuilder JSON here ({"parties": {...}} or bare party collections) - records are merged additively, nothing is wiped.'
            spellCheck={false}
          />
        </>
      ) : null}
    </Panel>
  );
};

// --- Page ---------------------------------------------------------------------------------------

const EMPTY_RECENT_IDS = {
  couples: [], clinics: [], surrogateMothers: [], representatives: [], notaries: [],
};

const PartiesPage = ({ isAdmin }) => {
  const isPartiesAdmin = Boolean(isAdmin) || isInvoiceBuilderUid(auth.currentUser?.uid) || (typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('admin') === '1');

  const [catalog, setCatalog] = useState(() => emptyDocumentsCatalog());
  const [recentIds, setRecentIds] = useState(EMPTY_RECENT_IDS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openGroups, setOpenGroups] = useState({});
  const [expandedKeys, setExpandedKeys] = useState({});

  const loadPartiesData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [partiesSnapshot, templatesSnapshot, settingsSnapshot] = await Promise.all([
        get(ref(database, DOCUMENTS_PARTIES_PATH)),
        get(ref(database, DOCUMENTS_TEMPLATES_PATH)),
        get(ref(database, `${PARTIES_SETTINGS_PATH}/recentIds`)),
      ]);
      setCatalog(normalizeDocumentsCatalog(
        partiesSnapshot.exists() ? partiesSnapshot.val() : null,
        templatesSnapshot.exists() ? templatesSnapshot.val() : null,
      ));
      const rawRecentIds = settingsSnapshot.exists() ? settingsSnapshot.val() : null;
      setRecentIds({
        couples: toArray(rawRecentIds?.couples),
        clinics: toArray(rawRecentIds?.clinics),
        surrogateMothers: toArray(rawRecentIds?.surrogateMothers),
        representatives: toArray(rawRecentIds?.representatives),
        notaries: toArray(rawRecentIds?.notaries),
      });
    } catch (loadError) {
      console.error('Unable to load parties data', loadError);
      setError('Parties data is not available right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPartiesData();
  }, [loadPartiesData]);

  const toggleGroup = key => setOpenGroups(previous => ({ ...previous, [key]: !previous[key] }));

  const toggleRecord = (collection, id, forceOpen) => {
    const key = `${collection}:${id}`;
    setExpandedKeys(previous => ({ ...previous, [key]: forceOpen !== undefined ? forceOpen : !previous[key] }));
  };

  // Most-recently-used-first ordering for the Cases relation-slot pickers (spec: "consistent with
  // the party-selector MRU rule elsewhere") - persisted the same way Documents Builder already
  // persists recentCaseIds/recentDocIds, so the order survives a reload.
  const recordPartyUsage = (collection, id) => {
    if (!id) return;
    setRecentIds(previous => {
      const nextForCollection = upsertRecentId(previous[collection], id);
      set(ref(database, `${PARTIES_SETTINGS_PATH}/recentIds/${collection}`), nextForCollection).catch(usageError => {
        console.error(`Unable to save recent ${collection} usage`, usageError);
      });
      return { ...previous, [collection]: nextForCollection };
    });
  };

  if (!isPartiesAdmin) {
    return (
      <Page>
        <Shell>
          <StateCard>This page is only available to admins.</StateCard>
        </Shell>
      </Page>
    );
  }

  return (
    <Page>
      <Shell>
        <Header>
          <div>
            <Eyebrow>Admin only</Eyebrow>
            <Title>Parties</Title>
          </div>
          <HeaderActions>
            <PageNavMenu />
          </HeaderActions>
        </Header>

        {loading ? (
          <StateCard>Loading…</StateCard>
        ) : error ? (
          <StateCard>{error}</StateCard>
        ) : (
          <>
            <CouplesGroup
              catalog={catalog}
              setCatalog={setCatalog}
              expandedKeys={expandedKeys}
              toggleRecord={toggleRecord}
              groupOpen={Boolean(openGroups.couples)}
              onToggleGroup={() => toggleGroup('couples')}
            />
            <SimplePartyGroup
              title="Surrogate mothers"
              collection="surrogateMothers"
              records={catalog.parties.surrogateMothers}
              fieldDefs={SURROGATE_MOTHER_FIELDS}
              displayName={partyDisplayName}
              createEmpty={createEmptySurrogateMother}
              catalog={catalog}
              setCatalog={setCatalog}
              expandedKeys={expandedKeys}
              toggleRecord={toggleRecord}
              groupOpen={Boolean(openGroups.surrogateMothers)}
              onToggleGroup={() => toggleGroup('surrogateMothers')}
            />
            <SimplePartyGroup
              title="Representatives"
              collection="representatives"
              records={catalog.parties.representatives}
              fieldDefs={REPRESENTATIVE_FIELDS}
              displayName={partyDisplayName}
              createEmpty={createEmptyRepresentative}
              catalog={catalog}
              setCatalog={setCatalog}
              expandedKeys={expandedKeys}
              toggleRecord={toggleRecord}
              groupOpen={Boolean(openGroups.representatives)}
              onToggleGroup={() => toggleGroup('representatives')}
            />
            <SimplePartyGroup
              title="Clinics"
              collection="clinics"
              records={catalog.parties.clinics}
              fieldDefs={CLINIC_FIELDS}
              displayName={partyDisplayName}
              createEmpty={createEmptyClinic}
              catalog={catalog}
              setCatalog={setCatalog}
              expandedKeys={expandedKeys}
              toggleRecord={toggleRecord}
              groupOpen={Boolean(openGroups.clinics)}
              onToggleGroup={() => toggleGroup('clinics')}
            />
            <SimplePartyGroup
              title="Maternity hospitals"
              collection="maternityHospitals"
              records={catalog.parties.maternityHospitals}
              fieldDefs={MATERNITY_HOSPITAL_FIELDS}
              displayName={maternityDisplayName}
              createEmpty={createEmptyMaternityHospital}
              catalog={catalog}
              setCatalog={setCatalog}
              expandedKeys={expandedKeys}
              toggleRecord={toggleRecord}
              groupOpen={Boolean(openGroups.maternityHospitals)}
              onToggleGroup={() => toggleGroup('maternityHospitals')}
            />
            <SimplePartyGroup
              title="Notaries"
              collection="notaries"
              records={catalog.parties.notaries}
              fieldDefs={NOTARY_FIELDS}
              displayName={partyDisplayName}
              createEmpty={createEmptyNotary}
              catalog={catalog}
              setCatalog={setCatalog}
              expandedKeys={expandedKeys}
              toggleRecord={toggleRecord}
              groupOpen={Boolean(openGroups.notaries)}
              onToggleGroup={() => toggleGroup('notaries')}
            />
            <CasesGroup
              catalog={catalog}
              setCatalog={setCatalog}
              expandedKeys={expandedKeys}
              toggleRecord={toggleRecord}
              groupOpen={Boolean(openGroups.cases)}
              onToggleGroup={() => toggleGroup('cases')}
              recentIds={recentIds}
              recordPartyUsage={recordPartyUsage}
            />
            <TechnicalSection catalog={catalog} setCatalog={setCatalog} />
          </>
        )}
      </Shell>
    </Page>
  );
};

export default PartiesPage;
