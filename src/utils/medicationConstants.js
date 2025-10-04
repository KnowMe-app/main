export const BASE_MEDICATIONS = [
  { key: 'aspirin', label: 'Аспірин кардіо', short: 'АК', plan: 'aspirin' },
  { key: 'folicAcid', label: 'Фолієва кислота', short: 'ФК', plan: 'folicAcid' },
  { key: 'metypred', label: 'Метипред', short: 'Мт', plan: 'metypred' },
  { key: 'progynova', label: 'Прогінова', short: 'Пр', plan: 'progynova' },
  { key: 'injesta', label: 'Інжеста', short: 'Ін', plan: 'injesta' },
  { key: 'luteina', label: 'Лютеіна', short: 'Лт', plan: 'luteina' },
];

export const BASE_MEDICATION_PLACEHOLDERS = {
  progynova: 'Прогінова 21',
  aspirin: 'АК 14',
  folicAcid: 'ФК 25',
  metypred: 'Метипред 30',
  // Інжеста та Лютеіна мають нульові дефолтні видачі, але плейсхолдери показують рекомендовані 40.
  injesta: 'Інжеста 40',
  luteina: 'Лютеіна 40',
};

export const BASE_MEDICATIONS_MAP = new Map(BASE_MEDICATIONS.map(item => [item.key, item]));

export const slugifyMedicationKey = value => {
  if (!value) return '';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
};

export const deriveShortLabel = label => {
  if (!label) return '';
  const trimmed = label.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + (parts[1][0] || '')).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
};
