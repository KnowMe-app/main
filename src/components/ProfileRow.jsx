import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FaChevronDown, FaMapMarkerAlt, FaPencilAlt } from 'react-icons/fa';
import {
  getProfileAge,
  getProfileBio,
  getProfileName,
  getProfilePhotos,
  bmiValue as computeBmiValue,
  normalizeDisplayValue,
  maritalStatusLabel,
  getBloodGroupDisplay,
  getProfileRole,
  getRoleCode,
  getRoleLabel,
} from './profileLayoutConfig';
import { normalizeCountry, normalizeRegion } from './normalizeLocation';
import { getContactEntries } from './contactMethods';
import * as S from './MatchingHiddenList.styled';

// The one profile row shared by the hidden-list screen and the matching feed's
// list mode (spec §0/§5). It owns the row's visual structure only - avatar,
// identity line, the italic metrics line, the comment block and the expandable
// detail section. Everything stateful about a *collection* (what the primary
// action does, where comments are stored, how pages are fetched) stays with the
// caller and arrives through props.

const CSECTION_KEYS = ['cSection', 'csection', 'c_section', 'cesareanSection'];
const UA_COUNTRY_VALUES = new Set(['україна', 'ukraine', 'ua']);

export const CONTACT_LABELS = {
  phone: 'Телефон',
  email: 'Пошта',
  telegram: 'Telegram',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  viber: 'Viber',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  twitter: 'X',
  website: 'Сайт',
  otherLink: 'Посилання',
  ameblo: 'Ameblo',
};

const GRID_FIELD_DEFS = [
  { key: 'education', label: 'Освіта' },
  { key: 'clothingSize', label: 'Одяг' },
  { key: 'shoeSize', label: 'Взуття' },
  { key: 'race', label: 'Раса' },
  { key: 'eyeColor', label: 'Очі' },
  { key: 'hair', label: 'Волосся', combined: ['hairColor', 'hairStructure'] },
  { key: 'faceShape', label: 'Обличчя' },
  { key: 'noseShape', label: 'Ніс' },
  { key: 'lipsShape', label: 'Губи' },
  { key: 'chin', label: 'Підборіддя' },
  { key: 'bodyType', label: 'Фігура' },
];

const INITIAL_GRADIENTS = [
  ['#E68DA2', '#C9455F'],
  ['#D9A56B', '#B87A3F'],
  ['#C98A6A', '#9C5B3E'],
  ['#C0A9C6', '#8A6E96'],
  ['#A8B49B', '#6F8266'],
  ['#9FB4C6', '#657E93'],
  ['#C8B79E', '#9E8563'],
  ['#8FA9A0', '#5C7A70'],
];

const hashString = value => {
  let hash = 0;
  const str = String(value || '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
};

export const getGradientFor = userId => {
  const [a, b] = INITIAL_GRADIENTS[hashString(userId) % INITIAL_GRADIENTS.length];
  return `linear-gradient(150deg, ${a}, ${b})`;
};

export const getInitials = name => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const resolveCSectionKey = user => CSECTION_KEYS.find(key => normalizeDisplayValue(user?.[key])) || 'csection';

const pad2 = value => String(value).padStart(2, '0');

// Delivery dates come in from different sources in different shapes - ISO
// (from newer records), dotted dd.mm.yyyy/dd.mm.yy, or slashed dd/mm/yyyy.
// Parse whichever one matches and always render dd.mm.yy.
const parseDeliveryDate = raw => {
  const value = String(raw || '').trim();
  if (!value) return null;
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return { d: match[3], mo: match[2], y: match[1] };
  match = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (match) return { d: pad2(match[1]), mo: pad2(match[2]), y: match[3] };
  match = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2})$/);
  if (match) return { d: pad2(match[1]), mo: pad2(match[2]), y: `20${match[3]}` };
  return null;
};

export const formatDeliveryDate = raw => {
  const parsed = parseDeliveryDate(raw);
  return parsed ? `${parsed.d}.${parsed.mo}.${parsed.y.slice(2)}` : '';
};

const CSECTION_ZERO_VALUES = new Set(['не було', 'немає', 'no', '-', '0']);
const formatCSectionValue = raw => {
  const trimmed = String(raw || '').trim();
  return CSECTION_ZERO_VALUES.has(trimmed.toLowerCase()) ? '0' : trimmed;
};

