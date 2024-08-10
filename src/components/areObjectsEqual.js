export const areObjectsEqual = (obj1, obj2) => {
  // Перевірка на наявність об'єктів і їх типу
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    // console.log('Об"єкти різні. Не об"єкт :>> ');
    return false;
  }

  // Отримання масивів ключів об'єктів
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  // Перевірка на рівну кількість ключів
  if (keys1.length !== keys2.length) {
    // console.log('Об"єкти різні. Різна кіькість ключів :>> ');
    return false;
  }

  // Перевірка значень кожного ключа
  for (const key of keys1) {
    if (key !== 'statusDate') {
      if (obj1[key] !== obj2[key]) {
        // console.log('key :>> ', key);
        // console.log('obj1[key] !== obj2[key] :>> ', obj1[key], obj2[key]);
        // console.log('Об"єкти різні. Значення ключів різні :>> ');
        return false;
      }
    }
  }

  // Якщо всі перевірки пройшли, повертаємо true
  return true;
}
