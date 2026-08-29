import { getCurrentValue } from './getCurrentValue';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import { normalizeCountry, normalizeRegion } from './normalizeLocation';
import { convertDriveLinkToImage } from '../utils/convertDriveLinkToImage';
import { CONTACT_FIELDS, getContactValues } from './contactMethods';
import { normalizeProfileRole } from '../utils/profileRole';

const EMPTY_VALUES = new Set(['', '-', '—', 'n/a', 'na', 'null', 'undefined', 'none', 'немає', 'нет']);

const getMatchingCurrentValue = value => {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const current = getMatchingCurrentValue(value[index]);
      if (current !== undefined && current !== null && String(current).trim() !== '') return current;
    }
    return undefined;
  }
  return getCurrentValue(value);
};

export const normalizeDisplayValue = value => {
  const current = getMatchingCurrentValue(value);
  if (Array.isArray(current)) {
    return current.map(normalizeDisplayValue).filter(Boolean).join(', ');
  }
  if (current && typeof current === 'object') {
    return Object.values(current).map(normalizeDisplayValue).filter(Boolean).join(', ');
  }
  if (current === null || current === undefined) return '';
  const normalized = String(current).trim();
  if (!normalized || EMPTY_VALUES.has(normalized.toLowerCase())) return '';
  return normalized;
};

export const shouldRenderField = value => Boolean(normalizeDisplayValue(value));

const YES_TOKENS = new Set(['yes', 'true']);
const NO_TOKENS = new Set(['no', 'false']);

const yesNoLabel = (rawValue, yesText, noText) => {
  const normalized = normalizeDisplayValue(rawValue).toLowerCase();
  if (!normalized) return '';
  if (YES_TOKENS.has(normalized)) return yesText;
  if (NO_TOKENS.has(normalized)) return noText;
  return normalizeDisplayValue(rawValue);
};

export const maritalStatusLabel = value => yesNoLabel(value, 'заміжня', 'не заміжня');
export const glassesLabel = value => yesNoLabel(value, 'так', 'ні');
const ownKidsBooleanLabel = value => yesNoLabel(value, 'є', 'немає');

// blood is stored as one combined field ("3+", "2", "+", "AB-", roman numerals,
// Ukrainian "І" instead of Latin "I", verbose Rh words, etc). Parse it into an
// ABO letter and a Rh sign so the two missing-half cases (bare sign, bare
// group) can be rendered with context instead of as a lone character.
const CYRILLIC_I_RE = /[Іі]/g;
const toLatinRoman = value => value.replace(CYRILLIC_I_RE, ch => (ch === 'І' ? 'I' : 'i'));

const ABO_LETTER_BY_TOKEN = {
  '1': 'O', i: 'O', o: 'O',
  '2': 'A', ii: 'A', a: 'A',
  '3': 'B', iii: 'B', b: 'B',
  '4': 'AB', iv: 'AB', ab: 'AB',
};
const ABO_TOKEN_RE = /^(iv|iii|ii|ab|i|a|b|o|[1-4])/i;
const RH_POSITIVE_RE = /^(rh)?\s*(\+|pos(itive)?)$/i;
const RH_NEGATIVE_RE = /^(rh)?\s*(-|neg(ative)?)$/i;

export const parseBloodValue = rawValue => {
  const trimmed = toLatinRoman(String(rawValue ?? '').trim());
  if (!trimmed) return { abo: '', rh: '' };

  let rest = trimmed;
  let abo = '';
  const aboMatch = rest.match(ABO_TOKEN_RE);
  if (aboMatch) {
    abo = ABO_LETTER_BY_TOKEN[aboMatch[1].toLowerCase()] || '';
    rest = rest.slice(aboMatch[0].length).trim();
  }

  let rh = '';
  const rhCandidate = rest.replace(/−/g, '-').trim();
  if (rhCandidate) {
    if (RH_POSITIVE_RE.test(rhCandidate)) rh = '+';
    else if (RH_NEGATIVE_RE.test(rhCandidate)) rh = '-';
  }

  return { abo, rh };
};

export const formatBloodGroup = (abo, rh) => {
  const sign = rh === '+' ? '+' : rh === '-' ? '−' : '';
  if (abo && sign) return `${abo}${sign}`;
  if (abo) return abo;
  if (sign) return `Rh${sign}`;
  return null;
};