const OTHER_VALUES = new Set(['other', 'інше', 'иное']);
const isOtherValue = value => OTHER_VALUES.has(String(value || '').trim().toLowerCase());

const abbreviateRegion = region => {
  const normalized = normalizeRegion(region);
  return normalized ? normalized.replace(/\s+область$/i, ' обл.') : '';
};

const stripCityPrefix = value => String(value || '').trim().replace(/^(м\.?\s+|місто\s+)/i, '').trim();

export const getLocationLine = user => {
  const country = normalizeCountry(normalizeDisplayValue(user?.country));
  const city = normalizeDisplayValue(user?.city);
  const isForeign = Boolean(country) && !UA_COUNTRY_VALUES.has(country.toLowerCase());
  const secondaryRaw = isForeign ? country : abbreviateRegion(normalizeDisplayValue(user?.region));
  const isDuplicateOfCity = Boolean(city) && Boolean(secondaryRaw)
    && stripCityPrefix(secondaryRaw).toLowerCase() === stripCityPrefix(city).toLowerCase();
  const secondary = isDuplicateOfCity ? '' : secondaryRaw;
  return [city, secondary].filter(Boolean).join(', ');
};

export const formatPhoneDisplay = raw => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/\s/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return trimmed;
  if (digits.length === 12 && digits.startsWith('380')) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
  }
  return trimmed.startsWith('+') ? trimmed : `+${digits}`;
};

export const getContactLabel = key => CONTACT_LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1));

const GRID_WIDE_VALUE_LENGTH = 22;

export const buildGridRows = user => {
  const rows = [];
  GRID_FIELD_DEFS.forEach(def => {
    if (def.combined) {
      const [keyA, keyB] = def.combined;
      const valA = normalizeDisplayValue(user?.[keyA]);
      const valB = normalizeDisplayValue(user?.[keyB]);
      const parts = [];
      if (valA && !isOtherValue(valA)) parts.push({ field: keyA, value: valA });
      if (valB && !isOtherValue(valB)) parts.push({ field: keyB, value: valB });
      if (!parts.length) return;
      rows.push({ label: def.label, parts });
      return;
    }
    const value = normalizeDisplayValue(user?.[def.key]);
    if (!value || isOtherValue(value)) return;
    rows.push({ label: def.label, parts: [{ field: def.key, value }] });
  });
  rows.forEach(row => {
    const valueLength = row.parts.map(part => part.value).join(', ').length;
    if (valueLength > GRID_WIDE_VALUE_LENGTH) row.wide = true;
  });
  if (rows.length % 2 === 1) {
    rows[rows.length - 1] = { ...rows[rows.length - 1], wide: true };
  }
  return rows;
};

// The metrics line: `172/59 BMI 20 не заміжня O+ пологів 1, останні 21.02.23`.
// Spec §5 asks that the fields an active filter narrowed on come first, so the
// caller passes those metric keys and everything else keeps the default order.
export const renderFacts = (user, priorityKeys = []) => {
  const nodes = [];

  const height = normalizeDisplayValue(user?.height);
  const weight = normalizeDisplayValue(user?.weight);
  if (height || weight) {
    nodes.push(
      <S.Fact key="hw">
        <b>{height}{height && weight && '/'}{weight}</b>
      </S.Fact>
    );
  }

  const bmi = computeBmiValue(user);
  if (bmi) {
    nodes.push(
      <S.Fact key="bmi">
        BMI <b>{bmi}</b>
      </S.Fact>
    );
  }

  const maritalDisplay = maritalStatusLabel(normalizeDisplayValue(user?.maritalStatus));
  if (maritalDisplay) {
    nodes.push(<S.Fact key="marital">{maritalDisplay}</S.Fact>);
  }

  const cSectionKey = resolveCSectionKey(user);
  const cSectionValue = normalizeDisplayValue(user?.[cSectionKey]);
  if (cSectionValue) {
    nodes.push(
      <S.Fact key="cs">
        КС <b>{formatCSectionValue(cSectionValue)}</b>
      </S.Fact>
    );
  }

  const bloodDisplay = getBloodGroupDisplay(user);
  if (bloodDisplay) {
    nodes.push(<S.Fact key="blood">{bloodDisplay}</S.Fact>);
  }

  const ownKids = normalizeDisplayValue(user?.ownKids);
  if (ownKids) {
    const isZeroBirths = /^0+$/.test(ownKids.trim());
    if (isZeroBirths) {
      nodes.push(<S.Fact key="births">без пологів</S.Fact>);
    } else {
      const formattedDate = formatDeliveryDate(normalizeDisplayValue(user?.lastDelivery));
      nodes.push(
        <S.Fact key="births">
          пологів <b>{ownKids}</b>
          {formattedDate && <>, останні <b>{formattedDate}</b></>}
        </S.Fact>
      );
    }
  }

  if (!priorityKeys.length) return nodes;

  const rank = node => {
    const index = priorityKeys.indexOf(node.key);
    return index === -1 ? priorityKeys.length : index;
  };
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => rank(a.node) - rank(b.node) || a.index - b.index)
    .map(entry => entry.node);
};

