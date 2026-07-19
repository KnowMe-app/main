// Documents - admin page for generating legal/client statements (PDF + Word) from bilingual
// paragraph templates filled with a case's party data. Architecturally a sibling of the Invoice
// Builder: same React + Firebase approach, same ivory/beige + bronze design system, same
// page-scoped --km-* palette override. Data lives on the backend under documentsBuilder/*:
// parties + cases, paragraph templates, and a settings record (favourite formatting values +
// recently used cases). Clinic logo files live directly in Firebase Storage by clinic id.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { get, ref, set, update } from 'firebase/database';
import { FaBold, FaChevronDown, FaChevronUp, FaFilePdf, FaFileWord, FaHeart, FaItalic, FaPencilAlt, FaPlus, FaSyncAlt, FaTrash, FaUpload } from 'react-icons/fa';
import { saveAs } from 'file-saver';
import designTokens from '../data/designTokens.json';
import { auth, database, deleteStorageFile, getStorageFileDataUrl, listStorageFolderFileNames, uploadFileToStorageFolder } from './config';
import { isInvoiceBuilderUid } from 'utils/accessLevel';
import { reencodePdfImageDataUrl } from 'utils/pdfImageEncoding';
import PageNavMenu from './PageNavMenu';
import { useAutoResize } from '../hooks/useAutoResize';
import {
  DEFAULT_DOC_FORMATTING,
  DOCUMENTS_PARTIES_PATH,
  DOCUMENTS_SETTINGS_PATH,
  DOCUMENTS_TEMPLATES_PATH,
  DOCUMENT_LAYOUTS,
  PARTY_COLLECTIONS,
  applyLogoLayoutAssignment,
  applyPlainTextEdit,
  buildCaseLabel,
  buildDocumentsFileName,
  buildGeneratedDocument,
  clinicLogoDbPath,
  clinicLogoEntriesToBackend,
  clinicLogoStorageFilePath,
  clinicLogoStorageFolder,
  diffDocFormattingOverrides,
  emptyDocumentsCatalog,
  getClinicLogo,
  getLayoutLang,
  getParagraphType,
  getTemplateLogoType,
  isBilingualLayout,
  legacyClinicLogoStorageFilePath,
  legacyClinicLogoStorageFolder,
  mergeDocumentsCatalog,
  normalizeDocFormatting,
  normalizeDocumentsCatalog,
  normalizeDocumentsSettings,
  orderCasesByRecent,
  orderRecordsByRecentIds,
  parseDocumentsTechnicalInput,
  parseFormattedRuns,
  plainTextOf,
  pruneDocOverride,
  resolveCaseContext,
  resolveEffectiveDocFormatting,
  resolveMergedRecordsForPersistence,
  shiftDocOverrideParagraphIndices,
  toggleInlineFormat,
  upsertRecentCaseId,
  upsertRecentId,
  validateDocumentTemplate,
} from './documentsCatalogUtils';

// Same stale-chunk detection as the Invoice Builder: a failed dynamic chunk means the deployed
// build changed under this tab, and the fix is a refresh - not the raw webpack error.
const isStaleChunkError = error => /loading (?:css )?chunk|chunkloaderror/i.test(`${error?.name || ''} ${error?.message || ''}`);
const STALE_APP_MESSAGE = 'The app has been updated since this page was opened. Refresh the page and try again.';

const MAX_LOGO_FILE_BYTES = 1024 * 1024;

// The two layout tags a logo variant can be assigned to (one tap on the variant row). Which
// variant a document actually uses is decided by the template itself, not by the page's column
// mode: a {{logo}} paragraph uses the '1col' variant (compact, duplicated above each visible
// language column); a {{logo-long}} paragraph uses the '2col' variant (one shared full-width
// logo, never duplicated). A template with neither token renders no logo at all.
const LOGO_LAYOUT_OPTIONS = [
  { tag: '1col', label: '{{logo}}', title: 'Use this variant for the {{logo}} token - compact, duplicated above each language column' },
  { tag: '2col', label: '{{logo-long}}', title: 'Use this variant for the {{logo-long}} token - one shared full-width logo' },
];

// Mobile admins can't easily reach the browser devtools console, so every Storage failure below
// is folded into the on-screen message with the real Firebase/network error code - "see the
// browser console" alone leaves them stuck with no way to report what actually went wrong.
const describeStorageError = error =>
  `${error?.code || error?.name || 'error'}: ${error?.message || String(error)}`.trim();

// --- Layout shell (mirrors InvoiceBuilderPage's page-scoped palette) -------------------------

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

const StateCard = styled.div`
  background: var(--km-card);
  border: 1px solid var(--km-border);
  border-radius: 10px;
  padding: 18px;
  text-align: center;
  color: var(--km-muted);
`;

const RowLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

// Plain-text convention (spec §3): every input on this page reads as editable text - borderless
// and background-free until hovered or focused, like the app's other inline-editable fields.
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

const ToggleGroup = styled.div`
  display: inline-flex;
  border: 1px solid var(--km-border);
  border-radius: 6px;
  overflow: hidden;
`;

const ToggleOption = styled.button`
  border: none;
  background: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-text)')};
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;

  & + & {
    border-left: 1px solid var(--km-border);
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

const DocCheckbox = styled.input`
  width: 15px;
  height: 15px;
  accent-color: var(--km-accent);
  cursor: pointer;
  flex-shrink: 0;
`;

const DocTitleButton = styled.button`
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--km-text);
  text-align: left;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 0;
`;

const DocSubtitle = styled.div`
  color: var(--km-muted);
  font-size: 11px;
  font-weight: 400;
`;

// "Styled as plain editable text" (the app-wide rule the Invoice Builder's plainFieldStyle also
// follows): no border, no fill, no focus box - ever. The paragraph must read as document text
// that happens to be editable, never as a form field sitting in the document.
const InlineTextarea = styled.textarea`
  width: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--km-text);
  font-family: var(--km-font);
  font-size: 12.5px;
  line-height: 1.45;
  padding: 4px 6px;
  resize: none;
  min-height: 0;
  overflow: hidden;

  &:hover,
  &:focus {
    outline: none;
    background: transparent;
    box-shadow: none;
  }
`;

// In the two-column layout each UA paragraph is boxed together with its EN counterpart (spec §4)
// so the pairing stays visible; one-column layouts render a single unboxed cell.

// Auto-grow every editable document paragraph/title to the exact rendered text height so long
// bilingual paragraphs look like normal document text while staying directly editable.
const AutoInlineTextarea = React.forwardRef(({ value, ...rest }, forwardedRef) => {
  const localRef = useRef(null);
  const autoResize = useAutoResize(localRef, value);

  return (
    <InlineTextarea
      ref={node => {
        localRef.current = node;
        autoResize(node);
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      rows={1}
      value={value}
      {...rest}
    />
  );
});
AutoInlineTextarea.displayName = 'AutoInlineTextarea';

const ParagraphPair = styled.div`
  display: grid;
  grid-template-columns: ${({ $single }) => ($single ? '1fr' : '1fr 1fr')};
  gap: 6px;
  margin-top: 6px;
  ${({ $single, $plain }) => ($single || $plain ? '' : `
    border: 1px solid var(--km-border);
    border-radius: 8px;
    padding: 4px 6px;
    background: rgba(162, 121, 63, 0.04);
  `)}

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

// Structural paragraph controls (insert a custom paragraph here / remove this one) - kept slim and
// visually distinct from the text itself, and only shown in Template mode: a paragraph's position
// is a template-level concept, not a per-case data value.
const ParagraphControlsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 4px;
`;

// Encloses one paragraph's controls (Insert/Remove) together with its own text, in one visible
// border - so which paragraph a button acts on is never ambiguous, regardless of whether the
// two-column ParagraphPair below would otherwise draw its own (now suppressed via $plain) border.
const ParagraphEditorBlock = styled.div`
  border: 1px solid var(--km-border);
  border-radius: 8px;
  padding: 6px 8px 8px;
  margin-top: 10px;
  background: rgba(162, 121, 63, 0.025);
`;

// Wraps a Data-mode field together with its own formatted preview (below), so a two-column
// ParagraphPair keeps each language's preview directly under that language's own textarea rather
// than as one shared block under both.
const ParagraphFieldColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

// A plain <textarea> can never render partial bold/italic - Data mode edits the de-markup'd plain
// text (spec §2), so pressing Bold/Italic on a selection changed the stored data with no visible
// feedback at all in that box. This read-only preview (shown only once a paragraph actually has
// formatting applied) renders the real bold/italic so the admin can confirm the toggle worked
// without generating a PDF first.
const FormattedPreviewLabel = styled.div`
  margin-top: 3px;
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--km-muted);
`;

const FormattedPreviewText = styled.div`
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--km-text);
  padding: 2px 6px 4px;
  white-space: pre-wrap;
`;

const hasInlineFormatting = text => parseFormattedRuns(text).some(run => run.bold || run.italic);

const FormattedRunsPreview = ({ text }) => (
  <>
    {parseFormattedRuns(text).map((run, index) => {
      let node = run.text;
      if (run.italic) node = <em>{node}</em>;
      if (run.bold) node = <strong>{node}</strong>;
      // eslint-disable-next-line react/no-array-index-key
      return <React.Fragment key={index}>{node}</React.Fragment>;
    })}
  </>
);

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

const CheckLine = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
`;

