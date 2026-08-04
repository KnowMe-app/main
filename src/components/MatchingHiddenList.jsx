import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import toast from 'react-hot-toast';
import { FaChevronDown, FaMapMarkerAlt, FaPencilAlt, FaUndo } from 'react-icons/fa';
import {
  getProfileAge,
  getProfileBio,
  getProfileName,
  getProfilePhotos,
  bmiValue as computeBmiValue,
  normalizeDisplayValue,
  maritalStatusLabel,
  getBloodGroupDisplay,
} from './profileLayoutConfig';
import { normalizeCountry, normalizeRegion } from './normalizeLocation';
import { getContactEntries } from './contactMethods';
import {
  addContactViewUser,
  addDislikeUser,
  fetchUserComments,
  lazyLoadProfilePhotos,
  removeDislikeUser,
  saveMyCardComment,
} from './config';
import { setDislike, cacheDislikedUsers } from 'utils/dislikesStorage';
import { loadComments, saveComments, setLocalComment } from 'utils/commentsStorage';
import { removeCardFromList } from 'utils/cardsStorage';
import * as S from './MatchingHiddenList.styled';

const PAGE_SIZE = 20;
const NOTE_TOAST_UNDO_MS = 5000;

const CSECTION_KEYS = ['cSection', 'csection', 'c_section', 'cesareanSection'];
const UA_COUNTRY_VALUES = new Set(['україна', 'ukraine', 'ua']);

