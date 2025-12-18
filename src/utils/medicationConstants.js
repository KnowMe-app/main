export const BASE_MEDICATIONS = [
  { key: 'aspirin', label: 'Аспірин кардіо', plan: 'aspirin' },
  { key: 'folicAcid', label: 'Фолієва кислота', plan: 'folicAcid' },
  { key: 'metypred', label: 'Метипред', plan: 'metypred' },
  { key: 'progynova', label: 'Прогінова', plan: 'progynova' },
  { key: 'injesta', label: 'Інжеста', plan: 'injesta' },
  { key: 'luteina', label: 'Лютеіна', plan: 'luteina' },
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
