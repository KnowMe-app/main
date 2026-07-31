const FIREBASE_FORBIDDEN_KEY_CHARACTERS = ['.', '#', '$', '[', ']', '/'];

export const parseNewUsersJson = jsonText => {
  let parsed;

  try {
    parsed = JSON.parse(jsonText);
  } catch (_error) {
    throw new Error('Файл містить некоректний JSON');
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('JSON має бути об’єктом із картками користувачів');
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    throw new Error('JSON не містить карток користувачів');
  }

  return entries.reduce((cards, [key, card]) => {
    const normalizedKey = String(key).trim();
    if (
      !normalizedKey ||
      FIREBASE_FORBIDDEN_KEY_CHARACTERS.some(character => normalizedKey.includes(character))
    ) {
      throw new Error(`Некоректний ключ картки: ${key}`);
    }
    if (!card || Array.isArray(card) || typeof card !== 'object') {
      throw new Error(`Картка ${normalizedKey} має бути об’єктом`);
    }

    cards[normalizedKey] = {
      ...card,
      userId: card.userId || normalizedKey,
    };
    return cards;
  }, {});
};
