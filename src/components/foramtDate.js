export const getCurrentDate = () => {
  const today = new Date();

  // Отримуємо день, місяць і рік з поточної дати
  const day = today.getDate().toString().padStart(2, '0');
  const month = (today.getMonth() + 1).toString().padStart(2, '0'); // Додати 1, оскільки місяці у JavaScript ідуть з 0 до 11
  const year = today.getFullYear().toString();

  // Отримуємо години, хвилини і секунди з поточного часу
  const hours = today.getHours().toString().padStart(2, '0');
  const minutes = today.getMinutes().toString().padStart(2, '0');
  const seconds = today.getSeconds().toString().padStart(2, '0');

  // Записуємо дату та час в потрібному форматі
  const todayMin = `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
  const todayDays = `${day}.${month}.${year}`;
  const todayDash = `${year}-${month}-${day}`;

  return { todayMin, todayDays, todayDash };
};

export const formatToLongDate = date => {
  // console.log('date :>> ', date);
  // Перевіряємо, чи date не є undefined або null
  if (date === undefined || date === null || date === '') {
    return ''; // Повертаємо пустий рядок у випадку, якщо date === undefined або date === null
  }
  try {
    const [day, month, year] = date.split('.'); // Розбиваємо рядок на день, місяць і рік

    // Масив англійських назв місяців
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Перетворюємо числовий місяць на англійську абревіатуру
    const formattedMonth = months[parseInt(month, 10) - 1];

    return `${day} ${formattedMonth} ${year}`;
  } catch (error) {
    // Повертаємо вихідну дату, якщо виникає помилка
    return date;
  }
};

export const formatDateForExpo4 = (inputDate) => {
  const [day, month, year] = inputDate.split('.');
  const newDate = `${year}-${month}-${day}`
  const _date = new Date(newDate);

let _dateObj = {
    day: _date.getDate(),
    month: _date.getMonth() + 1,
    year: _date.getFullYear()
};

  // return `${month}/${day}/${year}`;
  return _dateObj;
};

export const formatDateForExpo2 = (inputDate) => {
  // Wed Dec 01 2021
  const [day, month, year] = inputDate.split('.');
  const nYear = year || new Date().getFullYear();
  const date2 = new Date(nYear, month-1, day, 0, 0);
  const date3 = date2.toDateString()
  return date3;
};

export const formatDateForExpo3 = (inputDate) => {
  // Thu Feb 01 2024 00:00:00 GMT+0200
  const [day, month, year] = inputDate.split('.');
  const nYear = year || new Date().getFullYear();
  const date2 = new Date(nYear, month-1, day, 0, 0);
  const date3 = date2.toString()
  return date3;
};

export const formatDateForExpo = (inputDate) => {
  const [day, month, year] = inputDate.split('.');
  const newDate = `${year}-${month}-${day}`
  return newDate;
};