// The hidden list's card-expand state is local component state, so it's lost
// whenever the pencil button navigates to the admin-only /edit/:userId route
// and back (a separate route, remounting this component). Persist it across
// that round trip in sessionStorage, same lifetime as the scroll position.
const EXPANDED_IDS_KEY = 'matchingHiddenExpandedIds';
const loadPersistedExpandedIds = () => {
  try {
    const raw = sessionStorage.getItem(EXPANDED_IDS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};
const persistExpandedIds = ids => {
  try {
    sessionStorage.setItem(EXPANDED_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore write errors
  }
};

const CONTACT_LABELS = {
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

const getGradientFor = userId => {
  const [a, b] = INITIAL_GRADIENTS[hashString(userId) % INITIAL_GRADIENTS.length];
  return `linear-gradient(150deg, ${a}, ${b})`;
};

const getInitials = name => {
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

const formatDeliveryDate = raw => {
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

const getLocationLine = user => {
  const country = normalizeCountry(normalizeDisplayValue(user?.country));
  const city = normalizeDisplayValue(user?.city);
  const isForeign = Boolean(country) && !UA_COUNTRY_VALUES.has(country.toLowerCase());
  const secondaryRaw = isForeign ? country : abbreviateRegion(normalizeDisplayValue(user?.region));
  const isDuplicateOfCity = Boolean(city) && Boolean(secondaryRaw)
    && stripCityPrefix(secondaryRaw).toLowerCase() === stripCityPrefix(city).toLowerCase();
  const secondary = isDuplicateOfCity ? '' : secondaryRaw;
  return [city, secondary].filter(Boolean).join(', ');
};

const formatPhoneDisplay = raw => {
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

const getContactLabel = key => CONTACT_LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1));

const GRID_WIDE_VALUE_LENGTH = 22;

const buildGridRows = user => {
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

const renderFacts = user => {
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

  return nodes;
};

// Renders the candidate's self-written description (the "about me" field) as
// read-only, clamped text. Editing it now happens on the full ProfileForm,
// reached via the card's pencil button.
const NoteBlock = ({ text }) => {
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

// The client's own note about why a card was hidden. Batch 32: always
// editable, no page-wide edit mode. A short comment renders straight as an
// auto-height textarea; a long (clamped) one renders as plain clipped text
// first so it doesn't fight the card's tap-to-expand, and the first tap both
// expands it and turns it into a textarea with the caret at the tap point.
const CommentBlock = ({ text, onSave }) => {
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

const ContactsSection = ({ user, onOpened }) => {
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
            if (next) onOpened(user);
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

// A card counts as "unfilled" once its marital status is the only fact it
// has to show - a bare "заміжня"/"не заміжня" isn't informative enough on
// its own to justify a full-size card.
const isWeakOnlyFact = facts => facts.length === 1 && facts[0].key === 'marital';

const HiddenProfileCard = ({
  user,
  isAdmin,
  expanded,
  onToggleExpand,
  onReturn,
  onEditProfile,
  onContactsOpened,
  clientComment,
  onCommentSave,
}) => {
  const name = getProfileName(user);
  const age = getProfileAge(user);
  const location = getLocationLine(user);
  const photos = getProfilePhotos(user);
  const photo = photos[0];
  const bio = getProfileBio(user);
  const facts = useMemo(() => renderFacts(user), [user]);
  const gridRows = useMemo(() => buildGridRows(user), [user]);
  const contactEntries = useMemo(
    () => getContactEntries(user).filter(entry => entry.key !== 'vk'),
    [user]
  );
  const totalCount = gridRows.length + contactEntries.length;

  const hasLocation = Boolean(location);
  const isUnfilled = !hasLocation && (facts.length === 0 || isWeakOnlyFact(facts));

  return (
    <S.Card onClick={() => onToggleExpand(user.userId)}>
      <S.Top>
        <S.Photo
          style={photo
            ? { backgroundImage: `url(${photo})` }
            : { backgroundImage: getGradientFor(user.userId) }}
        >
          {!photo && getInitials(name)}
        </S.Photo>
        <S.Body>
          <S.Name>
            {name}
            {age && <>, {age}</>}
          </S.Name>
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
            <S.ReturnButton
              type="button"
              title="Повернути в загальний список"
              aria-label="Повернути в загальний список"
              onClick={e => { e.stopPropagation(); onReturn(user); }}
            >
              <FaUndo size={13} />
            </S.ReturnButton>
            {isAdmin && (
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
        </S.Ctrl>
      </S.Top>

      <CommentBlock text={clientComment} onSave={value => onCommentSave(user, value)} />

      {expanded && (
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

const SkeletonRows = ({ count }) => (
  <>
    {Array.from({ length: count }).map((_, idx) => (
      // eslint-disable-next-line react/no-array-index-key
      <S.SkeletonRow key={`hidden-skeleton-${idx}`}>
        <S.SkeletonPhoto />
        <S.SkeletonLines>
          <S.SkeletonLine $w="55%" $h="13px" />
          <S.SkeletonLine $w="40%" $h="10px" />
          <S.SkeletonLine $w="85%" $h="10px" />
        </S.SkeletonLines>
      </S.SkeletonRow>
    ))}
  </>
);

const MatchingHiddenList = ({
  ownerId,
  users,
  hasMore,
  loading,
  loadMore,
  dislikeUsers,
  setDislikeUsers,
  ownDislikeUsers,
  setOwnDislikeUsers,
  isAdmin,
  onGoToFeed,
  onEditProfile,
}) => {
  const [expandedIds, setExpandedIds] = useState(() => loadPersistedExpandedIds());
  const [photosByUserId, setPhotosByUserId] = useState({});
  const [commentsByUserId, setCommentsByUserId] = useState({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const photoRequestedRef = useRef(new Set());
  const commentRequestedRef = useRef(new Set());
  const contactViewKeysRef = useRef(new Set());
  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  useEffect(() => {
    const pending = users.filter(user => (
      user?.userId
      && !user.__photosHydrated
      && !photosByUserId[user.userId]
      && !photoRequestedRef.current.has(user.userId)
    ));
    if (!pending.length) return;
    pending.forEach(user => {
      photoRequestedRef.current.add(user.userId);
      lazyLoadProfilePhotos(user.userId, user.__sourceCollection)
        .then(photos => {
          setPhotosByUserId(prev => ({ ...prev, [user.userId]: Array.isArray(photos) ? photos : [] }));
        })
        .catch(() => {
          setPhotosByUserId(prev => ({ ...prev, [user.userId]: [] }));
        });
    });
  }, [users, photosByUserId]);

  // The client's personal note about why a card was hidden lives in
  // multiData/comments/{ownerId}/{cardId} (see config.js's fetchUserComments/
  // saveMyCardComment), not on the profile record itself - same store the
  // full profile card's "Comment" box reads from in Matching.jsx.
  useEffect(() => {
    if (!ownerId) return;
    const pendingIds = users
      .map(user => user?.userId)
      .filter(Boolean)
      .filter(userId => !(userId in commentsByUserId) && !commentRequestedRef.current.has(userId));
    if (!pendingIds.length) return;

    const cachedForOwner = loadComments()[ownerId] || {};
    const fromCache = {};
    const toFetch = [];
    pendingIds.forEach(userId => {
      commentRequestedRef.current.add(userId);
      if (cachedForOwner[userId]) fromCache[userId] = cachedForOwner[userId].text || '';
      else toFetch.push(userId);
    });
    if (Object.keys(fromCache).length) {
      setCommentsByUserId(prev => ({ ...prev, ...fromCache }));
    }
    if (!toFetch.length) return;

    fetchUserComments(ownerId, toFetch)
      .then(result => {
        const textByUserId = {};
        toFetch.forEach(userId => { textByUserId[userId] = result[userId]?.text || ''; });
        setCommentsByUserId(prev => ({ ...prev, ...textByUserId }));
        const allComments = loadComments();
        allComments[ownerId] = { ...(allComments[ownerId] || {}), ...result };
        saveComments(allComments);
      })
      .catch(error => {
        console.error('[MatchingHiddenList] Failed to load comments', error);
        const fallback = {};
        toFetch.forEach(userId => { fallback[userId] = ''; });
        setCommentsByUserId(prev => ({ ...prev, ...fallback }));
      });
  }, [users, ownerId, commentsByUserId]);

  const rows = useMemo(() => users
    .filter(user => user?.userId)
    .map(user => {
      const photoOverride = photosByUserId[user.userId];
      if (!photoOverride || !photoOverride.length) return user;
      return { ...user, photos: photoOverride };
    })
    .sort((a, b) => (Number(dislikeUsers[b.userId]) || 0) - (Number(dislikeUsers[a.userId]) || 0)),
  [users, photosByUserId, dislikeUsers]);

  const handleCommentSave = useCallback(async (user, text) => {
    const userId = user?.userId;
    if (!userId || !ownerId) return;
    setCommentsByUserId(prev => ({ ...prev, [userId]: text }));
    try {
      const res = await saveMyCardComment(userId, text, ownerId);
      setLocalComment(ownerId, userId, text, res?.lastAction);
    } catch (error) {
      console.error('[MatchingHiddenList] Failed to save comment', error);
      toast.error('Не вдалося зберегти коментар');
    }
  }, [ownerId]);

  const handleToggleExpand = useCallback(userId => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      persistExpandedIds(next);
      return next;
    });
  }, []);

  const handleContactsOpened = useCallback(user => {
    if (!user?.userId) return;
    const trackKey = `${ownerId || ''}:${user.userId}`;
    if (contactViewKeysRef.current.has(trackKey)) return;
    contactViewKeysRef.current.add(trackKey);
    void addContactViewUser(user.userId, ownerId);
  }, [ownerId]);

  const handleUndo = useCallback((user, previousDislikedAt) => {
    const userId = user?.userId;
    if (!userId || !ownerId) return;
    const timestamp = typeof previousDislikedAt === 'number' ? previousDislikedAt : Date.now();
    setDislikeUsers(prev => ({ ...prev, [userId]: timestamp }));
    if (setOwnDislikeUsers) {
      setOwnDislikeUsers(prev => ({ ...(prev || {}), [userId]: timestamp }));
    }
    setDislike(userId, true);
    cacheDislikedUsers({ [userId]: user });
    addDislikeUser(userId, ownerId, timestamp).catch(error => {
      console.error('[MatchingHiddenList] Failed to restore dislike:', error);
    });
  }, [ownerId, setDislikeUsers, setOwnDislikeUsers]);

  const handleReturn = useCallback(user => {
    const userId = user?.userId;
    if (!userId || !ownerId) return;
    const previousDislikedAt = dislikeUsers[userId];

    setDislikeUsers(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    if (setOwnDislikeUsers) {
      setOwnDislikeUsers(prev => {
        const next = { ...(prev || {}) };
        delete next[userId];
        return next;
      });
    }
    setDislike(userId, false);
    removeCardFromList(userId, 'dislike');
    removeDislikeUser(userId, ownerId).catch(error => {
      console.error('[MatchingHiddenList] Failed to remove dislike:', error);
    });

    toast.custom(t => (
      <S.ToastWrap>
        <span>Анкету повернуто</span>
        <S.ToastUndo
          onClick={() => {
            handleUndo(user, previousDislikedAt);
            toast.dismiss(t.id);
          }}
        >
          Скасувати
        </S.ToastUndo>
      </S.ToastWrap>
    ), { duration: NOTE_TOAST_UNDO_MS });
  }, [dislikeUsers, handleUndo, ownerId, setDislikeUsers, setOwnDislikeUsers]);

  const fetchNextPage = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    setLoadError(false);
    try {
      await loadMoreRef.current({
        currentVisibleCount: rows.length,
        targetVisibleCount: rows.length + PAGE_SIZE,
        limit: PAGE_SIZE,
      });
    } catch (error) {
      console.error('[MatchingHiddenList] Failed to load more hidden profiles', error);
      setLoadError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, rows.length]);

  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        fetchNextPage();
      }
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasMore]);

  useEffect(() => {
    if (!loading && !isLoadingMore && !loadError && hasMore && rows.length > 0 && rows.length < PAGE_SIZE) {
      fetchNextPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, hasMore, loading, isLoadingMore, loadError]);

  const showInitialSkeleton = loading && rows.length === 0;
  const showEmptyState = !loading && !showInitialSkeleton && rows.length === 0 && !loadError;

  return (
    <S.Wrap>
      {showEmptyState ? (
        <S.EmptyState>
          <S.EmptyStateTitle>Тут поки порожньо</S.EmptyStateTitle>
          <S.EmptyStateText>Тут зберігаються анкети, які ви прибрали зі стрічки.</S.EmptyStateText>
          {onGoToFeed && (
            <S.EmptyStateButton type="button" onClick={onGoToFeed}>До стрічки</S.EmptyStateButton>
          )}
        </S.EmptyState>
      ) : (
        <S.List>
          {rows.map(user => (
            <HiddenProfileCard
              key={user.userId}
              user={user}
              isAdmin={isAdmin}
              expanded={expandedIds.has(user.userId)}
              onToggleExpand={handleToggleExpand}
              onReturn={handleReturn}
              onEditProfile={onEditProfile}
              onContactsOpened={handleContactsOpened}
              clientComment={commentsByUserId[user.userId] || ''}
              onCommentSave={handleCommentSave}
            />
          ))}

          {showInitialSkeleton && <SkeletonRows count={4} />}
          {!showInitialSkeleton && isLoadingMore && <SkeletonRows count={2} />}

          {loadError && (
            <S.ErrorRow>
              Не вдалося завантажити
              <S.RetryButton type="button" onClick={fetchNextPage}>Спробувати ще</S.RetryButton>
            </S.ErrorRow>
          )}

          <S.Sentinel ref={sentinelRef} />

          {!hasMore && rows.length > 0 && (
            <S.FooterNote>Приховані анкети бачите тільки ви</S.FooterNote>
          )}
        </S.List>
      )}
    </S.Wrap>
  );
};

export default MatchingHiddenList;
