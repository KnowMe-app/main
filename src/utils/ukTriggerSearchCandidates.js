export const buildUkTriggerTelegramCandidates = ukTrigger => {
  const normalizedTelegram = ukTrigger?.searchPair?.telegram?.trim();
  if (!normalizedTelegram) return [];

  // Для UK-тригера використовуємо лише повний telegram-запит:
  // "УК СМ ... @nickname". Не робимо fallback за частиною handle,
  // щоб уникати хибних збігів (наприклад, коли "420" збігається з phone).
  return [normalizedTelegram];
};

export default buildUkTriggerTelegramCandidates;
