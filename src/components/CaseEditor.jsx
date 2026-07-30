// Case editor (batch 28) - adopts the reviewed case-editor mockup's information architecture
// (case switcher strip, a compact case header, 3 tabs, collapsible sections with completion
// badges, compact relation cards, a single sticky save bar, a bottom-sheet picker) re-skinned onto
// the app's own ivory/beige + bronze/Fraunces/Inter design system - never the mockup's own colors
// or fonts. Self-contained (same reasoning as the editors it replaces): no dependency on the host
// page's internals beyond the catalog/party-MRU plumbing already used elsewhere on Parties, so it
// drops into PartiesPage's --km-* scoped root as-is.
//
// Replaces the old CasesGroup + RelationSlot/RepresentativesSlot + the standalone
// CaseArtProgramEditor/CaseChildbirthTransactionEditor components: every field those used to own a
// separate Save button for now lives in one unified per-case draft, committed by the single sticky
// "Зберегти все" bar (spec §4) - a real behavior change, not just a visual one.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { ref, set, update } from 'firebase/database';
import { FaPlus, FaTrash } from 'react-icons/fa';
import { database } from './config';
import {
  DOCUMENTS_CASES_PATH,
  buildCaseLabel,
  coupleDisplayName,
  createChildRecord,
  formatShortNameUk,
  getMaternityHospitalDisplayName,
  getValueByPath,
  isGeneticSourceDonorCode,
  maternityDisplayName,
  normalizeIsoDate,
  orderCasesByRecent,
  orderRecordsByRecentIds,
  partyDisplayName,
  removeEmptyCaseValues,
  toArray,
} from './documentsCatalogUtils';

const describeSaveError = error => `${error?.code || error?.name || 'error'}: ${error?.message || String(error)}`.trim();
const isFilled = value => !(value === undefined || value === null || String(value).trim() === '');
const parseNumberOrBlank = value => (value === '' || value === undefined || value === null ? undefined : Number(value));

// --- Case switcher strip (spec §1) ---------------------------------------------------------------

const SwitcherRow = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const CasePill = styled.button`
  flex: 0 0 auto;
  max-width: 240px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-border)')};
  background: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'var(--km-card)')};
  color: ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-text)')};
  font-weight: ${({ $active }) => ($active ? 800 : 600)};
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;

  &:hover {
    border-color: var(--km-accent);
  }
`;

const NewCasePill = styled(CasePill)`
  border-style: dashed;
  color: var(--km-accent);
  font-weight: 800;
`;

// --- Compact case header --------------------------------------------------------------------------

const CaseHeaderBlock = styled.div`
  margin-top: 12px;
  background: var(--km-card);
  border: 1px solid var(--km-border);
  border-radius: 10px;
  padding: 14px 16px;
`;

const CaseHeaderTitle = styled.h2`
  margin: 0;
  font-family: var(--km-font-display);
  font-size: 18px;
  letter-spacing: -0.01em;
`;

const CaseHeaderSubtitle = styled.div`
  margin-top: 3px;
  font-size: 12px;
  color: var(--km-muted);
`;

const HeaderChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
`;

const HeaderChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--km-bg);
  border: 1px solid var(--km-border);
  font-size: 11px;
  font-weight: 700;
  color: ${({ $complete }) => ($complete ? 'var(--km-accent)' : 'var(--km-muted)')};
`;

// --- Tabs (same pill-segmented-control idiom as Invoice Builder's Invoice/Expected-expenses toggle) -

const Tabs = styled.div`
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  margin-top: 12px;
  border-radius: 8px;
  background: var(--km-bg);
  border: 1px solid var(--km-border);
`;

const TabButton = styled.button`
  border: none;
  border-radius: 6px;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  color: ${({ $active }) => ($active ? '#fff' : 'var(--km-muted)')};
  background: ${({ $active }) => ($active ? 'linear-gradient(135deg, var(--km-accent) 0%, var(--km-accent-mid) 100%)' : 'transparent')};
`;

// --- Collapsible section with a completion badge (spec §2) - same Panel/CompactSection idiom as
// the rest of Parties (Batch 19), plus the badge the mockup adds. ---------------------------------

const Section = styled.section`
  margin-top: 10px;
  border: 1px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-card);
  padding: 12px 14px;
`;

const SectionHead = styled.div`
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

const SectionHeadInfo = styled.div`
  flex: 1 1 auto;
  min-width: 0;
`;

const SectionTitle = styled.div`
  font-size: 12.5px;
  font-weight: 800;
`;

const SectionMeta = styled.div`
  margin-top: 2px;
  font-size: 11px;
  color: var(--km-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const HeadRight = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Badge = styled.span`
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 800;
  white-space: nowrap;
  background: ${({ $complete }) => ($complete ? 'var(--km-accent-light)' : 'var(--km-danger-bg, rgba(179, 82, 63, 0.12))')};
  color: ${({ $complete }) => ($complete ? 'var(--km-accent)' : 'var(--km-danger)')};
`;

const Chevron = styled.span`
  font-size: 11px;
  font-weight: 700;
  color: var(--km-accent);
`;

const SectionBody = styled.div`
  margin-top: 8px;
  padding: 10px 12px;
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

// Batch 29 §4: the Overview tab's one always-expanded section (relations) - same look as
// CollapsibleSection's Section/SectionHead, but never clickable/collapsible, since it's the tab's
// whole purpose now rather than one accordion item among several.
const PrimarySection = styled(Section)`
  border-color: var(--km-accent);
`;

const PrimarySectionHead = styled(SectionHead)`
  cursor: default;
  background: var(--km-accent-light);
  border-color: var(--km-accent);
`;

const CollapsibleSection = ({ id, title, meta, completion, open, onToggle, children }) => {
  const badge = completion ? (
    <Badge $complete={completion.filled >= completion.total}>{completion.filled}/{completion.total}</Badge>
  ) : null;
  return (
    <Section>
      <SectionHead onClick={onToggle} role="button" aria-expanded={open} id={`section-${id}`}>
        <SectionHeadInfo>
          <SectionTitle>{title}</SectionTitle>
          {meta ? <SectionMeta>{meta}</SectionMeta> : null}
        </SectionHeadInfo>
        <HeadRight>
          {badge}
          <Chevron>{open ? 'Hide ›' : 'Show ›'}</Chevron>
        </HeadRight>
      </SectionHead>
      {open ? <SectionBody>{children}</SectionBody> : null}
    </Section>
  );
};

// --- Compact relation cards (spec §3) --------------------------------------------------------------

const RelationGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const RelationCard = styled.div`
  border: 1px solid var(--km-border);
  background: var(--km-bg);
  border-radius: 10px;
  padding: 10px 12px;
  min-width: 0;
`;

const RelationCardLabel = styled.div`
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--km-accent);
`;

const RelationCardValue = styled.div`
  margin-top: 3px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RelationCardButton = styled.button`
  margin-top: 6px;
  border: none;
  background: transparent;
  padding: 0;
  color: var(--km-accent);
  font-size: 11.5px;
  font-weight: 800;
  cursor: pointer;
`;

// --- Generic field primitives (same "input styled as text" convention used everywhere else) -------

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  margin-top: 8px;

  &:first-child {
    margin-top: 0;
  }
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