export const getBloodGroupDisplay = user => {
  const { abo, rh } = parseBloodValue(normalizeDisplayValue(user?.blood));
  return formatBloodGroup(abo, rh);
};

export const getProfileRole = user => {
  const role = normalizeDisplayValue(user?.role || user?.userRole).toLowerCase();
  const normalizedRole = normalizeProfileRole(role);
  if (normalizedRole) return normalizedRole;
  return 'other';
};

export const getRoleLabel = role => {
  if (role === 'ed') return 'Egg donor';
  if (role === 'ag') return 'Agency';
  if (role === 'ip') return 'Intended parents';
  if (role === 'sm') return 'Surrogate mother';
  if (role === 'cl') return 'Client';
  return 'Profile';
};

/**
 * Дволітерний код ролі для плитки стрічки.
 *
 * На картці ширини під «Intended parents» немає, а знати, хто перед тобою,
 * треба ще до відкриття анкети. Код — це той самий рядок, яким роль лежить у
 * даних, тільки великими: він і короткий, і збігається з тим, що показують
 * фільтри. Роль, якої немає в переліку, коду не отримує — краще нічого, ніж
 * позначка, яку нема як прочитати.
 */
const ROLE_CODES = { ed: 'ED', sm: 'SM', ip: 'IP', ag: 'AG', cl: 'CL' };

export const getRoleCode = role => ROLE_CODES[String(role || '').trim().toLowerCase()] || '';

const getEmailName = user => {
  const email = normalizeDisplayValue(user?.email);
  if (!email) return '';
  return email.split('@')[0].trim();
};

const normalizeNameKey = part => part.toLowerCase().replace(/\s+/g, ' ').trim();

const isDuplicateNameKey = (seen, key) => {
  const keyTokens = key.split(' ');

  return Array.from(seen).some(existingKey => {
    const existingTokens = existingKey.split(' ');
    return existingKey === key
      || keyTokens.every(token => existingTokens.includes(token));
  });
};

const appendUniqueNamePart = (parts, seen, part) => {
  const key = normalizeNameKey(part);
  if (!key || isDuplicateNameKey(seen, key)) return;
  seen.add(key);
  parts.push(part);
};

const getPrimaryNamePart = user => [user?.name, user?.surname]
  .map(normalizeDisplayValue)
  .filter(Boolean)
  .join(' ');

const getUniqueNameParts = user => {
  const parts = [];
  const seen = new Set();

  [getPrimaryNamePart(user), user?.nameWife, user?.nameHusband]
    .map(normalizeDisplayValue)
    .filter(Boolean)
    .forEach(part => appendUniqueNamePart(parts, seen, part));

  return parts;
};

export const getProfileName = user => {
  const name = getUniqueNameParts(user).join(' ');
  return name || getEmailName(user);
};

export const getProfileAge = user => {
  const birth = normalizeDisplayValue(user?.birth);
  if (!birth) return '';
  const age = utilCalculateAge(birth);
  return age ? String(age) : '';
};

export const getProfileLocation = user => {
  const country = normalizeCountry(normalizeDisplayValue(user?.country));
  const region = normalizeRegion(normalizeDisplayValue(user?.region));
  const city = normalizeDisplayValue(user?.city);
  return [country, city || region].filter(Boolean).join(', ') || region || city;
};

export const getProfilePhotos = user => {
  const rawPhotos = Array.isArray(user?.photos) ? user.photos : [user?.photos, user?.photo, user?.avatar];
  return [...new Set(rawPhotos.map(normalizeDisplayValue).filter(Boolean).map(convertDriveLinkToImage))];
};

