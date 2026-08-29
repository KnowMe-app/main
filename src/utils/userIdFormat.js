// userId є "довгим" (Firebase-Auth UID), якщо довший за 20 символів. Саме на цій
// межі тримається розрізнення «анкета акаунта» / «анкета, заведена у вебі»:
// push-ключ Firebase — це рівно 20 символів, а UID акаунта — 28.
export const isLongFormatUserId = userId => String(userId || '').length > 20;
