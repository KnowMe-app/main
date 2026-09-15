import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FaArrowRight, FaChevronDown, FaMapMarkerAlt, FaPencilAlt, FaRegCommentDots } from 'react-icons/fa';
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
} from './profileLayoutConfig';
import { normalizeCountry, normalizeRegion } from './normalizeLocation';
import { profileUiText, resolveProfileLanguage, translateProfileLabel } from '../utils/profileTexts';
import { translateFieldValue } from './formFields';
import { uiText } from 'utils/uiTranslations';
import { useAppSettings } from '../hooks/useAppSettings';
import { getContactEntries } from './contactMethods';
import { PHONE_QUICK_LINKS, getContactIcon, isExternalContact } from './contactIcons';
import { PhoneHandsetIcon } from './icons/PhoneHandsetIcon';
import { formatProfileCountOrDate } from '../utils/profileDate';
import { formatDeliveryRecency } from '../utils/deliveryRecency';
import * as S from './MatchingHiddenList.styled';
// Доріжки нотаток беруться з розкладки відкритої картки, а не описуються тут
// удруге: у рядку стрічки й у картці стоять ті самі два записи — публічний
// відгук і власна нотатка, — і два екрани не можуть казати про них різне.
import { NoteLane, NoteLaneHead, NoteLaneHint, PublishDot } from './Matching.styled';
import { isMatchingCardPublished } from '../utils/matchingCardIndex';

// The one profile row shared by the hidden-list screen and the matching feed's
// list mode (spec §0/§5). It owns the row's visual structure only - avatar,
// identity line, the italic metrics line, the comment block and the expandable
// detail section. Everything stateful about a *collection* (what the primary
// action does, where comments are stored, how pages are fetched) stays with the
// caller and arrives through props.

const CSECTION_KEYS = ['cSection', 'csection', 'c_section', 'cesareanSection'];
const UA_COUNTRY_VALUES = new Set(['україна', 'ukraine', 'ua']);

// Підписи канонічно англійські — так само, як у решті розкладки анкети, — і
// перекладаються на показі. Бренди (Telegram, Viber) не перекладаються ніколи:
// це власні назви, а не підписи.
export const CONTACT_LABELS = {
  phone: 'Phone',
  email: 'Email',
  telegram: 'Telegram',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  viber: 'Viber',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  twitter: 'X',
  website: 'Website',
  otherLink: 'Other link',
  ameblo: 'Ameblo',
};

const GRID_FIELD_DEFS = [
  { key: 'education', label: 'Education' },
  { key: 'clothingSize', label: 'Clothing' },
  { key: 'shoeSize', label: 'Shoe' },
  { key: 'race', label: 'Race' },
  { key: 'eyeColor', label: 'Eyes' },
  { key: 'hair', label: 'Hair', combined: ['hairColor', 'hairStructure'] },
  { key: 'faceShape', label: 'Face shape' },
  { key: 'noseShape', label: 'Nose' },
  { key: 'lipsShape', label: 'Lips' },
  { key: 'chin', label: 'Chin' },
  { key: 'bodyType', label: 'Body type' },
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

const CSECTION_ZERO_VALUES = new Set(['не було', 'немає', 'нема', 'no', '-', '0']);
const formatCSectionValue = raw => {
  const trimmed = String(raw || '').trim();
  if (CSECTION_ZERO_VALUES.has(trimmed.toLowerCase())) return '0';
  // У частині анкет у полі кесаревого лежить дата операції. Сирою вона
  // друкувалась в ISO — поруч із «останні 11.03.26» у форматі дд.мм.рр.
  return formatProfileCountOrDate(trimmed);
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

// Значення, у якому, крім цифр, самі лише розділювачі номера. Усе інше —
// текст, який ввела людина («0501112233 Оксана»), і різати його на цифри не
// можна: з нього вийшов би номер, якого ніхто не набирав.
const PHONE_PUNCTUATION_ONLY = /^[+\d\s()\-.]+$/;

/**
 * Номер показується суцільним рядком, без пробілів і дужок.
 *
 * Пробіли в номері бувають двох походжень: свої, які малював цей код, і чужі —
 * ті, з якими номер лежить у базі. Перших тут більше немає, а другі знімаються:
 * номер читають, диктують і звіряють з іншим номером, і для всіх трьох справ
 * однаковий вигляд важливіший за групування трійками. Свої пробіли ще й
 * розʼїжджались із чужими — той самий номер виглядав по-різному залежно від
 * того, як його колись зберегли.
 */
export const formatPhoneDisplay = raw => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (!PHONE_PUNCTUATION_ONLY.test(trimmed)) return trimmed.replace(/\s+/g, ' ');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;
  // «+» дописується лише там, де він щось означає: у міжнародного номера.
  // Місцевий запис (`0671234567`) лишається як є — «+0671234567» не набереться.
  return trimmed.startsWith('+') || digits.length >= 11 ? `+${digits}` : digits;
};

export const getContactLabel = (key, language) =>
  translateProfileLabel(CONTACT_LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1)), language);

const GRID_WIDE_VALUE_LENGTH = 22;

