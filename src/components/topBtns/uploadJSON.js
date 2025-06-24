// import { generateUserId } from "components/generateUserId";
import { HiddenInput, StyledLabel } from "components/styles";
import React, { useState } from "react";

export const UploadJson = () => {
  const [cleanedJson, setCleanedJson] = useState(null);

  const excludedKeys = [
    "has_mobile", "books", "Игры", "movies", "can_access_closed", "Пол", "timezone", "tv", "last_seen", 
    "university", "Подписчики", "deactivated", "Деятельность", "online", "Пароль", "education_form", "education_status", "Статус", "Интересы",
    "Университет", "faculty", "faculty_name", "graduation", "О себе", "photo_max_orig", "Заголовок", "inline_bot_buttons", "ФИО", "✅  ВКонтакте [2012-2020]", "☑️  ВКонтакте [2013]"
  ];

  const keyMapping = {
    "Имя": "name",
    "Фамилия": "surname",
    "Город": "city",
    "Email": "email",
    "Телефоны": "phone",
    "Страна": "country",
    "Мобильный": "phone2",
    "Дата рождения": 'birth',
    "_id": "vk",
    "Родной город": "city2",
    "Skype":"skype",
    "Twitter" : "twitter",
    "Ник": "fathersname",
    "Facebook": "facebook",
    "Facebook Name": "facebook2",
    "Instagram": "instagram",
    "Домашний": "phone3",
    "Screen name": "vk2",
    "link": "otherLinks"

};

  // Функція перетворення text_entities у формат ключ-значення
  function parseTextEntitiesToKeyValue(entitiesArray) {
    const result = {};
    let currentKey = null;
    let collectingValue = false;
    let value = "";
  
    // Та сама логіка обробки значень, що й у parseTextToKeyValue
    function storeValue(key, rawValue) {
      const cleaned = rawValue.trim().replace(/^:/, "").replace(/[\n└├]/g, "");
      const existingVal = result[key];
  
      // Якщо ключа ще не було
      if (existingVal === undefined) {
        result[key] = cleaned;
      }
      // Якщо ключ уже є і це масив
      else if (Array.isArray(existingVal)) {
        // Перевіряємо, чи вже є ідентичне значення
        if (!existingVal.includes(cleaned)) {
          existingVal.push(cleaned);
        }
      }
      // Якщо ключ уже є і це не масив
      else {
        // Якщо нове значення відрізняється від старого
        if (existingVal !== cleaned) {
          // Перетворюємо у масив
          result[key] = [existingVal, cleaned];
        }
        // Якщо те саме, нічого не робимо
      }
    }
  
    entitiesArray.forEach((item) => {
      if (item.type === "bold") {
        // Як тільки натрапили на bold, зберігаємо попереднє значення
        if (currentKey && value.trim()) {
          storeValue(currentKey, value);
        }
        // Починаємо новий ключ
        currentKey = item.text.trim();
        collectingValue = false;
        value = "";
      }
      // Якщо це plain — починаємо чи продовжуємо збір значення
      else if (currentKey && item.type === "plain") {
        collectingValue = true;
        value += item.text.trim();
      }
      // Якщо в режимі "збирання" і є будь-який item.text
      else if (collectingValue && item.text) {
        value += item.text.trim();
      }
    });
  
    // Після завершення циклу, якщо лишилося незбережене значення
    if (currentKey && value.trim()) {
      storeValue(currentKey, value);
    }
  
    // Формуємо фінальний об'єкт, враховуючи keyMapping та excludedKeys
    const finalResult = {};
    const myComments = [];
  
    Object.entries(result).forEach(([key, val]) => {
      // Якщо ключ не у списку виключень
      if (!excludedKeys.includes(key)) {
        if (keyMapping[key]) {
          // Якщо є мапінг для цього ключа
          finalResult[keyMapping[key]] = val;
        } else {
          // Якщо немає — вважаємо, що це "коментар" або невідомий ключ
          if (Array.isArray(val)) {
            myComments.push(`${key}: ${val.join(", ")}`);
          } else {
            myComments.push(`${key}: ${val}`);
          }
        }
      }
    });
  
    // Якщо щось відправили у myComments, додаємо його у finalResult
    if (myComments.length > 0) {
      finalResult.myComments = myComments.join("; ");
    }
  
    return finalResult;
  }
  
  // Головна функція
  const parseTextToKeyValue = (textArray) => {
    const result = {};
    let currentKey = null;
    let collectingValue = false;
    let value = "";
  
    // Функція для запису значення в result
    function storeValue(key, rawValue) {
      // Прибираємо зайві символи
      const cleaned = rawValue.trim().replace(/^:/, "").replace(/[\n└├]/g, "");
      const existingVal = result[key];
  
      // Якщо ключа ще не було — просто записуємо значення як рядок
      if (existingVal === undefined) {
        result[key] = cleaned;
      }
      // Якщо ключ уже є і це масив
      else if (Array.isArray(existingVal)) {
        // Перевіряємо, чи немає вже ідентичного елемента
        if (!existingVal.includes(cleaned)) {
          existingVal.push(cleaned);
        }
        // Якщо таке ж значення вже є — нічого не робимо
      }
      // Якщо ключ є, але це не масив — отже, там зберігається один рядок
      else {
        // Якщо нове значення відрізняється від існуючого
        if (existingVal !== cleaned) {
          // Перетворюємо на масив
          result[key] = [existingVal, cleaned];
        }
        // Якщо таке ж саме — нічого не робимо
      }
    }
  
    // Проходимося по масиву textArray
    for (const item of textArray) {
      // Якщо зустріли "bold" — це новий ключ
      if (typeof item === "object" && item.type === "bold") {
        // Зберігаємо попереднє значення, якщо воно було
        if (currentKey && value.trim()) {
          storeValue(currentKey, value);
        }
        // Встановлюємо поточний ключ
        currentKey = item.text.trim();
        collectingValue = false;
        value = "";
      }
      // Якщо зустріли двокрапку, починаємо збирати значення
      else if (currentKey && typeof item === "string" && item.trim() === ":") {
        collectingValue = true;
      }
      // Продовжуємо збирати, якщо в режимі collectingValue
      else if (collectingValue && typeof item === "object" && item.text) {
        value += item.text.trim();
      }
      else if (collectingValue && typeof item === "string") {
        value += item.trim();
      }
    }
  
    // Зберігаємо останнє зібране значення
    if (currentKey && value.trim()) {
      storeValue(currentKey, value);
    }
  
    // Формуємо фінальний об'єкт із урахуванням keyMapping та excludedKeys
    const finalResult = {};
    const myComments = [];
  
    Object.entries(result).forEach(([key, val]) => {
      // Перевіряємо, чи не виключати ключ
      if (!excludedKeys.includes(key)) {
        // Якщо ключ є в keyMapping — замінюємо назву
        if (keyMapping[key]) {
          finalResult[keyMapping[key]] = val;
        } 
        // Якщо ключ не відомий (немає в keyMapping), зберігаємо в myComments
        else {
          // Можна залишити як є, якщо не потрібно переносити в коментар
          // Або перенести в myComments:
          myComments.push(`${key}: ${Array.isArray(val) ? val.join(", ") : val}`);
        }
      }
    });
  
    // Якщо є коментарі, додаємо їх у результат
    if (myComments.length > 0) {
      finalResult.myComments = myComments.join("; ");
    }
  
    console.log("finalResult :>> ", finalResult);
    return finalResult;
  };
  



  const formatDate = (dateString) => {
    const parts = dateString.split(".");
    if (parts.length === 3) {
      // Перетворюємо числа на рядки і додаємо 0, якщо необхідно
      const day = parts[0].padStart(2, "0");
      const month = parts[1].padStart(2, "0");
      const year = parts[2]; // Рік завжди залишається незмінним
      return `${day}.${month}.${year}`;
    }
    return dateString; // Повертаємо без змін, якщо формат некоректний
  };

  function mergeAllKeysAndValues(acc, newData) {
    for (const [key, newVal] of Object.entries(newData)) {
      const oldVal = acc[key];
      
      // Якщо в acc немає цього ключа — просто присвоюємо
      if (oldVal === undefined) {
        acc[key] = newVal;
      }
      // Якщо в acc вже є ключ і це масив
      else if (Array.isArray(oldVal)) {
        if (Array.isArray(newVal)) {
          // Додаємо кожен елемент без дублювання
          for (const item of newVal) {
            if (!oldVal.includes(item)) {
              oldVal.push(item);
            }
          }
        } else {
          // newVal — одиночний рядок
          if (!oldVal.includes(newVal)) {
            oldVal.push(newVal);
          }
        }
      }
      // Якщо в acc є ключ, але це не масив (а рядок)
      else {
        // Якщо нове значення — масив
        if (Array.isArray(newVal)) {
          // Якщо oldVal ще не міститься в цьому масиві — додаємо
          if (!newVal.includes(oldVal)) {
            acc[key] = [oldVal, ...newVal];
          } else {
            acc[key] = [...newVal];
          }
        } else {
          // oldVal і newVal обидва рядки
          if (oldVal !== newVal) {
            // якщо відрізняються — робимо масив із двох
            acc[key] = [oldVal, newVal];
          }
          // якщо ідентичні — нічого не робимо
        }
      }
    }
    return acc;
  }

  // Функція обробки JSON
  const processJson = (data) => {
    if (Array.isArray(data)) {
      return data.reduce((acc, item) => {
        const processedItem = processJson(item);
        if (processedItem && processedItem["vk"]) { 
          // const userId = generateUserId();
          const userId = `${Array.isArray(processedItem["vk"]) ? processedItem["vk"][0] : processedItem["vk"]}`.trim();
          acc[userId] = processedItem;
        }
        return acc;
      }, {});
    } else if (data && typeof data === "object") {
      let processed = Object.entries(data).reduce((acc, [key, value]) => {
          // Виключаємо ключі, де значення === "null"
      if (value === "null" || value === null) {
        return acc; // Пропускаємо цей ключ
      }
        const mappedKey = keyMapping[key] || key;
  
        if (["id", "type", "date", "date_unixtime", "edited", "edited_unixtime", "from", "from_id"].includes(key)) {
          return acc;
        } 
        else if (key === "text_entities") {
          const parsed = parseTextEntitiesToKeyValue(value);
          acc = mergeAllKeysAndValues(acc, parsed);
        } 
        else if (key === "text" && Array.isArray(value)) {
          const parsed = parseTextToKeyValue(value);
          acc = mergeAllKeysAndValues(acc, parsed);
        } else {
          acc[mappedKey] = processJson(value);
        }
        return acc;
      }, {});
  
      // Додатковий етап обробки ключів
      if (processed.country === "Россия" || processed.name === "DELETED") {
        return null; // Повертаємо null, якщо country === "Россия"
      }
      if (processed.birth && typeof processed.birth === "string") {
        processed.birth = formatDate(processed.birth);
      }
      if (processed.skype && typeof processed.skype === "string") {
        processed.skype = processed.skype.startsWith("@") ? processed.skype.slice(1) : processed.skype;
    } if (processed.skype === 'null') {
            delete processed.skype;
    }
      if (processed.twitter && typeof processed.twitter === "string") {
        processed.twitter = processed.twitter.startsWith("@") ? processed.twitter.slice(1) : processed.twitter;
      }
      if (processed.facebook && typeof processed.facebook === "string") {
        processed.facebook = processed.facebook.startsWith("@") ? processed.facebook.slice(1) : processed.facebook;
      }
      if (processed.instagram && typeof processed.instagram === "string") {
        processed.instagram = processed.instagram.startsWith("@") ? processed.instagram.slice(1) : processed.instagram;
      }
      if (processed.vk && typeof processed.vk === "string") {
        processed.vk = processed.vk.startsWith("id") ? processed.vk : `id${processed.vk}`;
      }

      function adaptVkLogic(processed) {
        // 1. Приводимо vk до масиву (або порожнього)
        let vkArr = [];
        if (processed.vk) {
          vkArr = Array.isArray(processed.vk) ? processed.vk : [processed.vk];
        }
      
        // 2. Приводимо vk2 до масиву (або порожнього)
        let vk2Arr = [];
        if (processed.vk2) {
          vk2Arr = Array.isArray(processed.vk2) ? processed.vk2 : [processed.vk2];
        }
      
        // 3. Об'єднуємо обидва масиви
        let mergedArr = [...vkArr, ...vk2Arr];
      
        // 4. Додаємо префікс "id", якщо елемент – лише цифри й не починається з "id"
        mergedArr = mergedArr.map((item) => {
          const isOnlyDigits = /^[0-9]+$/.test(item);
          if (isOnlyDigits && !item.startsWith("id")) {
            return "id" + item;
          }
          return item;
        });
      
        // 5. Видаляємо дублікати
        mergedArr = Array.from(new Set(mergedArr));
      
        // 6. Завжди видаляємо vk2 (усі його значення уже в mergedArr)
        delete processed.vk2;
      
        // 7. Прибираємо зайвий "порожній" vk
        //    Якщо після злиття не лишилось значень, видаляємо vk повністю
        if (mergedArr.length === 0) {
          delete processed.vk;
        }
        // Якщо в масиві 1 елемент — робимо звичайне поле (рядок)
        else if (mergedArr.length === 1) {
          processed.vk = mergedArr[0];
        }
        // Інакше зберігаємо масив
        else {
          processed.vk = mergedArr;
        }
      
        return processed;
      }

      function adaptPhones(processed) {
        // Зібрати все в один масив
        let phoneArr = [];
      
        // Допоміжна функція для перетворення у масив
        const toArray = (val) => Array.isArray(val) ? val : [val];
      
        // Якщо існує phone
        if (processed.phone) {
          phoneArr = phoneArr.concat(toArray(processed.phone));
        }
        // Якщо існує phone2
        if (processed.phone2) {
          phoneArr = phoneArr.concat(toArray(processed.phone2));
          delete processed.phone2; // видаляємо зайве поле
        }
        // Якщо існує phone3
        if (processed.phone3) {
          phoneArr = phoneArr.concat(toArray(processed.phone3));
          delete processed.phone3; // видаляємо зайве поле
        }
      
        // Якщо після збирання масив порожній (не було жодного phone / phone2 / phone3)
        if (phoneArr.length === 0) {
          delete processed.phone; 
          return processed;
        }
      
        // Нормалізація кожного елемента
        phoneArr = phoneArr.map((num) => {
          // Якщо значення містить букви (наприклад, "380667733147ttt"), залишаємо як є
          if (/[a-zA-Zа-яА-Я]/.test(num)) {
            return num; 
          }
      
          // Інакше видаляємо все нецифрове
          let cleaned = num.replace(/\D+/g, ""); // залишається лише цифри
      
          // Якщо після цього щось лишилось
          if (cleaned) {
            // Якщо починається з "0" — (опціонально) додаємо "38"
            if (cleaned.startsWith("0")) {
              cleaned = "38" + cleaned;
            }
            return cleaned;
          } else {
            // Якщо лишився порожній рядок (наприклад, було тільки "+( )"), повертаємо порожньо
            return "";
          }
        });
      
        // Видаляємо порожні
        phoneArr = phoneArr.filter((el) => el !== "");
      
        // Прибираємо дублікати
        phoneArr = Array.from(new Set(phoneArr));
      
        // Якщо після всього не лишилося номерів
        if (phoneArr.length === 0) {
          delete processed.phone;
          return processed;
        }
      
        // Якщо лишився лише один номер
        if (phoneArr.length === 1) {
          processed.phone = phoneArr[0];
        } else {
          // Якщо кілька — лишаємо масив
          processed.phone = phoneArr;
        }
      
        return processed;
      }

      function adaptFacebook(processed) {
        let facebookArr = [];

  const toArray = (val) => (Array.isArray(val) ? val : [val]);

  if (processed.facebook) {
    facebookArr = facebookArr.concat(toArray(processed.facebook));
  }
  if (processed.facebook2) {
    facebookArr = facebookArr.concat(toArray(processed.facebook2));
    delete processed.facebook2; // Видаляємо додаткове поле
  }

  if (facebookArr.length === 0) {
    delete processed.facebook;
    return processed;
  }

  // Нормалізуємо значення
  facebookArr = facebookArr
    .map((fb) => {
      fb = fb.trim().toLowerCase(); // Видаляємо пробіли та приводимо до нижнього регістру
      if (fb.startsWith("@")) {
        fb = fb.slice(1); // Видаляємо "@" на початку
      }
      return fb;
    })
    .filter((el) => el !== ""); // Видаляємо порожні значення

  // Видаляємо дублікати
  facebookArr = Array.from(new Set(facebookArr));

  if (facebookArr.length === 0) {
    delete processed.facebook;
    return processed;
  }

  if (facebookArr.length === 1) {
    processed.facebook = facebookArr[0]; // Якщо один елемент, повертаємо рядок
  } else {
    processed.facebook = facebookArr; // Якщо кілька, залишаємо масив
  }

  return processed;
      }

      function adaptCity(processed) {
        let cityArr = [];
      
        const toArray = (val) => (Array.isArray(val) ? val : [val]);
      
        if (processed.city) {
          cityArr = cityArr.concat(toArray(processed.city));
        }
        if (processed.city2) {
          cityArr = cityArr.concat(toArray(processed.city2));
          delete processed.city2;
        }
      
        if (cityArr.length === 0) {
          delete processed.city;
          return processed;
        }
      
        const lowerCaseSet = new Set(); // Зберігає значення для порівняння в нижньому регістрі
        const uniqueCities = []; // Зберігає оригінальні значення
      
        cityArr.forEach((city) => {
          const lowerCaseCity = city.toLowerCase(); // Приводимо до нижнього регістру для перевірки
          if (!lowerCaseSet.has(lowerCaseCity)) {
            lowerCaseSet.add(lowerCaseCity);
            uniqueCities.push(city); // Зберігаємо оригінальне значення
          }
        });
      
        if (uniqueCities.length === 0) {
          delete processed.city;
        } else if (uniqueCities.length === 1) {
          processed.city = uniqueCities[0];
        } else {
          processed.city = uniqueCities;
        }
      
        return processed;
      }

      function adaptSkype(processed) {
        let skypeArr = [];
      
        const toArray = (val) => (Array.isArray(val) ? val : [val]);
      
        if (processed.skype) {
          skypeArr = skypeArr.concat(toArray(processed.skype));
        }
      
        if (skypeArr.length === 0) {
          delete processed.skype;
          return processed;
        }
      
        // Нормалізація значень
        skypeArr = skypeArr
          .map((skype) => {
            skype = skype.trim(); // Видаляємо пробіли
            if (skype.startsWith("@")) {
              skype = skype.slice(1); // Видаляємо "@" на початку
            }
            return skype;
          })
          .filter((el) => el !== ""); // Видаляємо порожні значення
      
        // Видаляємо дублікати
        skypeArr = Array.from(new Set(skypeArr));
      
        if (skypeArr.length === 0) {
          delete processed.skype;
        } else if (skypeArr.length === 1) {
          processed.skype = skypeArr[0]; // Якщо одне значення, зберігаємо як рядок
        } else {
          processed.skype = skypeArr; // Якщо кілька, залишаємо масив
        }
      
        return processed;
      }

      function adaptInstagram(processed) {
        let instagramArr = [];
      
        const toArray = (val) => (Array.isArray(val) ? val : [val]);
      
        if (processed.instagram) {
          instagramArr = instagramArr.concat(toArray(processed.instagram));
        }
        if (processed.instagram2) {
          instagramArr = instagramArr.concat(toArray(processed.instagram2));
          delete processed.instagram2; // Видаляємо додаткове поле
        }
      
        if (instagramArr.length === 0) {
          delete processed.instagram;
          return processed;
        }
      
        // Нормалізація значень
        instagramArr = instagramArr
          .map((inst) => {
            inst = inst.trim(); // Видаляємо пробіли
            if (inst.startsWith("@")) {
              inst = inst.slice(1); // Видаляємо "@" на початку
            }
            return inst;
          })
          .filter((el) => el !== ""); // Видаляємо порожні значення
      
        // Видаляємо дублікати
        instagramArr = Array.from(new Set(instagramArr));
      
        if (instagramArr.length === 0) {
          delete processed.instagram;
        } else if (instagramArr.length === 1) {
          processed.instagram = instagramArr[0]; // Якщо одне значення, зберігаємо як рядок
        } else {
          processed.instagram = instagramArr; // Якщо кілька, залишаємо масив
        }
      
        return processed;
      }
      

      adaptVkLogic(processed);
      adaptPhones(processed);
      adaptFacebook(processed)
      adaptCity(processed) 
      adaptSkype(processed)
      adaptInstagram(processed)
  
//       // Обробка телефонних номерів
      let phones = [];

      // Розділяємо значення за комами та очищаємо пробіли
      if (processed.phone && typeof processed.phone === "string") {
        phones.push(...processed.phone.split(",").map((p) => p.trim()));
      } else if (processed.phone) {
        phones.push(processed.phone);
      }
      
      if (processed.phone2 && typeof processed.phone2 === "string") {
        phones.push(...processed.phone2.split(",").map((p) => p.trim()));
      } else if (processed.phone2) {
        phones.push(processed.phone2);
      }
      
      if (processed.phone3 && typeof processed.phone3 === "string") {
        phones.push(...processed.phone3.split(",").map((p) => p.trim()));
      } else if (processed.phone3) {
        phones.push(processed.phone3);
      }
      
      // Унікальність номерів
      const uniquePhones = [...new Set(phones)];
      
      if (uniquePhones.length === 1) {
        // Якщо є лише один унікальний номер, залишаємо його як ключ-значення
        processed.phone = uniquePhones[0];
      } else if (uniquePhones.length > 1) {
        // Якщо є кілька унікальних номерів, створюємо масив
        processed.phone = uniquePhones;
      }
      
      // Видаляємо ключі phone2 і phone3
      delete processed.phone2;
      delete processed.phone3;
  
//       // Обробка Facebook
      const facebooks = [];
      if (processed.facebook) facebooks.push(processed.facebook);
      if (processed.facebook2) facebooks.push(processed.facebook2);
  
      if (facebooks.length === 1) {
        processed.facebook = facebooks[0];
      } else if (facebooks.length > 1) {
        processed.facebook = facebooks;
      }
  
      delete processed.facebook2;
  
      // Обробка City
      // const cities = [];
      // if (processed.city) cities.push(processed.city);
      // if (processed.city2) cities.push(processed.city2);
  
      // const uniqueCities = [...new Set(cities.map((city) => city.toLowerCase()))];
  
//      // Вибір значення після нормалізації
// if (uniqueCities.length === 1) {
//   // Якщо всі значення однакові після нормалізації, залишаємо перший варіант як ключ-значення
//   processed.city = cities[0];
// } else if (uniqueCities.length > 1) {
//   // Якщо є кілька унікальних значень, створюємо масив
//   processed.city = [...new Set(cities)];
// }
  
//       delete processed.city2;
  
//       // Обробка VK
//       if (processed.vk || processed.vk2) {
//         const vks = [];
//         if (processed.vk) vks.push(processed.vk);
//         if (processed.vk2) vks.push(processed.vk2);
  
//         const uniqueVks = [...new Set(vks)];
  
//         if (uniqueVks.length === 1) {
//           processed.vk = uniqueVks[0];
//         } else if (uniqueVks.length > 1) {
//           processed.vk = uniqueVks;
//         }
  
//         delete processed.vk2;
//       }
  
//       // Додаємо userId
      if (processed.vk) {
        processed.userId = Array.isArray(processed.vk) ? processed.vk[0] : processed.vk;
      }

  
      return processed;
    }
    return data;
  };
  
  
  
  

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsedJson = JSON.parse(e.target.result);
          const processedData = processJson(parsedJson);
          setCleanedJson({ messages: processedData });
        } catch (error) {
          alert("Помилка: Файл не є валідним JSON.");
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div>
      <StyledLabel>
        <HiddenInput type="file" accept=".json" onChange={handleFileUpload} />
        JSON
      </StyledLabel>

      {cleanedJson && (
        <pre style={{ color: "black" }}>
          {JSON.stringify(cleanedJson, null, 2)}
        </pre>
      )}
    </div>
  );
};
