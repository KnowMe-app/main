export const utilCalculateIMT = (weight, height) => {
  if (weight && height) {
    const heightInMeters = height / 100;
    return (weight / heightInMeters ** 2).toFixed(1);
  }
  return 'N/A';
};