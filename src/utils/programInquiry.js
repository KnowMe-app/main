import { uiText } from './uiTranslations';

/*
 * «Написати про цю програму» — лист організації, який уже називає програму.
 *
 * Агенція веде кілька програм, і «Вітаю, мене цікавить донорство» без
 * назви змушувало перепитувати «яка саме». Текст складається з того, що
 * кандидатка бачить у рядку програми: кого шукають, назви рядка (місце й
 * відмінність) і винагороди.
 *
 * Готовий текст у чат кладуть не всі месенджери: WhatsApp (`wa.me/…?text=`)
 * і пошта (`mailto:?body=`) — так, Telegram і Viber — ні. Тож канал
 * обирається так: Telegram-нік (агенції найчастіше пишуть саме там), далі
 * телефон через WhatsApp, далі пошта, далі будь-який інший канал. Де текст
 * у чат не ліг, він лежить у буфері обміну, і кнопка про це каже.
 */

const digitsOnly = value => String(value ?? '').replace(/\D/g, '');

// Посилання з контактів картки пише людина (сайт, «інше посилання»), тож у
// кнопку йде лише безпечна схема: `javascript:` чи `data:` з анкети інакше
// виконались би дотиком до «Написати про цю програму».
const SAFE_SCHEMES = new Set(['https:', 'http:', 'tg:', 'mailto:', 'tel:', 'viber:']);
export const isSafeInquiryHref = href => {
  const value = String(href || '').trim();
  const scheme = value.match(/^([a-z][a-z0-9+.-]*:)/i)?.[1]?.toLowerCase();
  return Boolean(scheme && SAFE_SCHEMES.has(scheme));
};
// Адреса пошти — саме адреса: без «?», «&», «/» і пробілів, щоб не дописати
// листу чужих полів (`cc`, `subject`).
const isPlainEmail = value => /^[^\s?&/@]+@[^\s?&/@]+\.[^\s?&/@]+$/.test(String(value || '').trim());

export const buildProgramInquiryText = ({ offer = '', title = '', pay = '' }, language) => {
  const subject = [offer, title, pay].map(part => String(part || '').trim()).filter(Boolean).join(' · ');
  return uiText('Вітаю! Мене цікавить ваша програма: {subject}. Пишу з KnowMe.', language, { subject });
};

export const resolveProgramInquiryLink = (entries, text) => {
  const list = Array.isArray(entries) ? entries : [];
  const telegram = list.find(entry => entry.key === 'telegram' && isSafeInquiryHref(entry.href));
  if (telegram) return { href: telegram.href, channel: 'telegram', prefilled: false };
  const phone = list.find(entry => entry.key === 'phone' && digitsOnly(entry.value).length >= 9);
  if (phone) {
    return { href: `https://wa.me/${digitsOnly(phone.value)}?text=${encodeURIComponent(text)}`, channel: 'whatsapp', prefilled: true };
  }
  const email = list.find(entry => entry.key === 'email' && isPlainEmail(entry.value));
  if (email) {
    return { href: `mailto:${encodeURIComponent(String(email.value).trim()).replace('%40', '@')}?body=${encodeURIComponent(text)}`, channel: 'email', prefilled: true };
  }
  const other = list.find(entry => isSafeInquiryHref(entry.href));
  return other ? { href: other.href, channel: other.key, prefilled: false } : null;
};
