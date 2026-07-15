// Documents - admin page for generating legal/client statements (PDF + Word) from bilingual
// paragraph templates filled with a case's party data. Architecturally a sibling of the Invoice
// Builder: same React + Firebase approach, same ivory/beige + bronze design system, same
// page-scoped --km-* palette override. Data lives on the backend under documentsBuilder/*:
// parties + cases, paragraph templates, and a settings record (clinic logo + favourite
// formatting values + recently used cases).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { get, ref, set, update } from 'firebase/database';
import { FaChevronDown, FaChevronUp, FaFilePdf, FaFileWord, FaHeart, FaSyncAlt, FaTrash, FaUpload } from 'react-icons/fa';
import { saveAs } from 'file-saver';
import designTokens from '../data/designTokens.json';
import { auth, database } from './config';
import { isInvoiceBuilderUid } from 'utils/accessLevel';
import PageNavMenu from './PageNavMenu';
import {
  DEFAULT_DOC_FORMATTING,
  DOCUMENTS_PARTIES_PATH,
  DOCUMENTS_SETTINGS_PATH,
  DOCUMENTS_TEMPLATES_PATH,
  DOCUMENT_LAYOUTS,
  PARTY_COLLECTIONS,
  buildCaseLabel,
  buildDocumentsFileName,
  buildGeneratedDocument,
  emptyDocumentsCatalog,
  mergeDocumentsCatalog,
  normalizeDocFormatting,
  normalizeDocumentsCatalog,
  normalizeDocumentsSettings,
  orderCasesByRecent,
  parseDocumentsTechnicalInput,
  resolveCaseContext,
  resolveMergedRecordsForPersistence,
  upsertRecentCaseId,
} from './documentsCatalogUtils';

// Same stale-chunk detection as the Invoice Builder: a failed dynamic chunk means the deployed
// build changed under this tab, and the fix is a refresh - not the raw webpack error.
const isStaleChunkError = error => /loading (?:css )?chunk|chunkloaderror/i.test(`${error?.name || ''} ${error?.message || ''}`);
const STALE_APP_MESSAGE = 'The app has been updated since this page was opened. Refresh the page and try again.';

const MAX_LOGO_FILE_BYTES = 1024 * 1024;

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

const Select = styled.select`
  flex: 1;
  min-width: 200px;
  border: 1px solid var(--km-border);
  background: var(--km-card);
  color: var(--km-text);
  border-radius: 6px;
  min-height: 30px;
  padding: 4px 8px;
  font-size: 12.5px;
  font-family: var(--km-font);
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

// "Styled as plain editable text": borderless until hovered/focused, same convention as the
// app's other inline-editable fields.
const InlineTextarea = styled.textarea`
  width: 100%;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--km-text);
  font-family: var(--km-font);
  font-size: 12.5px;
  line-height: 1.45;
  padding: 4px 6px;
  resize: vertical;
  min-height: 40px;

  &:hover {
    border-color: var(--km-border);
  }

  &:focus {
    outline: none;
    border-color: var(--km-accent);
    background: var(--km-card);
  }