const Select = styled.select`
  border: 1px solid transparent;
  background: transparent;
  color: var(--km-text);
  border-radius: 6px;
  min-height: 28px;
  width: 100%;
  padding: 3px 8px;
  font-size: 12px;
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

// A "pick from list" field renders as the same plain-text-looking control as every other field,
// but opens the shared bottom sheet instead of a native <select> (spec §5: notary/maternity-hospital
// picks reuse the same sheet as the relation cards, never a second picker pattern).
const PickerFieldButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  color: var(--km-text);
  border-radius: 6px;
  min-height: 28px;
  padding: 3px 8px;
  font-size: 12px;
  font-family: var(--km-font);
  text-align: left;
  cursor: pointer;

  &:hover {
    border-color: var(--km-border);
  }
`;

const PickerFieldValue = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ $empty }) => ($empty ? 'var(--km-muted)' : 'var(--km-text)')};
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

const RowLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const MiniButton = styled.button`
  border: 1px solid var(--km-border);
  background: var(--km-card);
  color: var(--km-text);
  border-radius: 6px;
  min-height: 28px;
  padding: 5px 10px;
  font-size: 11.5px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;

  &:hover {
    border-color: var(--km-accent);
    color: var(--km-accent);
  }
`;

const DangerButton = styled(MiniButton)`
  border-color: var(--km-danger-border);
  color: var(--km-danger);

  &:hover {
    border-color: var(--km-danger);
    color: var(--km-danger);
  }
`;

const PrimaryButton = styled.button`
  border: none;
  color: #fff;
  background: linear-gradient(135deg, var(--km-accent) 0%, var(--km-accent-mid) 100%);
  border-radius: 8px;
  min-height: 34px;
  padding: 8px 16px;
  font-size: 12.5px;
  font-weight: 800;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.6 : 1)};

  &:hover:not(:disabled) {
    filter: brightness(1.05);
  }
`;

// --- Bottom-sheet picker modal (spec §5) - reused for every "pick from list" interaction on the
// page: relation cards' Змінити action, and every notary/maternity-hospital field. -----------------

const SheetOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(20, 16, 12, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
`;

const SheetCard = styled.div`
  width: min(880px, 100%);
  max-height: 78vh;
  background: var(--km-card);
  border-top: 1px solid var(--km-border);
  border-radius: 20px 20px 0 0;
  padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -18px 40px rgba(0, 0, 0, 0.15);
`;

const SheetHandle = styled.div`
  width: 42px;
  height: 4px;
  border-radius: 99px;
  background: var(--km-border);
  margin: 0 auto 12px;
  flex: 0 0 auto;
`;

const SheetTitle = styled.h3`
  margin: 0 0 10px;
  font-family: var(--km-font-display);
  font-size: 16px;
  flex: 0 0 auto;
`;

const SheetList = styled.div`
  overflow-y: auto;
  overscroll-behavior: contain;
  display: grid;
  gap: 6px;
`;

const SheetOption = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-border)')};
  background: ${({ $active }) => ($active ? 'var(--km-accent-light)' : '#fff')};
  color: ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-text)')};
  border-radius: 12px;
  padding: 11px 13px;
  font-size: 12.5px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
`;

const SheetButtonRow = styled.div`
  flex: 0 0 auto;
  display: flex;
  gap: 10px;
  margin-top: 12px;
`;

const PickerSheet = ({ title, options, multi, selectedIds, onApply, onCancel }) => {
  const [pending, setPending] = useState(() => selectedIds);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const toggleOption = id => {
    if (multi) {
      setPending(previous => (previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]));
    } else {
      setPending(previous => (previous[0] === id ? [] : [id]));
    }
  };

  return (
    <SheetOverlay onClick={onCancel}>
      <SheetCard onClick={event => event.stopPropagation()}>
        <SheetHandle />
        <SheetTitle>{title}</SheetTitle>
        <SheetList>
          {!multi ? (
            <SheetOption type="button" $active={pending.length === 0} onClick={() => setPending([])}>
              — Не обрано —
            </SheetOption>
          ) : null}
          {options.map(option => (
            <SheetOption
              key={option.id}
              type="button"
              $active={pending.includes(option.id)}
              onClick={() => toggleOption(option.id)}
            >
              {option.label}
              {pending.includes(option.id) ? <b>✓</b> : null}
            </SheetOption>
          ))}
          {!options.length ? <SectionMeta>Немає збережених записів цього типу.</SectionMeta> : null}
        </SheetList>
        <SheetButtonRow>
          <PrimaryButton type="button" onClick={() => onApply(pending)}>Застосувати</PrimaryButton>
          <MiniButton type="button" onClick={onCancel}>Скасувати</MiniButton>
        </SheetButtonRow>
      </SheetCard>
    </SheetOverlay>
  );
};

// --- Sticky save bar (spec §4) ----------------------------------------------------------------------

const StickyBar = styled.div`
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  z-index: 40;
  width: min(912px, 100%);
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.92);
  border-top: 1px solid var(--km-border);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  gap: 12px;
`;

const SaveState = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  color: var(--km-muted);
`;

const SaveStateLabel = styled.strong`
  display: block;
  font-size: 12.5px;
  color: ${({ $dirty }) => ($dirty ? 'var(--km-danger)' : 'var(--km-text)')};
