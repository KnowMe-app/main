import {
  FaFacebookF,
  FaInstagram,
  FaTelegramPlane,
  FaViber,
  FaWhatsapp,
} from 'react-icons/fa';
import { MdEmail } from 'react-icons/md';
import { SiTiktok } from 'react-icons/si';
import { getCurrentValue } from '../getCurrentValue';

export const fieldContacts = (data, parentKey = '') => {
  if (!data || typeof data !== 'object') {
    console.error('Invalid data passed to renderContacts:', data);
    return null;
  }

  const links = {
    telegram: value => `https://t.me/${value}`,
    instagram: value => `https://instagram.com/${value}`,
    tiktok: value => `https://www.tiktok.com/@${value}`,
    phone: value => `tel:${value}`,
    facebook: value => `https://facebook.com/${value}`,
    vk: value => `https://vk.com/${value}`,
    otherLink: value => `${value}`,
    email: value => `mailto:${value}`,
    telegramFromPhone: value => `https://t.me/${value.replace(/\s+/g, '')}`,
    viberFromPhone: value => `viber://chat?number=%2B${value.replace(/\s+/g, '')}`,
    whatsappFromPhone: value => `https://wa.me/${value.replace(/\s+/g, '')}`,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {(Array.isArray(data.phone) ? data.phone : [data.phone])
        .filter(v => v)
        .map((val, idx) => {
          const processedVal = String(val).replace(/\s/g, '');
          return (
            <span key={`phone-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <a
                href={links.phone(processedVal)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {`+${processedVal}`}
              </a>
              <a
                href={links.telegramFromPhone(`+${val}`)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                Tg
              </a>
              <a
                href={links.viberFromPhone(processedVal)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                V
              </a>
              <a
                href={links.whatsappFromPhone(processedVal)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                W
              </a>
            </span>
          );
        })}
      {data.email && (
        <a href={links.email(getCurrentValue(data.email))} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
          <MdEmail />
        </a>
      )}
      {data.facebook && (
        <a href={links.facebook(getCurrentValue(data.facebook))} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
          <FaFacebookF />
        </a>
      )}
      {data.instagram && (
        <a href={links.instagram(getCurrentValue(data.instagram))} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
          <FaInstagram />
        </a>
      )}
      {data.telegram && typeof getCurrentValue(data.telegram) === 'string' && !getCurrentValue(data.telegram).startsWith('УК СМ') && (
        <a href={links.telegram(getCurrentValue(data.telegram))} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
          <FaTelegramPlane />
        </a>
      )}
      {data.tiktok && (
        <a href={links.tiktok(getCurrentValue(data.tiktok))} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
          <SiTiktok />
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
    phone: value => `tel:${value}`,
    facebook: value => `https://facebook.com/${value}`,
    vk: value => `https://vk.com/${value}`,
    otherLink: value => `${value}`,
    email: value => `mailto:${value}`,
    telegramFromPhone: value => `https://t.me/${value.replace(/\s+/g, '')}`,
    viberFromPhone: value => `viber://chat?number=%2B${value.replace(/\s+/g, '')}`,
    whatsappFromPhone: value => `https://wa.me/${value.replace(/\s+/g, '')}`,
  };

  const iconMap = {
    facebook: <FaFacebookF />,
    instagram: <FaInstagram />,
    tiktok: <SiTiktok />,
    email: <MdEmail />,
  };

  const processed = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, getCurrentValue(v)])
  );

  const elements = [];

  const phoneValues = processed.phone
    ? Array.isArray(processed.phone)
      ? processed.phone.filter(v => v)
      : [processed.phone]
    : [];

  phoneValues.forEach((val, idx) => {
    const processedVal = String(val).replace(/\s/g, '');
    elements.push(
      <span key={`phone-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <a href={links.phone(processedVal)} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
          {`+${processedVal}`}
        </a>
        <a href={links.telegramFromPhone(`+${val}`)} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
          <FaTelegramPlane />
        </a>
        <a href={links.viberFromPhone(processedVal)} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
          <FaViber />
        </a>
        <a href={links.whatsappFromPhone(processedVal)} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
          <FaWhatsapp />
        </a>
      </span>
    );
  });

  if (processed.email) {
    elements.push(
      <a key="email" href={links.email(processed.email)} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
        <MdEmail />
      </a>
    );
  }

  if (processed.facebook) {
    elements.push(
      <a key="facebook" href={links.facebook(processed.facebook)} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
        <FaFacebookF />
      </a>
    );
  }

  if (processed.instagram) {
    elements.push(
      <a key="instagram" href={links.instagram(processed.instagram)} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
        <FaInstagram />
      </a>
    );
  }

  if (processed.telegram && typeof processed.telegram === 'string' && !processed.telegram.startsWith('УК СМ')) {
    elements.push(
      <a key="telegram" href={links.telegram(processed.telegram)} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
        <FaTelegramPlane />
      </a>
    );
  }

  if (processed.tiktok) {
    elements.push(
      <a key="tiktok" href={links.tiktok(processed.tiktok)} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
        <SiTiktok />
      </a>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {elements}
    </div>
  );
};