const LogoPreview = styled.img`
  max-width: 220px;
  max-height: 64px;
  object-fit: contain;
  border: 1px solid var(--km-border);
  border-radius: 6px;
  padding: 4px 8px;
  background: #fff;
`;

// An unassigned variant is kept in the list but visually muted - it is not used on documents.
const LogoVariant = styled.div`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  opacity: ${({ $muted }) => ($muted ? 0.5 : 1)};
`;

// Live logo preview above the document list: swaps with the column-mode toggle, confirming which
// variant is assigned where before anything is generated.
const DocLogoPreviewRow = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 10px;
`;

const LogoVariantCaption = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--km-muted);
  font-size: 10px;
  font-weight: 700;
`;

const TechnicalTextarea = styled.textarea`
  width: 100%;
  min-height: 110px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--km-text);
  font-family: monospace;
  font-size: 11.5px;
  padding: 8px;
  margin-top: 8px;
  resize: vertical;

  &:hover {
    border-color: var(--km-border);
  }

  &:focus {
    outline: none;
    border-color: var(--km-accent);
    background: var(--km-card);
  }
`;

// --- Page -------------------------------------------------------------------------------------

const DocumentsPage = ({ isAdmin }) => {
  const isDocumentsAdmin = Boolean(isAdmin) || isInvoiceBuilderUid(auth.currentUser?.uid) || (typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('admin') === '1');

  const [catalog, setCatalog] = useState(() => emptyDocumentsCatalog());
  const [settings, setSettings] = useState(() => normalizeDocumentsSettings(null));
  const [formatting, setFormatting] = useState(DEFAULT_DOC_FORMATTING);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState({});
  const [layout, setLayout] = useState('two-column');
  const [expandedDocId, setExpandedDocId] = useState('');
  // Pencil toggle (spec §2): 'data' shows the resolved values and edits them as per-case
  // overrides, 'template' shows the raw {{placeholder}} tokens and edits the shared template.
  const [editMode, setEditMode] = useState('data');
  const [dirtyDocIds, setDirtyDocIds] = useState({});
  const [dirtyOverrideDocIds, setDirtyOverrideDocIds] = useState({});
  const [technicalInput, setTechnicalInput] = useState('');
  const [isApplyingTechnical, setIsApplyingTechnical] = useState(false);
  const [formattingOpen, setFormattingOpen] = useState(false);
  // Per-document format overrides (spec §5): '' targets the shared default/favourite formatting
  // (the existing behavior); a document id targets that document's own working draft, which is
  // the reference formatting merged with whatever override it already has.
  const [formatDocId, setFormatDocId] = useState('');
  const [docFormatDraft, setDocFormatDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  // Every uploaded logo variant of the selected clinic: { fileName, dataUrl, width, height,
  // layout } where layout is the '2col' / '1col' assignment ('' while unassigned).
  const [clinicLogos, setClinicLogos] = useState([]);
  const [clinicLogoLoading, setClinicLogoLoading] = useState(false);
  const [clinicLogoError, setClinicLogoError] = useState('');
  const [clinicLogoRefreshKey, setClinicLogoRefreshKey] = useState(0);
  const logoInputRef = useRef(null);
  // Mirror of `settings` that persistSettings can read synchronously: two quick successive
  // saves (e.g. logo upload + favourite formatting) must each build on the other's result, and
  // React state updates are not guaranteed to have flushed between them.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  // Layout assignments ({ file, layout } entries per clinic) live in the catalog; the Storage
  // listing effect reads them through this ref so a local assignment change never re-lists the
  // whole Storage folder.
  const clinicLogoAssignmentsRef = useRef(catalog.clinicLogos);
  useEffect(() => {
    clinicLogoAssignmentsRef.current = catalog.clinicLogos || {};
  }, [catalog.clinicLogos]);

  const loadDocumentsData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [partiesSnapshot, templatesSnapshot, settingsSnapshot] = await Promise.all([
        get(ref(database, DOCUMENTS_PARTIES_PATH)),
        get(ref(database, DOCUMENTS_TEMPLATES_PATH)),
        get(ref(database, DOCUMENTS_SETTINGS_PATH)),
      ]);
      const nextCatalog = normalizeDocumentsCatalog(
        partiesSnapshot.exists() ? partiesSnapshot.val() : null,
        templatesSnapshot.exists() ? templatesSnapshot.val() : null,
      );
      const nextSettings = normalizeDocumentsSettings(settingsSnapshot.exists() ? settingsSnapshot.val() : null);
      setCatalog(nextCatalog);
      setSettings(nextSettings);
      // The favourite formatting values from the backend become the working values on load.
      setFormatting(nextSettings.formatting);
      const orderedCases = orderCasesByRecent(nextCatalog.parties.cases, nextSettings.recentCaseIds);
      setSelectedCaseId(previous => (previous && orderedCases.some(item => String(item.id) === previous)
        ? previous
        : String(orderedCases[0]?.id || '')));
    } catch (loadError) {
      console.error('Unable to load documents data', loadError);
      setError('Documents data is not available right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocumentsData();
  }, [loadDocumentsData]);

  // Warm the lazy PDF/DOCX chunks while this build is still deployed (see isStaleChunkError).
  useEffect(() => {
    import('@react-pdf/renderer').catch(() => {});
    import('./DocumentsPdfDocument').catch(() => {});
    import('docx').catch(() => {});
  }, []);

  const persistSettings = useCallback(async partial => {
    const nextSettings = { ...settingsRef.current, ...partial };
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    try {
      await set(ref(database, DOCUMENTS_SETTINGS_PATH), nextSettings);
      return true;
    } catch (saveError) {
      console.error('Unable to save documents settings', saveError);
      toast.error('Could not save settings to the backend.');
      return false;
    }
  }, []);

  // --- Technical input -----------------------------------------------------------------------

  // `overrideText` lets the file-upload handler (below) hand over freshly-read file content
  // directly, instead of first writing it to `technicalInput` state and waiting for a re-render -
  // state updates aren't guaranteed to have flushed before the next line runs.
  const handleApplyTechnical = async overrideText => {
    const sourceText = typeof overrideText === 'string' ? overrideText : technicalInput;
    let incoming;
    try {
      incoming = parseDocumentsTechnicalInput(sourceText);
    } catch (parseError) {
      toast.error(parseError.message);
      return;
    }
    setIsApplyingTechnical(true);
    try {
      const { catalog: merged, summary } = mergeDocumentsCatalog(catalog, incoming);
      // Additive persistence: only the touched records are written (multi-location update),
      // so concurrent edits to other records on the backend are never clobbered.
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
      // A full backend export also carries each clinic's {{logo}}/{{logo-long}} layout
      // assignments (parties.cases.clinics) - written per clinic id so an uploaded export
      // restores them instead of leaving every logo variant unassigned.
      const clinicIdsWithLogos = Object.keys(incoming.clinicLogos || {});
      await Promise.all(clinicIdsWithLogos.map(clinicId => set(
        ref(database, clinicLogoDbPath(clinicId)),
        merged.clinicLogos[clinicId],
      )));
      setCatalog(merged);
      if (!selectedCaseId && merged.parties.cases.length) setSelectedCaseId(String(merged.parties.cases[0].id));
      setTechnicalInput('');
      const logoNote = clinicIdsWithLogos.length ? `, ${clinicIdsWithLogos.length} clinic logo assignment(s)` : '';
      toast.success(`Merged: ${summary.added} added, ${summary.updated} updated${logoNote}.`);
    } catch (applyError) {
      console.error('Unable to merge documents data', applyError);
      toast.error('Could not save the parsed data to the backend.');
    } finally {
      setIsApplyingTechnical(false);
    }
  };

  // File upload (spec: not just paste) - reads the selected .json export and runs it straight
  // through the same parse+merge path as the textarea, so an admin can pick the exported file
  // instead of having to open it and copy its contents in by hand.
  const technicalFileInputRef = useRef(null);

  const handleTechnicalFileChange = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setTechnicalInput(text);
      handleApplyTechnical(text);
    };
    reader.onerror = () => toast.error('Could not read the selected file.');
    reader.readAsText(file);
  };

  // --- Inline template editing ----------------------------------------------------------------

  const updateTemplate = (docId, updater) => {
    setCatalog(previous => ({
      ...previous,
      documents: previous.documents.map(template => (String(template.id) === String(docId) ? updater(template) : template)),
    }));
    setDirtyDocIds(previous => ({ ...previous, [docId]: true }));
  };

  const handleParagraphChange = (docId, index, langKey, value) => {
    updateTemplate(docId, template => ({
      ...template,
      paragraphs: (template.paragraphs || []).map((paragraph, paragraphIndex) => (
        paragraphIndex === index ? { ...paragraph, [langKey]: value } : paragraph
      )),
    }));
  };

  // The letterhead logo always renders before the title (spec: "лого відображай перед title") and
  // is edited as plain text (spec: "додай його як посилання {{logo}} ... щоб я зміг вручну його
  // правити") - a free-text field the admin types {{logo}} / {{logo-long}} into directly, or
  // clears to remove the logo, rather than picking from a constrained list. Current templates
  // carry it as a dedicated `logo` field; older ones still have it embedded as the first
  // paragraph. Editing keeps whichever shape the template is already using instead of introducing
  // a second, conflicting source of truth.
  const handleLogoFieldChange = (docId, value) => {
    const token = value || '';
    updateTemplate(docId, template => {
      const hasDedicatedLogoField = Boolean(String(template.logo || '').trim());
      const legacyParagraphIsLogo = !hasDedicatedLogoField
        && getParagraphType((template.paragraphs || [])[0]) !== 'text';
      if (legacyParagraphIsLogo) {
        return {
          ...template,
          paragraphs: (template.paragraphs || []).map((paragraph, index) => (
            index === 0 ? { ...paragraph, uk: token, en: token } : paragraph
          )),
        };
      }
      return { ...template, logo: token };
    });
  };

  const handleTitleChange = (docId, langKey, value) => {
    updateTemplate(docId, template => ({
      ...template,
      title: { ...(template.title || {}), [langKey]: value },
    }));
  };

  // beforeTitle (spec §14): free-standing text rendered between the logo and the title - a
  // template opts in by carrying the array at all (usually pasted in via the technical JSON), so
  // editing here only touches existing blocks rather than letting the admin create the array from
  // scratch.
  const handleBeforeTitleChange = (docId, index, langKey, value) => {
    updateTemplate(docId, template => ({
      ...template,
      beforeTitle: (template.beforeTitle || []).map((block, blockIndex) => (
        blockIndex === index ? { ...block, [langKey]: value } : block
      )),
    }));
  };

  const handleBeforeTitleAlignChange = (docId, index, value) => {
    updateTemplate(docId, template => ({
      ...template,
      beforeTitle: (template.beforeTitle || []).map((block, blockIndex) => (
        blockIndex === index ? { ...block, align: value } : block
      )),
    }));
  };

  const handleBeforeTitleBoldChange = (docId, index, checked) => {
    updateTemplate(docId, template => ({
      ...template,
      beforeTitle: (template.beforeTitle || []).map((block, blockIndex) => (
        blockIndex === index ? { ...block, bold: checked } : block
      )),
    }));
  };

  // Inserting or removing a paragraph is a structural edit, not a text edit - persisted
  // immediately (not deferred to blur, unlike the plain text fields above) and, since a
  // paragraph's position is how per-case data-mode overrides key into it, reindexes every
  // affected case's overrides in the same operation so an insert/remove at any position never
  // silently misapplies an existing override to the wrong paragraph.
  const applyParagraphStructureChange = async (docId, buildParagraphs, atIndex, delta) => {
    const template = catalog.documents.find(item => String(item.id) === String(docId));
    if (!template) return;
    const nextTemplate = { ...template, paragraphs: buildParagraphs(template.paragraphs || []) };
    const shiftedByCaseId = catalog.parties.cases
      .filter(caseRecord => caseRecord.documents?.overrides?.[docId])
      .map(caseRecord => [caseRecord.id, shiftDocOverrideParagraphIndices(caseRecord.documents.overrides[docId], atIndex, delta)]);
    try {
      await set(ref(database, `${DOCUMENTS_TEMPLATES_PATH}/${docId}`), nextTemplate);
      const partiesPatch = {};
      shiftedByCaseId.forEach(([caseId, override]) => {
        partiesPatch[`cases/${caseId}/documents/overrides/${docId}`] = override;
      });
      if (Object.keys(partiesPatch).length) await update(ref(database, DOCUMENTS_PARTIES_PATH), partiesPatch);
      setCatalog(previous => ({
        ...previous,
        documents: previous.documents.map(item => (String(item.id) === String(docId) ? nextTemplate : item)),
        parties: {
          ...previous.parties,
          cases: previous.parties.cases.map(caseRecord => {
            const shifted = shiftedByCaseId.find(([caseId]) => caseId === caseRecord.id);
            if (!shifted) return caseRecord;
            return {
              ...caseRecord,
              documents: { ...(caseRecord.documents || {}), overrides: { ...(caseRecord.documents?.overrides || {}), [docId]: shifted[1] } },
            };
          }),
        },
      }));
    } catch (structureError) {
      console.error('Unable to update the document paragraph structure', structureError);
      toast.error('Could not save the paragraph change.');
    }
  };

  // `atIndex` may equal paragraphs.length to append a new custom paragraph after the last one.
  const handleInsertParagraph = (docId, atIndex) => applyParagraphStructureChange(
    docId,
    paragraphs => [...paragraphs.slice(0, atIndex), { uk: '', en: '' }, ...paragraphs.slice(atIndex)],
    atIndex,
    1,
  );

  const handleRemoveParagraph = (docId, atIndex) => {
    if (typeof window !== 'undefined' && !window.confirm('Remove this paragraph?')) return;
    applyParagraphStructureChange(
      docId,
      paragraphs => paragraphs.filter((_, index) => index !== atIndex),
      atIndex,
      -1,
    );
  };

  const persistTemplate = async docId => {
    if (!dirtyDocIds[docId]) return;
    const template = catalog.documents.find(item => String(item.id) === String(docId));
    if (!template) return;
    try {
      await set(ref(database, `${DOCUMENTS_TEMPLATES_PATH}/${docId}`), template);
      setDirtyDocIds(previous => {
        const next = { ...previous };
        delete next[docId];
        return next;
      });
    } catch (saveError) {
      console.error('Unable to save document template', saveError);
      toast.error('Could not save the paragraph edits.');
    }
  };

  // --- Data-mode editing (pencil "Data" mode, spec §2) ------------------------------------------
  // Edits to the resolved text are kept per case as sparse overrides (case.documents.overrides[docId])
  // so the shared template with its {{tokens}} stays untouched.

  const updateCaseDocOverride = (docId, updater) => {
    if (!selectedCaseId) return;
    setCatalog(previous => ({
      ...previous,
      parties: {
        ...previous.parties,
        cases: previous.parties.cases.map(caseRecord => (String(caseRecord.id) === selectedCaseId
          ? {
            ...caseRecord,
            documents: {
              ...(caseRecord.documents || {}),
              overrides: {
                ...(caseRecord.documents?.overrides || {}),
                [docId]: updater(caseRecord.documents?.overrides?.[docId] || {}),
              },
            },
          }
          : caseRecord)),
      },
    }));
    setDirtyOverrideDocIds(previous => ({ ...previous, [docId]: true }));
  };

  const handleDataTitleChange = (docId, langKey, value) => {
    updateCaseDocOverride(docId, override => ({
      ...override,
      title: { ...(override.title || {}), [langKey]: value },
    }));
  };

  const handleDataParagraphChange = (docId, index, langKey, value) => {
    updateCaseDocOverride(docId, override => ({
      ...override,
      paragraphs: {
        ...(override.paragraphs || {}),
        [index]: { ...(override.paragraphs?.[index] || {}), [langKey]: value },
      },
    }));
  };

  const persistDocOverride = async docId => {
    if (!dirtyOverrideDocIds[docId] || !selectedCaseId) return;
    const caseRecord = catalog.parties.cases.find(item => String(item.id) === selectedCaseId);
    const template = catalog.documents.find(item => String(item.id) === String(docId));
    if (!caseRecord || !template) return;
    // Only real deviations from the resolved template survive on the backend.
    const baseline = buildGeneratedDocument(template, resolveCaseContext(catalog, selectedCaseId));
    const pruned = pruneDocOverride(caseRecord.documents?.overrides?.[docId], baseline);
    try {
      await set(ref(database, `${DOCUMENTS_PARTIES_PATH}/cases/${caseRecord.id}/documents/overrides/${docId}`), pruned);
      setCatalog(previous => ({
        ...previous,
        parties: {
          ...previous.parties,
          cases: previous.parties.cases.map(item => {
            if (String(item.id) !== String(caseRecord.id)) return item;
            const overrides = { ...(item.documents?.overrides || {}) };
            if (pruned) overrides[docId] = pruned;
            else delete overrides[docId];
            return {
              ...item,
              documents: { ...(item.documents || {}), overrides },
            };
          }),
        },
      }));
      setDirtyOverrideDocIds(previous => {
        const next = { ...previous };
        delete next[docId];
        return next;
      });
    } catch (saveError) {
      console.error('Unable to save document data edits', saveError);
      toast.error('Could not save the data edits.');
    }
  };

  // --- Selection-based bold/italic (spec §1) -----------------------------------------------------
  // The Bold/Italic toolbar buttons act on whichever paragraph field currently holds the browser
  // text selection - tracked here rather than passed as props, since a toolbar click always blurs
  // the field first (selectionStart/End survive that, but focus itself moves to the button).

  const fieldNodesRef = useRef({});
  const activeFieldRef = useRef(null);
  const fieldKey = (docId, index, langKey) => `${docId}#${index}#${langKey}`;
  const registerFieldNode = (docId, index, langKey) => node => {
    fieldNodesRef.current[fieldKey(docId, index, langKey)] = node;
  };
  const handleRichFieldFocus = (docId, index, langKey) => () => {
    activeFieldRef.current = { docId, index, langKey };
  };

  const preventSelectionLoss = event => event.preventDefault();

  // Mobile browsers collapse the field's text selection the moment a tap lands anywhere outside
  // it (including on this very toolbar button) unless the touch's own default is prevented -
  // preventDefault on mousedown alone (enough on desktop) doesn't stop that. But preventing
  // touchstart's default also suppresses the synthetic click mobile browsers would otherwise fire
  // afterward, so the action has to run from touchend directly instead of waiting for onClick.
  const formatButtonProps = attr => ({
    onMouseDown: preventSelectionLoss,
    onTouchStart: preventSelectionLoss,
    onTouchEnd: event => {
      event.preventDefault();
      handleApplyInlineFormat(attr);
    },
    onClick: () => handleApplyInlineFormat(attr),
  });

  // Persisted immediately (direct write), the same pattern applyParagraphStructureChange uses for
  // a discrete click - waiting for the field's own onBlur would miss this, since the toolbar
  // button click already blurred the field before this handler runs.
  const handleApplyInlineFormat = async attr => {
    const active = activeFieldRef.current;
    if (!active || !selectedCaseId) return;
    const node = fieldNodesRef.current[fieldKey(active.docId, active.index, active.langKey)];
    if (!node) return;
    const start = node.selectionStart;
    const end = node.selectionEnd;
    if (start === end) {
      toast.error('Select some text first.');
      return;
    }
    const { docId, index, langKey } = active;
    const caseRecord = catalog.parties.cases.find(item => String(item.id) === selectedCaseId);
    const template = catalog.documents.find(item => String(item.id) === String(docId));
    if (!caseRecord || !template) return;
    const baseline = buildGeneratedDocument(template, resolveCaseContext(catalog, selectedCaseId));
    const currentOverride = caseRecord.documents?.overrides?.[docId] || {};
    const currentRaw = currentOverride.paragraphs?.[index]?.[langKey] ?? baseline.paragraphs[index]?.[langKey] ?? '';
    const nextRaw = toggleInlineFormat(currentRaw, start, end, attr);
    const nextOverride = {
      ...currentOverride,
      paragraphs: {
        ...(currentOverride.paragraphs || {}),
        [index]: { ...(currentOverride.paragraphs?.[index] || {}), [langKey]: nextRaw },
      },
    };
    const pruned = pruneDocOverride(nextOverride, baseline);
    try {
      await set(ref(database, `${DOCUMENTS_PARTIES_PATH}/cases/${caseRecord.id}/documents/overrides/${docId}`), pruned);
      setCatalog(previous => ({
        ...previous,
        parties: {
          ...previous.parties,
          cases: previous.parties.cases.map(item => {
            if (String(item.id) !== String(caseRecord.id)) return item;
            const overrides = { ...(item.documents?.overrides || {}) };
            if (pruned) overrides[docId] = pruned;
            else delete overrides[docId];
            return { ...item, documents: { ...(item.documents || {}), overrides } };
          }),
        },
      }));
    } catch (formatError) {
      console.error('Unable to save the inline formatting change', formatError);
      toast.error('Could not save the formatting change.');
    }
  };

  // --- Deletes (always behind an explicit confirmation) ----------------------------------------

  const handleDeleteTemplate = async template => {
    const name = template.title?.uk || template.title?.en || template.id;
    if (typeof window !== 'undefined' && !window.confirm(`Delete document "${name}" from the catalog?`)) return;
    try {
      await set(ref(database, `${DOCUMENTS_TEMPLATES_PATH}/${template.id}`), null);
      setCatalog(previous => ({
        ...previous,
        documents: previous.documents.filter(item => String(item.id) !== String(template.id)),
      }));
      setSelectedDocIds(previous => {
        const next = { ...previous };
        delete next[template.id];
        return next;
      });
      toast.success('Document deleted.');
    } catch (deleteError) {
      console.error('Unable to delete document template', deleteError);
      toast.error('Could not delete the document.');
    }
  };

  const handleDeleteCase = async () => {
    const caseRecord = catalog.parties.cases.find(item => String(item.id) === selectedCaseId);
    if (!caseRecord) return;
    const label = buildCaseLabel(catalog, caseRecord);
    if (typeof window !== 'undefined' && !window.confirm(`Delete case "${label}"? Party records stay in the catalog.`)) return;
    try {
      await set(ref(database, `${DOCUMENTS_PARTIES_PATH}/cases/${caseRecord.id}`), null);
      const remaining = catalog.parties.cases.filter(item => String(item.id) !== selectedCaseId);
      setCatalog(previous => ({
        ...previous,
        parties: { ...previous.parties, cases: remaining },
      }));
      const nextRecent = settings.recentCaseIds.filter(id => id !== selectedCaseId);
      persistSettings({ recentCaseIds: nextRecent });
      const ordered = orderCasesByRecent(remaining, nextRecent);
      setSelectedCaseId(String(ordered[0]?.id || ''));
      toast.success('Case deleted.');
    } catch (deleteError) {
      console.error('Unable to delete case', deleteError);
      toast.error('Could not delete the case.');
    }
  };

  // --- Clinic logo ------------------------------------------------------------------------------

  const handleLogoFileChange = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast.error('The logo must be an image file.');
      return;
    }
    if (file.size > MAX_LOGO_FILE_BYTES) {
      toast.error('The logo file is too large (max 1 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const image = new window.Image();
      image.onload = async () => {
        const userId = auth.currentUser?.uid;
        if (!userId) {
          toast.error('Sign in before uploading the clinic logo.');
          return;
        }

        const clinicId = selectedCase?.relations?.clinicId ? String(selectedCase.relations.clinicId) : '';
        if (!clinicId) {
          toast.error('Select a case with a clinic before uploading the logo.');
          return;
        }

        try {
          // Storage is the source of truth for clinic logos: PDF/DOCX generation lists this
          // folder directly, so uploads no longer need a matching Realtime Database filename
          // write that can fail independently and leave the visible logo state stale.
          const { fileName } = await uploadFileToStorageFolder(file, clinicLogoStorageFolder(clinicId), {
            disableCompression: true,
          });
          // New variants start unassigned - the admin taps "2 col" / "1 col" on the row to say
          // which column layout the file is for.
          setClinicLogos(previous => [...previous.filter(variant => variant.fileName !== fileName), {
            fileName,
            dataUrl,
            layout: '',
            width: image.naturalWidth || 0,
            height: image.naturalHeight || 0,
          }]);
          setClinicLogoError('');
          setClinicLogoRefreshKey(previous => previous + 1);
          toast.success('Clinic logo uploaded to the backend.');
        } catch (uploadError) {
          console.error('Unable to upload clinic logo', uploadError);
          toast.error(String(uploadError?.code || '').includes('unauthorized')
            ? 'The Storage security rules rejected the upload — the documentsBuilder path must allow this account to write.'
            : 'Could not upload the logo to the backend.');
        }
      };
      image.onerror = () => toast.error('Could not read the image file.');
      image.src = dataUrl;
    };
    reader.onerror = () => toast.error('Could not read the image file.');
    reader.readAsDataURL(file);
  };

  const readImageDimensions = useCallback(dataUrl => new Promise(resolve => {
    if (typeof window === 'undefined' || !dataUrl) {
      resolve({ width: 0, height: 0 });
      return;
    }
    const image = new window.Image();
    image.onload = () => resolve({
      width: image.naturalWidth || 0,
      height: image.naturalHeight || 0,
    });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  }), []);

  // Writes the clinic's DB logo node ({ file, layout } per variant) and, once the write landed,
  // syncs the in-memory catalog mirror so a later Storage re-list re-applies the assignments.
  const persistLogoAssignments = async (clinicId, variants) => {
    const entries = clinicLogoEntriesToBackend(variants);
    await set(ref(database, clinicLogoDbPath(clinicId)), entries);
    setCatalog(previous => ({
      ...previous,
      clinicLogos: {
        ...previous.clinicLogos,
        [clinicId]: entries.map(entry => ({ file: entry.file, layout: entry.layout || '' })),
      },
    }));
  };

  const handleAssignLogoLayout = async (fileName, layoutTag) => {
    const clinicId = selectedCase?.relations?.clinicId ? String(selectedCase.relations.clinicId) : '';
    if (!clinicId) return;
    const previousVariants = clinicLogos;
    const nextVariants = applyLogoLayoutAssignment(previousVariants, fileName, layoutTag);
    setClinicLogos(nextVariants);
    try {
      await persistLogoAssignments(clinicId, nextVariants);
    } catch (assignError) {
      console.error('Unable to save clinic logo layout assignment', assignError);
      setClinicLogos(previousVariants);
      toast.error('Could not save the logo layout assignment.');
    }
  };

  const handleRemoveLogoVariant = async fileName => {
    if (typeof window !== 'undefined' && !window.confirm('Remove this clinic logo variant from the backend?')) return;
    const clinicId = selectedCase?.relations?.clinicId ? String(selectedCase.relations.clinicId) : '';
    if (!clinicId) return;
    // A variant loaded via the legacy Storage-folder fallback still physically lives there.
    const isLegacyVariant = Boolean(clinicLogos.find(variant => variant.fileName === fileName)?.legacyFolder);
    try {
      await deleteStorageFile(isLegacyVariant
        ? legacyClinicLogoStorageFilePath(clinicId, fileName)
        : clinicLogoStorageFilePath(clinicId, fileName));
      const remaining = clinicLogos.filter(variant => variant.fileName !== fileName);
      setClinicLogos(remaining);
      setClinicLogoRefreshKey(previous => previous + 1);
      // Best effort: drop the deleted file's DB entry too. A stale entry is harmless - the
      // assignments only apply to files Storage still lists.
      persistLogoAssignments(clinicId, remaining).catch(() => {});
      toast.success('Clinic logo variant removed.');
    } catch (removeError) {
      console.error('Unable to remove clinic logo', removeError);
      toast.error('Could not remove the clinic logo.');
    }
  };

  // --- Formatting favourites + per-document overrides (spec §5) ---------------------------------

  // The formatting values currently shown/edited in the panel: the shared defaults, or (when a
  // specific document is targeted) that document's own working draft.
  const activeFormatting = formatDocId ? (docFormatDraft || formatting) : formatting;

  const handleFormatDocChange = nextDocId => {
    setFormatDocId(nextDocId);
    if (!nextDocId) {
      setDocFormatDraft(null);
      return;
    }
    const template = catalog.documents.find(item => String(item.id) === nextDocId);
    setDocFormatDraft(resolveEffectiveDocFormatting(formatting, template?.format));
  };

  const handleSaveFavouriteFormatting = async () => {
    const normalized = normalizeDocFormatting(formatting);
    setFormatting(normalized);
    const saved = await persistSettings({ formatting: normalized });
    if (saved) toast.success('Favourite formatting saved to the backend.');
  };

  // Writes only the values that differ from the shared defaults into that document's `format`
  // field - a value dialed back to match the default drops out of the overrides instead of
  // persisting a redundant copy (spec §5).
  const handleSaveDocFormatOverride = async () => {
    const template = catalog.documents.find(item => String(item.id) === formatDocId);
    if (!template) return;
    const normalizedDraft = normalizeDocFormatting(docFormatDraft || formatting);
    const overrides = diffDocFormattingOverrides(formatting, normalizedDraft);
    const nextTemplate = { ...template };
    if (Object.keys(overrides).length) nextTemplate.format = overrides;
    else delete nextTemplate.format;
    try {
      await set(ref(database, `${DOCUMENTS_TEMPLATES_PATH}/${formatDocId}`), nextTemplate);
      setCatalog(previous => ({
        ...previous,
        documents: previous.documents.map(item => (String(item.id) === formatDocId ? nextTemplate : item)),
      }));
      setDocFormatDraft(normalizedDraft);
      toast.success('Format saved for this document.');
    } catch (saveError) {
      console.error('Unable to save the per-document format override', saveError);
      toast.error('Could not save the format for this document.');
    }
  };

  const handleSaveFormatting = () => (formatDocId ? handleSaveDocFormatOverride() : handleSaveFavouriteFormatting());

  const setFormattingField = (field, value) => {
    if (formatDocId) {
      setDocFormatDraft(previous => ({ ...(previous || activeFormatting), [field]: value }));
    } else {
      setFormatting(previous => ({ ...previous, [field]: value }));
    }
  };

  const resetActiveFormattingTo = source => {
    if (formatDocId) setDocFormatDraft(source);
    else setFormatting(source);
  };

  const numberField = (field, label, step = 1) => (
    <Field key={field}>
      {label}
      <FieldInput
        type="number"
        step={step}
        value={activeFormatting[field]}
        onChange={event => setFormattingField(field, event.target.value === '' ? '' : Number(event.target.value))}
        onBlur={() => resetActiveFormattingTo(normalizeDocFormatting(activeFormatting))}
      />
    </Field>
  );

  // --- Generation --------------------------------------------------------------------------------

  const orderedCases = orderCasesByRecent(catalog.parties.cases, settings.recentCaseIds);
  // Most recently downloaded documents first (spec: "самі популярні документи мають бути вгорі") -
  // whatever hasn't been downloaded yet keeps the catalog's own order, after every recent one.
  const orderedDocuments = orderRecordsByRecentIds(catalog.documents, settings.recentDocIds);
  const selectedTemplates = orderedDocuments.filter(template => selectedDocIds[template.id]);
  const selectedCase = catalog.parties.cases.find(item => String(item.id) === selectedCaseId) || null;
  const caseContext = resolveCaseContext(catalog, selectedCaseId);
  // A logo only ever appears where a template declares one - via the dedicated `logo` field, or
  // a legacy leading paragraph (spec §5) - never automatically. `showLogo` is just the global
  // permission gate.
  const canRenderLogo = formatting.showLogo !== false;
  const selectedHasLogoToken = canRenderLogo && selectedTemplates.some(
    template => getTemplateLogoType(template) === 'logo',
  );
  const selectedHasLogoLongToken = canRenderLogo && !selectedHasLogoToken && selectedTemplates.some(
    template => getTemplateLogoType(template) === 'logo-long',
  );
  // Live preview above the document list of whichever variant the selected documents will
  // actually draw - or nothing, when none of them reference a logo token.
  const activeLogoVariant = selectedHasLogoToken
    ? getClinicLogo(clinicLogos, 'logo')
    : (selectedHasLogoLongToken ? getClinicLogo(clinicLogos, 'logo-long') : null);
  // Every unresolved {{path}} across the selected documents for the current case - shown as a
  // non-blocking warning and confirmed again right before a final export (spec §15).
  const unresolvedVariables = caseContext
    ? [...new Set(selectedTemplates.flatMap(template => validateDocumentTemplate(template, caseContext)))].sort()
    : [];
  const isGenerateDisabled = loading || Boolean(error) || isGenerating || clinicLogoLoading || !selectedTemplates.length || !selectedCase;

  // The selected case's clinicId maps directly to the Storage logo folder. Storage is the
  // source of truth here, so logos uploaded through the app or Firebase Console are discovered
  // without relying on a Realtime Database filename mirror.
  const logoClinicId = selectedCase?.relations?.clinicId ? String(selectedCase.relations.clinicId) : '';
  const clinicLogoStorageKey = `${logoClinicId}:${clinicLogoRefreshKey}`;

  // Fetch every stored logo variant of the selected clinic from Storage; the dimensions are what
  // the PDF/DOCX renderers use to scale each {{logo}}/{{logo-long}} image proportionally.
  useEffect(() => {
    let cancelled = false;
    const [clinicId] = clinicLogoStorageKey.split(':');
    setClinicLogos([]);
    setClinicLogoError('');
    if (!clinicId) {
      setClinicLogoLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setClinicLogoLoading(true);
    const loadVariants = async () => {
      let fileNames = [];
      let activeFolder = clinicLogoStorageFolder(clinicId);
      let usingLegacyFolder = false;
      try {
        fileNames = await listStorageFolderFileNames(activeFolder);
      } catch (listError) {
        console.error('[ClinicLogo] Unable to list', activeFolder, listError);
        if (!cancelled) {
          setClinicLogoError(`Could not list the clinic logo Storage folder - ${describeStorageError(listError)}`);
          setClinicLogoLoading(false);
        }
        return;
      }
      // Batch 17 §1/§2/§8: the canonical Storage folder moved from parties/cases/clinics/{id}/logo
      // to parties/clinics/{id}/logo - a clinic that hasn't been re-uploaded under the new path yet
      // still has its files at the old one, so fall back to reading (never writing) there.
      if (!fileNames.length) {
        const legacyFolder = legacyClinicLogoStorageFolder(clinicId);
        try {
          const legacyFileNames = await listStorageFolderFileNames(legacyFolder);
          if (legacyFileNames.length) {
            fileNames = legacyFileNames;
            activeFolder = legacyFolder;
            usingLegacyFolder = true;
          }
        } catch (legacyListError) {
          console.error('[ClinicLogo] Unable to list legacy folder', legacyFolder, legacyListError);
        }
      }
      if (cancelled) return;
      if (!fileNames.length) {
        setClinicLogoLoading(false);
        return;
      }

      // Storage lists the files; the DB logo node (catalog.clinicLogos) says which of them is
      // assigned to which column layout.
      const assignments = clinicLogoAssignmentsRef.current?.[clinicId] || [];
      const layoutFor = fileName => assignments.find(entry => entry.file === fileName)?.layout || '';
      const results = await Promise.all(fileNames.map(async fileName => {
        try {
          const filePath = usingLegacyFolder
            ? legacyClinicLogoStorageFilePath(clinicId, fileName)
            : clinicLogoStorageFilePath(clinicId, fileName);
          const rawDataUrl = await getStorageFileDataUrl(filePath);
          if (!rawDataUrl) return { fileName, error: 'empty response from Storage' };
          // Same re-encode the surrogate mother profile PDF export applies to uploaded photos:
          // @react-pdf/renderer only reliably embeds baseline JPEG/PNG, so a progressive JPEG or
          // EXIF-rotated logo can fail to appear in the generated PDF with no error.
          const dataUrl = await reencodePdfImageDataUrl(rawDataUrl, { preserveTransparency: true });
          const dimensions = await readImageDimensions(dataUrl);
          return { fileName, variant: { fileName, dataUrl, layout: layoutFor(fileName), legacyFolder: usingLegacyFolder, ...dimensions } };
        } catch (loadLogoError) {
          console.error('[ClinicLogo] Unable to load', fileName, 'from', activeFolder, loadLogoError);
          return { fileName, error: describeStorageError(loadLogoError) };
        }
      }));
      if (cancelled) return;
      const variants = results.map(result => result.variant).filter(Boolean);
      const errors = results.filter(result => result.error).map(result => `${result.fileName} (${result.error})`);
      setClinicLogos(variants);
      // Files are registered but none could be fetched - say so instead of pretending nothing
      // was ever uploaded, and show the real error(s) since "see the browser console" is not
      // reachable from a phone.
      setClinicLogoError(variants.length ? '' : `Could not load the uploaded clinic logo from Storage: ${errors.join('; ') || 'unknown error'}`);
      setClinicLogoLoading(false);
    };
    loadVariants();

    return () => {
      cancelled = true;
    };
  }, [readImageDimensions, clinicLogoStorageKey]);

  const prepareGeneration = () => {
    const context = resolveCaseContext(catalog, selectedCaseId);
    const generated = selectedTemplates.map(template => buildGeneratedDocument(
      template,
      context,
      selectedCase?.documents?.overrides?.[template.id],
    ));
    // Each document renders with the shared defaults merged with its own format overrides (spec
    // §5) - independent of whichever document (if any) the Format panel currently targets.
    const formattingByDoc = selectedTemplates.map(template => resolveEffectiveDocFormatting(formatting, template.format));
    return {
      generated,
      formattingByDoc,
    };
  };

  const rememberRecentCase = () => {
    persistSettings({ recentCaseIds: upsertRecentCaseId(settings.recentCaseIds, selectedCaseId) });
  };

  // Bumps every just-downloaded document to the front of the Documents list, in download order -
  // the last one downloaded ends up first (spec: "документ, скачаний останнім" is the most
  // popular), the rest keep whatever relative order they already had.
  const rememberRecentDocs = docIds => {
    const nextRecentDocIds = docIds.reduce((recent, docId) => upsertRecentId(recent, docId), settings.recentDocIds);
    persistSettings({ recentDocIds: nextRecentDocIds });
  };

  // A non-blocking warning is shown inline at all times (spec §15); the final export step still
  // asks for a confirmation so an admin never ships blanks without noticing.
  const confirmUnresolvedVariables = () => {
    if (!unresolvedVariables.length) return true;
    if (typeof window === 'undefined') return true;
    return window.confirm(
      `Не вдалося підставити ${unresolvedVariables.length} змінн${unresolvedVariables.length === 1 ? 'у' : 'их'}:\n`
      + `${unresolvedVariables.map(path => `- ${path}`).join('\n')}\n\nЗгенерувати документ попри це?`,
    );
  };

  const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });

  // Every checked document downloads as its own file (spec: "всі обрані документи ... мають бути
  // окремими файлами") - never bundled into one combined multi-page PDF/multi-section DOCX. A
  // short pause between saves keeps the browser from treating a fast run of downloads as a
  // pop-up-style flood and silently blocking everything after the first.
  const MULTI_DOWNLOAD_DELAY_MS = 300;

  const handleGeneratePdf = async () => {
    if (isGenerateDisabled) return;
    if (!confirmUnresolvedVariables()) return;
    setIsGenerating(true);
    try {
      const { generated, formattingByDoc } = prepareGeneration();
      const [{ pdf }, documentsModule] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./DocumentsPdfDocument'),
      ]);
      documentsModule.ensureDocumentsPdfFontsRegistered();
      const DocumentsPdfDocument = documentsModule.default;
      for (let index = 0; index < generated.length; index += 1) {
        const doc = generated[index];
        const blob = await pdf(React.createElement(DocumentsPdfDocument, {
          documents: [doc],
          layout,
          formatting: formattingByDoc[index],
          clinicLogos,
        })).toBlob();
        saveAs(blob, buildDocumentsFileName(catalog, selectedCase, layout, 'pdf', doc));
        if (index < generated.length - 1) await sleep(MULTI_DOWNLOAD_DELAY_MS);
      }
      rememberRecentCase();
      rememberRecentDocs(generated.map(doc => doc.id));
    } catch (generateError) {
      console.error('Unable to generate documents PDF', generateError);
      toast.error(isStaleChunkError(generateError) ? STALE_APP_MESSAGE : 'Could not generate the PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateDocx = async () => {
    if (isGenerateDisabled) return;
    if (!confirmUnresolvedVariables()) return;
    setIsGenerating(true);
    try {
      const { generated, formattingByDoc } = prepareGeneration();
      const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
      for (let index = 0; index < generated.length; index += 1) {
        const doc = generated[index];
        const blob = await buildDocumentsDocx({
          documents: [doc],
          layout,
          formatting: formattingByDoc[index],
          clinicLogos,
        });
        saveAs(blob, buildDocumentsFileName(catalog, selectedCase, layout, 'docx', doc));
        if (index < generated.length - 1) await sleep(MULTI_DOWNLOAD_DELAY_MS);
      }
      rememberRecentCase();
      rememberRecentDocs(generated.map(doc => doc.id));
    } catch (generateError) {
      console.error('Unable to generate documents DOCX', generateError);
      toast.error(isStaleChunkError(generateError) ? STALE_APP_MESSAGE : 'Could not generate the Word file.');
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Render ------------------------------------------------------------------------------------

  if (!isDocumentsAdmin) {
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
            <Title>Documents</Title>
          </div>
          <HeaderActions>
            <PageNavMenu />
            <MiniButton type="button" onClick={loadDocumentsData} disabled={loading} title="Reload from the backend">
              <FaSyncAlt /> Reload
            </MiniButton>
            <MiniButton type="button" onClick={handleGenerateDocx} disabled={isGenerateDisabled} title="Generate and download the Word file">
              <FaFileWord /> Word
            </MiniButton>
            <PrimaryMiniButton type="button" onClick={handleGeneratePdf} disabled={isGenerateDisabled} title="Generate and download the PDF">
              <FaFilePdf /> {isGenerating ? 'Generating…' : 'PDF'}
            </PrimaryMiniButton>
          </HeaderActions>
        </Header>

        {loading ? <StateCard>Loading documents data…</StateCard> : null}
        {!loading && error ? <StateCard>{error}</StateCard> : null}

        {!loading && !error ? (
          <>
            <Section>
              <SectionHead>
                <SectionTitle>Case</SectionTitle>
                <RowLine>
                  <ToggleGroup>
                    {DOCUMENT_LAYOUTS.map(option => (
                      <ToggleOption
                        key={option.id}
                        type="button"
                        $active={layout === option.id}
                        onClick={() => setLayout(option.id)}
                      >
                        {option.label}
                      </ToggleOption>
                    ))}
                  </ToggleGroup>
                </RowLine>
              </SectionHead>
              <RowLine style={{ marginTop: 8 }}>
                <Select value={selectedCaseId} onChange={event => setSelectedCaseId(event.target.value)}>
                  {!orderedCases.length ? <option value="">No cases yet</option> : null}
                  {orderedCases.map(caseRecord => (
                    <option key={caseRecord.id} value={String(caseRecord.id)}>
                      {buildCaseLabel(catalog, caseRecord)}
                    </option>
                  ))}
                </Select>
                <DangerButton type="button" onClick={handleDeleteCase} disabled={!selectedCase}>
                  <FaTrash /> Delete case
                </DangerButton>
              </RowLine>
            </Section>

            <Section>
              <SectionHead>
                <SectionTitle>Documents</SectionTitle>
                <ToggleGroup>
                  <ToggleOption
                    type="button"
                    $active={editMode === 'template'}
                    onClick={() => setEditMode('template')}
                    title="Edit the raw {{placeholder}} tokens of the shared template"
                  >
                    <FaPencilAlt /> Template
                  </ToggleOption>
                  <ToggleOption
                    type="button"
                    $active={editMode === 'data'}
                    onClick={() => setEditMode('data')}
                    title="Edit the resolved values of the selected case directly"
                  >
                    <FaPencilAlt /> Data
                  </ToggleOption>
                </ToggleGroup>
              </SectionHead>
              {activeLogoVariant?.dataUrl ? (
                <DocLogoPreviewRow>
                  <LogoPreview
                    src={activeLogoVariant.dataUrl}
                    alt="Clinic logo used by the selected document(s)"
                    title="The logo variant the selected document(s) will render, based on their {{logo}}/{{logo-long}} tokens"
                    style={selectedHasLogoLongToken ? { width: '100%', maxWidth: '100%' } : undefined}
                  />
                </DocLogoPreviewRow>
              ) : null}
              {unresolvedVariables.length ? (
                <DocSubtitle style={{ marginTop: 8, color: 'var(--km-danger)' }}>
                  Не вдалося підставити: {unresolvedVariables.join(', ')}
                </DocSubtitle>
              ) : null}
              {!catalog.documents.length ? (
                <DocSubtitle style={{ marginTop: 8 }}>No document templates yet — paste them in the technical field below.</DocSubtitle>
              ) : null}
              {orderedDocuments.map(template => {
                const isExpanded = expandedDocId === String(template.id);
                const isDataMode = editMode === 'data';
                // The builder view mirrors the selected layout mode (spec §1/§4): both languages as
                // grouped pairs in bilingual mode, a single language otherwise (1 or 2 columns).
                const isBilingual = isBilingualLayout(layout);
                const showUk = isBilingual || getLayoutLang(layout) === 'uk';
                const showEn = isBilingual || getLayoutLang(layout) === 'en';
                const isSingle = !(showUk && showEn);
                const resolvedDoc = isExpanded && isDataMode
                  ? buildGeneratedDocument(template, caseContext, selectedCase?.documents?.overrides?.[template.id])
                  : null;
                // Whichever source is currently authoritative (the dedicated `logo` field, or a
                // legacy leading paragraph) shown as one plain-text value the admin can type into
                // directly - never a normalized re-serialization, so a mid-edit/invalid value
                // isn't silently rewritten out from under them.
                const logoFieldValue = String(template.logo || '').trim()
                  ? template.logo
                  : (getParagraphType((template.paragraphs || [])[0]) !== 'text'
                    ? ((template.paragraphs || [])[0]?.uk || (template.paragraphs || [])[0]?.en || '')
                    : '');
                const titleValue = langKey => (isDataMode ? resolvedDoc?.title?.[langKey] ?? '' : template.title?.[langKey] || '');
                const rawParagraphValue = (paragraph, index, langKey) => (isDataMode
                  ? resolvedDoc?.paragraphs?.[index]?.[langKey] ?? ''
                  : paragraph?.[langKey] || '');
                // Data mode shows/edits the de-markup'd plain text as the editing toolbar handles
                // formatting (spec §2); Template mode shows the raw markup/encoding directly, so
                // the admin can see and hand-edit exactly what is stored.
                const paragraphValue = (paragraph, index, langKey) => (isDataMode
                  ? plainTextOf(rawParagraphValue(paragraph, index, langKey))
                  : rawParagraphValue(paragraph, index, langKey));
                const onTitleChange = langKey => event => (isDataMode
                  ? handleDataTitleChange(template.id, langKey, event.target.value)
                  : handleTitleChange(template.id, langKey, event.target.value));
                const onParagraphChange = (paragraph, index, langKey) => event => {
                  if (isDataMode) {
                    const nextRaw = applyPlainTextEdit(rawParagraphValue(paragraph, index, langKey), event.target.value);
                    handleDataParagraphChange(template.id, index, langKey, nextRaw);
                  } else {
                    handleParagraphChange(template.id, index, langKey, event.target.value);
                  }
                };
                const onFieldBlur = () => (isDataMode ? persistDocOverride(template.id) : persistTemplate(template.id));
                const dataEditLocked = isDataMode && !selectedCase;
                return (
                  <DocRow key={template.id}>
                    <DocRowHead>
                      <DocCheckbox
                        type="checkbox"
                        checked={Boolean(selectedDocIds[template.id])}
                        onChange={event => setSelectedDocIds(previous => ({ ...previous, [template.id]: event.target.checked }))}
                      />
                      <DocTitleButton
                        type="button"
                        onClick={() => setExpandedDocId(isExpanded ? '' : String(template.id))}
                      >
                        {template.title?.uk || template.title?.en || template.id}
                        {template.title?.en ? <DocSubtitle>{template.title.en}</DocSubtitle> : null}
                      </DocTitleButton>
                      <SmallButton
                        type="button"
                        onClick={() => setExpandedDocId(isExpanded ? '' : String(template.id))}
                        title={isExpanded ? 'Collapse' : 'Edit paragraphs'}
                      >
                        {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                      </SmallButton>
                      <DangerButton type="button" onClick={() => handleDeleteTemplate(template)} title="Delete document">
                        <FaTrash />
                      </DangerButton>
                    </DocRowHead>
                    {isExpanded ? (
                      <div style={{ marginTop: 6 }}>
                        {dataEditLocked ? (
                          <DocSubtitle>Select a case first — Data mode shows and edits its resolved values.</DocSubtitle>
                        ) : null}
                        {!isDataMode ? (
                          <RowLine style={{ marginTop: 4 }}>
                            <DocSubtitle style={{ fontWeight: 700 }}>Logo (before title)</DocSubtitle>
                            <FieldInput
                              type="text"
                              value={logoFieldValue}
                              placeholder="{{logo}} or {{logo-long}} - empty for no logo"
                              onChange={event => handleLogoFieldChange(template.id, event.target.value)}
                              onBlur={() => persistTemplate(template.id)}
                              style={{ flex: 1, minWidth: 240 }}
                            />
                          </RowLine>
                        ) : null}
                        {!isDataMode && (template.beforeTitle || []).length ? (
                          <div style={{ marginTop: 4 }}>
                            <DocSubtitle style={{ fontWeight: 700 }}>Before title</DocSubtitle>
                            {template.beforeTitle.map((block, index) => (
                              // eslint-disable-next-line react/no-array-index-key
                              <RowLine key={`${template.id}-before-title-${index}`} style={{ marginTop: 4 }}>
                                <FieldInput
                                  type="text"
                                  value={block.uk || ''}
                                  placeholder="Before title (uk)"
                                  onChange={event => handleBeforeTitleChange(template.id, index, 'uk', event.target.value)}
                                  onBlur={() => persistTemplate(template.id)}
                                  style={{ flex: 1, minWidth: 180 }}
                                />
                                <FieldInput
                                  type="text"
                                  value={block.en || ''}
                                  placeholder="Before title (en)"
                                  onChange={event => handleBeforeTitleChange(template.id, index, 'en', event.target.value)}
                                  onBlur={() => persistTemplate(template.id)}
                                  style={{ flex: 1, minWidth: 180 }}
                                />
                                <select
                                  value={block.align || 'left'}
                                  onChange={event => {
                                    handleBeforeTitleAlignChange(template.id, index, event.target.value);
                                    persistTemplate(template.id);
                                  }}
                                >
                                  <option value="left">left</option>
                                  <option value="right">right</option>
                                  <option value="center">center</option>
                                  <option value="justify">justify</option>
                                </select>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(block.bold)}
                                    onChange={event => {
                                      handleBeforeTitleBoldChange(template.id, index, event.target.checked);
                                      persistTemplate(template.id);
                                    }}
                                  />
                                  Bold
                                </label>
                              </RowLine>
                            ))}
                          </div>
                        ) : null}
                        <ParagraphPair $single={isSingle}>
                          {showUk ? (
                            <AutoInlineTextarea
                              value={titleValue('uk')}
                              placeholder="Title (uk)"
                              readOnly={dataEditLocked}
                              onChange={onTitleChange('uk')}
                              onBlur={onFieldBlur}
                            />
                          ) : null}
                          {showEn ? (
                            <AutoInlineTextarea
                              value={titleValue('en')}
                              placeholder="Title (en)"
                              readOnly={dataEditLocked}
                              onChange={onTitleChange('en')}
                              onBlur={onFieldBlur}
                            />
                          ) : null}
                        </ParagraphPair>
                        {(template.paragraphs || []).map((paragraph, index) => (
                          isDataMode ? (
                            // Boxed together so it's unambiguous which paragraph the toolbar acts
                            // on: the +/Bold/Italic/Delete controls and the paragraph's own text
                            // live inside the same visible border.
                            <ParagraphEditorBlock key={`${template.id}-p-${index}`}>
                              <ParagraphControlsRow>
                                <SmallButton
                                  type="button"
                                  disabled={dataEditLocked}
                                  onClick={() => handleInsertParagraph(template.id, index)}
                                  title="Insert a new custom paragraph above this one"
                                >
                                  <FaPlus /> Insert paragraph
                                </SmallButton>
                                <RowLine style={{ gap: 6 }}>
                                  <SmallButton
                                    type="button"
                                    disabled={dataEditLocked}
                                    {...formatButtonProps('bold')}
                                    title="Bold the selected text"
                                  >
                                    <FaBold />
                                  </SmallButton>
                                  <SmallButton
                                    type="button"
                                    disabled={dataEditLocked}
                                    {...formatButtonProps('italic')}
                                    title="Italicize the selected text"
                                  >
                                    <FaItalic />
                                  </SmallButton>
                                  <DangerButton
                                    type="button"
                                    disabled={dataEditLocked}
                                    onClick={() => handleRemoveParagraph(template.id, index)}
                                    title="Remove this paragraph"
                                  >
                                    <FaTrash />
                                  </DangerButton>
                                </RowLine>
                              </ParagraphControlsRow>
                              <ParagraphPair $single={isSingle} $plain>
                                {showUk ? (
                                  <ParagraphFieldColumn>
                                    <AutoInlineTextarea
                                      ref={registerFieldNode(template.id, index, 'uk')}
                                      value={paragraphValue(paragraph, index, 'uk')}
                                      placeholder="Paragraph (uk)"
                                      readOnly={dataEditLocked}
                                      onFocus={handleRichFieldFocus(template.id, index, 'uk')}
                                      onChange={onParagraphChange(paragraph, index, 'uk')}
                                      onBlur={onFieldBlur}
                                    />
                                    {hasInlineFormatting(rawParagraphValue(paragraph, index, 'uk')) ? (
                                      <>
                                        <FormattedPreviewLabel>Preview (bold/italic applied)</FormattedPreviewLabel>
                                        <FormattedPreviewText>
                                          <FormattedRunsPreview text={rawParagraphValue(paragraph, index, 'uk')} />
                                        </FormattedPreviewText>
                                      </>
                                    ) : null}
                                  </ParagraphFieldColumn>
                                ) : null}
                                {showEn ? (
                                  <ParagraphFieldColumn>
                                    <AutoInlineTextarea
                                      ref={registerFieldNode(template.id, index, 'en')}
                                      value={paragraphValue(paragraph, index, 'en')}
                                      placeholder="Paragraph (en)"
                                      readOnly={dataEditLocked}
                                      onFocus={handleRichFieldFocus(template.id, index, 'en')}
                                      onChange={onParagraphChange(paragraph, index, 'en')}
                                      onBlur={onFieldBlur}
                                    />
                                    {hasInlineFormatting(rawParagraphValue(paragraph, index, 'en')) ? (
                                      <>
                                        <FormattedPreviewLabel>Preview (bold/italic applied)</FormattedPreviewLabel>
                                        <FormattedPreviewText>
                                          <FormattedRunsPreview text={rawParagraphValue(paragraph, index, 'en')} />
                                        </FormattedPreviewText>
                                      </>
                                    ) : null}
                                  </ParagraphFieldColumn>
                                ) : null}
                              </ParagraphPair>
                            </ParagraphEditorBlock>
                          ) : (
                            <ParagraphPair key={`${template.id}-p-${index}`} $single={isSingle}>
                              {showUk ? (
                                <AutoInlineTextarea
                                  value={paragraphValue(paragraph, index, 'uk')}
                                  placeholder="Paragraph (uk)"
                                  onChange={onParagraphChange(paragraph, index, 'uk')}
                                  onBlur={onFieldBlur}
                                />
                              ) : null}
                              {showEn ? (
                                <AutoInlineTextarea
                                  value={paragraphValue(paragraph, index, 'en')}
                                  placeholder="Paragraph (en)"
                                  onChange={onParagraphChange(paragraph, index, 'en')}
                                  onBlur={onFieldBlur}
                                />
                              ) : null}
                            </ParagraphPair>
                          )
                        ))}
                        {isDataMode ? (
                          <ParagraphControlsRow style={{ justifyContent: 'flex-start' }}>
                            <SmallButton
                              type="button"
                              disabled={dataEditLocked}
                              onClick={() => handleInsertParagraph(template.id, (template.paragraphs || []).length)}
                              title="Append a new custom paragraph at the end of the document"
                            >
                              <FaPlus /> Add paragraph at the end
                            </SmallButton>
                          </ParagraphControlsRow>
                        ) : null}
                      </div>
                    ) : null}
                  </DocRow>
                );
              })}
            </Section>

            <Section>
              <SectionHead>
                <SectionTitle>Format</SectionTitle>
                <RowLine>
                  <SmallButton
                    type="button"
                    onClick={handleSaveFormatting}
                    title={formatDocId ? 'Save these values as this document\'s format override' : 'Save these values as the favourite (loaded on start)'}
                  >
                    <FaHeart /> {formatDocId ? 'Save for this document' : 'Save favourite'}
                  </SmallButton>
                  <SmallButton
                    type="button"
                    onClick={() => resetActiveFormattingTo(settings.formatting)}
                    title="Back to the saved favourite values"
                  >
                    Favourite
                  </SmallButton>
                  <SmallButton
                    type="button"
                    onClick={() => resetActiveFormattingTo(formatDocId ? formatting : DEFAULT_DOC_FORMATTING)}
                    title={formatDocId ? 'Back to the shared defaults - removes this document\'s overrides on save' : 'Back to the reference-document defaults'}
                  >
                    Defaults
                  </SmallButton>
                  <SmallButton type="button" onClick={() => setFormattingOpen(previous => !previous)}>
                    {formattingOpen ? <FaChevronUp /> : <FaChevronDown />}
                  </SmallButton>
                </RowLine>
              </SectionHead>
              {formattingOpen ? (
                <>
                  <RowLine style={{ marginTop: 8 }}>
                    <Select value={formatDocId} onChange={event => handleFormatDocChange(event.target.value)}>
                      <option value="">Format for: all documents (defaults)</option>
                      {orderedDocuments.map(template => (
                        <option key={template.id} value={String(template.id)}>
                          Format for: {template.title?.uk || template.title?.en || template.id}
                        </option>
                      ))}
                    </Select>
                  </RowLine>
                  <RowLine style={{ marginTop: 10 }}>
                    {clinicLogos.length ? clinicLogos.map(variant => (
                      <LogoVariant key={variant.fileName} $muted={!variant.layout}>
                        <LogoPreview src={variant.dataUrl} alt="Clinic logo variant" />
                        <LogoVariantCaption>
                          <ToggleGroup>
                            {LOGO_LAYOUT_OPTIONS.map(option => (
                              <ToggleOption
                                key={option.tag}
                                type="button"
                                $active={variant.layout === option.tag}
                                onClick={() => handleAssignLogoLayout(variant.fileName, option.tag)}
                                title={option.title}
                              >
                                {option.label}
                              </ToggleOption>
                            ))}
                          </ToggleGroup>
                          <DangerButton
                            type="button"
                            onClick={() => handleRemoveLogoVariant(variant.fileName)}
                            title="Remove this logo variant"
                          >
                            <FaTrash />
                          </DangerButton>
                        </LogoVariantCaption>
                      </LogoVariant>
                    )) : (
                      <DocSubtitle>{clinicLogoLoading ? 'Loading the clinic logo…' : (clinicLogoError || 'No clinic logo uploaded yet.')}</DocSubtitle>
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleLogoFileChange}
                    />
                    <SmallButton type="button" onClick={() => logoInputRef.current?.click()}>
                      <FaUpload /> {clinicLogos.length ? 'Add logo variant' : 'Upload logo'}
                    </SmallButton>
                    <CheckLine>
                      <DocCheckbox
                        type="checkbox"
                        checked={activeFormatting.showLogo}
                        onChange={event => setFormattingField('showLogo', event.target.checked)}
                      />
                      Show logo on documents
                    </CheckLine>
                  </RowLine>
                  <FieldGrid>
                    {numberField('fontSize', 'Font size (pt)', 0.5)}
                    {numberField('titleFontSize', 'Title size (pt)', 0.5)}
                    {numberField('lineSpacing', 'Line spacing (×)', 0.05)}
                    {numberField('paragraphSpacing', 'Paragraph spacing (pt)', 1)}
                    {numberField('firstLineIndentCm', 'First line indent (cm)', 0.25)}
                    {numberField('columnGapCm', 'Column gap (cm)', 0.1)}
                    {numberField('marginTopCm', 'Margin top (cm)', 0.1)}
                    {numberField('marginBottomCm', 'Margin bottom (cm)', 0.1)}
                    {numberField('marginLeftCm', 'Margin left (cm)', 0.1)}
                    {numberField('marginRightCm', 'Margin right (cm)', 0.1)}
                    {numberField('logoWidthMm', 'Logo width (mm)', 1)}
                  </FieldGrid>
                  <FieldGrid style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <Field>
                      Header text
                      <FieldInput
                        type="text"
                        value={activeFormatting.headerText}
                        onChange={event => setFormattingField('headerText', event.target.value)}
                      />
                    </Field>
                    <Field>
                      Footer text
                      <FieldInput
                        type="text"
                        value={activeFormatting.footerText}
                        onChange={event => setFormattingField('footerText', event.target.value)}
                      />
                    </Field>
                  </FieldGrid>
                  <RowLine style={{ marginTop: 8 }}>
                    <CheckLine>
                      <DocCheckbox
                        type="checkbox"
                        checked={activeFormatting.showPageNumbers}
                        onChange={event => setFormattingField('showPageNumbers', event.target.checked)}
                      />
                      Page numbers in the footer
                    </CheckLine>
                    <CheckLine>
                      <DocCheckbox
                        type="checkbox"
                        checked={activeFormatting.columnDivider}
                        onChange={event => setFormattingField('columnDivider', event.target.checked)}
                      />
                      Vertical divider between columns
                    </CheckLine>
                  </RowLine>
                </>
              ) : null}
            </Section>

            <Section>
              <SectionHead>
                <SectionTitle>Technical</SectionTitle>
                <RowLine>
                  <input
                    ref={technicalFileInputRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: 'none' }}
                    onChange={handleTechnicalFileChange}
                  />
                  <SmallButton
                    type="button"
                    onClick={() => technicalFileInputRef.current?.click()}
                    disabled={isApplyingTechnical}
                    title="Upload the exported documentsBuilder JSON file directly"
                  >
                    <FaUpload /> {isApplyingTechnical ? 'Merging…' : 'Upload file'}
                  </SmallButton>
                  <SmallButton type="button" onClick={() => handleApplyTechnical()} disabled={isApplyingTechnical || !technicalInput.trim()}>
                    {isApplyingTechnical ? 'Merging…' : 'Parse & merge'}
                  </SmallButton>
                </RowLine>
              </SectionHead>
              <TechnicalTextarea
                value={technicalInput}
                onChange={event => setTechnicalInput(event.target.value)}
                placeholder='Upload the exported JSON above, or paste it here ({"parties": {...}, "templates": {...}} or {"data": {...}, "documents": [...]}) — records are merged additively, nothing is wiped.'
                spellCheck={false}
              />
            </Section>
          </>
        ) : null}
      </Shell>
    </Page>
  );
};

export default DocumentsPage;
