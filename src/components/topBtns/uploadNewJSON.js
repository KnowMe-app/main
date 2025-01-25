import { HiddenInput, StyledLabel } from "components/styles";
import React, { useState } from "react";

export const UploadJson = () => {
  const [jsonData, setJsonData] = useState(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsedJson = JSON.parse(e.target.result);
          let filteredData = Object.fromEntries(
            Object.entries(parsedJson).filter(([, value]) => {
              const requiredKeys = ["phone", "email", "skype", "facebook", "instagram"];
              return requiredKeys.some((key) => key in value) && !("inline_bot_buttons" in value);
            }).map(([key, value]) => {
              if (value.phone) {
                if (Array.isArray(value.phone)) {
                  value.phone = value.phone
                  .map((num) => processPhoneNumber(num)) // Обробка кожного номера
                  .filter((num) => num !== null); // Видаляємо всі `null` значення
                    // Якщо після фільтрації залишається лише один елемент, перетворюємо в ключ-значення
    if (value.phone.length === 1) {
      value.phone = value.phone[0];
    }
                } else {
                  value.phone = processPhoneNumber(value.phone);
                }
              }

              if (value.instagram && typeof value.instagram === "string") {
                value.instagram = value.instagram.replace(/@/g, "");
              }

              return [key, value];
            })
          );


          // Повторна перевірка після основної обробки
        // Повторна перевірка для requiredKeys
        const requiredKeys = ["phone", "email", "facebook", "instagram"];
        filteredData = Object.fromEntries(
          Object.entries(filteredData).filter(([, value]) => {
            return requiredKeys.some((key) => {
              if (key === "phone") {
                if (Array.isArray(value.phone)) {
                  return value.phone.length > 0; // Перевіряємо, що масив номерів не порожній
                }
                return value.phone !== null && value.phone !== undefined;
              }
              return value[key] !== null && value[key] !== undefined && value[key] !== "";
            });
          })
        );


          setJsonData(filteredData);
        } catch (error) {
          alert("Помилка: Файл не є валідним JSON.");
        }
      };
      reader.readAsText(file);
    }
  };

  const processPhoneNumber = (phone) => {
    const processSinglePhone = (singlePhone) => {

      if (!singlePhone || singlePhone === null) return null; // Перевірка, що значення не порожнє або null
      
      let cleanedPhone = singlePhone.replace(/\+/g, "");
      if (cleanedPhone.startsWith("0")) {
        cleanedPhone = "38" + cleanedPhone;
      }
      if (!/\d/.test(cleanedPhone)) {
        // console.log(`Невалідний номер (немає цифр): ${singlePhone}`);
        return null;
      }

       // Перевіряємо на довжину, якщо номер починається з 380 і має менше 11 символів
    if (cleanedPhone.startsWith("380") && cleanedPhone.length < 11) {
      // console.log(`Невалідний номер: ${singlePhone}`); // Логування невалідного номера
      return null; // Повертаємо null, щоб видалити невалідний номер
    }

        // Фільтруємо номери, які є 101, 102, 103
        const invalidNumbers = ["101", "102", "103"];
        if (invalidNumbers.includes(cleanedPhone)) {
          // console.log(`Невалідний номер (спеціальний): ${singlePhone}`);
          return null;
        }

          // Фільтруємо номери, які містять 5 і більше однакових цифр підряд
          const repeatedDigitsPattern = /(.)\1{4,}/; // Будь-яка цифра, що повторюється 5 або більше разів

          if (repeatedDigitsPattern.test(cleanedPhone)) {
            // Знаходимо всі входження "380" у номері
            const matches = cleanedPhone.match(/380\d{0,12}/g); // Шукаємо "380" + до 12 цифр після нього
            if (matches && matches.length > 0) {
              matches.forEach((match) => {
                // Перевіряємо кожен знайдений номер
                if (!repeatedDigitsPattern.test(match)) {
                  // console.log(`Оригінальний номер: ${cleanedPhone}`);
                  // console.log(`Оновлений номер: ${match}`);
                  // Зберігаємо або повертаємо оновлений номер
                  return match; // Зберігаємо перший валідний номер
                } else {
                  // console.log(`Невалідний витягнутий номер (5 і більше однакових цифр): ${match}`);
                }
              });
            } else {
              // console.log(`Невалідний номер (немає коректної послідовності "380"): ${cleanedPhone}`);
            }
            return null; // Якщо всі номери невалідні, повертаємо null
          }

           // Перевіряємо на довжину, якщо номер починається з 380 і має менше 11 символів
           if (cleanedPhone.length < 10) {
            // console.log(`Невалідний короткий номер: ${singlePhone}`); // Логування невалідного номера
            return null; // Повертаємо null, щоб видалити невалідний номер
          }

   

    return cleanedPhone;
    };
  
    if (Array.isArray(phone)) {
      return phone.map(processSinglePhone);
    } else {
      return processSinglePhone(phone);
    }
  };

  return (
    <div>
      <StyledLabel>
        <HiddenInput type="file" accept=".json" onChange={handleFileUpload} />
        JSON
      </StyledLabel>

      {jsonData && (
        <pre style={{ color: "black" }}>
          {JSON.stringify(jsonData, null, 2)}
        </pre>
      )}
    </div>
  );
};
