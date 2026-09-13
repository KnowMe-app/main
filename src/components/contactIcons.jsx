import {
  FaFacebookF,
  FaGlobe,
  FaInstagram,
  FaLinkedin,
  FaTelegramPlane,
  FaViber,
  FaVk,
  FaWhatsapp,
  FaYoutube,
} from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { MdEmail } from 'react-icons/md';
import { SiTiktok } from 'react-icons/si';
import { PhoneHandsetIcon } from './icons/PhoneHandsetIcon';
import { CONTACT_LINK_BUILDERS } from './contactMethods';

/**
 * Значок каналу звʼязку — один набір на весь застосунок.
 *
 * Цей самий перелік жив окремо в картці анкети й у рядку стрічки, і за це
 * платив читач: той самий контакт позначався в двох місцях по-різному рівно
 * доти, доки хтось не згадував поправити обидві копії.
 */
export const CONTACT_ICONS = {
  phone: PhoneHandsetIcon,
  email: MdEmail,
  telegram: FaTelegramPlane,
  whatsapp: FaWhatsapp,
  viber: FaViber,
  facebook: FaFacebookF,
  instagram: FaInstagram,
  tiktok: SiTiktok,
  vk: FaVk,
  linkedin: FaLinkedin,
  youtube: FaYoutube,
  twitter: FaXTwitter,
  website: FaGlobe,
  otherLink: FaGlobe,
};

export const getContactIcon = key => CONTACT_ICONS[key] || FaGlobe;

/**
 * Три швидкі кнопки, які будуються з самого номера.
 *
 * Ніякого нового контакту вони не несуть: це той самий телефон, відкритий у
 * месенджері. Тому й стоять вони біля номера, а не окремим переліком у кінці
 * блока, де читались як три порожні контакти.
 */
export const PHONE_QUICK_LINKS = [
  { key: 'telegram', Icon: FaTelegramPlane, label: 'Telegram', build: CONTACT_LINK_BUILDERS.telegramFromPhone },
  { key: 'viber', Icon: FaViber, label: 'Viber', build: CONTACT_LINK_BUILDERS.viberFromPhone },
  { key: 'whatsapp', Icon: FaWhatsapp, label: 'WhatsApp', build: CONTACT_LINK_BUILDERS.whatsappFromPhone },
];

/** Телефон і пошта відкриваються застосунком пристрою, решта — новою вкладкою. */
export const isExternalContact = key => key !== 'phone' && key !== 'email';
