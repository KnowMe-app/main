import React, { useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const JsonToExcelButton = () => {
  const [jsonData, setJsonData] = useState([]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) {
      alert("Файл не обрано!");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const data = JSON.parse(content);
        console.log("JSON успішно завантажено:", data);

        // Перетворення структури JSON
        const transformedData = Object.keys(data).map((key) => ({
          userId: key,
          ...data[key],
        }));
        setJsonData(transformedData);
      } catch (error) {
        console.error("Помилка парсингу JSON:", error.message);
        alert("Помилка парсингу JSON! Перевірте формат файлу.");
      }
    };
    reader.readAsText(file);
  };

  const exportToExcel = () => {
    if (!jsonData || jsonData.length === 0) {
      alert("Дані відсутні! Завантажте файл JSON.");
      return;
    }
  
    // Вказана послідовність ключів
    const keyOrder = [
      "phone",
      "email",
      "instagram",
      "facebook",
      "twitter",
      "vk",
      "name",
      "surname",
      "fathersname",
      "city",
      "country",
      "birth",
      "skype",
    ];
  
    // Функція для групування та отримання всіх ключів
    const groupKeys = (data) => {
      const groupedKeys = keyOrder.flatMap((key) =>
        data.flatMap((item) =>
          Array.isArray(item[key]) ? item[key].map((_, i) => `${key}${i + 1}`) : [key]
        )
      );
  
      // Додати всі інші ключі, які не увійшли в keyOrder
      const allKeys = data.flatMap((item) =>
        Object.keys(item).flatMap((key) =>
          Array.isArray(item[key]) ? item[key].map((_, i) => `${key}${i + 1}`) : [`${key}1`]
        )
      );
  
      // Об'єднуємо ключі вказаного порядку та всі інші
      return [...new Set([...groupedKeys, ...allKeys])];
    };
  
    // Отримання всіх ключів у групованому порядку
    const allKeys = groupKeys(jsonData);
    console.log("Унікальні ключі (колонки):", allKeys);
  
    // Формування таблиці з усіма ключами
    const excelData = jsonData.map((item) => {
      const row = {};
      allKeys.forEach((key) => {
        const [field, index] = key.match(/(\D+)(\d*)/).slice(1, 3); // Розбиваємо ключ на основну частину та індекс
        if (Array.isArray(item[field])) {
          row[key] = item[field][index - 1] || ""; // Дістаємо відповідний елемент масиву
        } else {
          row[key] = index === "1" ? item[field] || "" : ""; // Якщо є індекс > 1, залишаємо пустим
        }
      });
      return row;
    });
  
    console.log("Підготовлені дані для Excel:", excelData);
  
    // Створення робочої книги
    try {
      const ws = XLSX.utils.json_to_sheet(excelData, { header: allKeys });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Дані");
  
      // Збереження файлу
      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
      saveAs(blob, "data.xlsx");
      console.log("Файл Excel успішно збережено!");
    } catch (error) {
      console.error("Помилка під час створення Excel:", error.message);
    }
  };
  

  return (
    <div>
      <h1>Завантаження JSON та Експорт у Excel</h1>
      <input
        type="file"
        accept=".json"
        onChange={handleFileUpload}
        style={{ marginBottom: "10px" }}
      />
      <button
        onClick={exportToExcel}
        style={{ padding: "10px 20px", cursor: "pointer" }}
      >
        Завантажити Excel
      </button>
    </div>
  );
};

export default JsonToExcelButton;
