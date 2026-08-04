import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import toast from 'react-hot-toast';
import { FaChevronDown, FaMapMarkerAlt, FaUndo } from 'react-icons/fa';
import {
  getProfileAge,
  getProfileBio,
  getProfileName,
  getProfilePhotos,
  bmiValue as computeBmiValue,
  normalizeDisplayValue,
} from './profileLayoutConfig';
import { normalizeCountry, normalizeRegion } from './normalizeLocation';
import { getContactEntries } from './contactMethods';
import {
  addContactViewUser,
  addDislikeUser,
  auth,
  lazyLoadProfilePhotos,
  removeDislikeUser,
  updateDataInFiresoreDB,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
} from './config';
import { setDislike, cacheDislikedUsers } from 'utils/dislikesStorage';
import { removeCardFromList } from 'utils/cardsStorage';
import { getOverlayForUserCard, patchOverlayField } from 'utils/multiAccountEdits';
import * as S from './MatchingHiddenList.styled';

const PAGE_SIZE = 20;
const NOTE_TOAST_UNDO_MS = 5000;

const CSECTION_KEYS = ['cSection', 'csection', 'c_section', 'cesareanSection'];
const BIO_KEYS = ['moreInfo_main', 'comment', 'description', 'about', 'bio'];
const UA_COUNTRY_VALUES = new Set(['україна', 'ukraine', 'ua']);

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

const buildOverrideKey = (userId, field) => `${userId}::${field}`;

const resolveCSectionKey = user => CSECTION_KEYS.find(key => normalizeDisplayValue(user?.[key])) || 'csection';
const resolveBioKey = user => BIO_KEYS.find(key => normalizeDisplayValue(user?.[key])) || 'moreInfo_main';

const formatShortYear = value => {
  const match = String(value || '').trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return normalizeDisplayValue(value);
  return `${match[1]}.${match[2]}.${match[3].slice(2)}`;
};

const isValidDeliveryDate = value => /^\d{2}\.\d{2}\.\d{4}$/.test(String(value || '').trim());

const abbreviateRegion = region => {
  const normalized = normalizeRegion(region);
  return normalized ? normalized.replace(/\s+область$/i, ' обл.') : '';
};