`;

const ParagraphPair = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 6px;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
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
  border: 1px solid var(--km-border);
  background: var(--km-card);
  color: var(--km-text);
  border-radius: 6px;
  min-height: 28px;
  padding: 3px 8px;
  font-size: 12px;
  font-family: var(--km-font);

  &:focus {
    outline: none;
    border-color: var(--km-accent);
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

const TechnicalTextarea = styled.textarea`
  width: 100%;
  min-height: 110px;
  border: 1px solid var(--km-border);
  border-radius: 8px;
  background: var(--km-card);
  color: var(--km-text);
  font-family: monospace;
  font-size: 11.5px;
  padding: 8px;
  margin-top: 8px;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: var(--km-accent);
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
  const [dirtyDocIds, setDirtyDocIds] = useState({});
  const [technicalInput, setTechnicalInput] = useState('');
  const [isApplyingTechnical, setIsApplyingTechnical] = useState(false);
  const [formattingOpen, setFormattingOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const logoInputRef = useRef(null);
  // Mirror of `settings` that persistSettings can read synchronously: two quick successive
  // saves (e.g. logo upload + favourite formatting) must each build on the other's result, and
  // React state updates are not guaranteed to have flushed between them.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

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

  const handleApplyTechnical = async () => {
    let incoming;
    try {
      incoming = parseDocumentsTechnicalInput(technicalInput);
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
      setCatalog(merged);
      if (!selectedCaseId && merged.parties.cases.length) setSelectedCaseId(String(merged.parties.cases[0].id));
      setTechnicalInput('');
      toast.success(`Merged: ${summary.added} added, ${summary.updated} updated.`);
    } catch (applyError) {
      console.error('Unable to merge documents data', applyError);
      toast.error('Could not save the parsed data to the backend.');
    } finally {
      setIsApplyingTechnical(false);
    }
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

  const handleTitleChange = (docId, langKey, value) => {
    updateTemplate(docId, template => ({
      ...template,
      title: { ...(template.title || {}), [langKey]: value },
    }));
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
        const saved = await persistSettings({
          clinicLogo: {
            dataUrl,
            width: image.naturalWidth || 0,
            height: image.naturalHeight || 0,
            name: file.name,
          },
        });
        if (saved) toast.success('Clinic logo uploaded to the backend.');
      };
      image.onerror = () => toast.error('Could not read the image file.');
      image.src = dataUrl;
    };
    reader.onerror = () => toast.error('Could not read the image file.');
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Remove the clinic logo from the backend?')) return;
    const saved = await persistSettings({ clinicLogo: null });
    if (saved) toast.success('Clinic logo removed.');
  };

  // --- Formatting favourites --------------------------------------------------------------------

  const handleSaveFavouriteFormatting = async () => {
    const normalized = normalizeDocFormatting(formatting);
    setFormatting(normalized);
    const saved = await persistSettings({ formatting: normalized });
    if (saved) toast.success('Favourite formatting saved to the backend.');
  };

  const setFormattingField = (field, value) => {
    setFormatting(previous => ({ ...previous, [field]: value }));
  };

  const numberField = (field, label, step = 1) => (
    <Field key={field}>
      {label}
      <FieldInput
        type="number"
        step={step}
        value={formatting[field]}
        onChange={event => setFormattingField(field, event.target.value === '' ? '' : Number(event.target.value))}
        onBlur={() => setFormatting(previous => normalizeDocFormatting(previous))}
      />
    </Field>
  );

  // --- Generation --------------------------------------------------------------------------------

  const orderedCases = orderCasesByRecent(catalog.parties.cases, settings.recentCaseIds);
  const selectedTemplates = catalog.documents.filter(template => selectedDocIds[template.id]);
  const selectedCase = catalog.parties.cases.find(item => String(item.id) === selectedCaseId) || null;
  const isGenerateDisabled = loading || Boolean(error) || isGenerating || !selectedTemplates.length || !selectedCase;

  const prepareGeneration = () => {
    const context = resolveCaseContext(catalog, selectedCaseId);
    const generated = selectedTemplates.map(template => buildGeneratedDocument(template, context));
    return { generated, normalizedFormatting: normalizeDocFormatting(formatting) };
  };

  const rememberRecentCase = () => {
    persistSettings({ recentCaseIds: upsertRecentCaseId(settings.recentCaseIds, selectedCaseId) });
  };

  const handleGeneratePdf = async () => {
    if (isGenerateDisabled) return;
    setIsGenerating(true);
    try {
      const { generated, normalizedFormatting } = prepareGeneration();
      const [{ pdf }, documentsModule] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./DocumentsPdfDocument'),
      ]);
      documentsModule.ensureDocumentsPdfFontsRegistered();
      const DocumentsPdfDocument = documentsModule.default;
      const blob = await pdf(React.createElement(DocumentsPdfDocument, {
        documents: generated,
        layout,
        formatting: normalizedFormatting,
        logoDataUrl: settings.clinicLogo?.dataUrl || null,
      })).toBlob();
      saveAs(blob, buildDocumentsFileName(catalog, selectedCase, layout, 'pdf'));
      rememberRecentCase();
    } catch (generateError) {
      console.error('Unable to generate documents PDF', generateError);
      toast.error(isStaleChunkError(generateError) ? STALE_APP_MESSAGE : 'Could not generate the PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateDocx = async () => {
    if (isGenerateDisabled) return;
    setIsGenerating(true);
    try {
      const { generated, normalizedFormatting } = prepareGeneration();
      const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
      const blob = await buildDocumentsDocx({
        documents: generated,
        layout,
        formatting: normalizedFormatting,
        logo: settings.clinicLogo,
      });
      saveAs(blob, buildDocumentsFileName(catalog, selectedCase, layout, 'docx'));
      rememberRecentCase();
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
              </SectionHead>
              {!catalog.documents.length ? (
                <DocSubtitle style={{ marginTop: 8 }}>No document templates yet — paste them in the technical field below.</DocSubtitle>
              ) : null}
              {catalog.documents.map(template => {
                const isExpanded = expandedDocId === String(template.id);
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
                        <ParagraphPair>
                          <InlineTextarea
                            value={template.title?.uk || ''}
                            placeholder="Title (uk)"
                            onChange={event => handleTitleChange(template.id, 'uk', event.target.value)}
                            onBlur={() => persistTemplate(template.id)}
                          />
                          <InlineTextarea
                            value={template.title?.en || ''}
                            placeholder="Title (en)"
                            onChange={event => handleTitleChange(template.id, 'en', event.target.value)}
                            onBlur={() => persistTemplate(template.id)}
                          />
                        </ParagraphPair>
                        {(template.paragraphs || []).map((paragraph, index) => (
                          <ParagraphPair key={`${template.id}-p-${index}`}>
                            <InlineTextarea
                              value={paragraph?.uk || ''}
                              placeholder="Paragraph (uk)"
                              onChange={event => handleParagraphChange(template.id, index, 'uk', event.target.value)}
                              onBlur={() => persistTemplate(template.id)}
                            />
                            <InlineTextarea
                              value={paragraph?.en || ''}
                              placeholder="Paragraph (en)"
                              onChange={event => handleParagraphChange(template.id, index, 'en', event.target.value)}
                              onBlur={() => persistTemplate(template.id)}
                            />
                          </ParagraphPair>
                        ))}
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
                  <SmallButton type="button" onClick={handleSaveFavouriteFormatting} title="Save these values as the favourite (loaded on start)">
                    <FaHeart /> Save favourite
                  </SmallButton>
                  <SmallButton type="button" onClick={() => setFormatting(settings.formatting)} title="Back to the saved favourite values">
                    Favourite
                  </SmallButton>
                  <SmallButton type="button" onClick={() => setFormatting(DEFAULT_DOC_FORMATTING)} title="Back to the reference-document defaults">
                    Defaults
                  </SmallButton>
                  <SmallButton type="button" onClick={() => setFormattingOpen(previous => !previous)}>
                    {formattingOpen ? <FaChevronUp /> : <FaChevronDown />}
                  </SmallButton>
                </RowLine>
              </SectionHead>
              {formattingOpen ? (
                <>
                  <RowLine style={{ marginTop: 10 }}>
                    {settings.clinicLogo ? (
                      <LogoPreview src={settings.clinicLogo.dataUrl} alt="Clinic logo" />
                    ) : (
                      <DocSubtitle>No clinic logo uploaded yet.</DocSubtitle>
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleLogoFileChange}
                    />
                    <SmallButton type="button" onClick={() => logoInputRef.current?.click()}>
                      <FaUpload /> {settings.clinicLogo ? 'Replace logo' : 'Upload logo'}
                    </SmallButton>
                    {settings.clinicLogo ? (
                      <DangerButton type="button" onClick={handleRemoveLogo}>
                        <FaTrash /> Remove
                      </DangerButton>
                    ) : null}
                    <CheckLine>
                      <DocCheckbox
                        type="checkbox"
                        checked={formatting.showLogo}
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
                        value={formatting.headerText}
                        onChange={event => setFormattingField('headerText', event.target.value)}
                      />
                    </Field>
                    <Field>
                      Footer text
                      <FieldInput
                        type="text"
                        value={formatting.footerText}
                        onChange={event => setFormattingField('footerText', event.target.value)}
                      />
                    </Field>
                  </FieldGrid>
                  <RowLine style={{ marginTop: 8 }}>
                    <CheckLine>
                      <DocCheckbox
                        type="checkbox"
                        checked={formatting.showPageNumbers}
                        onChange={event => setFormattingField('showPageNumbers', event.target.checked)}
                      />
                      Page numbers in the footer
                    </CheckLine>
                  </RowLine>
                </>
              ) : null}
            </Section>

            <Section>
              <SectionHead>
                <SectionTitle>Technical</SectionTitle>
                <SmallButton type="button" onClick={handleApplyTechnical} disabled={isApplyingTechnical || !technicalInput.trim()}>
                  <FaUpload /> {isApplyingTechnical ? 'Merging…' : 'Parse & merge'}
                </SmallButton>
              </SectionHead>
              <TechnicalTextarea
                value={technicalInput}
                onChange={event => setTechnicalInput(event.target.value)}
                placeholder='Paste the documents JSON here ({"data": {...}, "documents": [...]}) — records are merged additively, nothing is wiped.'
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