// Renders the candidate's self-written description (the "about me" field) as
// read-only, clamped text. Editing it now happens on the full ProfileForm,
// reached via the row's pencil button.
export const NoteBlock = ({ text }) => {
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    if (expanded) {
      setOverflowing(false);
      return;
    }
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight - el.clientHeight > 1);
  }, [text, expanded]);

  if (!text) return null;

  return (
    <>
      <S.SelfDescription ref={ref} $clip={!expanded}>{text}</S.SelfDescription>
      {overflowing && !expanded && (
        <S.NoteMore onClick={e => { e.stopPropagation(); setExpanded(true); }}>…</S.NoteMore>
      )}
    </>
  );
};

export const ContactsSection = ({ user, onOpened }) => {
  const entries = useMemo(
    () => getContactEntries(user).filter(entry => entry.key !== 'vk'),
    [user]
  );
  const [open, setOpen] = useState(false);

  if (!entries.length) return null;

  return (
    <S.ContactsBlock>
      <S.ContactsHeader
        type="button"
        onClick={() => {
          setOpen(current => {
            const next = !current;
            if (next && onOpened) onOpened(user);
            return next;
          });
        }}
      >
        Контакти
        {!open && <S.ContactsStatus>показати</S.ContactsStatus>}
      </S.ContactsHeader>
      {open && (
        <S.ContactsBody>
          {entries.map(entry => (
            <S.ContactRow
              key={`${entry.key}-${entry.index}`}
              href={entry.href}
              target={entry.key === 'phone' || entry.key === 'email' ? undefined : '_blank'}
              rel={entry.key === 'phone' || entry.key === 'email' ? undefined : 'noopener noreferrer'}
            >
              <span>{getContactLabel(entry.key)}</span>
              {entry.key === 'phone' ? formatPhoneDisplay(entry.value) : entry.value}
            </S.ContactRow>
          ))}
        </S.ContactsBody>
      )}
    </S.ContactsBlock>
  );
};

const COMMENT_SAVE_DEBOUNCE_MS = 800;

// Best-effort caret placement: the plain-text paragraph renders `text` as a
// single text node with the same font/width as the textarea it turns into,
// so a caret range resolved against the click point maps directly onto an
// offset within that same string.
const getCaretOffsetFromClick = e => {
  const { clientX, clientY } = e;
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(clientX, clientY);
    return range ? range.startOffset : null;
  }
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(clientX, clientY);
    return pos ? pos.offset : null;
  }
  return null;
};

const autoResizeTextarea = el => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

