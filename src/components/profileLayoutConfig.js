import { getCurrentValue } from './getCurrentValue';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import { normalizeCountry, normalizeRegion } from './normalizeLocation';
import { convertDriveLinkToImage } from '../utils/convertDriveLinkToImage';
import { CONTACT_FIELDS, getContactValues } from './contactMethods';

const EMPTY_VALUES = new Set(['', '-', '—', 'n/a', 'na', 'null', 'undefined', 'none', 'немає', 'нет']);

export const normalizeDisplayValue = value => {
  const current = getCurrentValue(value);
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

export const getProfileRole = user => {
  const role = normalizeDisplayValue(user?.role || user?.userRole).toLowerCase();
  if (['ed', 'egg donor', 'egg_donor'].includes(role)) return 'ed';
  if (['ag', 'agency'].includes(role)) return 'ag';
  if (['ip', 'intended parents', 'intended_parent'].includes(role)) return 'ip';
  if (user?.__sourceCollection === 'newUsers' && !role) return 'ed';
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

const getEmailName = user => {
  const email = normalizeDisplayValue(user?.email);
  if (!email) return '';
  return email.split('@')[0].trim();
};

export const getProfileName = user => {
  const name = [user?.name, user?.surname, user?.nameWife, user?.nameHusband]
    .map(normalizeDisplayValue)
    .filter(Boolean)
    .join(' ');
  return name || getEmailName(user);
};

export const getProfileAge = user => {
  if (!user?.birth) return '';
  const age = utilCalculateAge(user.birth);
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

const field = (key, label, valueGetter, sourceKeys) => ({
  key,
  label,
  valueGetter,
  sourceKeys: sourceKeys || [key],
});
const valueFor = (user, item) => normalizeDisplayValue(item.valueGetter ? item.valueGetter(user) : user?.[item.key]);
const isExcluded = (item, excludeKeys = []) => {
  const excluded = new Set(excludeKeys || []);
  return [item.key, ...(item.sourceKeys || [])].some(key => excluded.has(key));
};
const toDisplayFields = (items, user, excludeKeys = []) =>
  items
    .filter(item => !isExcluded(item, excludeKeys))
    .map(item => ({ ...item, value: valueFor(user, item) }))
    .filter(item => shouldRenderField(item.value));

const bmiValue = user => {
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
    field('blood', 'Blood/Rh'),
    field('experience', 'Exp', donorExperienceValue, ['experience', 'donationExperience', 'previousDonation', 'donationCount', 'donationsCount']),
  ],
  ip: [
    field('country', 'Country'),
    field('city', 'City'),
    field('maritalStatus', 'Family'),
    field('programInterest', 'Program'),
    field('lookingFor', 'Looking for'),
  ],
  ag: [
    field('country', 'Country'),
    field('city', 'City'),
    field('services', 'Services'),
    field('profession', 'Specialization'),
  ],
  other: [field('country', 'Country'), field('city', 'City'), field('role', 'Role')],
};

const quickFacts = {
  ed: [
    ...heroFields.ed,
    field('rh', 'RH'),
  ],
  ip: [
    field('country', 'Country'),
    field('city', 'City'),
    field('maritalStatus', 'Family status'),
    field('programInterest', 'Program interest'),
    field('budget', 'Budget'),
  ],
  ag: [
    field('country', 'Country'),
    field('city', 'City'),
    field('services', 'Services'),
    field('profession', 'Specialization'),
  ],
  other: [field('country', 'Country'), field('city', 'City'), field('profession', 'Profession')],
};

const sectionConfig = {
  ed: [
    { title: 'Main information', fields: [
      field('education', 'Education'), field('profession', 'Profession'), field('maritalStatus', 'Marital status'),
      field('ownKids', 'Own kids', ownKidsValue), field('clothingSize', 'Clothing'), field('shoeSize', 'Shoe'),
    ] },
    { title: 'Appearance', variant: 'chips', fields: [
      field('eyeColor', 'Eyes'), field('hairColor', 'Hair color'), field('hairStructure', 'Hair structure'),
      field('faceShape', 'Face shape'), field('noseShape', 'Nose'), field('lipsShape', 'Lips'),
      field('chin', 'Chin'), field('bodyType', 'Body type'), field('breastSize', 'Breast size'),
      field('race', 'Race'), field('glasses', 'Glasses'),
    ] },
    { title: 'Donation experience', fields: [
      field('experience', 'Previous donation'), field('donationCount', 'Donation count'), field('donationsCount', 'Donations'),
      field('cSection', 'C-section', user => user?.cSection || user?.csection || user?.c_section || user?.cesareanSection, ['cSection', 'csection', 'c_section', 'cesareanSection']),
    ] },
  ],
  ip: [
    { title: 'Main information', fields: [
      field('country', 'Country'), field('city', 'City'), field('region', 'Region'), field('maritalStatus', 'Family status'),
      field('programInterest', 'Program interest'), field('lookingFor', 'Looking for'), field('budget', 'Budget'),
    ] },
  ],
  ag: [
    { title: 'Agency details', fields: [
      field('agencyName', 'Agency name'), field('country', 'Country'), field('city', 'City'), field('services', 'Services'),
      field('profession', 'Specialization'),
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
    user => getContactValues(user, key).join(', ')
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
  normalizeDisplayValue(user?.moreInfo_main || user?.comment || user?.description || user?.about || user?.bio);