// `resolved: true` marks getters that already return final human-readable text
// (e.g. "немає"), which must not be re-run through normalizeDisplayValue's
// EMPTY_VALUES sentinel stripping - that set exists to drop raw DB placeholders
// like "-"/"n/a", but it also happens to contain the word "немає" itself, which
// would otherwise wrongly delete an intentionally rendered "немає" answer.
const field = (key, label, valueGetter, sourceKeys, { resolved = false } = {}) => ({
  key,
  label,
  valueGetter,
  sourceKeys: sourceKeys || [key],
  resolved,
});
const valueFor = (user, item) => {
  if (!item.valueGetter) return normalizeDisplayValue(user?.[item.key]);
  const result = item.valueGetter(user);
  if (item.resolved) return typeof result === 'string' ? result.trim() : normalizeDisplayValue(result);
  return normalizeDisplayValue(result);
};
const isExcluded = (item, excludeKeys = []) => {
  const excluded = new Set(excludeKeys || []);
  return [item.key, ...(item.sourceKeys || [])].some(key => excluded.has(key));
};
const toDisplayFields = (items, user, excludeKeys = []) =>
  items
    .filter(item => !isExcluded(item, excludeKeys))
    .map(item => ({ ...item, value: valueFor(user, item) }))
    .filter(item => (item.resolved ? Boolean(item.value) : shouldRenderField(item.value)));

export const bmiValue = user => {
  const explicit = normalizeDisplayValue(user?.bmi);
  if (explicit) return explicit;
  const weight = Number(normalizeDisplayValue(user?.weight));
  const height = Number(normalizeDisplayValue(user?.height));
  if (!weight || !height) return '';
  return String(Math.round((weight / (height * height)) * 10000));
};

const ownKidsValue = user => {
  const raw = normalizeDisplayValue(user?.ownKids);
  const compact = raw.toLowerCase();
  if (!raw) return '';
  if (['0', 'no', 'ні', 'нет'].includes(compact)) return 'No';
  if (/^[1-9]/.test(compact) || ['yes', 'так', 'да'].includes(compact)) return 'Yes';
  return raw;
};

const ownKidsDisplayValue = user => ownKidsBooleanLabel(ownKidsValue(user));
const maritalStatusDisplayValue = user => maritalStatusLabel(user?.maritalStatus);
const glassesDisplayValue = user => glassesLabel(user?.glasses);

const donorExperienceValue = user => {
  const exp = normalizeDisplayValue(user?.experience || user?.donationExperience || user?.previousDonation);
  const count = normalizeDisplayValue(user?.donationCount || user?.donationsCount);
  if (exp && count) return `${exp} · ${count}`;
  return exp || count;
};

const heroFields = {
  ed: [
    field('height', 'Height'),
    field('weight', 'Weight'),
    field('bmi', 'BMI', bmiValue, ['bmi']),
    field('blood', 'Blood/Rh', getBloodGroupDisplay, ['blood'], { resolved: true }),
    field('experience', 'Exp', donorExperienceValue, ['experience', 'donationExperience', 'previousDonation', 'donationCount', 'donationsCount']),
  ],
  ip: [
    field('country', 'Country'),
    field('city', 'City'),
    field('maritalStatus', 'Family', maritalStatusDisplayValue, ['maritalStatus'], { resolved: true }),
    field('programInterest', 'Program'),
    field('lookingFor', 'Looking for'),
  ],
  ag: [
    field('country', 'Country'),
    field('city', 'City'),
    field('services', 'Services'),
    field('profession', 'Specialization'),
  ],
  pp: [
    field('country', 'Country'),
    field('city', 'City'),
    field('services', 'Services'),
  ],
  cl: [
    field('country', 'Country'),
    field('city', 'City'),
    field('services', 'Services'),
  ],
  other: [field('country', 'Country'), field('city', 'City'), field('role', 'Role')],
};

const quickFacts = {
  ed: [
    ...heroFields.ed,
  ],
  ip: [
    field('country', 'Country'),
    field('city', 'City'),
    field('maritalStatus', 'Family status', maritalStatusDisplayValue, ['maritalStatus'], { resolved: true }),
    field('programInterest', 'Program interest'),
    field('budget', 'Budget'),
  ],
  ag: [
    field('country', 'Country'),
    field('city', 'City'),
    field('services', 'Services'),
    field('profession', 'Specialization'),
  ],
  pp: [
    field('country', 'Country'),
    field('city', 'City'),
    field('services', 'Services'),
    field('programInterest', 'Program interest'),
  ],
  cl: [
    field('country', 'Country'),
    field('city', 'City'),
    field('services', 'Services'),
    field('programInterest', 'Program interest'),
  ],
  other: [field('country', 'Country'), field('city', 'City'), field('profession', 'Profession')],
};