const getLocationLine = user => {
  const country = normalizeCountry(normalizeDisplayValue(user?.country));
  const city = normalizeDisplayValue(user?.city);
  const isForeign = Boolean(country) && !UA_COUNTRY_VALUES.has(country.toLowerCase());
  const secondary = isForeign ? country : abbreviateRegion(normalizeDisplayValue(user?.region));
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

const buildGridRows = user => {
  const rows = [];
  GRID_FIELD_DEFS.forEach(def => {
    if (def.combined) {
      const [keyA, keyB] = def.combined;
      const valA = normalizeDisplayValue(user?.[keyA]);
      const valB = normalizeDisplayValue(user?.[keyB]);
      if (!valA && !valB) return;
      rows.push({
        label: def.label,
        parts: valA && valB
          ? [{ field: keyA, value: valA }, { field: keyB, value: valB }]
          : [{ field: valA ? keyA : keyB, value: valA || valB }],
      });
      return;
    }
    const value = normalizeDisplayValue(user?.[def.key]);
    if (!value) return;
    rows.push({ label: def.label, parts: [{ field: def.key, value }] });
  });
  if (rows.length % 2 === 1) {
    rows[rows.length - 1] = { ...rows[rows.length - 1], wide: true };
  }
  return rows;
};

// Admin edits write straight to the canonical users/newUsers record. Non-admin
// ("editor") edits must never touch the live record directly - they are staged
// as a per-editor overlay (multiData/edits/{cardUserId}/{editorUserId}) that an
// admin later accepts or rejects, same as EditProfile.jsx's remoteUpdate().
const saveProfileFieldDirect = async (user, field, value) => {
  const payload = { [field]: value };
  if (user?.__sourceCollection === 'newUsers') {
    await updateDataInNewUsersRTDB(user.userId, payload, 'update');
  } else {
    await updateDataInRealtimeDB(user.userId, payload, 'update');
    await updateDataInFiresoreDB(user.userId, payload, 'update');
  }
};

const saveProfileFieldOverlay = async (user, field, value, editorUserId) => {
  await patchOverlayField({
    editorUserId,
    cardUserId: user.userId,
    fieldName: field,
    change: { from: normalizeDisplayValue(user?.[field]) ?? '', to: value },
  });
};

const EditContext = React.createContext({
  editMode: false,
  isAdmin: false,
  onSave: () => {},
  savingFields: {},
  fieldErrors: {},
  pendingFields: {},
});

const InlineField = ({ user, field, value, displayValue, placeholder, multiline, validate, validationError }) => {
  const { editMode, isAdmin, onSave, savingFields, fieldErrors, pendingFields } = useContext(EditContext);
  const [draft, setDraft] = useState(value || '');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setDraft(value || '');
    setLocalError('');
  }, [value]);

  if (!editMode) return <>{displayValue ?? value}</>;

  const key = buildOverrideKey(user.userId, field);
  const saving = Boolean(savingFields[key]);
  const remoteError = fieldErrors[key];
  const error = localError || remoteError;
  const pending = !isAdmin && Boolean(pendingFields[key]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === (value || '')) return;
    if (validate && trimmed && !validate(trimmed)) {
      setLocalError(validationError || 'Невірний формат');
      return;
    }
    setLocalError('');
    onSave(user, field, trimmed);
  };

  if (multiline) {
    return (
      <span>
        <S.EditableTextarea
          $pending={pending}
          value={draft}
          placeholder={placeholder}
          disabled={saving}
          onClick={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
        />
        {pending && !error && <S.PendingBadge title="Очікує підтвердження адміністратора">на розгляді</S.PendingBadge>}
        {error && <S.FieldError>{error}</S.FieldError>}
      </span>
    );
  }

  return (
    <span>
      <S.EditableInput
        $pending={pending}
        value={draft}
        size={Math.max(2, (draft || placeholder || '').length)}
        placeholder={placeholder}
        disabled={saving}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
      />
      {pending && !error && <S.PendingBadge title="Очікує підтвердження адміністратора">•</S.PendingBadge>}
      {error && <S.FieldError>{error}</S.FieldError>}
    </span>
  );
};

const renderFacts = user => {
  const nodes = [];

  const height = normalizeDisplayValue(user?.height);
  const weight = normalizeDisplayValue(user?.weight);
  if (height || weight) {
    nodes.push(
      <S.Fact key="hw">
        <b>
          {height && <InlineField user={user} field="height" value={height} placeholder="зріст" />}
          {height && weight && '/'}
          {weight && <InlineField user={user} field="weight" value={weight} placeholder="вага" />}
        </b>
      </S.Fact>
    );
  }

  const bmi = computeBmiValue(user);
  if (bmi) {
    nodes.push(
      <S.Fact key="bmi">
        BMI <b><InlineField user={user} field="bmi" value={bmi} /></b>
      </S.Fact>
    );
  }

  const marital = normalizeDisplayValue(user?.maritalStatus);
  if (marital) {
    nodes.push(
      <S.Fact key="marital"><InlineField user={user} field="maritalStatus" value={marital} /></S.Fact>
    );
  }

  const cSectionKey = resolveCSectionKey(user);
  const cSectionValue = normalizeDisplayValue(user?.[cSectionKey]);
  if (cSectionValue) {
    nodes.push(
      <S.Fact key="cs">
        КС <b><InlineField user={user} field={cSectionKey} value={cSectionValue} /></b>
      </S.Fact>
    );
  }

  const blood = normalizeDisplayValue(user?.blood);
  if (blood) {
    nodes.push(<S.Fact key="blood"><InlineField user={user} field="blood" value={blood} /></S.Fact>);
  }

  const ownKids = normalizeDisplayValue(user?.ownKids);
  if (ownKids) {
    const lastDelivery = normalizeDisplayValue(user?.lastDelivery);
    nodes.push(
      <S.Fact key="births">
        пологів <b><InlineField user={user} field="ownKids" value={ownKids} /></b>
        {lastDelivery && (
          <>
            , останні{' '}
            <b>
              <InlineField
                user={user}
                field="lastDelivery"
                value={lastDelivery}
                displayValue={formatShortYear(lastDelivery)}
                placeholder="дд.мм.рррр"
                validate={isValidDeliveryDate}
                validationError="Формат дд.мм.рррр"
              />
            </b>
          </>
        )}
      </S.Fact>
    );
  }

  return nodes;
};

