import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FaArrowRight, FaChevronDown, FaMapMarkerAlt, FaPencilAlt, FaRegClock, FaRegCommentDots, FaRegStickyNote } from 'react-icons/fa';
import {
  getProfileAge,
  getProfileBio,
  getProfileName,
  getProfilePhotos,
  bmiValue as computeBmiValue,
  normalizeDisplayValue,
  maritalStatusLabel,
  getProfileRole,
  getRoleCode,
  getRoleLabel,
} from './profileLayoutConfig';
import { normalizeCountry } from './normalizeLocation';
import {
  formatCityName,
  formatRegionName,
  isUkraineCountry,
  normalizeHeightCm,
  normalizeWeightKg,
} from '../utils/profileNormalization';
import { profileUiText, resolveProfileLanguage, translateProfileLabel } from '../utils/profileTexts';
import { uiText } from 'utils/uiTranslations';
import { useAppSettings } from '../hooks/useAppSettings';
import { getContactEntries } from './contactMethods';
import { PHONE_QUICK_LINKS, getContactIcon, isExternalContact } from './contactIcons';
import { PhoneHandsetIcon } from './icons/PhoneHandsetIcon';
import { formatDeliveryRecency } from '../utils/deliveryRecency';
import {
  buildProfileDetailSections,
  buildProfileStatStrip,
  buildProfileSummaryRows,
  formatCSectionValue,
  ProfileAboutSection,
  ProfileDetailSections,
  ProfileFactList,
  ProfileStatStrip,
  readBloodDisplay,
  resolveCSectionKey,
} from './ProfileFacts';
import { getRoleColor } from './matchingRoleColors';
import * as S from './MatchingHiddenList.styled';
import { CardRoleBlock, isCounterpartyCard } from './programs/CardRoleBlock';
import { AgencyMediaCarousel } from './programs/AgencyMediaCarousel';
import { isOrganisationAnketaRole } from '../utils/cardAnketas';
import { listProfileRoles } from '../utils/matchingPeerVisibility';
import {
  addMonthsIsoDate,
  formatPostponeDate,
  isPostponedUntil,
  POSTPONE_MONTH_OPTIONS,
  readPostponeDate,
} from '../utils/matchingPostpone';
import { getCurrentValue } from './getCurrentValue';

import usePhotoSwipe from './usePhotoSwipe';
import PhotoSwipeStage from './PhotoSwipeStage';
import PhotoViewer from './PhotoViewer';
// Доріжки нотаток беруться з розкладки відкритої картки, а не описуються тут
// удруге: у рядку стрічки й у картці стоять ті самі два записи — публічний
// відгук і власна нотатка, — і два екрани не можуть казати про них різне.
import { NoteClearButton, NoteFieldRow, NoteLane, NoteLaneHead, PublishDot, SharedCommentText } from './Matching.styled';
import { isMatchingCardPublished, MATCHING_CARD_REVIEW_FLAG_FIELD } from '../utils/matchingCardIndex';

const pickCurrentText = value => String(getCurrentValue(value) ?? '').trim();

// The one profile row shared by the hidden-list screen and the matching feed's
// list mode (spec §0/§5). It owns the row's visual structure only - avatar,
// identity line, the italic metrics line, the comment block and the expandable
// detail section. Everything stateful about a *collection* (what the primary
// action does, where comments are stored, how pages are fetched) stays with the
// caller and arrives through props.

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

const abbreviateRegion = (region, language) => formatRegionName(
  region,
  resolveProfileLanguage(language),
  { short: true },
);

const stripCityPrefix = value => String(value || '').trim().replace(/^(м\.?\s+|місто\s+)/i, '').trim();

