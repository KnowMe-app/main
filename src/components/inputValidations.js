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

  export const formatDateAndFormula = (input) => {
    if (!input) return '';

     // Якщо це масив — з'єднуємо елементи в один рядок
  if (Array.isArray(input)) {
    input = input.join(', ');
  }
  
    const today = new Date();
  
    // Якщо формат дати: DD.MM.YYYY
    const datePattern = /^\d{2}\.\d{2}\.\d{4}$/;
    if (datePattern.test(input)) {
      const [day, month, year] = input.split('.');
      return `${year}-${month}-${day}`; // Повертаємо у форматі YYYY-MM-DD
    }
  
    // Якщо формат типу "7d", "6m", "1y" або "7д", "6м", "1р"
    const periodPattern = /^(\d+)(d|m|y|д|м|р)$/;
    const matchPeriod = input.match(periodPattern);
    if (matchPeriod) {
      const value = parseInt(matchPeriod[1], 10);
      const unit = matchPeriod[2];
  
      switch (unit) {
        case 'd':
        case 'д':
          today.setDate(today.getDate() + value);
          break;
        case 'm':
        case 'м':
          today.setMonth(today.getMonth() + value);
          break;
        case 'y':
        case 'р':
          today.setFullYear(today.getFullYear() + value);
          break;
        default:
          break;
      }
      return today.toISOString().split('T')[0]; // Повертаємо у форматі YYYY-MM-DD
    }

    // Якщо формат типу "22т", "22t" або "22w" (тижнів тому)
    const weeksPattern = /^(\d+)(т|t|w)$/i;
    const matchWeeks = input.match(weeksPattern);
    if (matchWeeks) {
      const weeks = parseInt(matchWeeks[1], 10);
      today.setDate(today.getDate() - weeks * 7);
      return today.toISOString().split('T')[0]; // Повертаємо у форматі YYYY-MM-DD
    }
  
    // Якщо формат типу "360-90"
    const offsetPattern = /^(\d+)-(\d+)$/;
    const matchOffset = input.match(offsetPattern);
    if (matchOffset) {
      const base = parseInt(matchOffset[1], 10);
      const subtract = parseInt(matchOffset[2], 10);
      today.setDate(today.getDate() + (base - subtract));
      return today.toISOString().split('T')[0]; // Повертаємо у форматі YYYY-MM-DD
    }
  
    // Якщо формат числа: 6 або 8 цифр
    const digitPattern = /^\d{6,8}$/;
    if (digitPattern.test(input)) {
      const day = input.slice(0, 2);
      const month = input.slice(2, 4);
  
      if (input.length === 6) {
        const yearLastTwoDigits = input.slice(4, 6);
        const year = `20${yearLastTwoDigits}`;
        if (parseInt(yearLastTwoDigits, 10) > 23) {
          return `${year}-${month}-${day}`; // Повертаємо у форматі YYYY-MM-DD
        }
      }
  
      if (input.length === 8) {
        const yearFull = input.slice(4, 8);
        return `${yearFull}-${month}-${day}`; // Повертаємо у форматі YYYY-MM-DD
      }
    }
  
    // Якщо формат формули: починається з "="
    if (input.startsWith('=')) {
      const formula = input.slice(1).trim();
  
      if (formula.endsWith('.')) {
        try {
          const cleanFormula = formula.slice(0, -1);
  
          console.log('Формула для обчислення:', cleanFormula);
  
          if (!cleanFormula) {
            throw new Error('Порожня формула');
          }
  
          const result = calculateExpression(cleanFormula);
  
          if (isNaN(result)) {
            throw new Error('Результат не є числом');
          }
  
          today.setDate(today.getDate() + result);
          console.log('Нова дата:', today.toISOString().split('T')[0]); // Логування у форматі YYYY-MM-DD
          return today.toISOString().split('T')[0]; // Повертаємо у форматі YYYY-MM-DD
        } catch (error) {
          console.error('Помилка в обчисленні формули:', error.message);
          return 'Невірна формула';
        }
      }
  
      return input;
    }
  
    // Повертаємо введене значення, якщо воно не відповідає жодному шаблону
    return input;
  };
  
     // Перетворення дати з формату YYYY-MM-DD в DD.MM.YYYY
  export const formatDateToDisplay = (dateString) => {
    if (!dateString) return '';
    const dashPattern = /^\d{4}-\d{2}-\d{2}$/;
    if (dashPattern.test(dateString)) {
      const [year, month, day] = dateString.split('-');
      return `${day}.${month}.${year}`;
    }
    return dateString; // якщо вже у форматі дд.мм.рррр або невірний
  };

// Перетворення дати з формату DD.MM.YYYY в YYYY-MM-DD
export const formatDateToServer = (dateString) => {
  if (!dateString) return '';
  const parts = dateString.split('.');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month}-${day}`;
  }
  return dateString; // Повертаємо оригінал, якщо формат неправильний
};


  // Функція для обчислення математичних виразів
  const calculateExpression = (expression) => {
    const operators = {
      '+': (a, b) => a + b,
      '-': (a, b) => a - b,
      '*': (a, b) => a * b,
      '/': (a, b) => a / b,
    };
  
    const precedence = {
      '+': 1,
      '-': 1,
      '*': 2,
      '/': 2,
    };
  
    const isOperator = (token) => ['+', '-', '*', '/'].includes(token);
  
    const tokens = expression.match(/(\d+|\+|-|\*|\/)/g);
    console.log('Токени формули:', tokens);
  
    if (!tokens) {
      throw new Error('Невірний вираз: порожній або некоректний ввід');
    }
  
    const values = [];
    const ops = [];
  
    const applyOperator = () => {
      const b = values.pop();
      const a = values.pop();
      const op = ops.pop();
      console.log('Застосовуємо оператор:', op, '| Операнди:', a, b);
      if (a === undefined || b === undefined || !operators[op]) {
        throw new Error('Неповний вираз');
      }
      values.push(operators[op](a, b));
    };
  
    tokens.forEach((token) => {
      console.log('Обробка токена:', token);
      if (!isNaN(token)) {
        values.push(parseFloat(token));
        console.log('Додавання числа в стек:', values);
      } else if (isOperator(token)) {
        while (ops.length && precedence[ops[ops.length - 1]] >= precedence[token]) {
          applyOperator();
        }
        ops.push(token);
        console.log('Додавання оператора в стек:', ops);
      } else {
        throw new Error('Невірний токен');
      }
    });
  
    while (ops.length) {
      applyOperator();
    }
  
    if (values.length !== 1) {
      throw new Error('Помилка обчислення: некоректний стек після обчислення');
    }
  
    console.log('Результат обчислення:', values[0]);
    return values[0];
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