`;

// --- Draft helpers ------------------------------------------------------------------------------

const GENETIC_SOURCE_MODE_ROLE = 'role';
const GENETIC_SOURCE_MODE_DONOR = 'donor';
const GENETIC_SOURCE_MODE_UNSET = '';
const geneticSourceModeFor = value => {
  if (!isFilled(value)) return GENETIC_SOURCE_MODE_UNSET;
  return isGeneticSourceDonorCode(value) ? GENETIC_SOURCE_MODE_DONOR : GENETIC_SOURCE_MODE_ROLE;
};

const notaryOptionLabel = notary => {
  const nominative = notary?.name?.uk?.nominative || '';
  return formatShortNameUk(nominative) || nominative || notary?.id || '';
};

const buildDraftFromCase = caseRecord => {
  const relations = caseRecord?.relations || {};
  const childbirth = caseRecord?.childbirth || {};
  const artProgram = caseRecord?.artProgram || {};
  const shipment = artProgram.embryoShipment || {};
  const transferAttempt = artProgram.transferAttempt || {};
  const documents = caseRecord?.documents || {};
  const oocyteSourceMode = geneticSourceModeFor(artProgram.oocyteSource);
  const spermSourceMode = geneticSourceModeFor(artProgram.spermSource);

  return {
    relations: {
      coupleId: relations.coupleId || '',
      ukrainianClinicId: relations.ukrainianClinicId || '',
      partnerClinicId: relations.partnerClinicId || '',
      surrogateMotherId: relations.surrogateMotherId || '',
      representativeIds: toArray(relations.representativeIds).map(String),
    },
    childbirth: {
      maternityHospitalId: childbirth.maternityHospitalId || '',
      children: toArray(childbirth.children).map(child => ({
        id: child.id,
        sex: child.sex || '',
        birthDate: child.birthDate || '',
        birthPlace: { uk: child.birthPlace?.uk || '', en: child.birthPlace?.en || '' },
        medicalConclusion: { number: child.medicalConclusion?.number || '', date: child.medicalConclusion?.date || '' },
      })),
    },
    artProgram: {
      medicalIndicationsUk: artProgram.medicalIndications?.uk || '',
      oocyteSource: artProgram.oocyteSource || '',
      oocyteSourceMode,
      spermSource: artProgram.spermSource || '',
      spermSourceMode,
      physicianNameUk: artProgram.medicalTeam?.physician?.name?.uk?.nominative || '',
      embryoShipment: {
        ivfDate: shipment.ivfDate || '',
        plannedPeriod: { startDate: shipment.plannedPeriod?.startDate || '', endDate: shipment.plannedPeriod?.endDate || '' },
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
    },
    documents: {
      surrogacyAgreement: {
        number: { uk: documents.surrogacyAgreement?.number?.uk || '', en: documents.surrogacyAgreement?.number?.en || '' },
        date: documents.surrogacyAgreement?.date || '',
        notaryId: documents.surrogacyAgreement?.notaryId || '',
      },
      birthRegistrationConsent: {
        statementDate: documents.birthRegistrationConsent?.statementDate || '',
        notaryId: documents.birthRegistrationConsent?.notaryId || '',
      },
      maritalStatusDeclaration: {
        statementDate: documents.maritalStatusDeclaration?.statementDate || '',
        notaryId: documents.maritalStatusDeclaration?.notaryId || '',
      },
      legalServicesDisclaimer: {
        statementDate: documents.legalServicesDisclaimer?.statementDate || '',
        notaryId: documents.legalServicesDisclaimer?.notaryId || '',
      },
      surrogacyAgreementAppendix1: { date: documents.surrogacyAgreementAppendix1?.date || '' },
      geneticAffinityCertificate: {
        issueDate: documents.geneticAffinityCertificate?.issueDate || '',
        outgoingNumber: documents.geneticAffinityCertificate?.outgoingNumber || '',
      },
      medicalServicesAgreement: { date: documents.medicalServicesAgreement?.date || '' },
    },
  };
};

// --- Per-section required-field configs (spec §2/§7): the single source of truth for every
// section's completion badge. -----------------------------------------------------------------

const SECTION_DEFS = [
  {
    key: 'relations', tab: 'overview', title: 'Учасники та зв’язки', meta: 'Пара, клініки, сурогатна мати, представники',
    completion: draft => {
      const core = ['coupleId', 'ukrainianClinicId', 'surrogateMotherId'].filter(path => isFilled(getValueByPath(draft.relations, path))).length;
      const rep = draft.relations.representativeIds.length > 0 ? 1 : 0;
      return { filled: core + rep, total: 4 };
    },
  },
  {
    key: 'medicalData', tab: 'program', title: 'Медичні дані', meta: 'Основні параметри програми',
    completion: draft => {
      const a = draft.artProgram;
      const values = [a.medicalIndicationsUk, a.physicianNameUk, a.oocyteSource, a.spermSource];
      return { filled: values.filter(isFilled).length, total: values.length };
    },
  },
  {
    key: 'embryoShipment', tab: 'program', title: 'Транспортування ембріонів', meta: 'Ключові дати логістики',
    completion: draft => {
      const s = draft.artProgram.embryoShipment;
      const values = [s.ivfDate, s.plannedPeriod.startDate, s.plannedPeriod.endDate, s.sentDate, s.receivedDate];
      return { filled: values.filter(isFilled).length, total: values.length };
    },
  },
  {
    key: 'transferAttempt', tab: 'program', title: 'Успішний перенос', meta: 'Перенос, ХГЛ, УЗД, термін вагітності',
    completion: draft => {
      const t = draft.artProgram.transferAttempt;
      const singles = [t.date, t.embryoCount, t.embryoStage, t.hcgTestDate, t.ultrasoundDate, t.fetusCount];
      const gestationalRangeFilled = isFilled(t.gestationalAgeFrom) && isFilled(t.gestationalAgeTo);
      return { filled: singles.filter(isFilled).length + (gestationalRangeFilled ? 1 : 0), total: singles.length + 1 };
    },
  },
  {
    key: 'childbirth', tab: 'racs', title: 'Пологи та дитина', meta: 'Дані для реєстрації народження',
    completion: draft => {
      const c = draft.childbirth;
      const values = [c.maternityHospitalId, c.children.length ? 'x' : ''];
      c.children.forEach(child => values.push(
        child.sex,
        child.birthDate,
        child.birthPlace?.uk,
        child.medicalConclusion?.number,
        child.medicalConclusion?.date,
      ));
      return { filled: values.filter(isFilled).length, total: values.length };
    },
  },
  {
    key: 'surrogacyAgreement', tab: 'racs', title: 'Договір сурогатного материнства', meta: 'Номер, дата, нотаріус',
    completion: draft => {
      const d = draft.documents.surrogacyAgreement;
      const values = [d.number.uk, d.number.en, d.date, d.notaryId];
      return { filled: values.filter(isFilled).length, total: values.length };
    },
  },
  {
    key: 'ratsStatements', tab: 'racs', title: 'Заяви до РАЦС', meta: 'Три заяви та підписант',
    completion: draft => {
      const d = draft.documents;
      const values = [
        d.birthRegistrationConsent.statementDate, d.birthRegistrationConsent.notaryId,
        d.maritalStatusDeclaration.statementDate, d.maritalStatusDeclaration.notaryId,
        d.legalServicesDisclaimer.statementDate, d.legalServicesDisclaimer.notaryId,
      ];
      return { filled: values.filter(isFilled).length, total: values.length };
    },
  },
  {
    key: 'otherDocuments', tab: 'racs', title: 'Інші документи', meta: 'Додаток №1, генетична спорідненість, медичні послуги',
    completion: draft => {
      const d = draft.documents;
      const values = [d.surrogacyAgreementAppendix1.date, d.geneticAffinityCertificate.issueDate, d.geneticAffinityCertificate.outgoingNumber, d.medicalServicesAgreement.date];
      return { filled: values.filter(isFilled).length, total: values.length };
    },
  },
];

const sectionCompletion = (key, draft) => SECTION_DEFS.find(section => section.key === key)?.completion(draft) || { filled: 0, total: 0 };

// --- Component ----------------------------------------------------------------------------------

const CaseEditor = ({
  catalog, setCatalog, selectedCaseId, onSelectCase, onCreateCase, recentCaseIds, bumpRecentCase, partyRecentIds, recordPartyUsage,
}) => {
  const cases = catalog.cases;
  const orderedCases = useMemo(() => orderCasesByRecent(cases, recentCaseIds), [cases, recentCaseIds]);
  const selectedCase = cases.find(item => String(item.id) === String(selectedCaseId)) || null;

  const [activeTab, setActiveTab] = useState('overview');
  // Actionable/working sections start open, purely reference-y ones start collapsed (same idea the
  // reviewed mockup used) - ratsStatements/otherDocuments/racssClinicLetter are the ones an admin
  // visits far less often than the working set below. Overview's own relations section is no
  // longer part of this - it's always expanded now (batch 29 §4), never collapsible.
  const [openSections, setOpenSections] = useState({
    medicalData: true,
    embryoShipment: true,
    transferAttempt: true,
    childbirth: true,
    surrogacyAgreement: true,
    ratsStatements: false,
    otherDocuments: false,
    racssClinicLetter: false,
  });
  const [draft, setDraft] = useState(() => buildDraftFromCase(selectedCase));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAtLabel, setSavedAtLabel] = useState('');
  const [picker, setPicker] = useState(null);
  const draftRevision = useRef(0);

  useEffect(() => {
    setDraft(buildDraftFromCase(selectedCase));
    setDirty(false);
    setActiveTab('overview');
    setSavedAtLabel('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCaseId]);

  const toggleSection = key => setOpenSections(previous => ({ ...previous, [key]: !previous[key] }));

  const handleSelectCase = id => {
    if (dirty && typeof window !== 'undefined' && !window.confirm('Є незбережені зміни. Перейти до іншої справи без збереження?')) return;
    onSelectCase(id);
    bumpRecentCase(id);
  };

  const handleCreateCase = () => {
    if (dirty && typeof window !== 'undefined' && !window.confirm('Є незбережені зміни. Створити нову справу без збереження?')) return;
    onCreateCase();
  };

  const markDirty = () => {
    draftRevision.current += 1;
    setDirty(true);
  };

  const updateRelations = (field, value) => { setDraft(previous => ({ ...previous, relations: { ...previous.relations, [field]: value } })); markDirty(); };
  const updateChildbirth = (field, value) => { setDraft(previous => ({ ...previous, childbirth: { ...previous.childbirth, [field]: value } })); markDirty(); };
  const updateChild = (childId, field, value) => {
    setDraft(previous => ({
      ...previous,
      childbirth: { ...previous.childbirth, children: previous.childbirth.children.map(child => (child.id === childId ? { ...child, [field]: value } : child)) },
    }));
    markDirty();
  };
  const updateChildNested = (childId, group, field, value) => {
    setDraft(previous => ({
      ...previous,
      childbirth: {
        ...previous.childbirth,
        children: previous.childbirth.children.map(child => (child.id === childId ? { ...child, [group]: { ...child[group], [field]: value } } : child)),
      },
    }));
    markDirty();
  };
  const addChild = () => {
    setDraft(previous => ({ ...previous, childbirth: { ...previous.childbirth, children: [...previous.childbirth.children, createChildRecord()] } }));
    markDirty();
  };
  const removeChild = childId => {
    setDraft(previous => ({ ...previous, childbirth: { ...previous.childbirth, children: previous.childbirth.children.filter(child => child.id !== childId) } }));
    markDirty();
  };

  const updateArtField = (field, value) => { setDraft(previous => ({ ...previous, artProgram: { ...previous.artProgram, [field]: value } })); markDirty(); };
  const updateGeneticSourceMode = (field, modeField, mode) => {
    setDraft(previous => ({
      ...previous,
      artProgram: {
        ...previous.artProgram,
        [modeField]: mode,
        [field]: mode === GENETIC_SOURCE_MODE_ROLE ? (field === 'oocyteSource' ? 'wife' : 'husband') : '',
      },
    }));
    markDirty();
  };
  const updateShipmentField = (field, value) => {
    setDraft(previous => ({ ...previous, artProgram: { ...previous.artProgram, embryoShipment: { ...previous.artProgram.embryoShipment, [field]: value } } }));
    markDirty();
  };
  const updateShipmentPeriodField = (field, value) => {
    setDraft(previous => ({
      ...previous,
      artProgram: {
        ...previous.artProgram,
        embryoShipment: { ...previous.artProgram.embryoShipment, plannedPeriod: { ...previous.artProgram.embryoShipment.plannedPeriod, [field]: value } },
      },
    }));
    markDirty();
  };
  const updateTransferField = (field, value) => {
    setDraft(previous => ({ ...previous, artProgram: { ...previous.artProgram, transferAttempt: { ...previous.artProgram.transferAttempt, [field]: value } } }));
    markDirty();
  };

  const updateDocumentField = (docKey, field, value) => {
    setDraft(previous => ({ ...previous, documents: { ...previous.documents, [docKey]: { ...previous.documents[docKey], [field]: value } } }));
    markDirty();
  };
  const updateDocumentNumberField = (docKey, lang, value) => {
    setDraft(previous => ({
      ...previous,
      documents: { ...previous.documents, [docKey]: { ...previous.documents[docKey], number: { ...previous.documents[docKey].number, [lang]: value } } },
    }));
    markDirty();
  };

  // --- Shared bottom-sheet picker (spec §5) --------------------------------------------------------

  const DISPLAY_NAME_BY_COLLECTION = {
    couples: coupleDisplayName,
    clinics: partyDisplayName,
    partnerClinics: partyDisplayName,
    surrogateMothers: partyDisplayName,
    representatives: partyDisplayName,
    maternityHospitals: maternityDisplayName,
    notaries: notaryOptionLabel,
  };

  const openPicker = ({ title, collection, valueId, multi = false, onApply }) => {
    const records = catalog.parties[collection] || [];
    const ordered = orderRecordsByRecentIds(records, partyRecentIds[collection] || []);
    const displayName = DISPLAY_NAME_BY_COLLECTION[collection];
    setPicker({
      title,
      multi,
      options: ordered.map(record => ({ id: String(record.id), label: displayName(record) || record.id })),
      selectedIds: multi ? toArray(valueId).map(String) : (valueId ? [String(valueId)] : []),
      onApply: ids => {
        ids.forEach(id => recordPartyUsage(collection, id));
        onApply(multi ? ids : (ids[0] || ''));
        setPicker(null);
      },
    });
  };

  // --- Single batched save (spec §4) ---------------------------------------------------------------

  const handleSaveAll = async () => {
    if (!selectedCase) return;
    const submittedRevision = draftRevision.current;
    setSaving(true);
    try {
      const cleanedRelations = removeEmptyCaseValues({ ...draft.relations });

      const cleanedChildbirth = removeEmptyCaseValues(draft.childbirth);

      const shipmentDraft = draft.artProgram.embryoShipment;
      const transferDraft = draft.artProgram.transferAttempt;
      const hcgTest = transferDraft.hcgTestDate ? { date: normalizeIsoDate(transferDraft.hcgTestDate) } : undefined;
      const ultrasound = (transferDraft.ultrasoundDate || transferDraft.fetusCount || transferDraft.gestationalAgeFrom || transferDraft.gestationalAgeTo)
        ? {
          date: normalizeIsoDate(transferDraft.ultrasoundDate),
          fetusCount: parseNumberOrBlank(transferDraft.fetusCount),
          gestationalAgeWeeks: { from: parseNumberOrBlank(transferDraft.gestationalAgeFrom), to: parseNumberOrBlank(transferDraft.gestationalAgeTo) },
        }
        : undefined;
      const artProgramPayload = {
        medicalIndications: { uk: draft.artProgram.medicalIndicationsUk },
        medicalTeam: { physician: { name: { uk: { nominative: draft.artProgram.physicianNameUk } } } },
        embryoShipment: {
          ivfDate: normalizeIsoDate(shipmentDraft.ivfDate),
          plannedPeriod: { startDate: normalizeIsoDate(shipmentDraft.plannedPeriod.startDate), endDate: normalizeIsoDate(shipmentDraft.plannedPeriod.endDate) },
          sentDate: normalizeIsoDate(shipmentDraft.sentDate),
          receivedDate: normalizeIsoDate(shipmentDraft.receivedDate),
        },
        transferAttempt: { date: normalizeIsoDate(transferDraft.date), embryoCount: parseNumberOrBlank(transferDraft.embryoCount), embryoStage: transferDraft.embryoStage, hcgTest, ultrasound },
      };
      // The genetic-source mode selector never offers a blank option (it always displays
      // Дружина/Чоловік or Донор) - saving it unconditionally would fabricate
      // oocyteSource/spermSource on every single-save, even for a case whose ART Program tab was
      // never touched. Only include it once there's other real ART-program content, the case
      // already had one, or the admin actively chose the donor option.
      const hasOtherArtProgramContent = Object.keys(removeEmptyCaseValues({
        medicalIndications: artProgramPayload.medicalIndications,
        medicalTeam: artProgramPayload.medicalTeam,
        embryoShipment: artProgramPayload.embryoShipment,
        transferAttempt: artProgramPayload.transferAttempt,
      })).length > 0;
      const shouldIncludeGeneticSource = hasOtherArtProgramContent
        || Boolean(selectedCase.artProgram)
        || isFilled(draft.artProgram.oocyteSourceMode)
        || isFilled(draft.artProgram.spermSourceMode);
      if (shouldIncludeGeneticSource) {
        artProgramPayload.oocyteSource = draft.artProgram.oocyteSource;
        artProgramPayload.spermSource = draft.artProgram.spermSource;
      }
      const cleanedArtProgram = removeEmptyCaseValues(artProgramPayload);
      const nextArtProgram = Object.keys(cleanedArtProgram).length ? cleanedArtProgram : null;

      const documentsPayload = {
        surrogacyAgreement: draft.documents.surrogacyAgreement,
        birthRegistrationConsent: draft.documents.birthRegistrationConsent,
        maritalStatusDeclaration: draft.documents.maritalStatusDeclaration,
        legalServicesDisclaimer: draft.documents.legalServicesDisclaimer,
        surrogacyAgreementAppendix1: draft.documents.surrogacyAgreementAppendix1,
        geneticAffinityCertificate: {
          issueDate: normalizeIsoDate(draft.documents.geneticAffinityCertificate.issueDate),
          outgoingNumber: draft.documents.geneticAffinityCertificate.outgoingNumber,
        },
        medicalServicesAgreement: { date: normalizeIsoDate(draft.documents.medicalServicesAgreement.date) },
      };
      const cleanedDocuments = removeEmptyCaseValues(documentsPayload);
      const nextDocuments = { ...(selectedCase.documents || {}) };
      Object.keys(documentsPayload).forEach(key => {
        if (cleanedDocuments[key]) nextDocuments[key] = cleanedDocuments[key];
        else delete nextDocuments[key];
      });
      const persistedDocuments = Object.keys(nextDocuments).length ? nextDocuments : null;

      const patch = {
        [`${selectedCase.id}/relations`]: cleanedRelations,
        [`${selectedCase.id}/childbirth`]: cleanedChildbirth,
        [`${selectedCase.id}/artProgram`]: nextArtProgram,
        [`${selectedCase.id}/documents`]: persistedDocuments,
      };
      await update(ref(database, DOCUMENTS_CASES_PATH), patch);

      setCatalog(previous => ({
        ...previous,
        cases: previous.cases.map(item => {
          if (String(item.id) !== String(selectedCase.id)) return item;
          const next = { ...item, relations: cleanedRelations, childbirth: cleanedChildbirth };
          if (nextArtProgram) next.artProgram = nextArtProgram; else delete next.artProgram;
          if (persistedDocuments) next.documents = persistedDocuments; else delete next.documents;
          return next;
        }),
      }));
      if (draftRevision.current === submittedRevision) setDirty(false);
      setSavedAtLabel(new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }));
      toast.success('Усі зміни збережено.');
    } catch (saveError) {
      console.error('Unable to save the case', saveError);
      toast.error(`Не вдалося зберегти справу: ${describeSaveError(saveError)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCase = () => {
    if (!selectedCase) return;
    const label = buildCaseLabel(catalog, selectedCase) || selectedCase.id;
    if (typeof window !== 'undefined' && !window.confirm(`Видалити справу «${label}»? Записи учасників залишаться в довіднику.`)) return;
    set(ref(database, `${DOCUMENTS_CASES_PATH}/${selectedCase.id}`), null).then(() => {
      setCatalog(previous => ({ ...previous, cases: previous.cases.filter(item => String(item.id) !== String(selectedCase.id)) }));
      onSelectCase('');
      toast.success('Справу видалено.');
    }).catch(deleteError => {
      console.error('Unable to delete case', deleteError);
      toast.error('Не вдалося видалити справу.');
    });
  };

  if (!cases.length) {
    return (
      <div style={{ marginTop: 12 }}>
        <RowLine>
          <PrimaryButton type="button" onClick={onCreateCase}><FaPlus /> Нова справа</PrimaryButton>
        </RowLine>
      </div>
    );
  }

  const documentsRollup = ['surrogacyAgreement', 'ratsStatements', 'otherDocuments']
    .map(key => sectionCompletion(key, draft))
    .reduce((acc, item) => ({ filled: acc.filled + item.filled, total: acc.total + item.total }), { filled: 0, total: 0 });
  const fieldsRollup = SECTION_DEFS
    .map(section => section.completion(draft))
    .reduce((acc, item) => ({ filled: acc.filled + item.filled, total: acc.total + item.total }), { filled: 0, total: 0 });

  return (
    <div style={{ marginTop: 6 }}>
      <SwitcherRow>
        {orderedCases.map(caseRecord => (
          <CasePill
            key={caseRecord.id}
            type="button"
            $active={String(caseRecord.id) === String(selectedCaseId)}
            onClick={() => handleSelectCase(caseRecord.id)}
          >
            {buildCaseLabel(catalog, caseRecord) || caseRecord.id}
          </CasePill>
        ))}
        <NewCasePill type="button" onClick={handleCreateCase}>+ Нова справа</NewCasePill>
      </SwitcherRow>

      {selectedCase ? (
        <>
          <CaseHeaderBlock>
            <CaseHeaderTitle>{buildCaseLabel(catalog, selectedCase) || selectedCase.id}</CaseHeaderTitle>
            <CaseHeaderSubtitle>Вся інформація згрупована за етапами - заповнені блоки можна згорнути, а незавершені видно одразу.</CaseHeaderSubtitle>
            <HeaderChips>
              <HeaderChip $complete={fieldsRollup.filled >= fieldsRollup.total}>{fieldsRollup.filled} із {fieldsRollup.total} полів</HeaderChip>
              <HeaderChip $complete={documentsRollup.filled >= documentsRollup.total}>{documentsRollup.filled} із {documentsRollup.total} полів документів</HeaderChip>
            </HeaderChips>
            <Tabs role="tablist">
              <TabButton type="button" $active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>Огляд</TabButton>
              <TabButton type="button" $active={activeTab === 'program'} onClick={() => setActiveTab('program')}>Програма ДРТ</TabButton>
              <TabButton type="button" $active={activeTab === 'racs'} onClick={() => setActiveTab('racs')}>РАЦС</TabButton>
            </Tabs>
          </CaseHeaderBlock>

          {activeTab === 'overview' ? (
            <div>
              {/* Batch 29 §3/§4: the milestone reminder and the documents/RACS rollup cards were
                  dropped for being low-value - relations is now the tab's whole purpose, so it's
                  shown directly (no header row a click could hide, no collapse state to track). */}
              <PrimarySection>
                <PrimarySectionHead>
                  <SectionHeadInfo>
                    <SectionTitle>Учасники та зв'язки</SectionTitle>
                    <SectionMeta>Пара, клініки, сурогатна мати, представники</SectionMeta>
                  </SectionHeadInfo>
                  <HeadRight>
                    {(() => {
                      const completion = sectionCompletion('relations', draft);
                      return <Badge $complete={completion.filled >= completion.total}>{completion.filled}/{completion.total}</Badge>;
                    })()}
                  </HeadRight>
                </PrimarySectionHead>
                <SectionBody>
                <RelationGrid>
                  <RelationCard role="group" aria-label="Пара">
                    <RelationCardLabel>Пара</RelationCardLabel>
                    <RelationCardValue>{(() => {
                      const couple = catalog.parties.couples.find(item => String(item.id) === String(draft.relations.coupleId));
                      return couple ? coupleDisplayName(couple) : '— не обрано —';
                    })()}
                    </RelationCardValue>
                    <RelationCardButton type="button" onClick={() => openPicker({
                      title: 'Оберіть пару', collection: 'couples', valueId: draft.relations.coupleId, onApply: id => updateRelations('coupleId', id),
                    })}
                    >
                      Змінити
                    </RelationCardButton>
                  </RelationCard>
                  <RelationCard role="group" aria-label="Клініка">
                    <RelationCardLabel>Клініка</RelationCardLabel>
                    <RelationCardValue>{(() => {
                      const clinic = catalog.parties.clinics.find(item => String(item.id) === String(draft.relations.ukrainianClinicId));
                      return clinic ? partyDisplayName(clinic) : '— не обрано —';
                    })()}
                    </RelationCardValue>
                    <RelationCardButton type="button" onClick={() => openPicker({
                      title: 'Оберіть клініку', collection: 'clinics', valueId: draft.relations.ukrainianClinicId, onApply: id => updateRelations('ukrainianClinicId', id),
                    })}
                    >
                      Змінити
                    </RelationCardButton>
                  </RelationCard>
                  <RelationCard role="group" aria-label="Партнерська клініка">
                    <RelationCardLabel>Партнерська клініка</RelationCardLabel>
                    <RelationCardValue>{(() => {
                      const partnerClinic = catalog.parties.partnerClinics.find(item => String(item.id) === String(draft.relations.partnerClinicId));
                      return partnerClinic ? partyDisplayName(partnerClinic) : '— не обрано —';
                    })()}
                    </RelationCardValue>
                    <RelationCardButton type="button" onClick={() => openPicker({
                      title: 'Оберіть партнерську клініку', collection: 'partnerClinics', valueId: draft.relations.partnerClinicId, onApply: id => updateRelations('partnerClinicId', id),
                    })}
                    >
                      Змінити
                    </RelationCardButton>
                  </RelationCard>
                  <RelationCard role="group" aria-label="Сурогатна мати">
                    <RelationCardLabel>Сурогатна мати</RelationCardLabel>
                    <RelationCardValue>{(() => {
                      const surrogate = catalog.parties.surrogateMothers.find(item => String(item.id) === String(draft.relations.surrogateMotherId));
                      return surrogate ? partyDisplayName(surrogate) : '— не обрано —';
                    })()}
                    </RelationCardValue>
                    <RelationCardButton type="button" onClick={() => openPicker({
                      title: 'Оберіть сурогатну матір', collection: 'surrogateMothers', valueId: draft.relations.surrogateMotherId, onApply: id => updateRelations('surrogateMotherId', id),
                    })}
                    >
                      Змінити
                    </RelationCardButton>
                  </RelationCard>
                  <RelationCard role="group" aria-label="Представники">
                    <RelationCardLabel>Представники</RelationCardLabel>
                    <RelationCardValue>{(() => {
                      const selected = catalog.parties.representatives.filter(item => draft.relations.representativeIds.includes(String(item.id)));
                      return selected.length ? selected.map(partyDisplayName).join(', ') : '— немає —';
                    })()}
                    </RelationCardValue>
                    <RelationCardButton type="button" onClick={() => openPicker({
                      title: 'Оберіть представників', collection: 'representatives', valueId: draft.relations.representativeIds, multi: true, onApply: ids => updateRelations('representativeIds', ids),
                    })}
                    >
                      Змінити
                    </RelationCardButton>
                  </RelationCard>
                </RelationGrid>
                </SectionBody>
              </PrimarySection>
            </div>
          ) : null}

          {activeTab === 'program' ? (
            <div>
              <CollapsibleSection
                id="medicalData"
                title="Медичні дані"
                meta="Основні параметри програми"
                completion={sectionCompletion('medicalData', draft)}
                open={Boolean(openSections.medicalData)}
                onToggle={() => toggleSection('medicalData')}
              >
                <FieldGrid>
                  <Field style={{ gridColumn: '1 / -1' }}>
                    Медичні показання
                    <FieldInput type="text" value={draft.artProgram.medicalIndicationsUk} onChange={event => updateArtField('medicalIndicationsUk', event.target.value)} />
                  </Field>
                  <Field>
                    Джерело яйцеклітин
                    <RowLine>
                      <Select
                        style={{ width: 'auto', flex: 1 }}
                        value={draft.artProgram.oocyteSourceMode}
                        onChange={event => updateGeneticSourceMode('oocyteSource', 'oocyteSourceMode', event.target.value)}
                      >
                        <option value={GENETIC_SOURCE_MODE_UNSET}>Оберіть джерело</option>
                        <option value={GENETIC_SOURCE_MODE_ROLE}>Дружина</option>
                        <option value={GENETIC_SOURCE_MODE_DONOR}>Донор</option>
                      </Select>
                      {draft.artProgram.oocyteSourceMode === GENETIC_SOURCE_MODE_DONOR ? (
                        <FieldInput type="text" placeholder="Код донора" value={draft.artProgram.oocyteSource} onChange={event => updateArtField('oocyteSource', event.target.value)} />
                      ) : null}
                    </RowLine>
                  </Field>
                  <Field>
                    Джерело сперматозоїдів
                    <RowLine>
                      <Select
                        style={{ width: 'auto', flex: 1 }}
                        value={draft.artProgram.spermSourceMode}
                        onChange={event => updateGeneticSourceMode('spermSource', 'spermSourceMode', event.target.value)}
                      >
                        <option value={GENETIC_SOURCE_MODE_UNSET}>Оберіть джерело</option>
                        <option value={GENETIC_SOURCE_MODE_ROLE}>Чоловік</option>
                        <option value={GENETIC_SOURCE_MODE_DONOR}>Донор</option>
                      </Select>
                      {draft.artProgram.spermSourceMode === GENETIC_SOURCE_MODE_DONOR ? (
                        <FieldInput type="text" placeholder="Код донора" value={draft.artProgram.spermSource} onChange={event => updateArtField('spermSource', event.target.value)} />
                      ) : null}
                    </RowLine>
                  </Field>
                  <Field>
                    Лікар програми
                    <FieldInput type="text" value={draft.artProgram.physicianNameUk} onChange={event => updateArtField('physicianNameUk', event.target.value)} />
                  </Field>
                </FieldGrid>
              </CollapsibleSection>

              <CollapsibleSection
                id="embryoShipment"
                title="Транспортування ембріонів"
                meta="Ключові дати логістики"
                completion={sectionCompletion('embryoShipment', draft)}
                open={Boolean(openSections.embryoShipment)}
                onToggle={() => toggleSection('embryoShipment')}
              >
                <FieldGrid>
                  <Field>
                    Дата ЗІВ
                    <FieldInput type="date" value={draft.artProgram.embryoShipment.ivfDate} onChange={event => updateShipmentField('ivfDate', event.target.value)} />
                  </Field>
                  <Field>
                    Запланований період — початок
                    <FieldInput type="date" value={draft.artProgram.embryoShipment.plannedPeriod.startDate} onChange={event => updateShipmentPeriodField('startDate', event.target.value)} />
                  </Field>
                  <Field>
                    Запланований період — кінець
                    <FieldInput type="date" value={draft.artProgram.embryoShipment.plannedPeriod.endDate} onChange={event => updateShipmentPeriodField('endDate', event.target.value)} />
                  </Field>
                  <Field>
                    Дата відправлення
                    <FieldInput type="date" value={draft.artProgram.embryoShipment.sentDate} onChange={event => updateShipmentField('sentDate', event.target.value)} />
                  </Field>
                  <Field>
                    Дата фактичного отримання
                    <FieldInput type="date" value={draft.artProgram.embryoShipment.receivedDate} onChange={event => updateShipmentField('receivedDate', event.target.value)} />
                  </Field>
                </FieldGrid>
              </CollapsibleSection>

              <CollapsibleSection
                id="transferAttempt"
                title="Успішний перенос"
                meta="Перенос, ХГЛ, УЗД, термін вагітності"
                completion={sectionCompletion('transferAttempt', draft)}
                open={Boolean(openSections.transferAttempt)}
                onToggle={() => toggleSection('transferAttempt')}
              >
                <FieldGrid>
                  <Field>
                    Дата переносу
                    <FieldInput type="date" value={draft.artProgram.transferAttempt.date} onChange={event => updateTransferField('date', event.target.value)} />
                  </Field>
                  <Field>
                    Кількість ембріонів
                    <FieldInput type="number" min="0" value={draft.artProgram.transferAttempt.embryoCount} onChange={event => updateTransferField('embryoCount', event.target.value)} />
                  </Field>
                  <Field>
                    Стадія ембріонів
                    <FieldInput type="text" list="art-embryo-stage-options" placeholder="blastocyst" value={draft.artProgram.transferAttempt.embryoStage} onChange={event => updateTransferField('embryoStage', event.target.value)} />
                  </Field>
                </FieldGrid>
                <SectionSubhead>ХГЛ</SectionSubhead>
                <FieldGrid>
                  <Field>
                    Дата аналізу
                    <FieldInput type="date" value={draft.artProgram.transferAttempt.hcgTestDate} onChange={event => updateTransferField('hcgTestDate', event.target.value)} />
                  </Field>
                </FieldGrid>
                <SectionSubhead>УЗД</SectionSubhead>
                <FieldGrid>
                  <Field>
                    Дата УЗД
                    <FieldInput type="date" value={draft.artProgram.transferAttempt.ultrasoundDate} onChange={event => updateTransferField('ultrasoundDate', event.target.value)} />
                  </Field>
                  <Field>
                    Кількість плодів
                    <FieldInput type="number" min="0" value={draft.artProgram.transferAttempt.fetusCount} onChange={event => updateTransferField('fetusCount', event.target.value)} />
                  </Field>
                  <Field>
                    Строк вагітності — від (тижнів)
                    <FieldInput type="number" min="0" value={draft.artProgram.transferAttempt.gestationalAgeFrom} onChange={event => updateTransferField('gestationalAgeFrom', event.target.value)} />
                  </Field>
                  <Field>
                    Строк вагітності — до (тижнів)
                    <FieldInput type="number" min="0" value={draft.artProgram.transferAttempt.gestationalAgeTo} onChange={event => updateTransferField('gestationalAgeTo', event.target.value)} />
                  </Field>
                </FieldGrid>
                <datalist id="art-embryo-stage-options">
                  <option value="blastocyst" />
                </datalist>
              </CollapsibleSection>
            </div>
          ) : null}

          {activeTab === 'racs' ? (
            <div>
              <CollapsibleSection
                id="childbirth"
                title="Пологи та дитина"
                meta="Дані для реєстрації народження"
                completion={sectionCompletion('childbirth', draft)}
                open={Boolean(openSections.childbirth)}
                onToggle={() => toggleSection('childbirth')}
              >
                <Field>
                  Пологовий будинок
                  <PickerFieldButton
                    type="button"
                    onClick={() => openPicker({
                      title: 'Оберіть пологовий будинок', collection: 'maternityHospitals', valueId: draft.childbirth.maternityHospitalId, onApply: id => updateChildbirth('maternityHospitalId', id),
                    })}
                  >
                    <PickerFieldValue $empty={!draft.childbirth.maternityHospitalId}>
                      {(() => {
                        const hospital = catalog.parties.maternityHospitals.find(item => String(item.id) === String(draft.childbirth.maternityHospitalId));
                        return hospital ? getMaternityHospitalDisplayName(hospital) : '— не обрано —';
                      })()}
                    </PickerFieldValue>
                    <span>›</span>
                  </PickerFieldButton>
                </Field>

                {draft.childbirth.children.map((child, childIndex) => (
                  <DocRow key={child.id}>
                    <DocRowHead>
                      <SectionSubhead style={{ margin: 0 }}>Дитина {childIndex + 1}</SectionSubhead>
                      <DangerButton type="button" onClick={() => removeChild(child.id)} title="Видалити дитину"><FaTrash /></DangerButton>
                    </DocRowHead>
                    <FieldGrid>
                      <Field>
                        Стать
                        <Select value={child.sex} onChange={event => updateChild(child.id, 'sex', event.target.value)}>
                          <option value="">— не обрано —</option>
                          <option value="female">жіноча</option>
                          <option value="male">чоловіча</option>
                        </Select>
                      </Field>
                      <Field>
                        Дата народження
                        <FieldInput type="date" value={child.birthDate} onChange={event => updateChild(child.id, 'birthDate', event.target.value)} />
                      </Field>
                      <Field>
                        Місце народження (укр)
                        <FieldInput type="text" value={child.birthPlace.uk} onChange={event => updateChildNested(child.id, 'birthPlace', 'uk', event.target.value)} />
                      </Field>
                      <Field>
                        Місце народження (eng)
                        <FieldInput type="text" value={child.birthPlace.en} onChange={event => updateChildNested(child.id, 'birthPlace', 'en', event.target.value)} />
                      </Field>
                      <Field>
                        № медичного висновку
                        <FieldInput type="text" value={child.medicalConclusion.number} onChange={event => updateChildNested(child.id, 'medicalConclusion', 'number', event.target.value)} />
                      </Field>
                      <Field>
                        Дата медичного висновку
                        <FieldInput type="date" value={child.medicalConclusion.date} onChange={event => updateChildNested(child.id, 'medicalConclusion', 'date', event.target.value)} />
                      </Field>
                    </FieldGrid>
                  </DocRow>
                ))}
                <RowLine style={{ marginTop: 8 }}>
                  <MiniButton type="button" onClick={addChild}><FaPlus /> Додати дитину</MiniButton>
                </RowLine>
              </CollapsibleSection>

              <CollapsibleSection
                id="surrogacyAgreement"
                title="Договір сурогатного материнства"
                meta="Номер, дата, нотаріус"
                completion={sectionCompletion('surrogacyAgreement', draft)}
                open={Boolean(openSections.surrogacyAgreement)}
                onToggle={() => toggleSection('surrogacyAgreement')}
              >
                <FieldGrid>
                  <Field>
                    Номер (укр)
                    <FieldInput type="text" value={draft.documents.surrogacyAgreement.number.uk} onChange={event => updateDocumentNumberField('surrogacyAgreement', 'uk', event.target.value)} />
                  </Field>
                  <Field>
                    Номер (eng)
                    <FieldInput type="text" value={draft.documents.surrogacyAgreement.number.en} onChange={event => updateDocumentNumberField('surrogacyAgreement', 'en', event.target.value)} />
                  </Field>
                  <Field>
                    Дата договору
                    <FieldInput type="date" value={draft.documents.surrogacyAgreement.date} onChange={event => updateDocumentField('surrogacyAgreement', 'date', event.target.value)} />
                  </Field>
                  <Field>
                    Нотаріус
                    <PickerFieldButton
                      type="button"
                      onClick={() => openPicker({
                        title: 'Оберіть нотаріуса', collection: 'notaries', valueId: draft.documents.surrogacyAgreement.notaryId, onApply: id => updateDocumentField('surrogacyAgreement', 'notaryId', id),
                      })}
                    >
                      <PickerFieldValue $empty={!draft.documents.surrogacyAgreement.notaryId}>
                        {(() => {
                          const notary = catalog.parties.notaries.find(item => String(item.id) === String(draft.documents.surrogacyAgreement.notaryId));
                          return notary ? notaryOptionLabel(notary) : '— не обрано —';
                        })()}
                      </PickerFieldValue>
                      <span>›</span>
                    </PickerFieldButton>
                  </Field>
                </FieldGrid>
              </CollapsibleSection>

              <CollapsibleSection
                id="ratsStatements"
                title="Заяви до РАЦС"
                meta="Три заяви та підписант"
                completion={sectionCompletion('ratsStatements', draft)}
                open={Boolean(openSections.ratsStatements)}
                onToggle={() => toggleSection('ratsStatements')}
              >
                {[
                  { key: 'birthRegistrationConsent', label: 'Заява до РАЦС' },
                  { key: 'maritalStatusDeclaration', label: 'Заява СМ про відсутність шлюбу' },
                  { key: 'legalServicesDisclaimer', label: 'Заява про ненадання юридичних послуг клінікою' },
                ].map(({ key, label }) => (
                  <DocRow key={key}>
                    <SectionSubhead style={{ margin: '0 0 6px' }}>{label}</SectionSubhead>
                    <FieldGrid>
                      <Field>
                        Дата заяви
                        <FieldInput type="date" value={draft.documents[key].statementDate} onChange={event => updateDocumentField(key, 'statementDate', event.target.value)} />
                      </Field>
                      <Field>
                        Нотаріус
                        <PickerFieldButton
                          type="button"
                          onClick={() => openPicker({
                            title: 'Оберіть нотаріуса', collection: 'notaries', valueId: draft.documents[key].notaryId, onApply: id => updateDocumentField(key, 'notaryId', id),
                          })}
                        >
                          <PickerFieldValue $empty={!draft.documents[key].notaryId}>
                            {(() => {
                              const notary = catalog.parties.notaries.find(item => String(item.id) === String(draft.documents[key].notaryId));
                              return notary ? notaryOptionLabel(notary) : '— не обрано —';
                            })()}
                          </PickerFieldValue>
                          <span>›</span>
                        </PickerFieldButton>
                      </Field>
                    </FieldGrid>
                  </DocRow>
                ))}
              </CollapsibleSection>

              <CollapsibleSection
                id="otherDocuments"
                title="Інші документи"
                meta="Додаток №1, генетична спорідненість, медичні послуги"
                completion={sectionCompletion('otherDocuments', draft)}
                open={Boolean(openSections.otherDocuments)}
                onToggle={() => toggleSection('otherDocuments')}
              >
                <DocRow>
                  <SectionSubhead style={{ margin: '0 0 6px' }}>Додаток №1 до договору</SectionSubhead>
                  <FieldGrid>
                    <Field>
                      Дата додатка
                      <FieldInput type="date" value={draft.documents.surrogacyAgreementAppendix1.date} onChange={event => updateDocumentField('surrogacyAgreementAppendix1', 'date', event.target.value)} />
                    </Field>
                  </FieldGrid>
                </DocRow>
                <DocRow>
                  <SectionSubhead style={{ margin: '0 0 6px' }}>Довідка про генетичну спорідненість</SectionSubhead>
                  <FieldGrid>
                    <Field>
                      Дата видачі
                      <FieldInput type="date" value={draft.documents.geneticAffinityCertificate.issueDate} onChange={event => updateDocumentField('geneticAffinityCertificate', 'issueDate', event.target.value)} />
                    </Field>
                    <Field>
                      Вихідний номер
                      <FieldInput type="text" value={draft.documents.geneticAffinityCertificate.outgoingNumber} onChange={event => updateDocumentField('geneticAffinityCertificate', 'outgoingNumber', event.target.value)} />
                    </Field>
                  </FieldGrid>
                </DocRow>
                <DocRow>
                  <SectionSubhead style={{ margin: '0 0 6px' }}>Договір про медичні послуги</SectionSubhead>
                  <FieldGrid>
                    <Field>
                      Дата договору
                      <FieldInput type="date" value={draft.documents.medicalServicesAgreement.date} onChange={event => updateDocumentField('medicalServicesAgreement', 'date', event.target.value)} />
                    </Field>
                  </FieldGrid>
                </DocRow>
              </CollapsibleSection>

              <CollapsibleSection
                id="racssClinicLetter"
                title="Лист клініки до РАЦС"
                meta="Формується автоматично"
                open={Boolean(openSections.racssClinicLetter)}
                onToggle={() => toggleSection('racssClinicLetter')}
              >
                <SectionMeta>
                  Цей лист не має власних реквізитів - він повністю формується з даних транспортування ембріонів і переносу (розділ «Програма ДРТ»).
                </SectionMeta>
              </CollapsibleSection>

              <RowLine style={{ marginTop: 10 }}>
                <DangerButton type="button" onClick={handleDeleteCase}><FaTrash /> Видалити справу</DangerButton>
              </RowLine>
            </div>
          ) : null}
        </>
      ) : null}

      {selectedCase ? (
        <StickyBar>
          <SaveState>
            <SaveStateLabel $dirty={dirty}>{dirty ? 'Є незбережені зміни' : 'Усі зміни збережено'}</SaveStateLabel>
            {!dirty && savedAtLabel ? <span>Останнє збереження о {savedAtLabel}</span> : null}
            {dirty ? <span>Натисніть «Зберегти все»</span> : null}
          </SaveState>
          <PrimaryButton type="button" onClick={handleSaveAll} disabled={saving || !dirty}>
            {saving ? 'Зберігаємо…' : 'Зберегти все'}
          </PrimaryButton>
        </StickyBar>
      ) : null}

      {picker ? (
        <PickerSheet
          title={picker.title}
          options={picker.options}
          multi={picker.multi}
          selectedIds={picker.selectedIds}
          onApply={picker.onApply}
          onCancel={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
};

export default CaseEditor;
