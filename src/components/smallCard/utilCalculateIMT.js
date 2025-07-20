export const utilCalculateIMT = (weight, height) => {
  if (weight && height) {
    const heightInMeters = height / 100;
    return Math.round(weight / heightInMeters ** 2);
  }
  return 'N/A';
};