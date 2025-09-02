import React from 'react';
import {
  FaFacebookF,
  FaInstagram,
  FaTelegramPlane,
  FaPhoneVolume,
  FaViber,
  FaWhatsapp,
} from 'react-icons/fa';
import { MdEmail } from 'react-icons/md';
import { SiTiktok } from 'react-icons/si';
import { getCurrentValue } from '../getCurrentValue';

const ICON_SIZE = 16;

// Render phone numbers with Telegram, Viber and Facebook icons
export const fieldContacts = data => {
  if (!data || typeof data !== 'object') {
    console.error('Invalid data passed to renderContacts:', data);
    return null;
  }

  const links = {
    phone: value => `tel:+${value}`,
    telegramFromPhone: value => `https://t.me/${value.replace(/\s+/g, '')}`,
    viberFromPhone: value => `viber://chat?number=%2B${value.replace(/\s+/g, '')}`,
    facebook: value => `https://facebook.com/${value}`,
  };

  const iconStyle = { width: ICON_SIZE, height: ICON_SIZE };
  const iconLinkStyle = {
    color: 'inherit',
    textDecoration: 'none',
    lineHeight: 0,
    display: 'inline-flex',
    alignItems: 'center',
    margin: 0,
    padding: 0,
  };

  const numberLinkStyle = {
    color: 'inherit',
    textDecoration: 'none',
    margin: 0,
    padding: 0,
  };

  const processed = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, getCurrentValue(v)])
  );

  const phoneValues = processed.phone
    ? Array.isArray(processed.phone)
      ? processed.phone.filter(v => v)
      : [processed.phone]
    : [];

  const hasFacebook = !!processed.facebook;

  if (phoneValues.length === 0 && !hasFacebook) {
    return null;
  }

  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      {phoneValues.map((val, idx) => {
        const processedVal = String(val).replace(/\s/g, '');
        return (
          <span
            key={`phone-${idx}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <a
              href={links.phone(processedVal)}
              target="_blank"
              rel="noopener noreferrer"
              style={numberLinkStyle}
            >
              {`+${processedVal}`}
            </a>
            <a
              href={links.telegramFromPhone(`+${val}`)}
              target="_blank"
              rel="noopener noreferrer"
              style={iconLinkStyle}
            >
              <FaTelegramPlane style={iconStyle} />
            </a>
            <a
              href={links.viberFromPhone(processedVal)}
              target="_blank"
              rel="noopener noreferrer"
              style={iconLinkStyle}
            >
              <FaViber style={iconStyle} />
            </a>
          </span>
        );
      })}
      {hasFacebook && (
        <a
          href={links.facebook(processed.facebook)}
          target="_blank"
          rel="noopener noreferrer"
          style={iconLinkStyle}
        >
          <FaFacebookF style={iconStyle} />
        </a>
      )}
    </div>
  );
};

export const fieldContactsIcons = data => {
  if (!data || typeof data !== 'object') {
    console.error('Invalid data passed to renderContacts:', data);
    return null;
  }

  const links = {
    telegram: value => `https://t.me/${value}`,
    instagram: value => `https://instagram.com/${value}`,
    tiktok: value => `https://www.tiktok.com/@${value}`,
    phone: value => `tel:+${value}`,
    facebook: value => `https://facebook.com/${value}`,
    vk: value => `https://vk.com/${value}`,
    otherLink: value => `${value}`,
    email: value => `mailto:${value}`,
    telegramFromPhone: value => `https://t.me/${value.replace(/\s+/g, '')}`,
    viberFromPhone: value => `viber://chat?number=%2B${value.replace(/\s+/g, '')}`,
    whatsappFromPhone: value => `https://wa.me/${value.replace(/\s+/g, '')}`,
  };

  const iconStyle = { width: ICON_SIZE, height: ICON_SIZE };
  const linkStyle = {
    color: 'inherit',
    textDecoration: 'none',
    lineHeight: 0,
    display: 'inline-flex',
    alignItems: 'center',
    margin: 0,
    padding: 0,
  };


  const processed = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, getCurrentValue(v)])
  );

  // Filter out telegram links starting with "УК СМ"
  const telegramValues = processed.telegram
    ? Array.isArray(processed.telegram)
      ? processed.telegram.filter(v => v && !String(v).trim().startsWith('УК СМ'))
      : String(processed.telegram).trim().startsWith('УК СМ')
        ? []
        : [processed.telegram]
    : [];

  const phoneValues = processed.phone
    ? Array.isArray(processed.phone)
      ? processed.phone.filter(v => v)
      : [processed.phone]
    : [];
  const hasContacts =
    phoneValues.length > 0 ||
    telegramValues.length > 0 ||
    processed.email ||
    processed.facebook ||
    processed.instagram ||
    processed.tiktok;

  if (!hasContacts) {
    return null;
  }

  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      {phoneValues.map((val, idx) => {
        const processedVal = String(val).replace(/\s/g, '');
        return (
          <React.Fragment key={`phone-${idx}`}>
            <a
              href={links.phone(processedVal)}
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              <FaPhoneVolume style={iconStyle} />
            </a>
            <a
              href={links.telegramFromPhone(`+${val}`)}
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              <FaTelegramPlane style={iconStyle} />
            </a>
            <a
              href={links.viberFromPhone(processedVal)}
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              <FaViber style={iconStyle} />
            </a>
            <a
              href={links.whatsappFromPhone(processedVal)}
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              <FaWhatsapp style={iconStyle} />
            </a>
          </React.Fragment>
        );
      })}

      {processed.email && (
        <a
          href={links.email(processed.email)}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          <MdEmail style={iconStyle} />
        </a>
      )}

      {processed.facebook && (
        <a
          href={links.facebook(processed.facebook)}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          <FaFacebookF style={iconStyle} />
        </a>
      )}

      {processed.instagram && (
        <a
          href={links.instagram(processed.instagram)}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          <FaInstagram style={iconStyle} />
        </a>
      )}

      {telegramValues.map((val, idx) => (
        <a
          key={`telegram-${idx}`}
          href={links.telegram(val)}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          <FaTelegramPlane style={iconStyle} />
        </a>
      ))}

      {processed.tiktok && (
        <a
          href={links.tiktok(processed.tiktok)}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          <SiTiktok style={iconStyle} />
        </a>
      )}
    </div>
  );
};
