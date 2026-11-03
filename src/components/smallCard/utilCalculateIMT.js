import { getCurrentValue } from '../getCurrentValue';

// Зріст і вага — поля з історією версій: рахуємо з поточної, інакше масив
// дає `NaN`.
export const utilCalculateIMT = (weight, height) => {
  const currentWeight = getCurrentValue(weight);
  const currentHeight = getCurrentValue(height);
  if (currentWeight && currentHeight) {
    const heightInMeters = currentHeight / 100;
    const imt = Math.round(currentWeight / heightInMeters ** 2);
    return Number.isFinite(imt) ? imt : 'N/A';
  }
  return 'N/A';
};
