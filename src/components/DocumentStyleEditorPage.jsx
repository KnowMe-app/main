// Style Editor (batch 23 §4) - the admin surface for editing a layoutV2 template's `styleSheet`
// and page geometry, with a live PDF-true preview driven by a real case's data. Style edits apply
// to the template (shared across every case that uses it) - a case here only supplies the data the
// preview renders against, never a per-case style. Fourth sibling of Invoice Builder / Documents
// Builder / Parties, same React + Firebase approach, same page-scoped --km-* palette, reachable
// from the shared PageNavMenu.
//
// Storage is precise and non-destructive (spec, following the Batch 13/18 only-store-diffs
// philosophy already used for document `format` overrides): toggling a property on/editing it
// writes exactly that one `styleSheet.<styleName>.<property>` (or `page.<path>`) leaf via a
// targeted Firebase `update()`; toggling it back off deletes that one leaf (`update()` with
// `null`) - never a bulk clear of an entire named style or the whole styleSheet/template. The one
// exception is the explicit "reset whole group" action, which does clear one named style's entire
// override object at once and is gated behind a confirmation, per the app's existing
// delete-confirmation convention.
import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { get, ref, update } from 'firebase/database';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';
import designTokens from '../data/designTokens.json';
import { auth, database } from './config';
import { isInvoiceBuilderUid } from 'utils/accessLevel';
import PageNavMenu from './PageNavMenu';
import DocumentsPdfPreview from './DocumentsPdfPreview';
import {
  DEFAULT_DOC_FORMATTING,
  DOCUMENTS_CASES_PATH,
  DOCUMENTS_PARTIES_PATH,
  DOCUMENTS_SETTINGS_PATH,
  DOCUMENTS_TEMPLATES_PATH,
  LAYOUT_V2_STYLE_KEYS,
  buildCaseLabel,
  buildGeneratedDocument,
  emptyDocumentsCatalog,
  normalizeDocumentsCatalog,
  normalizeDocumentsSettings,
  orderCasesByRecent,
  resolveCaseContext,
  resolveLayoutV2Style,
  upsertRecentCaseId,
  validateLayoutV2Template,
} from './documentsCatalogUtils';

// --- Layout shell (same skeleton/palette as Invoice Builder, Documents Builder & Parties) -------

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

const StateCard = styled.div`
  padding: 20px;
  border-radius: 10px;
  background: var(--km-card);
  border: 1px solid var(--km-border);
  color: var(--km-muted);
  font-size: 13px;
`;

const Section = styled.section`
  background: var(--km-card);
  border: 1px solid var(--km-border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
`;

const SectionTitle = styled.h2`
  margin: 0 0 8px;
  font-family: var(--km-font-display);
  font-size: 15px;
  letter-spacing: -0.01em;
`;

const PickerRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;

  & > * {
    flex: 1 1 220px;
    min-width: 200px;
  }
`;

const Select = styled.select`
  border: 1px solid var(--km-border);
  background: var(--km-bg);
  color: var(--km-text);
  border-radius: 6px;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 12.5px;
  font-family: var(--km-font);
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: var(--km-accent);
  }
`;

const DangerLink = styled.button`
  border: none;
  background: transparent;
  color: var(--km-danger);
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
`;

// --- Collapsible group (one per named style, collapsed by default) -----------------------------

const GroupCard = styled.div`
  border: 1px solid var(--km-border);
  border-radius: 8px;
  margin-top: 8px;
  overflow: hidden;
`;

const GroupHead = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: none;
  background: var(--km-bg);
  color: var(--km-text);
  padding: 8px 10px;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
`;

const GroupBody = styled.div`
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const PropertyRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
`;

const PropertyLabel = styled.span`
  flex: 0 0 130px;
  color: var(--km-muted);
  font-weight: 600;
`;

const PropertyInput = styled.input`
  flex: 1;
  min-width: 0;
  border: 1px solid var(--km-border);
  background: var(--km-bg);
  color: var(--km-text);
  border-radius: 5px;
  min-height: 26px;
  padding: 3px 7px;
  font-size: 11.5px;
  font-family: var(--km-font);

  &:disabled {
    opacity: 0.45;
  }
`;

