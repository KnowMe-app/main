import { formatCountryName, formatRegionName } from '../utils/profileNormalization';
import { resolveProfileLanguage } from '../utils/profileTexts';

/**
 * Область і країна для показу — через довідники `utils/profileNormalization`.
 *
 * Досі тут російська назва області лишалась російською («Днепропетровская
 * область»), а з країн упізнавалась одна «Украина»: рядок стрічки казав
 * «Славянск, Донецкая обл.» посеред українського інтерфейсу. Тепер знайома
 * область показується українською (або англійською, коли така мова
 * інтерфейсу), незнайома — як написали.
 */
export const normalizeRegion = (region, language) => {
  if (!region || typeof region !== 'string') return region;
  return formatRegionName(region, resolveProfileLanguage(language));
};

export const normalizeCountry = (country, language) => {
  if (!country || typeof country !== 'string') return country;
  return formatCountryName(country, resolveProfileLanguage(language));
};

export const normalizeLocation = str => {
  if (!str || typeof str !== 'string') return str;
  const parts = str.split(',');
  const region = parts[0] ? normalizeRegion(parts[0]) : '';
  const city = parts.slice(1).join(',').trim();
  return city ? `${region}, ${city}`.trim() : region;
};
