export const generateUserId = (() => {
    let counter = 1;
    return () => {
      // Формуємо рядок із 5-ма нулями зліва
      // Якщо потрібно інша кількість цифр – змініть `padStart(5, '0')`
      const numberPart = String(counter).padStart(5, '0');
      const userId = `AC${numberPart}`;
      counter++;
      return userId;
    };
  })();