// Місто, область і країна — через ті самі довідники, що й відкрита картка
// (`utils/profileNormalization`): у базі вони лежать українською, російською
// й англійською впереміш, і рядок стрічки казав «Славянск, Донецкая обл.».
export const getLocationLine = (user, language) => {
  const resolvedLanguage = resolveProfileLanguage(language);
  const rawCountry = normalizeDisplayValue(user?.country);
  const country = normalizeCountry(rawCountry, resolvedLanguage);
  const city = formatCityName(normalizeDisplayValue(user?.city), resolvedLanguage);
  const isForeign = Boolean(country) && !isUkraineCountry(rawCountry);
  const secondaryRaw = isForeign ? country : abbreviateRegion(normalizeDisplayValue(user?.region), resolvedLanguage);
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

// The metrics line: `172/59 BMI 20 не заміжня O+ пологи 1, 18 міс тому`.
// Spec §5 asks that the fields an active filter narrowed on come first, so the
// caller passes those metric keys and everything else keeps the default order.
export const renderFacts = (user, priorityKeys = [], language) => {
  const nodes = [];

  // Сантиметри й кілограми, а не те, що набрали: фути з-за кордону («5»)
  // давали в рядку «5/3 BMI 1200». Неправдоподібне не показується зовсім.
  const height = normalizeHeightCm(normalizeDisplayValue(user?.height)) || '';
  const weight = normalizeWeightKg(normalizeDisplayValue(user?.weight)) || '';
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

  // Той самий читач, що й смуга показників: голий «-» із картки стрічки
  // `getBloodGroupDisplay` мовчки губив (`readBloodDisplay`).
  const bloodDisplay = readBloodDisplay(user);
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

/**
 * Контакти однієї картки — один рядок значків.
 *
 * Трубка — це дзвінок (`tel:`), а поруч три кнопки, зібрані з того самого
 * номера (Telegram, Viber, WhatsApp); далі значками решта каналів — пошта,
 * ніки, посилання. Цифр номера на екрані немає: доти тут стояла кнопка
 * «Показати номер», а за нею — номер текстом, і разом з рядком значків під
 * ним контакти займали два-три рядки картки заради тексту, який ніхто не
 * читав — номер набирають дотиком до трубки, а не переписують. Що саме за
 * значком, каже `title`. Рядок переноситься сам, коли значків більше, ніж
 * уміщає ширина.
 *
 * Режим лічильника (`onContactAction`): контакти — це дії, і кожен дотик до
 * будь-якого каналу рахується (`recordContactAction`) як знак, що анкета
 * справді зацікавила; значень у підказках тоді немає — відкривається канал
 * дотиком, і саме дотик рахується. Без обробника (шапка форми доповнення, де
 * номер і так стоїть у полі нижче) підказка називає й значення.
 */
export const ContactLinks = ({ entries, language, onContactAction }) => {
  const tracked = typeof onContactAction === 'function';
  const phones = entries.filter(entry => entry.key === 'phone');
  const others = entries.filter(entry => entry.key !== 'phone');
  const act = channel => () => { if (tracked) onContactAction(channel); };
  // Канал, записаний в анкеті окремо (нік Telegram, номер Viber), веде туди,
  // куди людина сама сказала писати; кнопка того самого каналу з номера поруч
  // з ним давала два однакові значки — і незрозуміло, який із них «правильний».
  const ownChannels = new Set(others.map(entry => entry.key));
  const phoneQuickLinks = PHONE_QUICK_LINKS.filter(link => !ownChannels.has(link.key));
  if (!entries.length) return null;

  return (
    <S.ContactIconRow>
      {phones.map(entry => {
        const displayValue = formatPhoneDisplay(entry.value);
        const phoneKey = `${entry.index}-${entry.value}`;
        const callLabel = tracked
          ? uiText('Подзвонити', language)
          : `${getContactLabel('phone', language)}: ${displayValue}`;
        return (
          <React.Fragment key={`phone-${phoneKey}`}>
            <S.ContactIconLink
              href={entry.href}
              $primary
              title={callLabel}
              aria-label={callLabel}
              onClick={act('phone')}
            >
              <PhoneHandsetIcon />
            </S.ContactIconLink>
            {phoneQuickLinks.map(({ key, Icon, label, build }) => {
              const quickLabel = tracked
                ? uiText('{label} за номером', language, { label })
                : `${label}: ${displayValue}`;
              return (
                <S.ContactIconLink
                  key={`phone-${key}-${entry.index}`}
                  href={build(entry.value)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={quickLabel}
                  aria-label={quickLabel}
                  $channel={key}
                  onClick={act(`phone-${key}`)}
                >
                  <Icon />
                </S.ContactIconLink>
              );
            })}
          </React.Fragment>
        );
      })}
      {others.map(entry => {
        const Icon = getContactIcon(entry.key);
        const label = tracked
          ? getContactLabel(entry.key, language)
          : `${getContactLabel(entry.key, language)}: ${entry.value}`;
        return (
          <S.ContactIconLink
            key={`${entry.key}-${entry.index}-${entry.value}`}
            href={entry.href}
            target={isExternalContact(entry.key) ? '_blank' : undefined}
            rel={isExternalContact(entry.key) ? 'noopener noreferrer' : undefined}
            title={label}
            aria-label={label}
            $channel={entry.key}
            onClick={act(entry.key)}
          >
            <Icon />
          </S.ContactIconLink>
        );
      })}
    </S.ContactIconRow>
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

  // Той самий хрестик, що й під публічним відгуком: записане знімається
  // одним дотиком, а не виділенням і стиранням тексту в полі.
  const clearButton = draft ? (
    <NoteClearButton
      type="button"
      title={uiText('Видалити памʼятку', language)}
      aria-label={uiText('Видалити памʼятку', language)}
      onClick={e => {
        e.stopPropagation();
        setDraft('');
        setMeasureText('');
        setExpanded(false);
        setMode('input');
        commit('');
      }}
    >
      ×
    </NoteClearButton>
  ) : null;

  if (mode === 'clamped') {
    return (
      <S.CommentLane>
        <NoteFieldRow>
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
          {clearButton}
        </NoteFieldRow>
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
      <NoteFieldRow>
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
        {clearButton}
      </NoteFieldRow>
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
      {/* Міра мусить мати ту саму ширину, що й поле: хрестик забирає в
          нього 32 px праворуч. */}
      <S.Note ref={measureRef} $clip $lines={COMMENT_VISIBLE_ROWS} $hidden aria-hidden="true" style={clearButton ? { right: 32 } : undefined}>{measureText}</S.Note>
    </S.CommentLane>
  );
};

// ---------------------------------------------------------------------------
// Public profile comment (spec §8)
//
// A record about a third party that every user of the base can read. It is
// anonymous: no author name is shown under it or written with it. The affordance is a line of muted text; a click turns it
// into a borderless auto-growing field. It is published only by the explicit
// «Опублікувати» button (or Ctrl/Cmd+Enter) — never on blur — and Esc or
// «Не публікувати» discards it. An empty field writes nothing at all.

const COMMENT_MIN_ROWS = 1;
const COMMENT_MAX_ROWS = 6;
const COMMENT_SAVED_STATUS_MS = 3000;
// Хто побачить запис, тепер каже підпис над доріжкою («Публічний коментар ·
// Бачать усі»), тож у порожньому полі лишається робота, а не попередження:
// запрошення написати. Стара константа лишається — рядок стрічки й тести
// звертаються до неї за замовчуванням, — але текст у ній іде мовою інтерфейсу.
export const publicCommentPlaceholder = language => profileUiText('publicCommentPlaceholder', language);
// Там, де відгуки приїжджають разом з екраном (відкрита картка, форма
// чернетки, форма доповнення), заклику перевіряти в плейсхолдері немає:
// перевірка вже відбулась, і те, що вона дала, каже `describeReviewsState`.
export const publicCommentPlainPlaceholder = language => profileUiText('publicCommentPlaceholderPlain', language);

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

const CommentComposer = ({ initialText, onCancel, onCommit, language, preloaded = false }) => {
  const ref = useRef(null);
  const [draft, setDraft] = useState(initialText || '');
  const isEdit = Boolean(String(initialText || '').trim());
  const canCommit = isEdit || draft.trim() !== '';

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
        placeholder={(preloaded ? publicCommentPlainPlaceholder : publicCommentPlaceholder)(language)}
        onTouchStart={e => e.stopPropagation()}
        onChange={e => {
          setDraft(e.target.value);
          autoGrowComment(e.target);
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
            return;
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (canCommit) onCommit(e.target.value);
          }
        }}
        // Втрата фокуса нічого не публікує. Порожній новий відгук просто
        // згортається назад у запрошення — інакше поле висіло б відкритим
        // після кожного випадкового дотику; набраний текст лишається в полі,
        // доки людина не натисне «Опублікувати» чи «Не публікувати».
        onBlur={e => {
          if (!isEdit && !e.target.value.trim()) onCancel();
        }}
      />
      <S.CommentActions>
        <S.CommentAudienceNote>{uiText('Побачать усі користувачі. Ваше імʼя не показується.', language)}</S.CommentAudienceNote>
        <S.CommentCancelButton
          type="button"
          // mousedown не забирає фокус у поля: інакше blur порожнього поля
          // згорнув би редактор раніше, ніж дійде клік.
          onMouseDown={e => e.preventDefault()}
          onClick={e => {
            e.stopPropagation();
            onCancel();
          }}
        >
          {uiText('Не публікувати', language)}
        </S.CommentCancelButton>
        <S.CommentPublishButton
          type="button"
          disabled={!canCommit}
          onMouseDown={e => e.preventDefault()}
          onClick={e => {
            e.stopPropagation();
            onCommit(draft);
          }}
        >
          {uiText(isEdit ? 'Зберегти відгук' : 'Опублікувати', language)}
        </S.CommentPublishButton>
      </S.CommentActions>
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
  // Чи відгуки цього екрана вже прочитані (або читаються) без окремого жесту.
  //
  // Читання ніде більше не чекає на дотик: стрічка сама питає його, щойно
  // прапорець `hasPublicReview` картки каже, що там є що читати (ефект у
  // `Matching.jsx`), а відкрита картка й обидві форми питають `comments`
  // одразу на відкритті. Тому кожен виклик цього блоку тепер несе
  // `preloaded`; параметр лишається вимкненим за замовчуванням лише для
  // випадку, коли читання колись знову коштуватиме окремого жесту.
  preloaded = false,
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
  // Optimistic rows: rendered straight away, and kept - with their text - if the
  // write fails, so a failure never costs what was typed.
  const [pending, setPending] = useState([]);

  useEffect(() => {
    if (!savedAt) return undefined;
    const timer = setTimeout(() => setSavedAt(0), COMMENT_SAVED_STATUS_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);

  // Хрестик знімає запис одним дотиком — без другого кроку «Видалити?».
  // Підтвердження тут стояло, і прибрати власний відгук коштувало двох
  // влучань у дрібний напис; мішень тепер велика (`NoteClearButton`), тож
  // випадковий дотик уже не ціна другого кроку.
  const removeComment = useCallback(async commentId => {
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
              preloaded={preloaded}
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
            <S.CommentBody>
              <S.CommentText $clip={!expanded}>{comment.text}</S.CommentText>
              {/* Автора під відгуком немає: відгук анонімний. Ініціали тут
                  стояли, і лишити відгук, не назвавши себе, було не можна. */}
              <S.CommentMeta>
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
              </S.CommentMeta>
            </S.CommentBody>
            {(canRemove || comment.failed) && (
              <NoteClearButton
                type="button"
                title={uiText('Видалити коментар', language)}
                aria-label={uiText('Видалити коментар', language)}
                onClick={e => {
                  e.stopPropagation();
                  // Невдалий запис у базі не лежить — знімається сам рядок.
                  if (comment.failed) setPending(prev => prev.filter(entry => entry.id !== comment.id));
                  else void removeComment(comment.id);
                }}
              >
                ×
              </NoteClearButton>
            )}
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
          preloaded={preloaded}
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
          <span>{(preloaded ? publicCommentPlainPlaceholder : publicCommentPlaceholder)(language)}</span>
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
export const enrichGateLabel = language => uiText('Доповнити дані', language);

/**
 * Дві доріжки нотаток — одна плашка, і стоїть вона в кожній картці.
 *
 * Публічний відгук і власна нотатка — це два записи про ту саму людину, і
 * читають їх разом; тому і в рядку стрічки, і в плитці галереї, і у відкритій
 * картці вони йдуть парою, у сталому порядку: публічне зверху (відгук читають),
 * власне знизу (нотатку пишуть).
 *
 * **Порожня доріжка в стрічці згорнута в рядок «+ Відгук · + Памʼятка».**
 * Доти обидва поля стояли відкритими в кожній картці, і на сторінці з
 * тридцятьма картками це було шістдесят порожніх полів «Додати…» — кожна
 * картка ставала довшою за екран телефона, а людина гортала повз запрошення
 * писати замість фактів. Написане при цьому видно, як і було: доріжка
 * розгортається сама, щойно в ній є відгуки (прапорець `hasPublicReview` чи
 * прочитані), стан їх читання або власна памʼятка, — тож дописати поверх
 * запису, якого не бачиш, як і раніше, не можна. Запис коштує той самий один
 * дотик: кнопка в рядку відкриває поле й ставить у нього курсор.
 *
 * Згортає лише той, хто назвав наповненість (`hasPublicContent`,
 * `hasPrivateContent`); без цих пропсів обидві доріжки відкриті, як у
 * відкритій картці.
 */
const EMPTY_SHARED_NOTES = [];

export const ProfileNotes = ({
  language,
  publicSlot,
  privateSlot,
  reviewsStatus,
  hasReviews = false,
  hasPublicContent,
  hasPrivateContent,
  // «Повернутись пізніше» (`utils/matchingPostpone`): `{ until, onSet, onClear }`.
  // Третя доріжка поруч із відгуком і памʼяткою — це теж запис читача про
  // людину, тільки записаний датою.
  postpone,
  // Нотатки інших власників спільного доступу (`multiData/comments` чужого
  // піддерева) — лише на прочитання, курсивом під власною памʼяткою. Їх
  // показувала тільки відкрита картка; її більше немає, тож вони тут.
  sharedNotes = EMPTY_SHARED_NOTES,
}) => {
  const collapsible = hasPublicContent !== undefined || hasPrivateContent !== undefined;
  const [opened, setOpened] = useState({ public: false, private: false, postpone: false });
  const postponeUntil = postpone && isPostponedUntil(postpone.until) ? readPostponeDate(postpone.until) : '';
  const showPostpone = Boolean(postpone) && (Boolean(postponeUntil) || opened.postpone);
  const [focusLane, setFocusLane] = useState('');
  const publicLaneRef = useRef(null);
  const privateLaneRef = useRef(null);
  const showPublic = !collapsible || Boolean(hasPublicContent) || Boolean(reviewsStatus) || opened.public;
  const showPrivate = !collapsible || Boolean(hasPrivateContent) || opened.private;

  useEffect(() => {
    if (!focusLane) return;
    const lane = focusLane === 'public' ? publicLaneRef.current : privateLaneRef.current;
    const target = lane?.querySelector('textarea, [role="button"], button');
    if (target && typeof target.focus === 'function') target.focus();
    setFocusLane('');
  }, [focusLane]);

  const openLane = key => event => {
    event.stopPropagation();
    setOpened(previous => ({ ...previous, [key]: true }));
    setFocusLane(key);
  };

  return (
    <S.RowNotes onClick={e => e.stopPropagation()}>
      {/* `hasReviews` — прочитані відгуки, а не прапорець проєкції: прапорець
          лишається й після того, як останній відгук зняли, і червона смужка
          тоді обіцяла б те, чого під нею вже немає. */}
      {showPublic && (
        <NoteLane ref={publicLaneRef} $public $reviewed={hasReviews} data-testid="public-note-lane" data-reviewed={hasReviews ? 'true' : undefined}>
          <NoteLaneHead>
            <b>{profileUiText('publicComment', language)}</b>
          </NoteLaneHead>
          {publicSlot}
          <ReviewsStateNote>{reviewsStatus}</ReviewsStateNote>
        </NoteLane>
      )}
      {showPrivate && (
        <NoteLane ref={privateLaneRef}>
          <NoteLaneHead>
            <b>{profileUiText('personalNote', language)}</b>
          </NoteLaneHead>
          {privateSlot}
          {sharedNotes.map((text, index) => (
            <SharedCommentText key={`shared-note-${index}`}>{text}</SharedCommentText>
          ))}
        </NoteLane>
      )}
      {showPostpone && (
        <PostponeLane
          language={language}
          until={postponeUntil}
          onSet={months => {
            setOpened(previous => ({ ...previous, postpone: false }));
            postpone.onSet(months);
          }}
          onClear={() => {
            setOpened(previous => ({ ...previous, postpone: false }));
            postpone.onClear();
          }}
          onCancel={() => setOpened(previous => ({ ...previous, postpone: false }))}
        />
      )}
      {(!showPublic || !showPrivate || (postpone && !showPostpone)) && (
        <S.NotesAddRow data-testid="notes-add-row">
          {!showPublic && (
            <S.NotesAddButton type="button" $public onClick={openLane('public')}>
              <FaRegCommentDots aria-hidden="true" />
              <span>{uiText('Відгук', language)}</span>
            </S.NotesAddButton>
          )}
          {!showPrivate && (
            <S.NotesAddButton type="button" onClick={openLane('private')}>
              <FaRegStickyNote aria-hidden="true" />
              <span>{uiText('Памʼятка', language)}</span>
            </S.NotesAddButton>
          )}
          {postpone && !showPostpone && (
            <S.NotesAddButton
              type="button"
              $postpone
              title={uiText('Відкласти профіль — картка стане в кінець списку до обраної дати', language)}
              onClick={event => {
                event.stopPropagation();
                setOpened(previous => ({ ...previous, postpone: true }));
              }}
            >
              <FaRegClock aria-hidden="true" />
              <span>{uiText('Відкласти', language)}</span>
            </S.NotesAddButton>
          )}
        </S.NotesAddRow>
      )}
    </S.RowNotes>
  );
};

/*
 * Доріжка «Повернутись пізніше». Питання — реченням, яке читається саме:
 * «Повернутись до цього профілю через [1] [2] [3] [6] [9] [12] міс.» Обрана
 * відповідь стає датою, і доріжка каже вже її: «Повернетесь 03.01.2027 —
 * до того часу картка стоїть у кінці списку», з хрестиком, який знімає
 * відкладення.
 */
const PostponeLane = ({ language, until, onSet, onClear, onCancel }) => (
  <S.PostponeLane data-testid="postpone-lane">
    <NoteLaneHead>
      <b>{uiText('Відкласти профіль', language)}</b>
      {!until && (
        <S.PostponeCancel
          type="button"
          title={uiText('Відмінити', language)}
          aria-label={uiText('Відмінити', language)}
          onClick={event => { event.stopPropagation(); onCancel(); }}
        >
          ×
        </S.PostponeCancel>
      )}
    </NoteLaneHead>
    {until ? (
      <NoteFieldRow>
        <S.PostponeText>
          {uiText('Звернутись після {date}. До того картка стоїть у кінці списку', language, { date: formatPostponeDate(until) })}
        </S.PostponeText>
        <NoteClearButton
          type="button"
          title={uiText('Не відкладати', language)}
          aria-label={uiText('Не відкладати', language)}
          onClick={event => { event.stopPropagation(); onClear(); }}
        >
          ×
        </NoteClearButton>
      </NoteFieldRow>
    ) : (
      <>
        <S.PostponeText>{uiText('Повернутись до цього профілю через', language)}</S.PostponeText>
        <S.PostponeChoices>
          {POSTPONE_MONTH_OPTIONS.map(months => (
            <S.PostponeChoice
              key={months}
              type="button"
              title={formatPostponeDate(addMonthsIsoDate(months))}
              onClick={event => { event.stopPropagation(); onSet(months); }}
            >
              {months}
            </S.PostponeChoice>
          ))}
          <S.PostponeUnit>{uiText('міс. від сьогодні', language)}</S.PostponeUnit>
        </S.PostponeChoices>
      </>
    )}
  </S.PostponeLane>
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
/**
 * Один вигляд у стану читання відгуків — на всі екрани, де він показується.
 *
 * Рядок той самий і в картці стрічки, і у відкритій анкеті, і у формі
 * доповнення: «прочитали, відгуків немає» не мусить виглядати по-різному
 * залежно від того, звідки на ту саму людину дивляться.
 */
export const ReviewsStateNote = ({ children }) => (children
  ? <S.ReviewsGateNote aria-live="polite">{children}</S.ReviewsGateNote>
  : null);

export const describeReviewsState = ({ requested, loading, loaded, offline = false, count = 0 }, language) => {
  // Без звʼязку з базою читання не падає, а висить, і «Шукаємо» тут тривало б
  // вічно — тобто казало б неправду про те, що відбувається.
  if (loading && offline) return uiText('Немає звʼязку — відгуки прочитаються, щойно він повернеться', language);
  if (loading) return uiText('Шукаємо відгуки…', language);
  if (requested && !loaded) return uiText('Не вдалося прочитати відгуки', language);
  // Прочитана порожнеча мовчить: відгуки приїжджають самі, тож «відгуків
  // немає» — це просто порожня доріжка з полем для запису. Окремий рядок
  // «Публічних відгуків ще немає» займав місце в кожній картці й не казав
  // нічого, чого не видно й так.
  return '';
};

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
  onEditProfile,
  // Дотик до будь-якого контакту — дія (`recordContactAction`): `(user, channel)`.
  onContactAction,
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
  // Дочитати решту фото картки: проєкція стрічки несе один аватар, а
  // перелік знімків просить уже сам свайп по фото (`usePhotoSwipe`).
  onRequestPhotos,
  // Програми агенцій і клінік: хто читач, його анкета для «підходить N з M»,
  // курс і валюта показу. Один обʼєкт на всю стрічку (`Matching`).
  programsContext,
  // Прев'ю власної картки в «Моєму профілі»: картка та сама, але без
  // нотаток і ряду рішень — реагувати на себе й писати собі відгук нема
  // сенсу, а місця вони займали б більше за саму картку.
  preview = false,
  // Нотатки прев'ю — лише прочитати, без полів: `{ publicText, privateText }`.
  // Список чернеток малює картку тією самою, що й стрічка, і записане про
  // людину мусить стояти в ній там само — доріжками під карткою. Порожнє не
  // малюється зовсім: в прев'ю немає куди писати, тож порожнє поле лише
  // обіцяло б дію.
  previewNotes,
  // Роль анкети, яку малює цей рядок, коли картка несе дві — особисту й
  // організації (`listCardAnketaRoles`): тоді стрічка ставить два рядки, і
  // кожен показує лише своє. Без неї рядок — уся картка, як і раніше.
  anketaRole = '',
  // The feed projection remains the publication boundary after `user` is
  // hydrated with private/full-profile fields.
  publishedUser = user,
  // «Повернутись пізніше»: `{ until, onSet(months), onClear() }` — див. `ProfileNotes`.
  postpone,
  // Нотатки інших власників спільного доступу — див. `ProfileNotes`.
  sharedNotes,
}) => {
  // A limited profile is the projection a viewer without full access gets back
  // from a search: surname, name, age, region, city, and the public comment. There
  // is nothing else to expand into, so the row drops the metrics line, the detail
  // chevron, the edit button and the swipe actions rather than showing them empty.
  //
  // Фото в ній при цьому відкривається на весь екран, як і в повному рядку.
  const isLimited = user?.__limitedProfile === true;
  // Рядок стрічки говорить тією ж мовою, що й картка: підписи полів і слова,
  // які застосунок підставляє сам («пологів», «КС», «не заміжня»).
  const { language } = useAppSettings();
  const isOrganisationAnketa = Boolean(anketaRole) && isOrganisationAnketaRole(anketaRole);
  const isPersonAnketa = Boolean(anketaRole) && !isOrganisationAnketa;
  const showsOrganisation = !isPersonAnketa && (isOrganisationAnketa || listProfileRoles(user).some(isOrganisationAnketaRole));
  const organisationName = isOrganisationAnketa ? pickCurrentText(user?.agencyName) : '';
  const name = organisationName || getProfileName(user);
  const rowRole = anketaRole || getProfileRole(user);
  // Роль позначає дволітерний код — і на знімку, і в рядку імені, коли знімка
  // немає. Словом вона тут стояла («Донорка», «Agency»), і слово розходилось
  // саме з собою: у рядку одне, у відкритій картці інше, у фільтрах третє, а
  // зміна мови інтерфейсу міняла всі три. Код той самий, яким роль лежить у
  // даних, і однаковий на всіх екранах матчингу.
  const roleCode = getRoleCode(rowRole);
  const age = isOrganisationAnketa ? '' : getProfileAge(user);
  const location = getLocationLine(user, language);
  const photos = getProfilePhotos(user);
  const requestPhotos = useCallback(() => {
    if (onRequestPhotos) onRequestPhotos(user);
  }, [onRequestPhotos, user]);
  const photoSwipe = usePhotoSwipe({
    photos,
    complete: user?.__allPhotosLoaded === true,
    onRequestPhotos: onRequestPhotos && !isLimited ? requestPhotos : undefined,
  });
  const photo = photoSwipe.current || photos[0];
  // Дотик до фото відкриває його на весь екран (`PhotoViewer`) з того знімка,
  // який зараз у рядку. Відкритої картки, куди дотик вів раніше, більше
  // немає: вона показувала те саме, що рядок, лише більшим фото.
  const [viewerIndex, setViewerIndex] = useState(null);
  const photosComplete = user?.__allPhotosLoaded === true || !onRequestPhotos || isLimited;
  const openPhotoViewer = event => {
    event.stopPropagation();
    if (!photosComplete) requestPhotos();
    setViewerIndex(photoSwipe.index || 0);
  };
  const openPhotoViewerAt = index => {
    if (!photosComplete) requestPhotos();
    setViewerIndex(index);
  };
  const bio = isOrganisationAnketa ? '' : getProfileBio(user);
  // Картку складають ті самі три частини, що й відкриту картку
  // (`ProfileFacts`): смуга показників і короткі факти беруть самі поля картки
  // стрічки, тож стоять у рядку одразу й не міняються, коли приїхала повна
  // анкета; розділи повної анкети (`detailSections`) — лише під стрілкою.
  // Рядка фактів у курсиві («166/57 BMI 21 не заміжня Rh+») тут більше немає:
  // він казав те саме, що смуга й факти, іншим почерком, і стоїть лише в
  // плитці галереї, де на підписи немає ширини.
  // Агенцію, клініку й біологічних батьків описують не тіло й пологи, а те,
  // що вони пропонують чи шукають (`CardRoleBlock`): смуга «зріст, вага, ІМТ»
  // під агенцією казала донорці рівно нічого.
  const isCounterparty = isOrganisationAnketa || (!isPersonAnketa && isCounterpartyCard(user));
  const statCells = useMemo(() => (isLimited || isCounterparty ? [] : buildProfileStatStrip(user, language)), [isCounterparty, isLimited, language, user]);
  const summaryRows = useMemo(() => (isLimited || isCounterparty ? [] : buildProfileSummaryRows(user, language)), [isCounterparty, isLimited, language, user]);
  const detailSections = useMemo(
    () => (isLimited || isOrganisationAnketa ? [] : buildProfileDetailSections(user, language)),
    [isLimited, isOrganisationAnketa, language, user]
  );
  // Блок організації не бачить особистих ролей, але зберігає анкету батьків:
  // `listCardAnketaRoles` не створює для `ip` третього рядка, тож інакше її
  // «кого шукають» зникло б з усіх рядків картки `ed + ag + ip`.
  const roleBlockCard = useMemo(
    () => (isOrganisationAnketa ? {
      ...user,
      role: [anketaRole, ...listProfileRoles(publishedUser).filter(role => role === 'ip')],
      userRole: [anketaRole, ...listProfileRoles(publishedUser).filter(role => role === 'ip')],
    } : user),
    [anketaRole, isOrganisationAnketa, publishedUser, user]
  );
  const roleAccent = getRoleColor(rowRole);
  const contactEntries = useMemo(
    () => (isLimited ? [] : getContactEntries(user).filter(entry => entry.key !== 'vk')),
    [isLimited, user]
  );
  const hasLocation = Boolean(location);
  const postponedUntil = postpone && !isLimited && isPostponedUntil(postpone.until) ? readPostponeDate(postpone.until) : '';

  // Контакти стоять у рядку самі, без кнопки «Контакти»: у картці стрічки
  // їх немає (вони живуть в окремому вузлі за межею приватності), тож рядок,
  // щойно зʼявився на екрані, просить їх сам (`onRequestContacts`) — одним
  // точковим читанням `profileContacts/{id}` і лише там, де за ними щось
  // стоїть (`canViewContacts`: картка в стрічці, тобто з `feedDate`, власна
  // чернетка або службовий доступ). Кнопка коштувала рядка в ряду рішень і
  // дотику на кожну картку заради двох рядків значків.
  const shouldLoadContacts = Boolean(onRequestContacts) && !isLimited && canViewContacts && contactEntries.length === 0;
  const cardRef = useRef(null);
  const contactsRequestedRef = useRef(false);
  useEffect(() => {
    if (!shouldLoadContacts || contactsRequestedRef.current) return undefined;
    const node = cardRef.current;
    const request = () => {
      if (contactsRequestedRef.current) return;
      contactsRequestedRef.current = true;
      onRequestContacts(user);
    };
    // Просимо лише для рядків, які справді на екрані (з запасом на екран
    // уперед), а не для всієї сторінки наперед.
    if (!node || typeof IntersectionObserver === 'undefined') {
      request();
      return undefined;
    }
    const observer = new IntersectionObserver(observed => {
      if (observed.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        request();
      }
    }, { rootMargin: '600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onRequestContacts, shouldLoadContacts, user]);

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
  const hasMoreDetails = detailSections.length > 0 || Boolean(bio);

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

  // Читання відгуків більше не чекає на дотик: його починає сам ефект стрічки,
  // щойно в проєкції картки стоїть прапорець `hasPublicReview` (`Matching.jsx`,
  // ефект над `requestPublicComments`). Рядок про це не питає нікого — він лише
  // описує вже почате читання словом (`describeReviewsState` нижче), тож
  // локальної позначки «просили» тут більше не тримають.
  const hasPublicReview = Boolean(user?.[MATCHING_CARD_REVIEW_FLAG_FIELD]);

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
    // Дотик до картки розгортає її. Відкритої картки, куди він вів раніше,
    // більше немає: вона повторювала рядок, лише з більшим фото, — а фото тепер
    // відкривається на весь екран дотиком до самого фото. Урізану проєкцію
    // розгортати нема чим: метрик і контактів у ній немає.
    if (isLimited) return;
    if (onToggleExpand) onToggleExpand(user.userId);
  };

  return (
    <S.Card
      $role={rowRole}
      // Якір для відновлення позиції: повернувшись до стрічки, сторінка шукає
      // саме цей рядок, а не піксель (див. `SCROLL_ANCHOR_KEY` у `Matching`).
      data-card-id={user?.userId}
      ref={cardRef}
      onClick={handleRowClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Фото стоїть перед усім текстом і на всю ширину картки: у списку
          гортають саме його, а плиткою 52 px збоку воно не показувало нічого.
          Плитки з ініціалами тут немає й не було: вона повторювала імʼя, яке
          стоїть рядком нижче. Немає фото — рядок починається з імені, а «хто
          це» несе смужка ролі на лівому краї картки. */}
      {showsOrganisation ? (
        <AgencyMediaCarousel
          card={roleBlockCard}
          photos={photos}
          programsContext={programsContext}
          language={language}
          onOpenPhoto={openPhotoViewerAt}
        />
      ) : photo && (
        <S.Photo
          {...photoSwipe.handlers}
          $loading={photoSwipe.loading}
          data-testid="row-photo"
          onClick={openPhotoViewer}
        >
          <PhotoSwipeStage swipe={photoSwipe} photo={photo} loading={photoSwipe.loading} />
          {/* Роль лежить на знімку — там само, де її малювала відкрита
              картка, поки вона була. Під іменем вона стояла чіпом і забирала
              ширину в локації. */}
          {roleCode && <S.PhotoRoleBadge $role={rowRole}>{getRoleLabel(rowRole, language)}</S.PhotoRoleBadge>}
          {photoSwipe.total > 1 && (
            <S.PhotoCount>
              {photoSwipe.index > 0 ? `${photoSwipe.index + 1}/${photoSwipe.total}` : photoSwipe.total}
            </S.PhotoCount>
          )}
          {/* Цятка публікації — на фото, у правому верхньому куті. Це стан
              картки, а не дія над нею, і адмін читає його одним поглядом по
              фото, а не шукає в стовпчику кнопок під ним. */}
          {isAdmin && onTogglePublish && !isLimited && (
            <S.PhotoPublishDot
              type="button"
              $published={isPublished}
              title={uiText(isPublished ? 'Зняти з публікації' : 'Опублікувати', language)}
              aria-label={uiText(isPublished ? 'Зняти з публікації' : 'Опублікувати', language)}
              aria-pressed={isPublished}
              onClick={e => { e.stopPropagation(); onTogglePublish(user); }}
            />
          )}
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
            {!photo && roleCode && <S.RoleCode $role={rowRole}>{getRoleLabel(rowRole, language)}</S.RoleCode>}
          </S.NameRow>
          {hasLocation && (
            <S.MetaRow>
              <S.Location>
                <FaMapMarkerAlt aria-hidden="true" />
                <span>{location}</span>
              </S.Location>
            </S.MetaRow>
          )}
          {/* Відкладена картка видна одразу, а не лише в кінці списку: плашка
              під імʼям каже, що до людини звертатись пізніше й коли саме. */}
          {postponedUntil && (
            <S.PostponeBadge data-testid="postpone-badge">
              <FaRegClock aria-hidden="true" />
              <span>{uiText('Звернутись після {date}', language, { date: formatPostponeDate(postponedUntil) })}</span>
            </S.PostponeBadge>
          )}
        </S.Body>
        <S.Ctrl>
          <S.RowActionStack>
            {/* Цятці публікації нема на чому лежати без фото — тут вона
                лишається запасним шляхом (див. `S.PhotoPublishDot` вище). */}
            {!photo && isAdmin && onTogglePublish && !isLimited && (
              <PublishDot
                type="button"
                $published={isPublished}
                title={uiText(isPublished ? 'Зняти з публікації' : 'Опублікувати', language)}
                aria-label={uiText(isPublished ? 'Зняти з публікації' : 'Опублікувати', language)}
                aria-pressed={isPublished}
                onClick={e => { e.stopPropagation(); onTogglePublish(user); }}
              />
            )}
            {/* Олівця тут більше немає: він стоїть у ряду рішень, на місці
                колишньої стрілки «розгорнути» (див. ряд рішень нижче). */}
          </S.RowActionStack>
        </S.Ctrl>
      </S.Top>

      {/* Метрики — на всю ширину картки, а не в колонці поруч із фото.
          Поруч із фото їм лишалось десь дві третини рядка, і «пологи 4, 6 міс
          тому» переносилось на третій рядок там, де на повну ширину стає двох.
          А головне — ліва межа: усе, що нижче (контакти, «всі дані», нотатки,
          ряд рішень), починається від краю картки, і рядок метрик посеред них
          був єдиним зсунутим. Відступ лишився рівно один і очевидний — під
          саме імʼя, поруч із фото. */}
      {/* Смуга показників і короткі факти — ті самі, що вгорі відкритої
          картки, і з тих самих полів картки стрічки: рядок і картка кажуть
          про людину одне й те саме однаковими словами. */}
      <ProfileStatStrip cells={statCells} />
      <ProfileFactList rows={summaryRows} />
      {!isLimited && !isPersonAnketa ? <CardRoleBlock card={roleBlockCard} programsContext={programsContext} language={language} showPrograms={!showsOrganisation} /> : null}

      {/* «Детальніше» — під коротким описом, посеред картки, а не стрілкою в
          правому кінці ряду рішень: розгортають саме те, що щойно прочитали,
          і палець не мусить іти в куток екрана повз серце й хрестик.
          Розгорнуте лягає просто під кнопку. */}
      {/* У прев'ю кнопка є лише там, де екран дав `onToggleExpand`
          («Мій профіль»), і лише коли під нею щось є: стрічка дочитує анкету
          на дотик, а прев'ю вже несе її всю. */}
      {canExpandDetails && onToggleExpand && (!preview || hasMoreDetails) && (
        <S.RowDetailsToggle
          type="button"
          data-testid="row-details-toggle"
          $turn={expanded}
          aria-expanded={expanded}
          onClick={e => { e.stopPropagation(); onToggleExpand(user.userId); }}
        >
          <span>{uiText(expanded ? 'Згорнути' : 'Детальніше', language)}</span>
          <FaChevronDown size={11} aria-hidden="true" />
        </S.RowDetailsToggle>
      )}

      {/* Порожнього блоку «всі дані» не буває: без жодного поля він малював
          рамку з написом «Додаткових даних немає», тобто зайвий рядок і
          відступ у картці, який нічого не казав. */}
      {expanded && !isLimited && hasMoreDetails && (
        <S.More $afterToggle onClick={e => e.stopPropagation()}>
          {/* Під кнопкою — розділи повної анкети, ті самі й у тому самому
              порядку, що й у формі (`ProfileFacts`). */}
          <ProfileAboutSection text={bio} language={language} accent={roleAccent} />
          <ProfileDetailSections sections={detailSections} accent={roleAccent} />
        </S.More>
      )}

      {contactEntries.length > 0 && (
        <S.RowContacts onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
          <ContactLinks
            entries={contactEntries}
            language={language}
            onContactAction={onContactAction ? channel => onContactAction(user, channel) : undefined}
          />
        </S.RowContacts>
      )}

      {/* Нотатки — одна плашка на дві доріжки: спершу те, що про людину
          написали інші, під ним — те, що дописує читач. Доріжки ті самі, що
          й у відкритій картці та в плитці галереї, разом із підписом над
          кожною: хто побачить запис, має бути сказано там, де його пишуть, а
          не лише в порожньому полі — «Додати коментар» про це мовчало.

          Обидві стоять відкритим полем, а не за кнопкою: читач гортає список,
          аби вирішити, і лишити запис — що власний, що публічний — має
          коштувати один дотик просто тут. Публічну доріжку колись відкривала
          кнопка «перевірити відгуки», тобто написати відгук можна було лише
          дорогою до чужих. Тепер читання чужих не чекає й на дотик: `reviewsSlot`
          несе прочитане, щойно прапорець `hasPublicReview` картки скаже, що
          воно є (ефект стрічки в `Matching.jsx`), а картці без прапорця в
          доріжці й далі стоїть саме поле. */}
      {!preview ? <ProfileNotes
        language={language}
        postpone={isLimited ? undefined : postpone}
        publicSlot={reviewsSlot}
        hasReviews={(reviewsAction?.count || 0) > 0}
        hasPublicContent={hasPublicReview || (reviewsAction?.count || 0) > 0}
        hasPrivateContent={commentSlot !== undefined || Boolean(String(clientComment || '').trim()) || (sharedNotes?.length || 0) > 0}
        sharedNotes={sharedNotes}
        reviewsStatus={describeReviewsState({
          requested: hasPublicReview,
          loading: Boolean(reviewsAction?.loading),
          loaded: Boolean(reviewsAction?.loaded),
          offline: Boolean(reviewsAction?.offline),
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
      /> : null}

      {preview && (previewNotes?.publicText || previewNotes?.privateText) ? (
        <S.RowNotes data-testid="preview-notes">
          {previewNotes.publicText ? (
            <NoteLane $public>
              <NoteLaneHead><b>{profileUiText('publicComment', language)}</b></NoteLaneHead>
              <S.PreviewNoteText>{previewNotes.publicText}</S.PreviewNoteText>
            </NoteLane>
          ) : null}
          {previewNotes.privateText ? (
            <NoteLane>
              <NoteLaneHead><b>{profileUiText('personalNote', language)}</b></NoteLaneHead>
              <S.PreviewNoteText>{previewNotes.privateText}</S.PreviewNoteText>
            </NoteLane>
          ) : null}
        </S.RowNotes>
      ) : null}

      {/* Ряд рішень — останній у картці: спершу все, що вона каже про людину,
          потім те, що читач про неї записав, і аж тоді жест.

          Порядок у ряду сталий: хрестик і серце → олівець. Реакції стоять
          парою в спільній рамці, бо це два боки одного вибору, а не два
          незалежні значки. Усередині пари `primaryAction` іде першим: у
          стрічці це хрестик, щоб лайк стояв праворуч.

          Праворуч тут стояла стрілка «розгорнути» — і розгорнути анкету
          означало тягнутись у куток екрана. Розгортання переїхало під опис
          людини кнопкою «Детальніше», а на його місце став олівець: дія над
          самою карткою поруч із рішеннями про неї. Угорі біля імені олівця
          більше немає.

          Підписів у ряду немає: ці кнопки раніше були широкими рядками з
          написами («Доповнити дані», «Перевірити наявність відгуків»), і
          картка з трьох фактів займала пів екрана. Що робить кожна, каже
          `title` і `aria-label` — саме їх читає й екранний диктор. */}
      {/* Прев'ю ряду рішень не має, доки йому не дали реакцій: шапка чернетки
          їх дає (рішення про картку там те саме, що й у стрічці), «Мій
          профіль» — ні, бо реагувати на себе нема сенсу. Олівця в прев'ю
          немає ніде: воно й так стоїть над формою. */}
      {(preview ? !isLimited && (primaryAction || secondaryAction) : (editAction || (!isLimited && (primaryAction || secondaryAction)))) && (
        <S.RowFooterActions onClick={e => e.stopPropagation()}>
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
          {/* Олівець — на колишньому місці стрілки «розгорнути»: розгортання
              переїхало під опис людини словом «Детальніше», а дія над самою
              карткою стала поруч із рішеннями про неї. */}
          {editAction && !preview && (
            <S.RowFooterButton
              type="button"
              data-testid="row-edit-action"
              title={editAction.title}
              aria-label={editAction.title}
              onClick={e => { e.stopPropagation(); editAction.onClick(user); }}
            >
              <FaPencilAlt size={12} />
            </S.RowFooterButton>
          )}
        </S.RowFooterActions>
      )}

      {diagnosticsSlot}

      {viewerIndex !== null && photos.length > 0 && (
        <PhotoViewer
          photos={photos}
          index={Math.min(viewerIndex, photos.length - 1)}
          closeOnHistoryBack
          onReachEnd={photosComplete ? undefined : requestPhotos}
          onClose={() => setViewerIndex(null)}
        />
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
  && prev.onTogglePublish === next.onTogglePublish
  && prev.primaryAction?.active === next.primaryAction?.active
  && prev.secondaryAction?.active === next.secondaryAction?.active
  && prev.priorityMetricKeys === next.priorityMetricKeys
  && prev.commentSlot === next.commentSlot
  && prev.reviewsSlot === next.reviewsSlot
  && prev.previewNotes?.publicText === next.previewNotes?.publicText
  && prev.previewNotes?.privateText === next.previewNotes?.privateText
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
  && prev.onRequestPhotos === next.onRequestPhotos
  && prev.programsContext === next.programsContext
  && prev.postpone?.ownerId === next.postpone?.ownerId
  && prev.postpone?.until === next.postpone?.until
  && prev.sharedNotes === next.sharedNotes
));