const NoteBlock = ({ user, text }) => {
  const { editMode } = useContext(EditContext);
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    if (editMode || expanded) {
      setOverflowing(false);
      return;
    }
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight - el.clientHeight > 1);
  }, [text, editMode, expanded]);

  if (!text) return null;

  return (
    <>
      <S.Note ref={ref} $clip={!editMode && !expanded}>
        {editMode
          ? <InlineField user={user} field={resolveBioKey(user)} value={text} multiline />
          : text}
      </S.Note>
      {!editMode && overflowing && !expanded && (
        <S.NoteMore onClick={e => { e.stopPropagation(); setExpanded(true); }}>…</S.NoteMore>
      )}
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

const HiddenProfileCard = ({
  user,
  editMode,
  isAdmin,
  expanded,
  onToggleExpand,
  onReturn,
  onFieldSave,
  savingFields,
  fieldErrors,
  pendingFields,
  onContactsOpened,
}) => {
  const name = getProfileName(user);
  const age = getProfileAge(user);
  const location = getLocationLine(user);
  const photos = getProfilePhotos(user);
  const photo = photos[0];
  const bio = getProfileBio(user);
  const gridRows = useMemo(() => buildGridRows(user), [user]);
  const contactEntries = useMemo(
    () => getContactEntries(user).filter(entry => entry.key !== 'vk'),
    [user]
  );
  const totalCount = gridRows.length + contactEntries.length;

  const editContextValue = useMemo(() => ({
    editMode,
    isAdmin,
    onSave: onFieldSave,
    savingFields,
    fieldErrors,
    pendingFields,
  }), [editMode, isAdmin, onFieldSave, savingFields, fieldErrors, pendingFields]);

  const cityValue = normalizeDisplayValue(user?.city);
  const regionValue = normalizeDisplayValue(user?.region);

  return (
    <EditContext.Provider value={editContextValue}>
      <S.Card
        $editMode={editMode}
        onClick={() => { if (!editMode) onToggleExpand(user.userId); }}
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
            <S.Name>
              <InlineField user={user} field="name" value={normalizeDisplayValue(user?.name)} />
              {age && <>, {age}</>}
            </S.Name>
            {(location || (editMode && (cityValue || regionValue))) && (
              <S.Location>
                <FaMapMarkerAlt aria-hidden="true" />
                <span>
                  {editMode ? (
                    <>
                      <InlineField user={user} field="city" value={cityValue} />
                      {(cityValue || regionValue) && ', '}
                      <InlineField user={user} field="region" value={regionValue} />
                    </>
                  ) : location}
                </span>
              </S.Location>
            )}
            <S.FactsRow>{renderFacts(user)}</S.FactsRow>
          </S.Body>
          <S.Ctrl>
            <S.ReturnButton
              type="button"
              title="Повернути в загальний список"
              aria-label="Повернути в загальний список"
              onClick={e => { e.stopPropagation(); onReturn(user); }}
            >
              <FaUndo size={13} />
            </S.ReturnButton>
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

        <NoteBlock user={user} text={bio} />

        {expanded && (
          <S.More onClick={e => e.stopPropagation()}>
            {gridRows.length > 0 && (
              <S.Grid>
                {gridRows.map(row => (
                  <S.GridRow key={row.label} $wide={row.wide}>
                    {row.label}: <b>
                      {row.parts.map((part, idx) => (
                        <React.Fragment key={part.field}>
                          {idx > 0 && ', '}
                          <InlineField user={user} field={part.field} value={part.value} />
                        </React.Fragment>
                      ))}
                    </b>
                  </S.GridRow>
                ))}
              </S.Grid>
            )}
            <ContactsSection user={user} onOpened={onContactsOpened} />
          </S.More>
        )}
      </S.Card>
    </EditContext.Provider>
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
  editMode,
  isAdmin,
  onGoToFeed,
}) => {
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [fieldOverrides, setFieldOverrides] = useState({});
  const [savingFields, setSavingFields] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [pendingFields, setPendingFields] = useState({});
  const [photosByUserId, setPhotosByUserId] = useState({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const photoRequestedRef = useRef(new Set());
  const overlayHydratedRef = useRef(new Set());
  const contactViewKeysRef = useRef(new Set());
  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  // Non-admin editors never write straight to users/newUsers - their edits are
  // staged per-editor and only applied once an admin accepts them elsewhere
  // (EditProfile.jsx). When they open edit mode here, hydrate any of their own
  // still-pending overlay values so they don't lose track of an earlier draft.
  useEffect(() => {
    if (!editMode || isAdmin) return;
    const editorUserId = auth.currentUser?.uid;
    if (!editorUserId) return;
    const candidates = users.filter(user => (
      user?.userId && !overlayHydratedRef.current.has(user.userId)
    ));
    if (!candidates.length) return;
    candidates.forEach(user => {
      overlayHydratedRef.current.add(user.userId);
      getOverlayForUserCard({ editorUserId, cardUserId: user.userId })
        .then(overlay => {
          const fields = overlay?.fields;
          if (!fields || !Object.keys(fields).length) return;
          const overrideValues = {};
          const pendingKeys = {};
          Object.entries(fields).forEach(([fieldName, change]) => {
            if (!change || typeof change !== 'object' || !('to' in change)) return;
            overrideValues[fieldName] = change.to ?? '';
            pendingKeys[buildOverrideKey(user.userId, fieldName)] = true;
          });
          if (!Object.keys(overrideValues).length) return;
          setFieldOverrides(prev => ({
            ...prev,
            [user.userId]: { ...(prev[user.userId] || {}), ...overrideValues },
          }));
          setPendingFields(prev => ({ ...prev, ...pendingKeys }));
        })
        .catch(error => {
          console.error('[MatchingHiddenList] Failed to load pending overlay', error);
        });
    });
  }, [editMode, isAdmin, users]);

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

  const rows = useMemo(() => users
    .filter(user => user?.userId)
    .map(user => {
      const overrides = fieldOverrides[user.userId];
      const photoOverride = photosByUserId[user.userId];
      if (!overrides && !photoOverride) return user;
      return {
        ...user,
        ...(overrides || {}),
        photos: (photoOverride && photoOverride.length) ? photoOverride : user.photos,
      };
    })
    .sort((a, b) => (Number(dislikeUsers[b.userId]) || 0) - (Number(dislikeUsers[a.userId]) || 0)),
  [users, fieldOverrides, photosByUserId, dislikeUsers]);

  const handleFieldSave = useCallback(async (user, field, value) => {
    const userId = user.userId;
    const key = buildOverrideKey(userId, field);
    setFieldOverrides(prev => ({ ...prev, [userId]: { ...(prev[userId] || {}), [field]: value } }));
    setFieldErrors(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSavingFields(prev => ({ ...prev, [key]: true }));
    try {
      if (isAdmin) {
        await saveProfileFieldDirect(user, field, value);
        setPendingFields(prev => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        const editorUserId = auth.currentUser?.uid;
        if (!editorUserId) throw new Error('Not signed in');
        await saveProfileFieldOverlay(user, field, value, editorUserId);
        setPendingFields(prev => ({ ...prev, [key]: true }));
      }
    } catch (error) {
      console.error('[MatchingHiddenList] Failed to save field', field, error);
      setFieldErrors(prev => ({ ...prev, [key]: 'Не вдалося зберегти' }));
    } finally {
      setSavingFields(prev => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [isAdmin]);

  const handleToggleExpand = useCallback(userId => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
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
      {editMode && (
        <S.EditHint>
          {isAdmin
            ? 'Режим редагування: торкніться будь-якого значення, щоб змінити його.'
            : 'Режим редагування: зміни зберігаються як пропозиція та підуть на розгляд адміністратору.'}
        </S.EditHint>
      )}

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
              editMode={editMode}
              isAdmin={isAdmin}
              expanded={expandedIds.has(user.userId)}
              onToggleExpand={handleToggleExpand}
              onReturn={handleReturn}
              onFieldSave={handleFieldSave}
              savingFields={savingFields}
              fieldErrors={fieldErrors}
              pendingFields={pendingFields}
              onContactsOpened={handleContactsOpened}
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
