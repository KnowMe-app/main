export const utilCalculateAge = birthDateString => {
    if (!birthDateString) return null;
    if (typeof birthDateString !== 'string') return birthDateString;
    const [day, month, year] = birthDateString?.split('.').map(Number);
    const birthDate = new Date(year, month - 1, day);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };