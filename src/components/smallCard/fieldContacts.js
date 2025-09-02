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

const ICON_SIZE = 16;

const collectValues = value => {
  const result = [];
  const visit = val => {
    if (Array.isArray(val)) {
      val.forEach(visit);
    } else if (val && typeof val === 'object') {
      Object.values(val).forEach(visit);
    } else if (val !== undefined && val !== null && val !== '') {
      result.push(val);
    }
  };
  visit(value);
  return result;
};

// Render phone numbers with all contact icons
export const fieldContacts = data => {
  if (!data || typeof data !== 'object') {
    console.error('Invalid data passed to renderContacts:', data);
    return null;
  }

  const links = {
    phone: value => `tel:+${value}`,
    telegram: value => `https://t.me/${value}`,
    instagram: value => `https://instagram.com/${value}`,
    tiktok: value => `https://www.tiktok.com/@${value}`,
    facebook: value => `https://facebook.com/${value}`,
    email: value => `mailto:${value}`,
    telegramFromPhone: value => `https://t.me/${value.replace(/\s+/g, '')}`,
    viberFromPhone: value => `viber://chat?number=%2B${value.replace(/\s+/g, '')}`,
    whatsappFromPhone: value => `https://wa.me/${value.replace(/\s+/g, '')}`,
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

  const phoneValues = collectValues(data.phone).map(val =>
    String(val).replace(/\s/g, '')
  );
  const emailValues = collectValues(data.email);
  const facebookValues = collectValues(data.facebook);
  const instagramValues = collectValues(data.instagram);
  const telegramValues = collectValues(data.telegram).filter(
    v => !String(v).trim().startsWith('УК СМ')
  );
  const tiktokValues = collectValues(data.tiktok);

  const hasContacts =
    phoneValues.length ||
    emailValues.length ||
    facebookValues.length ||
    instagramValues.length ||
    telegramValues.length ||
    tiktokValues.length;

  if (!hasContacts) {
    return null;
  }

  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      {phoneValues.map((val, idx) => (
        <span
          key={`phone-${idx}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <a
            href={links.phone(val)}
            target="_blank"
            rel="noopener noreferrer"
            style={numberLinkStyle}
          >
            {`+${val}`}
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
            href={links.viberFromPhone(val)}
            target="_blank"
            rel="noopener noreferrer"
            style={iconLinkStyle}
          >
            <FaViber style={iconStyle} />
          </a>
          <a
            href={links.whatsappFromPhone(val)}
            target="_blank"
            rel="noopener noreferrer"
            style={iconLinkStyle}
          >
            <FaWhatsapp style={iconStyle} />
          </a>
        </span>
      ))}

      {emailValues.map((val, idx) => (
        <a
          key={`email-${idx}`}
          href={links.email(val)}
          target="_blank"
          rel="noopener noreferrer"
          style={iconLinkStyle}
        >
          <MdEmail style={iconStyle} />
        </a>
      ))}

      {facebookValues.map((val, idx) => (
        <a
          key={`facebook-${idx}`}
          href={links.facebook(val)}
          target="_blank"
          rel="noopener noreferrer"
          style={iconLinkStyle}
        >
          <FaFacebookF style={iconStyle} />
        </a>
      ))}

      {instagramValues.map((val, idx) => (
        <a
          key={`instagram-${idx}`}
          href={links.instagram(val)}
          target="_blank"
          rel="noopener noreferrer"
          style={iconLinkStyle}
        >
          <FaInstagram style={iconStyle} />
        </a>
      ))}

      {telegramValues.map((val, idx) => (
        <a
          key={`telegram-${idx}`}
          href={links.telegram(val)}
          target="_blank"
          rel="noopener noreferrer"
          style={iconLinkStyle}
        >
          <FaTelegramPlane style={iconStyle} />
        </a>
      ))}

      {tiktokValues.map((val, idx) => (
        <a
          key={`tiktok-${idx}`}
          href={links.tiktok(val)}
          target="_blank"
          rel="noopener noreferrer"
          style={iconLinkStyle}
        >
          <SiTiktok style={iconStyle} />
        </a>
      ))}
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

  const phoneValues = collectValues(data.phone).map(val =>
    String(val).replace(/\s/g, '')
  );
  const emailValues = collectValues(data.email);
  const facebookValues = collectValues(data.facebook);
  const instagramValues = collectValues(data.instagram);
  const telegramValues = collectValues(data.telegram).filter(
    v => !String(v).trim().startsWith('УК СМ')
  );
  const tiktokValues = collectValues(data.tiktok);

  const hasContacts =
    phoneValues.length ||
    emailValues.length ||
    facebookValues.length ||
    instagramValues.length ||
    telegramValues.length ||
    tiktokValues.length;

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
      {phoneValues.map((val, idx) => (
        <React.Fragment key={`phone-${idx}`}>
          <a
            href={links.phone(val)}
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
            href={links.viberFromPhone(val)}
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
          >
            <FaViber style={iconStyle} />
          </a>
          <a
            href={links.whatsappFromPhone(val)}
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
          >
            <FaWhatsapp style={iconStyle} />
          </a>
        </React.Fragment>
      ))}

      {emailValues.map((val, idx) => (
        <a
          key={`email-${idx}`}
          href={links.email(val)}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          <MdEmail style={iconStyle} />
        </a>
      ))}

      {facebookValues.map((val, idx) => (
        <a
          key={`facebook-${idx}`}
          href={links.facebook(val)}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          <FaFacebookF style={iconStyle} />
        </a>
      ))}

      {instagramValues.map((val, idx) => (
        <a
          key={`instagram-${idx}`}
          href={links.instagram(val)}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          <FaInstagram style={iconStyle} />
        </a>
      ))}

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

      {tiktokValues.map((val, idx) => (
        <a
          key={`tiktok-${idx}`}
          href={links.tiktok(val)}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          <SiTiktok style={iconStyle} />
        </a>
      ))}
    </div>
  );
};