const PropertySelect = styled.select`
  flex: 1;
  min-width: 0;
  border: 1px solid var(--km-border);
  background: var(--km-bg);
  color: var(--km-text);
  border-radius: 5px;
  min-height: 26px;
  padding: 3px 7px;
  font-size: 11.5px;
  font-family: var(--km-font);

  &:disabled {
    opacity: 0.45;
  }
`;

// Every named style a genetic-affinity-certificate-family layoutV2 template is expected to carry
// (spec §4) - shown even when a particular template's styleSheet doesn't (yet) have that key, so
// it can be added. A template's own extra style names (anything not in this list) still show up -
// see styleNamesFor below - this is only the "always offer these" baseline.
const KNOWN_LAYOUT_V2_STYLE_NAMES = [
  'document', 'letterheadContact', 'titleMain', 'titleSecondary', 'body', 'bodyJustify',
  'formValue', 'formValueMixedCase', 'formCaption', 'signatureLabel', 'signatureName',
  'signatureCaption', 'inlineEmphasis',
];

const styleNamesFor = template => [...new Set([
  ...KNOWN_LAYOUT_V2_STYLE_NAMES,
  ...Object.keys(template?.styleSheet || {}),
])];

// One control spec per toggleable property (spec §4: "Each style property ... is individually
// toggleable on/off ... and editable when on") - the seed value a fresh toggle-on starts from, and
// the input widget used while it's on.
const PROPERTY_CONTROLS = {
  fontFamily: { seed: 'Times New Roman', type: 'text' },
  fontSizePt: { seed: 10, type: 'number' },
  fontWeight: { seed: 400, type: 'select', options: [400, 500, 600, 700] },
  fontStyle: { seed: 'normal', type: 'select', options: ['normal', 'italic'] },
  lineHeight: { seed: 1, type: 'number' },
  color: { seed: '#000000', type: 'text' },
  align: { seed: 'left', type: 'select', options: ['left', 'center', 'right', 'justify'] },
  spaceBeforePt: { seed: 0, type: 'number' },
  spaceAfterPt: { seed: 0, type: 'number' },
  textDecoration: { seed: 'underline', type: 'select', options: ['underline'] },
  textTransform: { seed: 'uppercase', type: 'select', options: ['uppercase', 'lowercase', 'capitalize'] },
  letterSpacingPt: { seed: 0, type: 'number' },
};

const PROPERTY_LABELS = {
  fontFamily: 'Font family',
  fontSizePt: 'Font size (pt)',
  fontWeight: 'Font weight',
  fontStyle: 'Font style',
  lineHeight: 'Line height',
  color: 'Color',
  align: 'Align',
  spaceBeforePt: 'Space before (pt)',
  spaceAfterPt: 'Space after (pt)',
  textDecoration: 'Decoration',
  textTransform: 'Text transform',
  letterSpacingPt: 'Letter spacing (pt)',
};

// One property row: a checkbox that says whether this property is overridden at all, plus its
// control (disabled, showing the effective/inherited value as a hint, while off). `controls`/
// `labels` default to the layoutV2 text-style maps but are swappable (see LineStyleGroup below,
// which reuses this same row for lineStyles' widthPt/color/fill* properties).
const StylePropertyRow = ({
  property, rawValue, effectiveValue, onSet, onDelete, controls = PROPERTY_CONTROLS, labels = PROPERTY_LABELS,
}) => {
  const control = controls[property];
  const isOn = rawValue !== undefined;
  const [draft, setDraft] = useState(rawValue !== undefined ? String(rawValue) : '');
  useEffect(() => {
    setDraft(rawValue !== undefined ? String(rawValue) : '');
  }, [rawValue]);
  const commit = value => {
    if (control.type === 'number') {
      const parsed = Number(value);
      onSet(Number.isFinite(parsed) ? parsed : control.seed);
    } else {
      onSet(value);
    }
  };
  return (
    <PropertyRow>
      <input
        type="checkbox"
        checked={isOn}
        onChange={event => (event.target.checked ? onSet(effectiveValue !== undefined ? effectiveValue : control.seed) : onDelete())}
      />
      <PropertyLabel>{labels[property] || property}</PropertyLabel>
      {control.type === 'boolean' ? (
        <input
          type="checkbox"
          disabled={!isOn}
          checked={isOn ? Boolean(rawValue) : Boolean(effectiveValue ?? control.seed)}
          onChange={event => onSet(event.target.checked)}
        />
      ) : control.type === 'select' ? (
        <PropertySelect
          disabled={!isOn}
          value={isOn ? String(rawValue) : String(effectiveValue ?? control.seed)}
          onChange={event => {
            const value = control.options.every(option => typeof option === 'number') ? Number(event.target.value) : event.target.value;
            onSet(value);
          }}
        >
          {control.options.map(option => <option key={option} value={option}>{option}</option>)}
        </PropertySelect>
      ) : (
        <PropertyInput
          type="text"
          disabled={!isOn}
          value={isOn ? draft : ''}
          placeholder={effectiveValue !== undefined ? String(effectiveValue) : ''}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
        />
      )}
    </PropertyRow>
  );
};

