export const removeSpaceAndNewLine = value => {
    // Видаляємо пробіли
    value = value.replace(/\s/g, '');
    // Переносимо на новий рядок
    value = value.replace(/(.{50})/g, '$1\n');
    return value;
  };
  
  export const removeNotNumbers = value => {
    // Вилучаємо всі символи, які не є цифрами
    value = value.replace(/\D/g, '');
    return value;
  };
  
  export const removeSpaces = value => {
    // Видаляємо пробіли на початку та в кінці рядка
    let trimmedStr = value.trim();
    // Замінюємо послідовності пробілів всередині рядка на один пробіл, але не чіпаємо перенос на нову строку
    let processedStr = trimmedStr.replace(/[^\S\r\n]+/g, ' ');
    return processedStr;
  };
  
  export const removeSpacesLeaveEnter = value => {
    let processedStr = value.replace(/(\r?\n){2,}|([^\S\r\n]+)/g, (match, severalLines, spaces) => {
      // (\r?\n){2,} шукає два або більше переноси на новий рядок.
      // (\r?\n) шукає переноси на новий рядок.
      // ([^\S\r\n]+) шукає будь-яку послідовність пробілів, крім переносу на новий рядок.
      if (severalLines) {
        // Якщо декілька переносів, лишаэмо 1
        return '\n'; // залишаємо перенос на новий рядок без змін
      } else if (spaces) {
        // Якщо збіг відповідає послідовності пробілів, замінюємо їх на один пробіл
        return ' ';
      }
    });
  
    return processedStr;
  };
  
  export const formatEmail = email => {
    email = removeSpaceAndNewLine(email);
    return email;
  };
  
  export const formatInstagram = link => {
    // Шукаємо підстроку "id=" в посиланні
    const comIndex = link.indexOf('com/');
  
    if (comIndex !== -1) {
      // Якщо "com/" знайдено, витягуємо все за "com/"
      let nickName = link.substring(comIndex + 4);
      nickName = nickName.replace(/\//g, '');
  
      nickName = removeSpaceAndNewLine(nickName);
  
      // Видаляємо будь-який текст після
      const firstSpaceIndex = nickName.indexOf(' ');
      if (firstSpaceIndex !== -1) {
        return nickName.substring(0, firstSpaceIndex);
      }
  
      const queryIndex = nickName.indexOf('?');
      if (queryIndex !== -1) {
        // Якщо є параметри запиту, видаляємо їх
        nickName = nickName.substring(0, queryIndex);
        // Видаляємо всі "/" з рядка
        nickName = nickName.replace(/\//g, '');
      }
  
      return nickName;
    } else if (link.includes('@')) {
      // Якщо в ніку є символ "@", видаляємо його
      link = link.replace(/@/g, '');
      return link;
    } else {
      // Якщо "com/" не знайдено, просто повертаємо весь рядок
      link = removeSpaceAndNewLine(link);
      return link;
    }
  };
  
  export const formatFacebook = link => {
    // Шукаємо підстроку "id=" в посиланні
    const idIndex = link.indexOf('id=');
    if (idIndex !== -1) {
      // Якщо "id=" знайдено, витягуємо цифровий ID, який слідує за "id="
      const id = link.substring(idIndex + 3);
      // Видаляємо будь-який текст після цифрового ID
      const firstSpaceIndex = id.indexOf(' ');
      if (firstSpaceIndex !== -1) {
        return id.substring(0, firstSpaceIndex);
      }
      return id;
    } else {
      // Якщо "id=" не знайдено, шукаємо "com/" та витягуємо цифровий ID, який слідує за "com/"
      const comIndex = link.indexOf('com/');
      if (comIndex !== -1) {
        let nickName = link.substring(comIndex + 4);
        const queryIndex = nickName.indexOf('?');
        if (queryIndex !== -1) {
          // Якщо є параметри запиту, видаляємо їх
          nickName = nickName.substring(0, queryIndex);
          // Видаляємо всі "/" з рядка
          nickName = nickName.replace(/\//g, '');
          nickName = removeSpaceAndNewLine(nickName);
          return nickName;
        }
        nickName = removeSpaceAndNewLine(nickName);
        return nickName;
      } else if (link.includes('@')) {
        // Якщо в ніку є символ "@", видаляємо його
        link = link.replace(/@/g, '');
        return link;
      } else {
        // Якщо ні "id=" ні "com/" не знайдено, просто повертаємо весь рядок
        link = removeSpaceAndNewLine(link);
        return link;
      }
    }
  };
  
  export const formatTelegram = nick => {
    // Видаляємо символ "@" з початку ніка
    if (nick.includes('@')) {
      // Якщо в ніку є символ "@", видаляємо його
      nick = nick.replace(/@/g, '');
    } else if (nick.includes('https://t.me/')) {
      // Якщо в ніку немає "@" і містить "https://t.me/", залишаємо текст після "https://t.me/"
      nick = nick.replace(/https:\/\/t.me\//, '');
    }
    nick = removeSpaceAndNewLine(nick);
  
    return nick;
  };
  
  export const formatNumber = (value, maxValue) => {
    // Вилучаємо всі символи, які не є цифрами
    let cleanedValue = removeNotNumbers(value);
    cleanedValue = removeSpaceAndNewLine(cleanedValue);
  
    let valueToUpdate;
    if ((value === '' || cleanedValue === '') && (isNaN(value) || isNaN(cleanedValue))) {
      return '';
    } else {
      // Обмежуємо значення до максимально дозволеного
      valueToUpdate = cleanedValue === '' ? '' : Math.min(parseInt(cleanedValue, 10), maxValue).toString();
    }
    return valueToUpdate;
  };

  export const formatPhoneNumberNoSpace = number => {
    let cleaned = removeNotNumbers(number);
    cleaned = removeSpaceAndNewLine(cleaned);
  
    if (cleaned.startsWith('380380')) {
      cleaned = '380' + cleaned.slice(6);
    }
    // Check if the number starts with '3800', then remove one zero
    else if (cleaned.startsWith('3800')) {
      cleaned = '380' + cleaned.slice(4);
    }
    // форматування номера телефону
    const match = cleaned.match(/^(\d{0,2})(\d{0,3})(\d{0,3})(\d{0,2})(\d{0,2})$/);
    let formattedNumber = '';
    if (match) {
      const [fullMatch, countryCode, areaCode, firstPart, secondPart, thirdPart] = match;
      formattedNumber = '';
  
      console.log('fullMatch :>> ', fullMatch);
      // if (countryCode && countryCode.charAt(0) === '0') {
      formattedNumber += countryCode;
      // } else if (countryCode) {
      //   formattedNumber += '+' + countryCode;
      // }
  
      if (areaCode) {
        formattedNumber += '' + areaCode;
        if (firstPart) {
          formattedNumber += '' + firstPart;
          if (secondPart) {
            formattedNumber += '' + secondPart;
            if (thirdPart) {
              formattedNumber += '' + thirdPart;
            }
          }
        }
      }
    } else {
      formattedNumber = '380'; // If the number doesn't match, retain the default value
    }
    return formattedNumber;
  };
  
  export const formatPhoneNumber = number => {
    let cleaned = removeNotNumbers(number);
    cleaned = removeSpaceAndNewLine(cleaned);
  
    if (cleaned.startsWith('380380')) {
      cleaned = '380' + cleaned.slice(6);
    }
    // Check if the number starts with '3800', then remove one zero
    else if (cleaned.startsWith('3800')) {
      cleaned = '380' + cleaned.slice(4);
    }
    // форматування номера телефону
    const match = cleaned.match(/^(\d{0,2})(\d{0,3})(\d{0,3})(\d{0,2})(\d{0,2})$/);
    let formattedNumber = '';
    if (match) {
      const [fullMatch, countryCode, areaCode, firstPart, secondPart, thirdPart] = match;
      formattedNumber = '';
  
      console.log('fullMatch :>> ', fullMatch);
      // if (countryCode && countryCode.charAt(0) === '0') {
      formattedNumber += countryCode;
      // } else if (countryCode) {
      //   formattedNumber += '+' + countryCode;
      // }
  
      if (areaCode) {
        formattedNumber += ' ' + areaCode;
        if (firstPart) {
          formattedNumber += ' ' + firstPart;
          if (secondPart) {
            formattedNumber += ' ' + secondPart;
            if (thirdPart) {
              formattedNumber += ' ' + thirdPart;
            }
          }
        }
      }
    } else {
      formattedNumber = '380'; // If the number doesn't match, retain the default value
    }
    return formattedNumber;
  };
  
  // TODO2: додавання, видалення і зміна рядків
  export const createOpuData = value => {
    // Math?.min(value, 15);
    const actualValue = formatNumber(value, 14);
    // Генеруємо масив чисел від 1 до value
    const ids = Array.from({ length: actualValue }, (_, i) => i + 1);
  
    // Використовуємо метод map для створення масиву об'єктів opuData
    const opuData = ids.map(id => ({
      id,
      opuCountry: '',
      opuDate: '',
      opuEggsNumber: '',
    }));
  
    const valueToUpdate = opuData;
    return valueToUpdate;
  };
  
  export const formatDate = (value, option) => {
    let cleaned = removeNotNumbers(value);
    cleaned = removeSpaceAndNewLine(cleaned);
    const match = cleaned.match(/^(\d{0,2})(\d{0,2})(\d{0,4})$/); // Розбиваємо на групи (DD, MM, YYYY)
    let formattedDate = '';
    if (match) {
      const [, day, month, year] = match;
      formattedDate = '';
  
      if (day) {
        formattedDate += day;
        if (month) {
          formattedDate += '.' + month;
          if (year) {
            formattedDate += '.' + year;
            if (year.length > 3) {
              const age = !option && calculateAge(`${day}.${month}.${year}`);
              if (age && (age > 90 || age < 15)) {
                !option && alert(`Перевірте правильність введення дати, Вам ${age}?`);
                formattedDate = '';
              } else console.log('Формат дати вірний');
            }
          }
        }
      }
    }
  
    return formattedDate;
  };
  
  export const calculateAge = date => {
    const [day, month, year] = date.split('.');
    const enteredDate = new Date(`${year}-${month}-${day}`);
    const currentDate = new Date();
  
    let age = currentDate.getFullYear() - enteredDate.getFullYear();
    const monthDiff = currentDate.getMonth() - enteredDate.getMonth();
  
    if (monthDiff < 0 || (monthDiff === 0 && currentDate.getDate() < enteredDate.getDate())) {
      age--;
    }
  
    return age;
  };

  export const removeExtraSpaces = (str) => {
    // Видаляємо пробіли на початку та в кінці рядка
    let trimmedStr = str.trimLeft();
    // Замінюємо послідовності пробілів всередині рядка на один пробіл
    let processedStr = trimmedStr.replace(/\s+/g, ' ');
    return processedStr;
    }
  