// The client's own note about a row. Always editable, no page-wide edit mode.
// A short comment renders straight as an auto-height textarea; a long (clamped)
// one renders as plain clipped text first so it doesn't fight the row's
// tap-to-expand, and the first tap both expands it and turns it into a textarea
// with the caret at the tap point.
export const CommentBlock = ({ text, onSave }) => {
  const measureRef = useRef(null);
  const textareaRef = useRef(null);
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef(text || '');
  const pendingCaretRef = useRef(null);
  const [draft, setDraft] = useState(text || '');
  const [measureText, setMeasureText] = useState(text || '');
  const [mode, setMode] = useState('input');

  useEffect(() => {
    lastSavedRef.current = text || '';
    setDraft(text || '');
    setMeasureText(text || '');
  }, [text]);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) { setMode('input'); return; }
    setMode(el.scrollHeight - el.clientHeight > 1 ? 'clamped' : 'input');
  }, [measureText]);

  useLayoutEffect(() => {
    if (mode === 'input') autoResizeTextarea(textareaRef.current);
  }, [mode, draft]);

  useLayoutEffect(() => {
    if (mode !== 'input' || pendingCaretRef.current == null) return;
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      const pos = Math.min(pendingCaretRef.current, ta.value.length);
      ta.setSelectionRange(pos, pos);
    }
    pendingCaretRef.current = null;
  }, [mode]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const commit = useCallback(value => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (value === lastSavedRef.current) return;
    lastSavedRef.current = value;
    onSave(value);
  }, [onSave]);

  const scheduleSave = value => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => commit(value), COMMENT_SAVE_DEBOUNCE_MS);
  };

  if (mode === 'clamped') {
    return (
      <S.Note
        ref={measureRef}
        $clip
        onClick={e => {
          e.stopPropagation();
          pendingCaretRef.current = getCaretOffsetFromClick(e) ?? draft.length;
          setMode('input');
        }}
      >
        {text}
      </S.Note>
    );
  }

  return (
    <>
      <S.CommentInput
        ref={textareaRef}
        rows={1}
        value={draft}
        placeholder="Додати коментар"
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onChange={e => {
          const { value } = e.target;
          setDraft(value);
          autoResizeTextarea(e.target);
          scheduleSave(value);
        }}
        onBlur={e => {
          commit(e.target.value);
          setMeasureText(e.target.value);
        }}
      />
      <S.Note ref={measureRef} $clip $hidden aria-hidden="true">{measureText}</S.Note>
    </>
  );
};

// ---------------------------------------------------------------------------
// Public profile comment (spec §8)
//
// A record about a third party that every user of the base can read, signed with
// the author's own name. The affordance is a line of muted text; a click turns it
// into a borderless auto-growing field. It saves on blur, discards on Esc, and
// commits + blurs on Ctrl/Cmd+Enter. An empty field writes nothing at all.

const COMMENT_MIN_ROWS = 1;
const COMMENT_MAX_ROWS = 6;
const COMMENT_SAVED_STATUS_MS = 3000;
export const PUBLIC_COMMENT_VISIBILITY_NOTE = 'Загальнодоступний коментар';

const autoGrowComment = el => {
  if (!el) return;
  const style = window.getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || 18;
  const vertical = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  el.style.height = 'auto';
  const maxHeight = lineHeight * COMMENT_MAX_ROWS + vertical;
  const minHeight = lineHeight * COMMENT_MIN_ROWS + vertical;
  const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
};