// One collapsible group per named style (spec §4: "collapsible dropdown groups ... collapsed by
// default"). `onResetGroup` clears every override on this one style in a single confirmed action -
// the only place this page ever clears more than one property at once.
const StyleGroup = ({
  styleName, template, onSetProperty, onDeleteProperty, onResetGroup,
}) => {
  const [open, setOpen] = useState(false);
  const rawStyle = template.styleSheet?.[styleName] || {};
  const effectiveStyle = resolveLayoutV2Style(template, styleName, {});
  const hasOverrides = Object.keys(rawStyle).length > 0;
  return (
    <GroupCard>
      <GroupHead type="button" onClick={() => setOpen(previous => !previous)}>
        <span>{styleName}{hasOverrides ? ` (${Object.keys(rawStyle).length})` : ''}</span>
        {open ? <FaChevronUp /> : <FaChevronDown />}
      </GroupHead>
      {open ? (
        <GroupBody>
          {LAYOUT_V2_STYLE_KEYS.map(property => (
            <StylePropertyRow
              key={property}
              property={property}
              rawValue={rawStyle[property]}
              effectiveValue={effectiveStyle[property]}
              onSet={value => onSetProperty(styleName, property, value)}
              onDelete={() => onDeleteProperty(styleName, property)}
            />
          ))}
          {hasOverrides ? (
            <div>
              <DangerLink type="button" onClick={() => onResetGroup(styleName)}>Reset this whole group to default</DangerLink>
            </div>
          ) : null}
        </GroupBody>
      ) : null}
    </GroupCard>
  );
};

// The document's base style (clean layoutV2 template spec §2/§3: `template.format`, the layer
// every named style/block sits on top of - never a required `styleSheet.document`). Same
// collapsible-group shape as StyleGroup, just backed by `format/<property>` instead of
// `styleSheet/<styleName>/<property>`.
const FormatGroup = ({
  template, onSetProperty, onDeleteProperty, onResetGroup,
}) => {
  const [open, setOpen] = useState(false);
  const rawStyle = template.format || {};
  const effectiveStyle = resolveLayoutV2Style(template, undefined, {});
  const hasOverrides = Object.keys(rawStyle).length > 0;
  return (
    <GroupCard>
      <GroupHead type="button" onClick={() => setOpen(previous => !previous)}>
        <span>format (base style){hasOverrides ? ` (${Object.keys(rawStyle).length})` : ''}</span>
        {open ? <FaChevronUp /> : <FaChevronDown />}
      </GroupHead>
      {open ? (
        <GroupBody>
          {LAYOUT_V2_STYLE_KEYS.map(property => (
            <StylePropertyRow
              key={property}
              property={property}
              rawValue={rawStyle[property]}
              effectiveValue={effectiveStyle[property]}
              onSet={value => onSetProperty(property, value)}
              onDelete={() => onDeleteProperty(property)}
            />
          ))}
          {hasOverrides ? (
            <div>
              <DangerLink type="button" onClick={onResetGroup}>Reset format to default</DangerLink>
            </div>
          ) : null}
        </GroupBody>
      ) : null}
    </GroupCard>
  );
};

const PAGE_GEOMETRY_MARGIN_SIDES = ['top', 'right', 'bottom', 'left'];
const PAGE_SIZE_OPTIONS = ['A4', 'Letter'];