const sectionConfig = {
  ed: [
    { title: 'Main information', fields: [
      field('education', 'Education'), field('profession', 'Profession'), field('maritalStatus', 'Marital status', maritalStatusDisplayValue, ['maritalStatus'], { resolved: true }),
      field('ownKids', 'Own kids', ownKidsDisplayValue, ['ownKids'], { resolved: true }), field('clothingSize', 'Clothing'), field('shoeSize', 'Shoe'),
    ] },
    { title: 'Appearance', variant: 'chips', fields: [
      field('eyeColor', 'Eyes'), field('hairColor', 'Hair color'), field('hairStructure', 'Hair structure'),
      field('faceShape', 'Face shape'), field('noseShape', 'Nose'), field('lipsShape', 'Lips'),
      field('chin', 'Chin'), field('bodyType', 'Body type'), field('breastSize', 'Breast size'),
      field('race', 'Race'), field('glasses', 'Glasses', glassesDisplayValue, ['glasses'], { resolved: true }),
    ] },
    { title: 'Donation experience', fields: [
      field('experience', 'Previous donation'), field('donationCount', 'Donation count'), field('donationsCount', 'Donations'),
      field('cSection', 'C-section', user => user?.cSection || user?.csection || user?.c_section || user?.cesareanSection, ['cSection', 'csection', 'c_section', 'cesareanSection']),
    ] },
  ],
  ip: [
    { title: 'Main information', fields: [
      field('country', 'Country'), field('city', 'City'), field('region', 'Region'), field('maritalStatus', 'Family status', maritalStatusDisplayValue, ['maritalStatus'], { resolved: true }),
      field('programInterest', 'Program interest'), field('lookingFor', 'Looking for'), field('budget', 'Budget'),
    ] },
  ],
  ag: [
    { title: 'Agency details', fields: [
      field('agencyName', 'Agency name'), field('country', 'Country'), field('city', 'City'), field('services', 'Services'),
      field('profession', 'Specialization'),
    ] },
  ],
  pp: [
    { title: 'Main information', fields: [
      field('country', 'Country'),
      field('city', 'City'),
      field('region', 'Region'),
      field('programInterest', 'Program interest'),
      field('lookingFor', 'Looking for'),
      field('budget', 'Budget'),
      field('services', 'Services'),
    ] },
  ],
  cl: [
    { title: 'Main information', fields: [
      field('country', 'Country'),
      field('city', 'City'),
      field('region', 'Region'),
      field('programInterest', 'Program interest'),
      field('lookingFor', 'Looking for'),
      field('budget', 'Budget'),
      field('services', 'Services'),
    ] },
  ],
  other: [
    { title: 'Main information', fields: [field('country', 'Country'), field('city', 'City'), field('profession', 'Profession'), field('education', 'Education')] },
  ],
};

export const getHeroFields = (user, role = getProfileRole(user), { excludeKeys = [] } = {}) =>
  toDisplayFields(heroFields[role] || heroFields.other, user, excludeKeys).slice(0, 6);

export const getQuickFacts = (user, role = getProfileRole(user), { excludeKeys = [] } = {}) =>
  toDisplayFields(quickFacts[role] || quickFacts.other, user, excludeKeys).slice(0, 8);

const contactFields = CONTACT_FIELDS.map(key =>
  field(
    key,
    key === 'otherLink' ? 'Other link' : key.charAt(0).toUpperCase() + key.slice(1),
    user => getContactValues(user, key, getMatchingCurrentValue).join(', ')
  )
);

export const getProfileSections = (user, role = getProfileRole(user), { excludeKeys = [] } = {}) => {
  const sections = (sectionConfig[role] || sectionConfig.other).map(section => ({
    ...section,
    fields: toDisplayFields(section.fields, user, excludeKeys),
  })).filter(section => section.fields.length > 0);

  const contacts = toDisplayFields(contactFields, user, excludeKeys);
  if (contacts.length > 0) sections.push({ title: 'Contacts', fields: contacts, variant: 'contacts' });
  return sections;
};

export const getProfileBio = user =>
  normalizeDisplayValue(user?.publicComment || user?.moreInfo_main || user?.comment || user?.description || user?.about || user?.bio);
