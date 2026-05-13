import { getCurrentValue } from './getCurrentValue';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import { normalizeCountry, normalizeRegion } from './normalizeLocation';
import { convertDriveLinkToImage } from '../utils/convertDriveLinkToImage';

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
  const role = normalizeDisplayValue(user?.userRole || user?.role).toLowerCase();
  if (role === 'ed') return 'ed';
  if (role === 'ag') return 'ag';
  if (role === 'ip') return 'ip';
  if (user?.__sourceCollection === 'newUsers' && !role) return 'ed';
  return role || 'other';
};

export const getRoleLabel = role => {
  if (role === 'ed') return 'Egg donor';
  if (role === 'ag') return 'Agency';
  if (role === 'ip') return 'Intended parents';
  if (role === 'sm') return 'Surrogate mother';
  if (role === 'cl') return 'Client';
  return 'Profile';
};

export const getProfileName = user => {
  const agencyName = normalizeDisplayValue(user?.agencyName || user?.companyName || user?.agency);
  const name = [user?.name, user?.surname]
    .map(normalizeDisplayValue)
    .filter(Boolean)
    .join(' ');
  return agencyName || name || getRoleLabel(getProfileRole(user));
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

const field = (key, label, valueGetter) => ({ key, label, valueGetter });
const valueFor = (user, item) => normalizeDisplayValue(item.valueGetter ? item.valueGetter(user) : user?.[item.key]);

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
    field('bmi', 'BMI', bmiValue),
    field('blood', 'Blood/Rh'),
    field('eyeColor', 'Eyes'),
    field('experience', 'Experience', donorExperienceValue),
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
    field('website', 'Website'),
  ],
  other: [field('country', 'Country'), field('city', 'City'), field('role', 'Role')],
};

const quickFacts = {
  ed: [
    ...heroFields.ed,
    field('rh', 'RH'),
    field('ownKids', 'Own kids', ownKidsValue),
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
    field('website', 'Website'),
    field('telegram', 'Telegram'),
  ],
  other: [field('country', 'Country'), field('city', 'City'), field('profession', 'Profession')],
};

const sectionConfig = {
  ed: [
    { title: 'Appearance', fields: [
      field('eyeColor', 'Eyes'), field('hairColor', 'Hair color'), field('hairStructure', 'Hair structure'),
      field('faceShape', 'Face shape'), field('noseShape', 'Nose'), field('lipsShape', 'Lips'),
      field('chin', 'Chin'), field('bodyType', 'Body type'), field('race', 'Race'), field('glasses', 'Glasses'),
    ] },
    { title: 'Main information', fields: [
      field('education', 'Education'), field('profession', 'Profession'), field('maritalStatus', 'Marital status'),
      field('ownKids', 'Own kids', ownKidsValue), field('clothingSize', 'Clothing'), field('shoeSize', 'Shoe'),
    ] },
    { title: 'Donation experience', fields: [
      field('experience', 'Previous donation'), field('donationCount', 'Donation count'), field('donationsCount', 'Donations'),
      field('cSection', 'C-section'), field('reward', 'Expected reward'),
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
      field('website', 'Website'), field('profession', 'Specialization'),
    ] },
  ],
  other: [
    { title: 'Main information', fields: [field('country', 'Country'), field('city', 'City'), field('profession', 'Profession'), field('education', 'Education')] },
  ],
};

export const getHeroFields = (user, role = getProfileRole(user)) =>
  (heroFields[role] || heroFields.other)
    .map(item => ({ ...item, value: valueFor(user, item) }))
    .filter(item => shouldRenderField(item.value))
    .slice(0, 6);

export const getQuickFacts = (user, role = getProfileRole(user)) =>
  (quickFacts[role] || quickFacts.other)
    .map(item => ({ ...item, value: valueFor(user, item) }))
    .filter(item => shouldRenderField(item.value))
    .slice(0, 8);

const contactFields = [
  field('phone', 'Phone'), field('telegram', 'Telegram'), field('whatsapp', 'WhatsApp'), field('email', 'Email'),
  field('vk', 'VK'), field('instagram', 'Instagram'), field('website', 'Website'),
];

export const getProfileSections = (user, role = getProfileRole(user)) => {
  const sections = (sectionConfig[role] || sectionConfig.other).map(section => ({
    ...section,
    fields: section.fields.map(item => ({ ...item, value: valueFor(user, item) })).filter(item => shouldRenderField(item.value)),
  })).filter(section => section.fields.length > 0);

  const contacts = contactFields
    .map(item => ({ ...item, value: valueFor(user, item) }))
    .filter(item => shouldRenderField(item.value));
  if (contacts.length > 0) sections.push({ title: 'Contacts', fields: contacts, variant: 'contacts' });
  return sections;
};

export const getProfileBio = user =>
  normalizeDisplayValue(user?.moreInfo_main || user?.comment || user?.description || user?.about || user?.bio);
