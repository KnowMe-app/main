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

  return Object.keys(data).map(key => {
    const nestedKey = parentKey ? `${parentKey}.${key}` : key;
    const value = data[key];

    // Пропускаємо ключ, якщо його значення — порожній рядок або порожній масив
    if (!value || (Array.isArray(value) && value.length === 0)) {
      return null;
    }

    if (links[key]) {
      return (
        <div key={nestedKey}>
          {!['email', 'phone'].includes(key) && <strong>{key}:</strong>}{' '}
          {Array.isArray(value) ? (
            value
              .filter(val => typeof val === 'string' && val.trim() !== '') // Фільтруємо лише непусті рядки
              .map((val, idx) => {
                try {
                  const processedVal = key === 'phone' ? val.replace(/\s/g, '') : val; // Видаляємо пробіли тільки для phone
                  return (
                    <div key={`${nestedKey}-${idx}`} style={{ marginBottom: '2px' }}>
                      <a
                        href={links[key](processedVal)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
                      >
                        {key === 'phone' ? `+${processedVal}` : processedVal}
                      </a>
                      {key === 'phone' && (
                        <>
                          <a
                            href={links.telegramFromPhone(`+${val}`)} // Telegram отримує значення з пробілами
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                          >
                            Tg
                          </a>
                          <a
                            href={links.viberFromPhone(processedVal)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                          >
                            V
                          </a>
                          <a
                            href={links.whatsappFromPhone(processedVal)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                          >
                            W
                          </a>
                        </>
                      )}
                    </div>
                  );
                } catch (error) {
                  return (
                    <div key={`${nestedKey}-${idx}`} style={{ marginBottom: '2px' }}>
                      {val}
                    </div>
                  );
                }
              })
          ) : (
            <>
              {(() => {
                try {
                  const processedValue = key === 'phone' ? value.replace(/\s/g, '') : value; // Видаляємо пробіли тільки для phone
                  return (
                    <>
                      <a
                        href={links[key](processedValue)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
                      >
                        {key === 'phone' ? `+${processedValue}` : processedValue}
                      </a>
                      {key === 'phone' && (
                        <>
                          <a
                            href={links.telegramFromPhone(`+${value}`)} // Telegram отримує значення з пробілами
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                          >
                            Tg
                          </a>
                          <a
                            href={links.viberFromPhone(processedValue)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                          >
                            V
                          </a>
                          <a
                            href={links.whatsappFromPhone(processedValue)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
                          >
                            W
                          </a>
                        </>
                      )}
                    </>
                  );
                } catch (error) {
                  return <div>{value}</div>;
                }
              })()}
            </>
          )}
        </div>
      );
    }

    return null; // Якщо ключ не обробляється
  });
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

  const socialKeys = ['instagram', 'facebook', 'vk', 'tiktok', 'telegram', 'otherLink', 'email'];

  const socialRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {socialKeys.map(key => {
        const val = processed[key];
        if (!val) return null;
        if (iconMap[key]) {
          return (
            <a
              key={key}
              href={links[key](val)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {iconMap[key]}
            </a>
          );
        }
        return (
          <a
            key={key}
            href={links[key](val)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            {val}
          </a>
        );
      })}
    </div>
  );

  const phoneValues = processed.phone
    ? Array.isArray(processed.phone)
      ? processed.phone.filter(v => v)
      : [processed.phone]
    : [];

  const phoneRows = phoneValues.map((val, idx) => {
    const processedVal = String(val).replace(/\s/g, '');
    return (
      <div key={`phone-${idx}`} style={{ marginTop: idx ? '2px' : '0px' }}>
        <a
          href={links.phone(processedVal)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
        >
          {`+${processedVal}`}
        </a>
        <a
          href={links.telegramFromPhone(`+${val}`)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
        >
          <FaTelegramPlane />
        </a>
        <a
          href={links.viberFromPhone(processedVal)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
        >
          <FaViber />
        </a>
        <a
          href={links.whatsappFromPhone(processedVal)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
        >
          <FaWhatsapp />
        </a>
      </div>
    );
  });

  return (
    <div>
      {socialRow}
      {phoneRows}
    </div>
  );
};