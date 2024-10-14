import axios from 'axios';

export const aiHandler = async (input) => {

  const options = {
    method: 'POST',
    url: 'https://api.openai.com/v1/chat/completions', // Вірний URL для chat API
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`, // Ваш API-ключ
    },
    data: {
      model: 'gpt-3.5-turbo', // Можна використовувати іншу модель, якщо потрібно
      messages: [
        {
          role: 'user',
          content: `Створи пари ключ-значення з"${input}" в один об"єкт. Для неідентифікованих даних ключ moreInfo_main. Найймовірніші ключі facebook, phone, vk, instagram, tiktok`
        }
      ],
      max_tokens: 100,
      temperature: 0,
    },
  };

  try {
    const response = await axios.request(options);
    const res = response.data.choices[0].message.content.trim(); // Використовуйте content замість text
    return res;
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
};