/**
 * Значення сітки — тією самою мовою, що й підпис поруч.
 *
 * Підписи тут перекладались, а значення — ні, і рядок стрічки казав
 * «Раса: European», «Волосся: Fair, Straight», «Фігура: Hourglass»: половина
 * комірки українською, половина англійською. Варіанти цих полів вибирають зі
 * списку, і пара до кожного вже лежить у формі (`formFields`), тож перекладає
 * їх те саме `translateFieldValue`, що й відкрита картка анкети
 * (`localizeFieldValue` у `profileLayoutConfig`) — не другий словник, а той
 * самий. Вільний текст словнику не відповідає й лишається як є: те, що ввела
 * людина, не перекладається ніколи.
 */
const localizeGridValue = (field, value, language) => {
  if (resolveProfileLanguage(language) !== 'uk') return value;
  return String(value)
    .split(', ')
    .map(part => translateFieldValue(field, part))
    .join(', ');
};

export const buildGridRows = (user, language) => {
  const rows = [];
  const cell = (field, value) => ({ field, value: localizeGridValue(field, value, language) });
  GRID_FIELD_DEFS.forEach(def => {
    if (def.combined) {
      const [keyA, keyB] = def.combined;
      const valA = normalizeDisplayValue(user?.[keyA]);
      const valB = normalizeDisplayValue(user?.[keyB]);
      const parts = [];
      if (valA && !isOtherValue(valA)) parts.push(cell(keyA, valA));
      if (valB && !isOtherValue(valB)) parts.push(cell(keyB, valB));
      if (!parts.length) return;
      rows.push({ label: translateProfileLabel(def.label, language), parts });
      return;
    }
    const value = normalizeDisplayValue(user?.[def.key]);
    if (!value || isOtherValue(value)) return;
    rows.push({ label: translateProfileLabel(def.label, language), parts: [cell(def.key, value)] });
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

// The metrics line: `172/59 BMI 20 не заміжня O+ пологи 1, 18 міс тому`.
// Spec §5 asks that the fields an active filter narrowed on come first, so the
// caller passes those metric keys and everything else keeps the default order.
export const renderFacts = (user, priorityKeys = [], language) => {
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

  const maritalDisplay = maritalStatusLabel(normalizeDisplayValue(user?.maritalStatus), language);
  if (maritalDisplay) {
    nodes.push(<S.Fact key="marital">{maritalDisplay}</S.Fact>);
  }

  const cSectionKey = resolveCSectionKey(user);
  const cSectionValue = normalizeDisplayValue(user?.[cSectionKey]);
  if (cSectionValue) {
    nodes.push(
      <S.Fact key="cs">
        {profileUiText('factCSection', language)} <b>{formatCSectionValue(cSectionValue)}</b>
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
      nodes.push(<S.Fact key="births">{profileUiText('factNoBirths', language)}</S.Fact>);
    } else {
      // Не дата, а давність: точний день пологів у рядку стрічки нічого не
      // вирішує, а називає подію з життя людини. Питання читача — чи встигла
      // жінка відновитись, і на нього відповідає «18 міс тому».
      const recency = formatDeliveryRecency(normalizeDisplayValue(user?.lastDelivery), language);
      nodes.push(
        <S.Fact key="births">
          {profileUiText('factBirths', language)} <b>{ownKids}</b>
          {recency && <>, <b>{recency}</b> {profileUiText('factAgo', language)}</>}
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

/**
 * Контакти однієї картки: номер у першому рядку, решта — значками в другому.
 *
 * Номер читають очима: його переписують, диктують і звіряють, тож він стоїть
 * повністю, а поруч із ним — три швидкі кнопки, зібрані з нього ж (Telegram,
 * Viber, WhatsApp). Нового контакту вони не несуть, тому й стоять біля номера,
 * а не окремим переліком. Пошта й ніки читання не потребують — у них тапають, —
 * і кожен з них коштував цілого рядка; тепер вони йдуть значками під номером.
 * Що саме за значком, каже `title`.
 */
export const ContactLinks = ({ entries, language }) => {
  const phones = entries.filter(entry => entry.key === 'phone');
  const others = entries.filter(entry => entry.key !== 'phone');

  return (
    <>
      {phones.map(entry => {
        const displayValue = formatPhoneDisplay(entry.value);
        const phoneLabel = `${getContactLabel('phone', language)}: ${displayValue}`;
        return (
          <S.ContactPhoneRow key={`phone-${entry.index}-${entry.value}`}>
            <S.ContactPhoneLink href={entry.href} title={phoneLabel} aria-label={phoneLabel}>
              {/* Значок номера лежить у такій самій рамці, як значки решти
                  каналів: ліва межа блока контактів одна на всі рядки. */}
              <S.ContactIconBadge aria-hidden="true">
                <PhoneHandsetIcon />
              </S.ContactIconBadge>
              <span>{displayValue}</span>
            </S.ContactPhoneLink>
            <S.ContactIconRow>
              {PHONE_QUICK_LINKS.map(({ key, Icon, label, build }) => (
                <S.ContactIconLink
                  key={`phone-${key}-${entry.index}`}
                  href={build(entry.value)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${label}: ${displayValue}`}
                  aria-label={`${label}: ${displayValue}`}
                >
                  <Icon />
                </S.ContactIconLink>
              ))}
            </S.ContactIconRow>
          </S.ContactPhoneRow>
        );
      })}
      {others.length > 0 && (
        <S.ContactIconRow $standalone>
          {others.map(entry => {
            const Icon = getContactIcon(entry.key);
            const label = `${getContactLabel(entry.key, language)}: ${entry.value}`;
            return (
              <S.ContactIconLink
                key={`${entry.key}-${entry.index}-${entry.value}`}
                href={entry.href}
                target={isExternalContact(entry.key) ? '_blank' : undefined}
                rel={isExternalContact(entry.key) ? 'noopener noreferrer' : undefined}
                title={label}
                aria-label={label}
              >
                <Icon />
              </S.ContactIconLink>
            );
          })}
        </S.ContactIconRow>
      )}
    </>
  );
};

export const ContactsSection = ({ user, onOpened }) => {
  const { language } = useAppSettings();
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
        {translateProfileLabel('Contacts', language)}
        {!open && <S.ContactsStatus>{profileUiText('show', language)}</S.ContactsStatus>}
      </S.ContactsHeader>
      {open && (
        <S.ContactsBody>
          <ContactLinks entries={entries} language={language} />
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

// Скільки рядків власної нотатки видно без розгортання. Поле починається з
// одного рядка й росте разом із текстом, але не безкінечно: під ним стоять
// реакції, і довга нотатка відсувала б їх за край екрана. Далі — «…».
export const COMMENT_VISIBLE_ROWS = 4;

const autoResizeTextarea = (el, maxRows = 0) => {
  if (!el) return;
  el.style.height = 'auto';
  if (!maxRows) {
    el.style.height = `${el.scrollHeight}px`;
    el.style.overflowY = 'hidden';
    return;
  }
  const style = window.getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || 18;
  const vertical = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const maxHeight = lineHeight * maxRows + vertical;
  const next = Math.min(el.scrollHeight, maxHeight);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > next + 1 ? 'auto' : 'hidden';
};

// The client's own note about a row. Always editable, no page-wide edit mode.
// A short comment renders straight as an auto-height textarea; a long (clamped)
// one renders as plain clipped text first so it doesn't fight the row's
// tap-to-expand, and the first tap both expands it and turns it into a textarea
// with the caret at the tap point.
export const CommentBlock = ({ text, onSave, placeholder }) => {
  const { language } = useAppSettings();
  const measureRef = useRef(null);
  const textareaRef = useRef(null);
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef(text || '');
  const pendingCaretRef = useRef(null);
  const [draft, setDraft] = useState(text || '');
  const [measureText, setMeasureText] = useState(text || '');
  const [mode, setMode] = useState('input');
  // Розгорнуте поле лишається розгорнутим, поки читач сам його не згорне:
  // «…» — це його рішення про цю картку, а не стан набору тексту.
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);

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
    if (mode !== 'input') return;
    const el = textareaRef.current;
    autoResizeTextarea(el, expanded ? 0 : COMMENT_VISIBLE_ROWS);
    setClipped(Boolean(el) && !expanded && el.scrollHeight - el.clientHeight > 1);
  }, [mode, draft, expanded]);

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
      <S.CommentLane>
        <S.Note
          ref={measureRef}
          $clip
          $lines={COMMENT_VISIBLE_ROWS}
          onClick={e => {
            e.stopPropagation();
            pendingCaretRef.current = getCaretOffsetFromClick(e) ?? draft.length;
            setExpanded(true);
            setMode('input');
          }}
        >
          {text}
        </S.Note>
        <S.NoteMore
          onClick={e => {
            e.stopPropagation();
            setExpanded(true);
            setMode('input');
          }}
        >
          …
        </S.NoteMore>
      </S.CommentLane>
    );
  }

  return (
    <S.CommentLane>
      <S.CommentInput
        ref={textareaRef}
        rows={1}
        value={draft}
        placeholder={placeholder || uiText('Додати коментар', language)}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onChange={e => {
          const { value } = e.target;
          setDraft(value);
          autoResizeTextarea(e.target, expanded ? 0 : COMMENT_VISIBLE_ROWS);
          scheduleSave(value);
        }}
        onBlur={e => {
          commit(e.target.value);
          setMeasureText(e.target.value);
        }}
      />
      {clipped && (
        <S.NoteMore
          onClick={e => {
            e.stopPropagation();
            setExpanded(true);
          }}
        >
          …
        </S.NoteMore>
      )}
      <S.Note ref={measureRef} $clip $lines={COMMENT_VISIBLE_ROWS} $hidden aria-hidden="true">{measureText}</S.Note>
    </S.CommentLane>
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
// Хто побачить запис, тепер каже підпис над доріжкою («Публічний коментар ·
// Бачать усі»), тож у порожньому полі лишається робота, а не попередження:
// запрошення написати. Стара константа лишається — рядок стрічки й тести
// звертаються до неї за замовчуванням, — але текст у ній іде мовою інтерфейсу.
export const publicCommentPlaceholder = language => profileUiText('publicCommentPlaceholder', language);

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

const CommentComposer = ({ initialText, onCancel, onCommit, language }) => {
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
      <S.PublicCommentInput
        ref={ref}
        rows={COMMENT_MIN_ROWS}
        value={draft}
        placeholder={publicCommentPlaceholder(language)}
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

// Єдине представлення службового переходу потрібне і до, і після читання
// коментарів. Так unloaded-гейт не ховає переданий йому `backendHref`, а вигляд
// та поведінка стрілки не розходяться між двома станами.
const PublicCommentsBackendLink = ({ backendHref }) => (backendHref ? (
  <S.CommentBackendRow>
    <S.CommentBackendLink
      href={backendHref}
      target="_blank"
      rel="noopener noreferrer"
      title={uiText('Відкрити публічні нотатки анкети у Firebase')}
      aria-label={uiText('Відкрити публічні нотатки анкети у Firebase')}
      onClick={e => e.stopPropagation()}
    >
      <FaArrowRight size={12} />
    </S.CommentBackendLink>
  </S.CommentBackendRow>
) : null);

export const PublicCommentBlock = ({
  profileId,
  comments = [],
  viewerId,
  // Блок живе у двох місцях із різними відступами — див. `PublicComments`.
  flush = false,
  // Адреса вузла `comments/{profileId}` у консолі Firebase. Складає її та сторона,
  // що знає і читача, і режим (`Matching`), — сам блок не вирішує, кому службова
  // навігація належить: порожній рядок означає «не показувати».
  backendHref = '',
  // Адмін відповідає за публічні записи про третіх осіб, тож редагує і знімає
  // будь-який із них, не тільки власний.
  canModerate = false,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const { language } = useAppSettings();
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
      setFailedNotice(uiText('Не вдалось видалити — спробуйте ще раз', language));
    }
  }, [language, onDelete, profileId]);

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
    <S.PublicComments $flush={flush} onClick={e => e.stopPropagation()}>
      <PublicCommentsBackendLink backendHref={backendHref} />
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
              language={language}
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
            <S.CommentText $clip={!expanded}>{comment.text}</S.CommentText>
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
                  {uiText('Повторити', language)}
                </S.CommentRetry>
              )}
              {canRemove && (
                <S.CommentDelete
                  type="button"
                  $confirming={confirmingDelete === comment.id}
                  aria-label={uiText(confirmingDelete === comment.id ? 'Підтвердити видалення' : 'Видалити коментар', language)}
                  onClick={e => {
                    e.stopPropagation();
                    if (confirmingDelete === comment.id) void removeComment(comment.id);
                    else setConfirmingDelete(comment.id);
                  }}
                >
                  {confirmingDelete === comment.id ? uiText('Видалити?', language) : '×'}
                </S.CommentDelete>
              )}
            </S.CommentMeta>
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
          language={language}
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
          {publicCommentPlaceholder(language)}
        </S.AddCommentTrigger>
      )}

      {failedNotice && <S.CommentStatus aria-live="polite">{failedNotice}</S.CommentStatus>}

      {savedAt > 0 && (
        <S.CommentStatus aria-live="polite">{uiText('Збережено {time}', language, { time: formatCommentClock(savedAt) })}</S.CommentStatus>
      )}
    </S.PublicComments>
  );
};

// Другий рядок фактів — це не «решта», а окрема відповідь: скільки пологів,
// коли останні, чи був кесарів. Тіло (зріст, вага, ІМТ, група) читають, щоб
// відсіяти, а це — щоб зважити, тож вони й не мусять стояти впритул.
const REPRO_FACT_KEYS = ['births', 'cs', 'marital'];

export const splitFactsByGroup = (facts = []) => [
  facts.filter(node => !REPRO_FACT_KEYS.includes(node.key)),
  facts.filter(node => REPRO_FACT_KEYS.includes(node.key)),
];

/*
 * Підписи жестів у ряду рішень. Вони не показуються словами — їх несуть
 * `title` і `aria-label`, — але читає їх і людина, і екранний диктор, тож ідуть
 * вони мовою інтерфейсу. Виклик без аргументу віддає українську за
 * замовчуванням лише тоді, коли мова інтерфейсу українська.
 */
export const reviewsGateLabel = language => uiText('Перевірити наявність відгуків', language);
export const enrichGateLabel = language => uiText('Доповнити дані', language);

/**
 * Дві доріжки нотаток — одна плашка, і стоїть вона в кожній картці.
 *
 * Публічний відгук і власна нотатка — це два записи про ту саму людину, і
 * читають їх разом; тому і в рядку стрічки, і в плитці галереї, і у відкритій
 * картці вони йдуть парою, у сталому порядку: публічне зверху (відгук читають),
 * власне знизу (нотатку пишуть).
 *
 * Обидва поля стоять **без умови**. Написати відгук — це рішення читача, а не
 * наслідок того, що він спершу натиснув «перевірити»: поки поле відкривала
 * кнопка, лишити запис можна було тільки заради того, щоб спершу прочитати
 * чужі. Читання чужих лишається на дотик і далі (`reviewsAction` у ряду
 * рішень): відгуки живуть в окремому вузлі, і запит на кожен рядок списку
 * коштував би сторінку читань заради блока, під яким у більшості анкет порожньо.
 */
export const ProfileNotes = ({ language, publicSlot, privateSlot, reviewsStatus }) => (
  <S.RowNotes onClick={e => e.stopPropagation()}>
    <NoteLane $flush $public>
      <NoteLaneHead>
        <b>{profileUiText('publicComment', language)}</b>
        <NoteLaneHint>{profileUiText('publicCommentHint', language)}</NoteLaneHint>
      </NoteLaneHead>
      {publicSlot}
      {reviewsStatus && <S.ReviewsGateNote aria-live="polite">{reviewsStatus}</S.ReviewsGateNote>}
    </NoteLane>
    <NoteLane $flush>
      <NoteLaneHead>
        <b>{profileUiText('personalNote', language)}</b>
        <NoteLaneHint>{profileUiText('personalNoteHint', language)}</NoteLaneHint>
      </NoteLaneHead>
      {privateSlot}
    </NoteLane>
  </S.RowNotes>
);

/**
 * Що сказати про читання відгуків, крім самих відгуків.
 *
 * Поле для власного запису стоїть на місці завжди, тож порожня доріжка більше
 * не означає «ще не читали»: це може бути і «читання триває», і «читання
 * впало». Мовчати про останнє не можна — читач натиснув кнопку й має право
 * знати, що відповіді не було.
 *
 * **Відповідь «відгуків немає» — теж відповідь, і вона лишається на екрані.**
 * Доти дотик до значка давав «Шукаємо відгуки…» на частку секунди й тишу
 * після: людина бачила, як напис блимнув і зник, і не знала, чи прочитано
 * бодай щось. Тепер прочитана порожнеча каже про себе рядком під полем
 * запису — тим самим приглушеним написом, тобто місця в рядку не додається,
 * а невідповіді більше немає.
 */
export const describeReviewsState = ({ requested, loading, loaded, count = 0 }, language) => {
  if (loading) return uiText('Шукаємо відгуки…', language);
  if (requested && !loaded) return uiText('Не вдалося прочитати відгуки', language);
  if (loaded && !count) return uiText('Публічних відгуків ще немає', language);
  return '';
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
  onTogglePublish,
  expanded,
  onToggleExpand,
  onOpen,
  onEditProfile,
  onContactsOpened,
  onRequestContacts,
  // Чи цьому читачеві взагалі є що тут відкривати. Питання вирішує той, хто
  // знає і картку, і читача (`canOfferProfileContacts` у Matching), — рядок
  // лише виконує рішення.
  canViewContacts = true,
  contactsLoading = false,
  clientComment,
  onCommentSave,
  primaryAction,
  secondaryAction,
  priorityMetricKeys,
  commentSlot,
  // Відгуки про людину (публічні) — окремий слот від власної нотатки: у
  // плашці нотаток стоять обидва, і сплутати їх не можна. Слот — це самий
  // лише вміст; жест, який його відкриває, стоїть у ряду рішень і приходить
  // окремо (`reviewsAction`), бо читання починається з дотику.
  reviewsSlot,
  // `{ count, loading, onRequest }` — усе, чого ряду треба про відгуки: скільки
  // їх (коли вже прочитані), чи триває читання і кого просити його почати.
  reviewsAction,
  diagnosticsSlot,
  onEnrich,
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
  // Рядок стрічки говорить тією ж мовою, що й картка: підписи полів і слова,
  // які застосунок підставляє сам («пологів», «КС», «не заміжня»).
  const { language } = useAppSettings();
  const name = getProfileName(user);
  const rowRole = getProfileRole(user);
  // Роль позначає дволітерний код — і на знімку, і в рядку імені, коли знімка
  // немає. Словом вона тут стояла («Донорка», «Agency»), і слово розходилось
  // саме з собою: у рядку одне, у відкритій картці інше, у фільтрах третє, а
  // зміна мови інтерфейсу міняла всі три. Код той самий, яким роль лежить у
  // даних, і однаковий на всіх екранах матчингу.
  const roleCode = getRoleCode(rowRole);
  const age = getProfileAge(user);
  const location = getLocationLine(user);
  const photos = getProfilePhotos(user);
  const photo = photos[0];
  const bio = getProfileBio(user);
  const facts = useMemo(
    () => (isLimited ? [] : renderFacts(user, priorityMetricKeys || [], language)),
    [isLimited, language, user, priorityMetricKeys]
  );
  // Один рядок фактів переносився посеред самого факту («пологів 3, останні
  // 19.10.25» тікало на другий рядок), і зачепитись оку не було за що. Тіло
  // лишається зверху, пологи й кесарів ідуть окремим, приглушеним рядком.
  const [bodyFacts, reproFacts] = useMemo(() => splitFactsByGroup(facts), [facts]);
  const gridRows = useMemo(() => (isLimited ? [] : buildGridRows(user, language)), [isLimited, language, user]);
  const contactEntries = useMemo(
    () => (isLimited ? [] : getContactEntries(user).filter(entry => entry.key !== 'vk')),
    [isLimited, user]
  );
  const hasLocation = Boolean(location);
  const isUnfilled = !isLimited && !hasLocation && (facts.length === 0 || isWeakOnlyFact(facts));

  // Кнопка контактів малюється завжди й нічого не читає наперед: у картці
  // стрічки контактів немає, бо вони живуть в окремому вузлі за межею
  // приватності. Дотик запускає те саме читання анкети, що й відкрита картка,
  // — і всі перевірки права відбуваються там, а не тут.
  const [contactsOpen, setContactsOpen] = useState(false);
  // Кнопки немає там, де за нею нічого не стоїть. Картка поза стрічкою, на яку
  // читач не має права, контактів не віддасть — ані кнопці, ані розгорнутому
  // блоку, — а сам значок обіцяв, що віддасть, і кожне натискання коштувало
  // круга до бази заради «Контактів немає або вони закриті».
  const showContactsButton = Boolean(onRequestContacts) && !isLimited && canViewContacts;

  // Стрілка стоїть у кожному нефільтрованому рядку й числа біля себе не несе.
  //
  // Число там було, і воно брехало: рахувалось воно по `gridRows`, а ті
  // збираються з тієї ж проєкції `matchingCards`, у якій освіти, зовнішності й
  // контактів немає взагалі — вони приїжджають аж на дотик до стрілки
  // (`ensureFullProfile`). Тобто підпис обіцяв «0» або «2» рівно там, де під
  // стрілкою лежав десяток полів, а в уже відкритій картці міняв своє значення
  // просто тому, що анкета приїхала. Порахувати чесно тут нічим: рядок не знає
  // анкети, доки її не прочитає.
  //
  // Тому стрілка тепер саме стрілка: «розгорнути й дозавантажити». І стоїть
  // вона в кожному повному рядку, а не лише там, де проєкція вже щось показує,
  // — інакше картка без жодного зайвого поля в проєкції ховала б і саму
  // можливість прочитати анкету.
  const canExpandDetails = !isLimited;

  // Стан публікації читається з картки, а не з `publish`: у проєкції стрічки
  // такого ключа немає (див. `isMatchingCardPublished`).
  const isPublished = isMatchingCardPublished(user);

  // Дедуплікацію рядок на себе не бере: нею відає той, хто читає анкету
  // (`ensureFullProfile`), і він же знімає позначку, коли читання впало. Свій
  // прапорець «уже просили» зробив би кнопку мертвою рівно після невдалої
  // спроби — тобто саме тоді, коли повторити й треба.
  /*
   * Олівець у ряду рішень — один на обидві ролі.
   *
   * Читач із правом заводити картки ним *дописує* знайдену анкету
   * (`onEnrich`), адмін — відкриває її на редагування (`onEditProfile`). Жест
   * той самий і наслідок той самий — «правити цю анкету», — тож і кнопка одна;
   * різняться вони лише тим, куди ведуть, і це каже підпис. Досі це були дві
   * різні кнопки в різних кутках картки: широкий рядок «Доповнити дані» під
   * фактами й значок олівця в стовпчику праворуч.
   */
  const editAction = useMemo(() => {
    if (onEnrich) return { title: enrichGateLabel(language), onClick: onEnrich };
    if (isAdmin && onEditProfile && !isLimited) return { title: uiText('Редагувати анкету', language), onClick: onEditProfile };
    return null;
  }, [isAdmin, isLimited, language, onEditProfile, onEnrich]);

  // Значок відгуків більше нічого не розгортає — він просить їх прочитати.
  // Доріжка з полем стоїть на місці й без нього, тож «згорнути» означало б
  // прибрати поле, у яке читач саме зібрався писати. Повторний дотик — це
  // повтор читання: `requestPublicComments` знімає позначку «вже просили» саме
  // на помилці, тож те, що впало, можна спробувати ще раз.
  const [reviewsRequested, setReviewsRequested] = useState(false);
  const requestReviews = () => {
    setReviewsRequested(true);
    if (reviewsAction?.onRequest) reviewsAction.onRequest(user.userId);
  };

  const toggleContacts = () => {
    setContactsOpen(open => {
      const next = !open;
      if (next) {
        if (onRequestContacts) onRequestContacts(user);
        if (onContactsOpened) onContactsOpened(user);
      }
      return next;
    });
  };

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
      $role={rowRole}
      // Якір для відновлення позиції: повернувшись до стрічки, сторінка шукає
      // саме цей рядок, а не піксель (див. `SCROLL_ANCHOR_KEY` у `Matching`).
      data-card-id={user?.userId}
      onClick={handleRowClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Фото стоїть перед усім текстом і на всю ширину картки: у списку
          гортають саме його, а плиткою 52 px збоку воно не показувало нічого.
          Плитки з ініціалами тут немає й не було: вона повторювала імʼя, яке
          стоїть рядком нижче. Немає фото — рядок починається з імені, а «хто
          це» несе смужка ролі на лівому краї картки. */}
      {photo && (
        <S.Photo>
          <img src={photo} alt="" loading="lazy" decoding="async" />
          {/* Роль лежить на знімку — там само, де її малює відкрита картка
              (`ModernRoleBadge`). Під іменем вона стояла чіпом і забирала
              ширину в локації; а два екрани не можуть казати про ту саму річ
              у двох різних місцях. */}
          {roleCode && <S.PhotoRoleBadge $role={rowRole}>{roleCode}</S.PhotoRoleBadge>}
          {photos.length > 1 && <S.PhotoCount>{photos.length}</S.PhotoCount>}
        </S.Photo>
      )}
      <S.Top>
        <S.Body>
          {/* Імʼя володіє рядком майже одноосібно: поруч із ним стає хіба
              дволітерний код ролі, і лише там, де знімка немає — тобто де
              плашці ролі нема на чому лежати. */}
          <S.NameRow>
            <S.Name>
              {name}
              {age && <>, {age}</>}
            </S.Name>
            {!photo && roleCode && <S.RoleCode $role={rowRole}>{roleCode}</S.RoleCode>}
          </S.NameRow>
          {hasLocation && (
            <S.MetaRow>
              <S.Location>
                <FaMapMarkerAlt aria-hidden="true" />
                <span>{location}</span>
              </S.Location>
            </S.MetaRow>
          )}
        </S.Body>
        <S.Ctrl>
          <S.RowActionStack>
            {/* Цятка публікації — перша в стовпчику: це не дія над карткою, а
                її стан, і адмін читає його одним поглядом по всьому списку. */}
            {isAdmin && onTogglePublish && !isLimited && (
              <PublishDot
                type="button"
                $published={isPublished}
                title={uiText(isPublished ? 'Прибрати зі стрічки' : 'Показати у стрічці', language)}
                aria-label={uiText(isPublished ? 'Прибрати зі стрічки' : 'Показати у стрічці', language)}
                aria-pressed={isPublished}
                onClick={e => { e.stopPropagation(); onTogglePublish(user); }}
              />
            )}
            {showContactsButton && (
              <S.RowActionButton
                type="button"
                $on={contactsOpen}
                title={uiText('Контакти', language)}
                aria-label={uiText('Контакти', language)}
                aria-expanded={contactsOpen}
                onClick={e => { e.stopPropagation(); toggleContacts(); }}
              >
                <PhoneHandsetIcon size={13} />
              </S.RowActionButton>
            )}
          </S.RowActionStack>
          {canExpandDetails && (
          <S.ChevronButton
            type="button"
            $open={expanded}
            aria-label={uiText('Показати всі дані', language)}
            title={uiText('Показати всі дані', language)}
            onClick={e => { e.stopPropagation(); onToggleExpand(user.userId); }}
          >
            <FaChevronDown size={11} />
          </S.ChevronButton>
          )}
        </S.Ctrl>
      </S.Top>

      {/* Метрики — на всю ширину картки, а не в колонці поруч із фото.
          Поруч із фото їм лишалось десь дві третини рядка, і «пологи 4, 6 міс
          тому» переносилось на третій рядок там, де на повну ширину стає двох.
          А головне — ліва межа: усе, що нижче (контакти, «всі дані», нотатки,
          ряд рішень), починається від краю картки, і рядок метрик посеред них
          був єдиним зсунутим. Відступ лишився рівно один і очевидний — під
          саме імʼя, поруч із фото. */}
      {!isUnfilled && facts.length > 0 ? (
        <>
          {bodyFacts.length > 0 && (
            <S.FactsRow>
              {bodyFacts.map((node, idx) => (
                <React.Fragment key={node.key}>
                  {idx > 0 && ' '}
                  {node}
                </React.Fragment>
              ))}
            </S.FactsRow>
          )}
          {reproFacts.length > 0 && (
            <S.FactsRow $soft>
              {reproFacts.map((node, idx) => (
                <React.Fragment key={node.key}>
                  {idx > 0 && ' '}
                  {node}
                </React.Fragment>
              ))}
            </S.FactsRow>
          )}
        </>
      ) : isUnfilled && (
        <S.EmptyNote>{uiText('Анкета не заповнена', language)}</S.EmptyNote>
      )}

      {contactsOpen && (
        <S.RowContacts onClick={e => e.stopPropagation()}>
          {contactEntries.length > 0 ? (
            <ContactLinks entries={contactEntries} language={language} />
          ) : (
            <S.RowContactsNote>
              {uiText(contactsLoading ? 'Шукаємо контакти…' : 'Контактів немає або вони закриті', language)}
            </S.RowContactsNote>
          )}
        </S.RowContacts>
      )}

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
          {/* Контакти тут другим списком не йдуть: їх показує кнопка з
              трубкою, і поки блок «усі дані» дублював їх, у чернетці той
              самий номер стояв двічі — раз під кнопкою, раз під стрілкою.
              Там, де кнопки немає (список прихованих), блок лишається
              єдиним місцем, звідки контакти видно. */}
          {!showContactsButton && canViewContacts && (
            <ContactsSection user={user} onOpened={onContactsOpened} />
          )}
          {/* Стрілка тепер стоїть у кожному рядку, тож розгорнути можна й
              картку, анкета якої ще їде (або в якій цих полів просто немає).
              Порожній блок читався б як поламаний — краще сказати словом. */}
          {gridRows.length === 0 && !bio && (
            <S.RowContactsNote>{uiText('Додаткових даних немає', language)}</S.RowContactsNote>
          )}
        </S.More>
      )}

      {/* Нотатки — одна плашка на дві доріжки: спершу те, що про людину
          написали інші, під ним — те, що дописує читач. Доріжки ті самі, що
          й у відкритій картці та в плитці галереї, разом із підписом над
          кожною: хто побачить запис, має бути сказано там, де його пишуть, а
          не лише в порожньому полі — «Додати коментар» про це мовчало.

          Обидві стоять відкритим полем, а не за кнопкою: читач гортає список,
          аби вирішити, і лишити запис — що власний, що публічний — має
          коштувати один дотик просто тут. Публічну доріжку досі відкривала
          кнопка «перевірити відгуки», тобто написати відгук можна було лише
          дорогою до чужих. Читання чужих на дотику й лишилось: `reviewsSlot`
          несе прочитане, а поки його не просили, у доріжці стоїть саме поле. */}
      <ProfileNotes
        language={language}
        publicSlot={reviewsSlot}
        reviewsStatus={describeReviewsState({
          requested: reviewsRequested,
          loading: Boolean(reviewsAction?.loading),
          loaded: Boolean(reviewsAction?.loaded),
          count: reviewsAction?.count || 0,
        }, language)}
        privateSlot={commentSlot !== undefined
          ? commentSlot
          : (
            <CommentBlock
              text={clientComment}
              placeholder={profileUiText('personalNotePlaceholder', language)}
              onSave={value => onCommentSave(user, value)}
            />
          )}
      />

      {/* Ряд рішень — останній у картці: спершу все, що вона каже про людину,
          потім те, що читач про неї записав, і аж тоді жест.

          Порядок у ряду сталий: олівець (дописати анкету) → серце й хрестик →
          відгуки. Ліворуч те, що читач робить із карткою, праворуч — те, про
          що він її питає; реакції посередині стоять парою в спільній рамці,
          бо це два боки одного вибору, а не два незалежні значки.

          Підписів у ряду немає: три з цих кнопок раніше були широкими рядками
          з написами («Доповнити дані», «Перевірити наявність відгуків»), і
          картка з трьох фактів займала пів екрана. Що робить кожна, каже
          `title` і `aria-label` — саме їх читає й екранний диктор. */}
      {(editAction || reviewsAction || (!isLimited && (primaryAction || secondaryAction))) && (
        <S.RowFooterActions onClick={e => e.stopPropagation()}>
          {editAction && (
            <S.RowFooterButton
              type="button"
              title={editAction.title}
              aria-label={editAction.title}
              onClick={e => { e.stopPropagation(); editAction.onClick(user); }}
            >
              <FaPencilAlt size={13} />
            </S.RowFooterButton>
          )}
          {!isLimited && (primaryAction || secondaryAction) && (
            <S.RowReactionPair data-testid="row-reactions">
              {primaryAction && (
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
              {secondaryAction && (
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
            </S.RowReactionPair>
          )}
          {reviewsAction && (
            <S.RowFooterButton
              type="button"
              $on={reviewsRequested}
              disabled={Boolean(reviewsAction.loading)}
              title={reviewsGateLabel(language)}
              aria-label={reviewsGateLabel(language)}
              onClick={e => { e.stopPropagation(); requestReviews(); }}
            >
              <FaRegCommentDots size={13} />
              {reviewsAction.count > 0 && <b>{reviewsAction.count}</b>}
            </S.RowFooterButton>
          )}
        </S.RowFooterActions>
      )}

      {diagnosticsSlot}

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
  && prev.onTogglePublish === next.onTogglePublish
  && prev.primaryAction?.active === next.primaryAction?.active
  && prev.secondaryAction?.active === next.secondaryAction?.active
  && prev.priorityMetricKeys === next.priorityMetricKeys
  && prev.commentSlot === next.commentSlot
  && prev.reviewsSlot === next.reviewsSlot
  // Дія звіряється по значенню, а не по посиланню: об'єкт складається на
  // кожен рендер списку, і звірка по посиланню означала б «завжди інша».
  && prev.reviewsAction?.count === next.reviewsAction?.count
  && prev.reviewsAction?.loading === next.reviewsAction?.loading
  && prev.reviewsAction?.onRequest === next.reviewsAction?.onRequest
  && prev.canViewContacts === next.canViewContacts
  && prev.contactsLoading === next.contactsLoading
  && prev.diagnosticsSlot === next.diagnosticsSlot
  && prev.onEnrich === next.onEnrich
  && prev.onEditProfile === next.onEditProfile
  && prev.onSwipeRight === next.onSwipeRight
  && prev.onSwipeLeft === next.onSwipeLeft
));