const formatCommentClock = timestamp => {
  const date = new Date(timestamp || Date.now());
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const formatCommentDate = timestamp => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getFullYear()).slice(2)}`;
};

const CommentComposer = ({ initialText, onCancel, onCommit }) => {
  const ref = useRef(null);
  const cancelledRef = useRef(false);
  const [draft, setDraft] = useState(initialText || '');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
    autoGrowComment(el);
  }, []);

  return (
    <S.CommentEditor onClick={e => e.stopPropagation()}>
      <S.CommentEditorHead>
        <span>{PUBLIC_COMMENT_VISIBILITY_NOTE}</span>
      </S.CommentEditorHead>
      <S.PublicCommentInput
        ref={ref}
        rows={COMMENT_MIN_ROWS}
        value={draft}
        onTouchStart={e => e.stopPropagation()}
        onChange={e => {
          setDraft(e.target.value);
          autoGrowComment(e.target);
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelledRef.current = true;
            onCancel();
            return;
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onCommit(e.target.value);
          }
        }}
        onBlur={e => {
          if (cancelledRef.current) return;
          onCommit(e.target.value);
        }}
      />
    </S.CommentEditor>
  );
};

export const PublicCommentBlock = ({
  profileId,
  comments = [],
  viewerId,
  // Адмін відповідає за публічні записи про третіх осіб, тож редагує і знімає
  // будь-який із них, не тільки власний.
  canModerate = false,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [failedNotice, setFailedNotice] = useState('');
  // Видалення публічного запису питає підтвердження в тому самому рядку —
  // випадковий дотик до хрестика не мусить коштувати чужого коментаря.
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  // Optimistic rows: rendered straight away, and kept - with their text - if the
  // write fails, so a failure never costs what was typed.
  const [pending, setPending] = useState([]);

  useEffect(() => {
    if (!savedAt) return undefined;
    const timer = setTimeout(() => setSavedAt(0), COMMENT_SAVED_STATUS_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const removeComment = useCallback(async commentId => {
    setConfirmingDelete(null);
    setFailedNotice('');
    if (!onDelete) return;
    try {
      await onDelete(profileId, commentId);
    } catch {
      setFailedNotice('Не вдалось видалити — спробуйте ще раз');
    }
  }, [onDelete, profileId]);

  const submit = useCallback(async (draftId, text, commentId) => {
    const trimmed = String(text || '').trim();
    setEditing(null);
    if (!trimmed) {
      setPending(prev => prev.filter(entry => entry.id !== draftId));
      // Стертий текст існуючого запису — це і є його видалення: інакше
      // коментар нічим не прибрати, і він лишався б назавжди.
      if (commentId) await removeComment(commentId);
      return;
    }

    setPending(prev => {
      const next = prev.filter(entry => entry.id !== draftId);
      if (commentId) return next;
      return [...next, { id: draftId, text: trimmed, authorId: viewerId, createdAt: Date.now(), failed: false }];
    });

    try {
      if (commentId) await onUpdate(profileId, commentId, trimmed);
      else await onCreate(profileId, trimmed);
      setPending(prev => prev.filter(entry => entry.id !== draftId));
      setSavedAt(Date.now());
    } catch {
      // The text stays on screen with a retry next to it - a failed write must
      // never cost what was typed.
      const failedEntry = {
        id: draftId,
        text: trimmed,
        authorId: viewerId,
        createdAt: Date.now(),
        failed: true,
        commentId,
      };
      setPending(prev => (prev.some(entry => entry.id === draftId)
        ? prev.map(entry => (entry.id === draftId ? { ...entry, ...failedEntry } : entry))
        : [...prev, failedEntry]));
    }
  }, [onCreate, onUpdate, profileId, removeComment, viewerId]);

  const rows = useMemo(() => [...comments, ...pending], [comments, pending]);
  const storedIds = useMemo(() => new Set(comments.map(comment => comment.id)), [comments]);
  const visibleRows = expanded ? rows : rows.slice(0, 2);

  return (
    <S.PublicComments onClick={e => e.stopPropagation()}>
      {visibleRows.map(comment => {
        const isOwn = Boolean(viewerId) && comment.authorId === viewerId;
        const canEdit = isOwn || canModerate;
        // Знімати можна лише те, що вже лежить у базі: оптимістичний рядок
        // прибирає сам запис, а не видалення.
        const canRemove = canEdit && Boolean(onDelete) && storedIds.has(comment.id);
        const isEditingThis = editing?.commentId === comment.id;
        if (isEditingThis) {
          return (
            <CommentComposer
              key={comment.id}
              initialText={comment.text}
              onCancel={() => setEditing(null)}
              onCommit={text => submit(editing.draftId, text, comment.id)}
            />
          );
        }
        return (
          <S.CommentEntry
            key={comment.id}
            $failed={comment.failed}
            $editable={canEdit}
            onClick={() => {
              // Spec §8: someone else's record opens, it never becomes editable -
              // окрім адміна, який за ці записи відповідає.
              if (canEdit) setEditing({ commentId: comment.id, draftId: comment.id });
              else setExpanded(true);
            }}
          >
            <S.CommentMeta>
              <b>{getInitials(comment.authorName) || '—'}</b>
              <span>{formatCommentDate(comment.createdAt)}</span>
              {comment.failed && (
                <S.CommentRetry
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    void submit(comment.id, comment.text, comment.commentId);
                  }}
                >
                  Повторити
                </S.CommentRetry>
              )}
              {canRemove && (
                <S.CommentDelete
                  type="button"
                  $confirming={confirmingDelete === comment.id}
                  aria-label={confirmingDelete === comment.id ? 'Підтвердити видалення' : 'Видалити коментар'}
                  onClick={e => {
                    e.stopPropagation();
                    if (confirmingDelete === comment.id) void removeComment(comment.id);
                    else setConfirmingDelete(comment.id);
                  }}
                >
                  {confirmingDelete === comment.id ? 'Видалити?' : '×'}
                </S.CommentDelete>
              )}
            </S.CommentMeta>
            <S.CommentText $clip={!expanded}>{comment.text}</S.CommentText>
          </S.CommentEntry>
        );
      })}

      {rows.length > 2 && (
        <S.CommentsMoreButton
          type="button"
          $open={expanded}
          onClick={() => setExpanded(open => !open)}
          aria-expanded={expanded}
        >
          <b>{rows.length}</b>
          <FaChevronDown size={10} />
        </S.CommentsMoreButton>
      )}

      {editing?.commentId === null ? (
        <CommentComposer
          initialText=""
          onCancel={() => setEditing(null)}
          onCommit={text => submit(editing.draftId, text, null)}
        />
      ) : !editing && (
        <S.AddCommentTrigger
          role="button"
          tabIndex={0}
          onClick={() => setEditing({ commentId: null, draftId: `draft-${Date.now()}` })}
          onKeyDown={e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            setEditing({ commentId: null, draftId: `draft-${Date.now()}` });
          }}
        >
          Додати коментар
        </S.AddCommentTrigger>
      )}

      {failedNotice && <S.CommentStatus aria-live="polite">{failedNotice}</S.CommentStatus>}

      {savedAt > 0 && (
        <S.CommentStatus aria-live="polite">Збережено {formatCommentClock(savedAt)}</S.CommentStatus>
      )}
    </S.PublicComments>
  );
};

// A row counts as "unfilled" once its marital status is the only fact it has to
// show - a bare "заміжня"/"не заміжня" isn't informative enough on its own.
const isWeakOnlyFact = facts => facts.length === 1 && facts[0].key === 'marital';

// Spec §7: in the feed the like/hide actions are a row swipe - right adds to
// favourites, left hides - so the reader can triage without opening anything.
const SWIPE_DISTANCE_PX = 72;
const SWIPE_DOMINANCE = 1.35;

const ProfileRow = ({
  user,
  isAdmin,
  expanded,
  onToggleExpand,
  onOpen,
  onEditProfile,
  onContactsOpened,
  clientComment,
  onCommentSave,
  primaryAction,
  secondaryAction,
  priorityMetricKeys,
  commentSlot,
  diagnosticsSlot,
  onSwipeRight,
  onSwipeLeft,
}) => {
  // A limited profile is the projection a viewer without full access gets back
  // from a search: surname, name, age, region, city, and the public comment. There
  // is nothing else to expand into, so the row drops the metrics line, the detail
  // chevron, the edit button and the swipe actions rather than showing them empty.
  //
  // Відкрити її при цьому можна. Раніше — ні, і на дотик рядок не робив рівно
  // нічого: жодної реакції, жодного пояснення — картка виглядала зламаною. Шар
  // деталей показує ту саму проєкцію, але з фото на весь екран, тож дотик має
  // що відкрити.
  const isLimited = user?.__limitedProfile === true;
  const name = getProfileName(user);
  const rowRole = getProfileRole(user);
  const roleCode = getRoleCode(rowRole);
  const age = getProfileAge(user);
  const location = getLocationLine(user);
  const photos = getProfilePhotos(user);
  const photo = photos[0];
  const bio = getProfileBio(user);
  const facts = useMemo(
    () => (isLimited ? [] : renderFacts(user, priorityMetricKeys || [])),
    [isLimited, user, priorityMetricKeys]
  );
  const gridRows = useMemo(() => (isLimited ? [] : buildGridRows(user)), [isLimited, user]);
  const contactEntries = useMemo(
    () => (isLimited ? [] : getContactEntries(user).filter(entry => entry.key !== 'vk')),
    [isLimited, user]
  );
  const totalCount = gridRows.length + contactEntries.length;

  const hasLocation = Boolean(location);
  const isUnfilled = !isLimited && !hasLocation && (facts.length === 0 || isWeakOnlyFact(facts));

  const touchStartRef = useRef(null);
  const swipedRef = useRef(false);

  const handleTouchStart = e => {
    if (!e.touches || e.touches.length !== 1) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = e => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || !e.changedTouches || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < SWIPE_DISTANCE_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_DOMINANCE) return;
    const handler = dx > 0 ? onSwipeRight : onSwipeLeft;
    if (!handler || isLimited) return;
    // The gesture ends in a click event too; swallow that one so a swipe never
    // also opens the card.
    swipedRef.current = true;
    handler(user);
  };

  const handleRowClick = () => {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    // Розгортати рядок урізаної проєкції нема чим — метрик і контактів у ній
    // немає, — тож дотик веде тільки в шар деталей.
    if (isLimited) {
      if (onOpen) onOpen(user);
      return;
    }
    if (onOpen) onOpen(user);
    else if (onToggleExpand) onToggleExpand(user.userId);
  };

  return (
    <S.Card
      onClick={handleRowClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <S.Top>
        <S.Photo
          style={photo
            ? { backgroundImage: `url(${photo})` }
            : { backgroundImage: getGradientFor(user.userId) }}
        >
          {!photo && getInitials(name)}
        </S.Photo>
        <S.Body>
          <S.NameRow>
            <S.Name>
              {name}
              {age && <>, {age}</>}
            </S.Name>
            {roleCode && <S.RoleCode title={getRoleLabel(rowRole)}>{roleCode}</S.RoleCode>}
          </S.NameRow>
          {hasLocation && (
            <S.Location>
              <FaMapMarkerAlt aria-hidden="true" />
              <span>{location}</span>
            </S.Location>
          )}
          {!isUnfilled && facts.length > 0 ? (
            <S.FactsRow>
              {facts.map((node, idx) => (
                <React.Fragment key={node.key}>
                  {idx > 0 && ' '}
                  {node}
                </React.Fragment>
              ))}
            </S.FactsRow>
          ) : isUnfilled && (
            <S.EmptyNote>Анкета не заповнена</S.EmptyNote>
          )}
        </S.Body>
        <S.Ctrl>
          <S.TopButtonsRow>
            {primaryAction && !isLimited && (
              <S.RowActionButton
                type="button"
                $accent={Boolean(primaryAction.accent)}
                $on={Boolean(primaryAction.active)}
                title={primaryAction.title}
                aria-label={primaryAction.title}
                aria-pressed={primaryAction.active}
                onClick={e => { e.stopPropagation(); primaryAction.onClick(user); }}
              >
                {primaryAction.icon}
              </S.RowActionButton>
            )}
            {secondaryAction && !isLimited && (
              <S.RowActionButton
                type="button"
                $accent={Boolean(secondaryAction.accent)}
                $on={Boolean(secondaryAction.active)}
                title={secondaryAction.title}
                aria-label={secondaryAction.title}
                aria-pressed={secondaryAction.active}
                onClick={e => { e.stopPropagation(); secondaryAction.onClick(user); }}
              >
                {secondaryAction.icon}
              </S.RowActionButton>
            )}
            {isAdmin && onEditProfile && !isLimited && (
              <S.EditButton
                type="button"
                title="Редагувати анкету"
                aria-label="Редагувати анкету"
                onClick={e => { e.stopPropagation(); onEditProfile(user); }}
              >
                <FaPencilAlt size={12} />
              </S.EditButton>
            )}
          </S.TopButtonsRow>
          {!isLimited && (
          <S.ChevronButton
            type="button"
            $open={expanded}
            aria-label="Показати всі дані"
            title="Показати всі дані"
            onClick={e => { e.stopPropagation(); onToggleExpand(user.userId); }}
          >
            <b>{totalCount}</b>
            <FaChevronDown size={11} />
          </S.ChevronButton>
          )}
        </S.Ctrl>
      </S.Top>

      {commentSlot !== undefined
        ? commentSlot
        : <CommentBlock text={clientComment} onSave={value => onCommentSave(user, value)} />}

      {diagnosticsSlot}

      {expanded && !isLimited && (
        <S.More onClick={e => e.stopPropagation()}>
          {gridRows.length > 0 && (
            <S.Grid>
              {gridRows.map(row => (
                <S.GridRow key={row.label} $wide={row.wide}>
                  {row.label}: <b>{row.parts.map(part => part.value).join(', ')}</b>
                </S.GridRow>
              ))}
            </S.Grid>
          )}
          <NoteBlock text={bio} />
          <ContactsSection user={user} onOpened={onContactsOpened} />
        </S.More>
      )}
    </S.Card>
  );
};

// Spec §10: rows only re-render when their identity or their last write moved.
// The object identity check carries the photo hydration, which lands as a new
// user object without touching updatedAt; the caller memoises the row array, so
// identity is stable across renders that changed nothing about this row.
export default React.memo(ProfileRow, (prev, next) => (
  prev.user?.userId === next.user?.userId
  && prev.user?.updatedAt === next.user?.updatedAt
  && prev.user === next.user
  && prev.expanded === next.expanded
  && prev.clientComment === next.clientComment
  && prev.isAdmin === next.isAdmin
  && prev.primaryAction?.active === next.primaryAction?.active
  && prev.secondaryAction?.active === next.secondaryAction?.active
  && prev.priorityMetricKeys === next.priorityMetricKeys
  && prev.commentSlot === next.commentSlot
  && prev.diagnosticsSlot === next.diagnosticsSlot
  && prev.onSwipeRight === next.onSwipeRight
  && prev.onSwipeLeft === next.onSwipeLeft
));