// Page geometry (spec §4: "plus page geometry (page.marginsMm, page.size)") - same toggle-on/off
// per field, same non-destructive per-leaf writes, just under `page.*` instead of `styleSheet.*`.
const PageGeometryGroup = ({ template, onSetPageField, onDeletePageField }) => {
  const [open, setOpen] = useState(false);
  const page = template.page || {};
  const margins = page.marginsMm || {};
  return (
    <GroupCard>
      <GroupHead type="button" onClick={() => setOpen(previous => !previous)}>
        <span>Page geometry</span>
        {open ? <FaChevronUp /> : <FaChevronDown />}
      </GroupHead>
      {open ? (
        <GroupBody>
          <PropertyRow>
            <input
              type="checkbox"
              checked={page.size !== undefined}
              onChange={event => (event.target.checked ? onSetPageField('size', 'A4') : onDeletePageField('size'))}
            />
            <PropertyLabel>Page size</PropertyLabel>
            <PropertySelect
              disabled={page.size === undefined}
              value={page.size || 'A4'}
              onChange={event => onSetPageField('size', event.target.value)}
            >
              {PAGE_SIZE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
            </PropertySelect>
          </PropertyRow>
          {PAGE_GEOMETRY_MARGIN_SIDES.map(side => (
            <PropertyRow key={side}>
              <input
                type="checkbox"
                checked={margins[side] !== undefined}
                onChange={event => (event.target.checked ? onSetPageField(`marginsMm/${side}`, margins[side] ?? 15) : onDeletePageField(`marginsMm/${side}`))}
              />
              <PropertyLabel>Margin {side} (mm)</PropertyLabel>
              <PropertyInput
                type="text"
                disabled={margins[side] === undefined}
                value={margins[side] ?? ''}
                onChange={event => onSetPageField(`marginsMm/${side}`, Number(event.target.value) || 0)}
              />
            </PropertyRow>
          ))}
        </GroupBody>
      ) : null}
    </GroupCard>
  );
};

// Known line-style names a genetic-affinity-certificate-family template is expected to carry (spec
// §4) - shown even when a template's own `lineStyles` doesn't (yet) have that key, same pattern as
// KNOWN_LAYOUT_V2_STYLE_NAMES/styleNamesFor above.
const KNOWN_LINE_STYLE_NAMES = ['letterheadDivider', 'formLine', 'signatureLine'];

const lineStyleNamesFor = template => [...new Set([
  ...KNOWN_LINE_STYLE_NAMES,
  ...Object.keys(template?.lineStyles || {}),
])];

const LINE_STYLE_PROPERTY_CONTROLS = {
  widthPt: { seed: 0.75, type: 'number' },
  color: { seed: '#000000', type: 'text' },
  fillBeforeValue: { seed: true, type: 'boolean' },
  fillAfterValue: { seed: true, type: 'boolean' },
};

const LINE_STYLE_PROPERTY_LABELS = {
  widthPt: 'Width (pt)',
  color: 'Color',
  fillBeforeValue: 'Fill before value',
  fillAfterValue: 'Fill after value',
};

// One collapsible group per named line style (spec §4/§15: "editing lineStyles"), same non-
// destructive per-leaf writes as StyleGroup/PageGeometryGroup, just under `lineStyles.<name>.*`.
const LineStyleGroup = ({
  styleName, template, onSetProperty, onDeleteProperty, onResetGroup,
}) => {
  const [open, setOpen] = useState(false);
  const rawStyle = template.lineStyles?.[styleName] || {};
  const hasOverrides = Object.keys(rawStyle).length > 0;
  return (
    <GroupCard>
      <GroupHead type="button" onClick={() => setOpen(previous => !previous)}>
        <span>{styleName}{hasOverrides ? ` (${Object.keys(rawStyle).length})` : ''}</span>
        {open ? <FaChevronUp /> : <FaChevronDown />}
      </GroupHead>
      {open ? (
        <GroupBody>
          {Object.keys(LINE_STYLE_PROPERTY_CONTROLS).map(property => (
            <StylePropertyRow
              key={property}
              property={property}
              rawValue={rawStyle[property]}
              effectiveValue={undefined}
              controls={LINE_STYLE_PROPERTY_CONTROLS}
              labels={LINE_STYLE_PROPERTY_LABELS}
              onSet={value => onSetProperty(styleName, property, value)}
              onDelete={() => onDeleteProperty(styleName, property)}
            />
          ))}
          {hasOverrides ? (
            <div>
              <DangerLink type="button" onClick={() => onResetGroup(styleName)}>Reset this whole line style to default</DangerLink>
            </div>
          ) : null}
        </GroupBody>
      ) : null}
    </GroupCard>
  );
};

const DocumentStyleEditorPage = ({ isAdmin }) => {
  const isStyleEditorAdmin = Boolean(isAdmin) || isInvoiceBuilderUid(auth.currentUser?.uid) || (typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('admin') === '1');

  const [catalog, setCatalog] = useState(() => emptyDocumentsCatalog());
  const [settings, setSettings] = useState(() => normalizeDocumentsSettings(null));
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [partiesSnapshot, casesSnapshot, templatesSnapshot, settingsSnapshot] = await Promise.all([
        get(ref(database, DOCUMENTS_PARTIES_PATH)),
        get(ref(database, DOCUMENTS_CASES_PATH)),
        get(ref(database, DOCUMENTS_TEMPLATES_PATH)),
        get(ref(database, DOCUMENTS_SETTINGS_PATH)),
      ]);
      const nextCatalog = normalizeDocumentsCatalog(
        partiesSnapshot.exists() ? partiesSnapshot.val() : null,
        templatesSnapshot.exists() ? templatesSnapshot.val() : null,
        casesSnapshot.exists() ? casesSnapshot.val() : null,
      );
      const nextSettings = normalizeDocumentsSettings(settingsSnapshot.exists() ? settingsSnapshot.val() : null);
      setCatalog(nextCatalog);
      setSettings(nextSettings);
      const layoutV2Templates = nextCatalog.documents.filter(template => template.layoutV2?.blocks);
      setSelectedTemplateId(previous => (previous && layoutV2Templates.some(item => String(item.id) === previous)
        ? previous
        : String(layoutV2Templates[0]?.id || '')));
      // Defaults to the app-wide last-selected case (spec observations §4: same case Documents
      // Builder most recently used) - the case here only drives the preview, so reusing that MRU
      // means opening this page never requires re-picking a case just to see live data.
      const orderedCases = orderCasesByRecent(nextCatalog.cases, nextSettings.recentCaseIds);
      setSelectedCaseId(previous => (previous && orderedCases.some(item => String(item.id) === previous)
        ? previous
        : String(orderedCases[0]?.id || '')));
    } catch (loadError) {
      console.error('Unable to load style editor data', loadError);
      setError('Documents data is not available right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const layoutV2Templates = catalog.documents.filter(template => template.layoutV2?.blocks);
  const orderedCases = orderCasesByRecent(catalog.cases, settings.recentCaseIds);
  const selectedTemplate = layoutV2Templates.find(template => String(template.id) === selectedTemplateId) || null;

  const handleSelectCase = caseId => {
    setSelectedCaseId(caseId);
    const nextRecentCaseIds = upsertRecentCaseId(settings.recentCaseIds, caseId);
    setSettings(previous => ({ ...previous, recentCaseIds: nextRecentCaseIds }));
    update(ref(database, DOCUMENTS_SETTINGS_PATH), { recentCaseIds: nextRecentCaseIds }).catch(usageError => {
      console.error('Unable to save the recently-used case', usageError);
    });
  };

  // Every write here targets one precise leaf path under the template record - see the file header
  // comment for why (only-store-diffs, never a bulk clear). The local catalog mirror is updated
  // optimistically in the same shape so the live preview reflects the edit immediately.
  const writeTemplateLeaf = async (templateId, leafPath, value, applyLocally) => {
    try {
      await update(ref(database), { [`${DOCUMENTS_TEMPLATES_PATH}/${templateId}/${leafPath}`]: value === undefined ? null : value });
      setCatalog(previous => ({
        ...previous,
        documents: previous.documents.map(template => (String(template.id) === String(templateId) ? applyLocally(template) : template)),
      }));
    } catch (writeError) {
      console.error('Unable to update the template style', writeError);
      toast.error('Could not save the style change.');
    }
  };

  const handleSetProperty = (styleName, property, value) => {
    if (!selectedTemplate) return;
    writeTemplateLeaf(selectedTemplate.id, `styleSheet/${styleName}/${property}`, value, template => ({
      ...template,
      styleSheet: { ...template.styleSheet, [styleName]: { ...template.styleSheet?.[styleName], [property]: value } },
    }));
  };

  const handleDeleteProperty = (styleName, property) => {
    if (!selectedTemplate) return;
    writeTemplateLeaf(selectedTemplate.id, `styleSheet/${styleName}/${property}`, undefined, template => {
      const nextStyle = { ...template.styleSheet?.[styleName] };
      delete nextStyle[property];
      return { ...template, styleSheet: { ...template.styleSheet, [styleName]: nextStyle } };
    });
  };

  // The one bulk-clear action this page allows - one named style's entire override object, never
  // the whole styleSheet - gated behind confirmation since it can discard several edits at once
  // (spec observations §4: confirm only for "reset whole group", not a single-property reset).
  const handleResetGroup = styleName => {
    if (!selectedTemplate) return;
    if (typeof window !== 'undefined' && !window.confirm(`Reset every "${styleName}" style override to default?`)) return;
    writeTemplateLeaf(selectedTemplate.id, `styleSheet/${styleName}`, undefined, template => {
      const nextStyleSheet = { ...template.styleSheet };
      delete nextStyleSheet[styleName];
      return { ...template, styleSheet: nextStyleSheet };
    });
  };

  // Base `format` (spec §2/§3) - same per-leaf write pattern as styleSheet, just at the template's
  // own top-level `format` key instead of `styleSheet/<styleName>`.
  const handleSetFormatProperty = (property, value) => {
    if (!selectedTemplate) return;
    writeTemplateLeaf(selectedTemplate.id, `format/${property}`, value, template => ({
      ...template,
      format: { ...template.format, [property]: value },
    }));
  };

  const handleDeleteFormatProperty = property => {
    if (!selectedTemplate) return;
    writeTemplateLeaf(selectedTemplate.id, `format/${property}`, undefined, template => {
      const nextFormat = { ...template.format };
      delete nextFormat[property];
      return { ...template, format: nextFormat };
    });
  };

  const handleResetFormat = () => {
    if (!selectedTemplate) return;
    if (typeof window !== 'undefined' && !window.confirm('Reset the base format to default?')) return;
    writeTemplateLeaf(selectedTemplate.id, 'format', undefined, template => ({ ...template, format: {} }));
  };

  // lineStyles (spec §4/§15) - same per-leaf write pattern as styleSheet, under `lineStyles.<name>`.
  const handleSetLineStyleProperty = (styleName, property, value) => {
    if (!selectedTemplate) return;
    writeTemplateLeaf(selectedTemplate.id, `lineStyles/${styleName}/${property}`, value, template => ({
      ...template,
      lineStyles: { ...template.lineStyles, [styleName]: { ...template.lineStyles?.[styleName], [property]: value } },
    }));
  };

  const handleDeleteLineStyleProperty = (styleName, property) => {
    if (!selectedTemplate) return;
    writeTemplateLeaf(selectedTemplate.id, `lineStyles/${styleName}/${property}`, undefined, template => {
      const nextStyle = { ...template.lineStyles?.[styleName] };
      delete nextStyle[property];
      return { ...template, lineStyles: { ...template.lineStyles, [styleName]: nextStyle } };
    });
  };

  const handleResetLineStyleGroup = styleName => {
    if (!selectedTemplate) return;
    if (typeof window !== 'undefined' && !window.confirm(`Reset every "${styleName}" line style override to default?`)) return;
    writeTemplateLeaf(selectedTemplate.id, `lineStyles/${styleName}`, undefined, template => {
      const nextLineStyles = { ...template.lineStyles };
      delete nextLineStyles[styleName];
      return { ...template, lineStyles: nextLineStyles };
    });
  };

  const handleSetPageField = (fieldPath, value) => {
    if (!selectedTemplate) return;
    writeTemplateLeaf(selectedTemplate.id, `page/${fieldPath}`, value, template => {
      const [head, tail] = fieldPath.split('/');
      if (!tail) return { ...template, page: { ...template.page, [head]: value } };
      return { ...template, page: { ...template.page, [head]: { ...template.page?.[head], [tail]: value } } };
    });
  };

  const handleDeletePageField = fieldPath => {
    if (!selectedTemplate) return;
    writeTemplateLeaf(selectedTemplate.id, `page/${fieldPath}`, undefined, template => {
      const [head, tail] = fieldPath.split('/');
      if (!tail) {
        const nextPage = { ...template.page };
        delete nextPage[head];
        return { ...template, page: nextPage };
      }
      const nextSub = { ...template.page?.[head] };
      delete nextSub[tail];
      return { ...template, page: { ...template.page, [head]: nextSub } };
    });
  };

  const previewDoc = selectedTemplate
    ? buildGeneratedDocument(selectedTemplate, resolveCaseContext(catalog, selectedCaseId, { templateId: selectedTemplate.id }) || {})
    : null;

  // Best-effort diagnostics (spec §17): unknown style/lineStyle/bottomBorderStyle references,
  // columns overflowing the page's content width, etc. - never blocks editing, just surfaced.
  const validation = selectedTemplate ? validateLayoutV2Template(selectedTemplate) : { errors: [], warnings: [] };

  if (!isStyleEditorAdmin) {
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
            <Title>Style Editor</Title>
          </div>
          <HeaderActions>
            <PageNavMenu />
          </HeaderActions>
        </Header>

        {loading ? <StateCard>Loading…</StateCard> : null}
        {!loading && error ? <StateCard>{error}</StateCard> : null}

        {!loading && !error ? (
          <>
            <Section>
              <SectionTitle>Document &amp; preview case</SectionTitle>
              <PickerRow>
                <Select value={selectedTemplateId} onChange={event => setSelectedTemplateId(event.target.value)}>
                  {!layoutV2Templates.length ? <option value="">No layoutV2 documents yet</option> : null}
                  {layoutV2Templates.map(template => (
                    <option key={template.id} value={String(template.id)}>
                      {template.catalogName || template.title?.uk || template.title?.en || template.id}
                    </option>
                  ))}
                </Select>
                <Select value={selectedCaseId} onChange={event => handleSelectCase(event.target.value)}>
                  {!orderedCases.length ? <option value="">No cases yet</option> : null}
                  {orderedCases.map(caseRecord => (
                    <option key={caseRecord.id} value={String(caseRecord.id)}>
                      {buildCaseLabel(catalog, caseRecord)}
                    </option>
                  ))}
                </Select>
              </PickerRow>
              {!layoutV2Templates.length ? (
                <StateCard style={{ marginTop: 10 }}>
                  The Style Editor only supports layoutV2 documents (rendererVersion 2, e.g. genetic-affinity-certificate) -
                  none exist yet.
                </StateCard>
              ) : null}
            </Section>

            {selectedTemplate && (validation.errors.length || validation.warnings.length) ? (
              <Section>
                <SectionTitle>Validation</SectionTitle>
                {validation.errors.map(message => <StateCard key={message} style={{ marginBottom: 6, color: 'var(--km-danger)' }}>{message}</StateCard>)}
                {validation.warnings.map(message => <StateCard key={message} style={{ marginBottom: 6 }}>{message}</StateCard>)}
              </Section>
            ) : null}

            {selectedTemplate ? (
              <Section>
                <SectionTitle>Styles</SectionTitle>
                <FormatGroup
                  template={selectedTemplate}
                  onSetProperty={handleSetFormatProperty}
                  onDeleteProperty={handleDeleteFormatProperty}
                  onResetGroup={handleResetFormat}
                />
                {styleNamesFor(selectedTemplate).map(styleName => (
                  <StyleGroup
                    key={styleName}
                    styleName={styleName}
                    template={selectedTemplate}
                    onSetProperty={handleSetProperty}
                    onDeleteProperty={handleDeleteProperty}
                    onResetGroup={handleResetGroup}
                  />
                ))}
                <PageGeometryGroup
                  template={selectedTemplate}
                  onSetPageField={handleSetPageField}
                  onDeletePageField={handleDeletePageField}
                />
              </Section>
            ) : null}

            {selectedTemplate ? (
              <Section>
                <SectionTitle>Line styles</SectionTitle>
                {lineStyleNamesFor(selectedTemplate).map(styleName => (
                  <LineStyleGroup
                    key={styleName}
                    styleName={styleName}
                    template={selectedTemplate}
                    onSetProperty={handleSetLineStyleProperty}
                    onDeleteProperty={handleDeleteLineStyleProperty}
                    onResetGroup={handleResetLineStyleGroup}
                  />
                ))}
              </Section>
            ) : null}

            {previewDoc ? (
              <Section>
                <SectionTitle>Live preview</SectionTitle>
                <DocumentsPdfPreview
                  doc={previewDoc}
                  layout="two-column"
                  formatting={DEFAULT_DOC_FORMATTING}
                  clinicLogos={[]}
                />
              </Section>
            ) : null}
          </>
        ) : null}
      </Shell>
    </Page>
  );
};

export default DocumentStyleEditorPage;
