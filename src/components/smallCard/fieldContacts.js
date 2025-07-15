import {
  FaFacebookF,
  FaInstagram,
  FaTelegramPlane,
  FaViber,
  FaWhatsapp,
} from 'react-icons/fa';
import { MdEmail } from 'react-icons/md';
import { SiTiktok } from 'react-icons/si';

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

  return Object.keys(data).map(key => {
    const value = data[key];
    if (!value || (Array.isArray(value) && value.length === 0)) return null;

    if (key === 'phone') {
      const val = Array.isArray(value) ? value[0] : value;
      const processed = val.replace(/\s/g, '');
      return (
        <div key="phone" style={{ marginBottom: '2px' }}>
          <a
            href={links.phone(processed)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
          >
            {`+${processed}`}
          </a>
          <a
            href={links.telegramFromPhone(`+${val}`)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
          >
            <FaTelegramPlane />
          </a>
          <a
            href={links.viberFromPhone(processed)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
          >
            <FaViber />
          </a>
          <a
            href={links.whatsappFromPhone(processed)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none', marginLeft: '8px' }}
          >
            <FaWhatsapp />
          </a>
        </div>
      );
    }

    if (iconMap[key]) {
      const val = Array.isArray(value) ? value[0] : value;
      return (
        <a
          key={key}
          href={links[key](val)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
        >
          {iconMap[key]}
        </a>
      );
    }

    if (links[key]) {
      const val = Array.isArray(value) ? value[0] : value;
      return (
        <a
          key={key}
          href={links[key](val)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none', marginRight: '8px' }}
        >
          {val}
        </a>
      );
    }

    return null;
  });
};