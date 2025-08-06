export const areObjectsEqual = (obj1, obj2) => {
  if (obj1 === obj2) {
    return true;
  }

  if (
    obj1 === null ||
    obj2 === null ||
    typeof obj1 !== 'object' ||
    typeof obj2 !== 'object'
  ) {
    return false;
  }

  const filterKeys = obj => Object.keys(obj).filter(key => key !== 'statusDate');

  const keys1 = filterKeys(obj1);
  const keys2 = filterKeys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (!keys2.includes(key)) {
      return false;
    }

    const val1 = obj1[key];
    const val2 = obj2[key];
    const bothObjects =
      typeof val1 === 'object' && val1 !== null && typeof val2 === 'object' && val2 !== null;

    if (bothObjects) {
      if (!areObjectsEqual(val1, val2)) {
        return false;
      }
    } else if (val1 !== val2) {
      return false;
    }
  }

  return true;
};
