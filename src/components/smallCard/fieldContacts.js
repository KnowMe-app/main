import React from 'react';
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
import { color } from '../styles';

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

  const icons = {
    facebook: <FaFacebookF />,
    instagram: <FaInstagram />,
    telegram: <FaTelegramPlane />,
    telegramFromPhone: <FaTelegramPlane />,
    viberFromPhone: <FaViber />,
    whatsappFromPhone: <FaWhatsapp />,
  };

  return Object.keys(data).map(key => {
    const nestedKey = parentKey ? `${parentKey}.${key}` : key;
    const value = data[key];

    if (!value || (Array.isArray(value) && value.length === 0)) {
      return null;
    }

    if (links[key]) {
      const label = icons[key] ? icons[key] : `${key}:`;
      return (
        <div key={nestedKey} style={{ whiteSpace: 'normal' }}>
          {!['email', 'phone'].includes(key) && (
            <strong style={{ marginRight: '4px' }}>{label}</strong>
          )}
          {Array.isArray(value)
            ? value
                .filter(val => typeof val === 'string' && val.trim() !== '')
                .map((val, idx) => {
                  try {
                    const processedVal =
                      key === 'phone' ? val.replace(/\s/g, '') : val;
                    return (
                      <span
                        key={`${nestedKey}-${idx}`}
                        style={{ display: 'inline-block', marginRight: '8px' }}
                      >
                        <a
                          href={links[key](processedVal)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {key === 'phone' ? `+${processedVal}` : processedVal}
                        </a>
                        {key === 'phone' && (
                          <>
                            <a
                              href={links.telegramFromPhone(`+${val}`)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: 'inherit',
                                textDecoration: 'none',
                                marginLeft: '8px',
                              }}
                            >
                              {icons.telegramFromPhone}
                            </a>
                            <a
                              href={links.viberFromPhone(processedVal)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: 'inherit',
                                textDecoration: 'none',
                                marginLeft: '8px',
                              }}
                            >
                              {icons.viberFromPhone}
                            </a>
                            <a
                              href={links.whatsappFromPhone(processedVal)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: 'inherit',
                                textDecoration: 'none',
                                marginLeft: '8px',
                              }}
                            >
                              {icons.whatsappFromPhone}
                            </a>
                          </>
                        )}
                      </span>
                    );
                  } catch (error) {
                    return (
                      <span
                        key={`${nestedKey}-${idx}`}
                        style={{ display: 'inline-block', marginRight: '8px' }}
                      >
                        {val}
                      </span>
                    );
                  }
                })
            : (() => {
                try {
                  const processedValue =
                    key === 'phone' ? value.replace(/\s/g, '') : value;
                  return (
                    <span style={{ display: 'inline-block', marginRight: '8px' }}>
                      <a
                        href={links[key](processedValue)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        {key === 'phone'
                          ? `+${processedValue}`
                          : processedValue}
                      </a>
                      {key === 'phone' && (
                        <>
                          <a
                            href={links.telegramFromPhone(`+${value}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: 'inherit',
                              textDecoration: 'none',
                              marginLeft: '8px',
                            }}
                          >
                            {icons.telegramFromPhone}
                          </a>
                          <a
                            href={links.viberFromPhone(processedValue)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: 'inherit',
                              textDecoration: 'none',
                              marginLeft: '8px',
                            }}
                          >
                            {icons.viberFromPhone}
                          </a>
                          <a
                            href={links.whatsappFromPhone(processedValue)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: 'inherit',
                              textDecoration: 'none',
                              marginLeft: '8px',
                            }}
                          >
                            {icons.whatsappFromPhone}
                          </a>
                        </>
                      )}
                    </span>
                  );
                } catch (error) {
                  return <span>{value}</span>;
                }
              })()}
        </div>
      );
    }

    return null;
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

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
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
              style={{ color: color.black, textDecoration: 'none' }}
            >
              {`+${processedVal}`}
            </a>
            <a
              href={links.telegramFromPhone(`+${val}`)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <FaTelegramPlane />
            </a>
            <a
              href={links.viberFromPhone(processedVal)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <FaViber />
            </a>
            <a
              href={links.whatsappFromPhone(processedVal)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <FaWhatsapp />
            </a>
          </React.Fragment>
        );
      })}

      {processed.email && (
        <a
          href={links.email(processed.email)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          <MdEmail />
        </a>
      )}

      {processed.facebook && (
        <a
          href={links.facebook(processed.facebook)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          <FaFacebookF />
        </a>
      )}

      {processed.instagram && (
        <a
          href={links.instagram(processed.instagram)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          <FaInstagram />
        </a>
      )}

      {telegramValues.map((val, idx) => (
        <a
          key={`telegram-${idx}`}
          href={links.telegram(val)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          <FaTelegramPlane />
        </a>
      ))}

      {processed.tiktok && (
        <a
          href={links.tiktok(processed.tiktok)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          <SiTiktok />
        </a>
      )}
    </div>
  );
};
