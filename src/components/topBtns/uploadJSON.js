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
  const parseTextEntitiesToKeyValue = (entitiesArray) => {
    const result = {};
    let currentKey = null;
    let collectingValue = false;
    let value = "";
    let myComments = [];
  
    entitiesArray.forEach((item) => {
      if (item.type === "bold") {
        if (currentKey && value.trim()) {
          result[currentKey] = value
            .trim()
            .replace(/^:/, "") // Видаляємо двокрапку на початку значення
            .replace(/[\n└├]/g, ""); // Видаляємо зайві символи (\n, └, ├)
        }
        currentKey = item.text.trim();
        collectingValue = false;
        value = "";
      } else if (currentKey && item.type === "plain") {
        collectingValue = true;
        value += item.text.trim();
      } else if (collectingValue && item.text) {
        value += item.text.trim();
      }
    });
  
    if (currentKey && value.trim()) {
      result[currentKey] = value
        .trim()
        .replace(/^:/, "") // Видаляємо двокрапку на початку значення
        .replace(/[\n└]/g, ""); // Видаляємо зайві символи
    }
  
    Object.entries(result).forEach(([key, value]) => {
      if (!keyMapping[key] && !excludedKeys.includes(key)) {
        myComments.push(`${key}: ${value}`);
        delete result[key]; // Видаляємо ключ із основного об'єкта
      }
    });
  
    return {
      ...Object.fromEntries(
        Object.entries(result)
          .filter(([key]) => !excludedKeys.includes(key))
          .map(([key, value]) => [keyMapping[key] || key, value])
      ),
      ...(myComments.length > 0 ? { myComments: myComments.join(", ") } : {}),
    };
  };
  

  // Функція перетворення text у формат ключ-значення
  const parseTextToKeyValue = (textArray) => {
    const result = {};
    let currentKey = null;
    let collectingValue = false;
    let value = "";
    let myComments = [];
  
    textArray.forEach((item) => {
      if (typeof item === "object" && item.type === "bold") {
        if (currentKey && value.trim()) {
          result[currentKey] = value
            .trim()
            .replace(/^:/, "") // Видаляємо двокрапку на початку значення
            .replace(/[\n└├]/g, ""); // Видаляємо зайві символи (\n, └, ├)
        }
        currentKey = item.text.trim();
        collectingValue = false;
        value = "";
      } else if (currentKey && typeof item === "string" && item.trim() === ":") {
        collectingValue = true;
      } else if (collectingValue && typeof item === "object" && item.text) {
        value += item.text.trim();
      } else if (collectingValue && typeof item === "string") {
        value += item.trim();
      }
    });
  
    if (currentKey && value.trim()) {
      result[currentKey] = value
        .trim()
        .replace(/^:/, "") // Видаляємо двокрапку на початку значення
        .replace(/[\n└├]/g, ""); // Видаляємо зайві символи (\n, └, ├)
    }
  
    Object.entries(result).forEach(([key, value]) => {
      if (!keyMapping[key] && !excludedKeys.includes(key)) {
        myComments.push(`${key}: ${value}`);
        delete result[key]; // Видаляємо ключ із основного об'єкта
      }
    });
  
    return {
      ...Object.fromEntries(
        Object.entries(result)
          .filter(([key]) => !excludedKeys.includes(key))
          .map(([key, value]) => [keyMapping[key] || key, value])
      ),
      ...(myComments.length > 0 ? { myComments: myComments.join(", ") } : {}),
    };
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

  // Функція обробки JSON
  const processJson = (data) => {
    if (Array.isArray(data)) {
      return data.reduce((acc, item) => {
        const processedItem = processJson(item);
        if (processedItem && processedItem["vk"]) { 
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
        } else if (key === "text_entities") {
          acc = { ...acc, ...parseTextEntitiesToKeyValue(value) };
        } else if (key === "text" && Array.isArray(value)) {
          acc = { ...acc, ...parseTextToKeyValue(value) };
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
      if (processed.vk && typeof processed.vk === "string") {
        processed.vk = processed.vk.startsWith("id") ? processed.vk : `id${processed.vk}`;
      }
      if (processed.vk && processed.vk2) {
        const vk2WithoutId = processed.vk2.startsWith("id") ? processed.vk2.slice(2) : processed.vk2;
        if (processed.vk === `id${vk2WithoutId}`) {
          delete processed.vk;
        }
      }
  
      // Обробка телефонних номерів
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
  
      // Обробка Facebook
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
      const cities = [];
      if (processed.city) cities.push(processed.city);
      if (processed.city2) cities.push(processed.city2);
  
      const uniqueCities = [...new Set(cities.map((city) => city.toLowerCase()))];
  
     // Вибір значення після нормалізації
if (uniqueCities.length === 1) {
  // Якщо всі значення однакові після нормалізації, залишаємо перший варіант як ключ-значення
  processed.city = cities[0];
} else if (uniqueCities.length > 1) {
  // Якщо є кілька унікальних значень, створюємо масив
  processed.city = [...new Set(cities)];
}
  
      delete processed.city2;
  
      // Обробка VK
      if (processed.vk || processed.vk2) {
        const vks = [];
        if (processed.vk) vks.push(processed.vk);
        if (processed.vk2) vks.push(processed.vk2);
  
        const uniqueVks = [...new Set(vks)];
  
        if (uniqueVks.length === 1) {
          processed.vk = uniqueVks[0];
        } else if (uniqueVks.length > 1) {
          processed.vk = uniqueVks;
        }
  
        delete processed.vk2;
      }
  
      // Додаємо userId
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
