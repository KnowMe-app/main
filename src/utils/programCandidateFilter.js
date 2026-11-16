import { evaluateProgram, extractViewerProgramFacts } from './donorPrograms';
import { computeBmi, normalizeHeightCm } from './profileNormalization';
import { listProfileRoles } from './matchingPeerVisibility';
import { getProfileAge, parseBloodValue } from '../components/profileLayoutConfig';

/*
 * «Кандидатки під програму» — фільтр стрічки для того, хто веде програми
 * (агенція, клініка, батьки; 15.11, на прохання власниці продукту).
 *
 * Власник обирає свою програму, і стрічка лишає самі анкети типу програми
 * (донорські — донорок, програма СМ — сурогатних мам), що не порушують жодної
 * її вимоги. Вимоги ті самі, якими програма звіряє анкету донорки на її боці
 * (`evaluateProgram`), а факти — з картки стрічки тими самими функціями, що
 * й анкету читачки (`extractViewerProgramFacts`): «підходить» мусить означати
 * одне й те саме з обох боків.
 *
 * Невідоме не відсіює: картка без групи крові під «лише Rh+» лишається, а
 * рядок каже, чого не вказано (`describeCandidateFit`). Повна група крові
 * лежить лише в опублікованій картці, а неопублікованих стрічка й так не
 * показує.
 *
 * У фільтрі лежить знімок програми (`id`, `type`, `label`, `requirements`):
 * так фільтр діє без читання програм і переживає перезавантаження
 * (`PROGRAM_FILTER_STORAGE_KEY`). Змінила агенція вимоги — знімок
 * оновлюється, щойно її програми приїхали (`refreshProgramFilterSnapshot`).
 */

export const PROGRAM_FILTER_STORAGE_KEY = 'matchingProgramFilter';

const FACT_HELPERS = {
  age: getProfileAge,
  height: normalizeHeightCm,
  bmi: computeBmi,
  rh: value => parseBloodValue(value).rh,
  abo: value => parseBloodValue(value).abo,
};

export const buildProgramFilter = (program, label = '') => (program?.id && program?.type
  ? { id: program.id, type: program.type, label: String(label || '').slice(0, 120), requirements: program.requirements || {} }
  : null);

export const isProgramFilterActive = filter => Boolean(filter?.id && filter?.type);

// Резус картки стрічки лежить окремим полем (`rh`: '+' / '-'), а повна
// група — лише в опублікованій. Голий «-» розбір групи читає як порожнє
// поле, тож без цього донорка з Rh− проходила б під «лише Rh+».
const readCardRh = card => {
  const last = value => (Array.isArray(value) ? value[value.length - 1] : value);
  const rh = String(last(card?.rh) ?? '').trim();
  if (rh === '+' || rh === '-') return rh;
  const blood = String(last(card?.blood) ?? '').trim();
  return blood === '+' || blood === '-' ? blood : '';
};

export const evaluateCardForProgram = (card, filter) => {
  if (!isProgramFilterActive(filter)) return null;
  const facts = extractViewerProgramFacts(card, FACT_HELPERS);
  if (facts && !facts.rh) facts.rh = readCardRh(card);
  return evaluateProgram({ requirements: filter.requirements || {} }, facts);
};

export const cardFitsProgramFilter = (card, filter) => {
  if (!isProgramFilterActive(filter)) return true;
  if (!listProfileRoles(card).includes(filter.type)) return false;
  return evaluateCardForProgram(card, filter)?.matches !== false;
};

export const readStoredProgramFilter = () => {
  try {
    const raw = window.localStorage.getItem(PROGRAM_FILTER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isProgramFilterActive(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const storeProgramFilter = filter => {
  try {
    if (isProgramFilterActive(filter)) window.localStorage.setItem(PROGRAM_FILTER_STORAGE_KEY, JSON.stringify(filter));
    else window.localStorage.removeItem(PROGRAM_FILTER_STORAGE_KEY);
  } catch {
    // Сховище недоступне — фільтр діє до перезавантаження.
  }
};

/**
 * Знімок у фільтрі проти свіжих програм власника: вимоги змінились —
 * новий знімок; програму видалили чи сховали — фільтр знімається (`null`);
 * без змін — той самий обʼєкт (нічого не перезапускати).
 */
export const refreshProgramFilterSnapshot = (filter, programs, labelOf = () => filter?.label || '') => {
  if (!isProgramFilterActive(filter) || !Array.isArray(programs) || !programs.length) return filter;
  const program = programs.find(item => item.id === filter.id);
  if (!program || program.type !== filter.type) return null;
  const next = buildProgramFilter(program, labelOf(program));
  return JSON.stringify(next.requirements) === JSON.stringify(filter.requirements || {}) && next.label === filter.label ? filter : next;
};
