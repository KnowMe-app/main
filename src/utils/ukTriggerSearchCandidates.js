export const buildUkTriggerTelegramCandidates = ukTrigger => {
  const normalizedTelegram = ukTrigger?.searchPair?.telegram?.trim();
  if (!normalizedTelegram) return [];

  const candidates = [normalizedTelegram];
  const handle = String(ukTrigger?.handle || '').trim();

  // Єдине правило: завжди шукаємо і повний UK-тригер, і fallback по handle.
  // Це зберігає partial-поведінку для запитів типу "УК СМ @yuliia420",
  // де очікуються також збіги на кшталт "УК СМ @yuliia4201".
  if (handle) {
    candidates.push(handle);
  }

  return candidates;
};

export default buildUkTriggerTelegramCandidates;
