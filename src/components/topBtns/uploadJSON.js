import { HiddenInput, StyledLabel } from "components/styles";
import React, { useState } from "react";

export const UploadJson = () => {
  const [cleanedJson, setCleanedJson] = useState(null);

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
          result[currentKey] = value.trim().replace(/├/g, "");
        }
        currentKey = item.text.trim();
        collectingValue = false;
        value = "";
      } else if (currentKey && item.type === "plain" && item.text.trim() === ":") {
        collectingValue = true;
      } else if (collectingValue && item.text) {
        value += ` ${item.text.trim()}`;
      }
    });

    if (currentKey && value.trim()) {
      result[currentKey] = value.trim().replace(/├/g, "");
    }

    const excludedKeys = [
      "has_mobile", "books", "Игры", "movies", "can_access_closed", "Пол", "timezone", "tv", "last_seen", "university", "Подписчики", "deactivated", "Деятельность", "online"
    ];
    const keyMapping = {
      "Имя": "name",
      "Фамилия": "surname",
      "Город": "city",
      "Email": "email",
      "Телефоны": "phone",
      "Страна": "country",
      "photo_max_orig": "photo",
      "О себе": "moreInfo",
      "Мобильный": "phone2",
      "Дата рождения": 'birth',
      "_id": "vk",
      "Screen name": "vk2",
      "Родной город": "city",
      "Skype":"skype",
      "Twitter" : "twitter"
    };

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
          result[currentKey] = value.trim().replace(/├/g, "");
        }
        currentKey = item.text.trim();
        collectingValue = false;
        value = "";
      } else if (currentKey && typeof item === "string" && item.trim() === ":") {
        collectingValue = true;
      } else if (collectingValue && typeof item === "object" && item.text) {
        value += ` ${item.text.trim()}`;
      } else if (collectingValue && typeof item === "string") {
        value += ` ${item.trim()}`;
      }
    });

    if (currentKey && value.trim()) {
      result[currentKey] = value.trim().replace(/├/g, "");
    }

    const excludedKeys = [
      "has_mobile", "books", "Игры", "movies", "can_access_closed", "Пол", "timezone", "tv", "last_seen", "university", "Подписчики", "deactivated", "Деятельность", "online"
    ];
    const keyMapping = {
        "Имя": "name",
        "Фамилия": "surname",
        "Город": "city",
        "Email": "email",
        "Телефоны": "phone",
        "Страна": "country",
        "photo_max_orig": "photo",
        "О себе": "moreInfo",
        "Мобильный": "phone2",
        "Дата рождения": 'birth',
        "_id": "vk",
        "Screen name": "vk2",
        "Родной город": "city",
        "Skype":"skype",
        "Twitter" : "twitter"
      
    };

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

  // Функція обробки JSON
  const processJson = (data) => {
    if (Array.isArray(data)) {
      return data.reduce((acc, item) => {
        const processedItem = processJson(item);
        if (processedItem && processedItem["vk"]) { // Використовуємо "vk" замість "_id"
          const userId = `id${processedItem["vk"].trim()}`; // Формуємо userId на основі "vk"
          acc[userId] = processedItem;
        }
        return acc;
      }, {});
    } else if (data && typeof data === "object") {
      const processed = Object.entries(data).reduce((acc, [key, value]) => {
        if (key === "text_entities") {
          acc = { ...acc, ...parseTextEntitiesToKeyValue(value) };
        } else if (key === "text" && Array.isArray(value)) {
          acc = { ...acc, ...parseTextToKeyValue(value) };
        } else if (
          [
            "id", "type", "date", "date_unixtime", "edited", "edited_unixtime", "from", "from_id"
          ].includes(key)
        ) {
          return acc;
        } else {
          acc[key] = processJson(value); // Рекурсивно обробляємо інші поля
        }
        return acc;
      }, {});

      return processed;
    }
    return data; // Повертаємо значення без змін
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
