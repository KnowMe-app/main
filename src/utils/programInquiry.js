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

export const buildProgramInquiryText = ({ offer = '', title = '', pay = '' }, language) => {
  const subject = [offer, title, pay].map(part => String(part || '').trim()).filter(Boolean).join(' · ');
  return uiText('Вітаю! Мене цікавить ваша програма: {subject}. Пишу з KnowMe.', language, { subject });
};

export const resolveProgramInquiryLink = (entries, text) => {
  const list = Array.isArray(entries) ? entries : [];
  const telegram = list.find(entry => entry.key === 'telegram' && entry.href);
  if (telegram) return { href: telegram.href, channel: 'telegram', prefilled: false };
  const phone = list.find(entry => entry.key === 'phone' && digitsOnly(entry.value).length >= 9);
  if (phone) {
    return { href: `https://wa.me/${digitsOnly(phone.value)}?text=${encodeURIComponent(text)}`, channel: 'whatsapp', prefilled: true };
  }
  const email = list.find(entry => entry.key === 'email' && String(entry.value || '').includes('@'));
  if (email) {
    return { href: `mailto:${String(email.value).trim()}?body=${encodeURIComponent(text)}`, channel: 'email', prefilled: true };
  }
  const other = list.find(entry => entry.href);
  return other ? { href: other.href, channel: other.key, prefilled: false } : null;
};
