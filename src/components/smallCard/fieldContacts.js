import React from 'react';
import {
  FaFacebookF,
  FaInstagram,
  FaTelegramPlane,
  FaViber,
  FaWhatsapp,
  FaVk,
} from 'react-icons/fa';
import { FaPhoneFlip } from 'react-icons/fa6';
import { MdEmail } from 'react-icons/md';
import { SiTiktok } from 'react-icons/si';
import { getCurrentValue } from '../getCurrentValue';
import { color } from '../styles';

const iconStyle = {
  verticalAlign: 'middle',
  width: '12px',
  height: '12px',
  fontSize: '12px',
};
const phoneBtnStyle = {
  color: 'inherit',
  textDecoration: 'none',
  marginLeft: '8px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  lineHeight: '0',
  border: `1px solid ${color.white}`,
  borderRadius: '50%',
};

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
  facebook: <FaFacebookF style={iconStyle} />,
  instagram: <FaInstagram style={iconStyle} />,
  telegram: <FaTelegramPlane style={iconStyle} />,
  telegramFromPhone: <FaTelegramPlane style={iconStyle} />,
  viberFromPhone: <FaViber style={iconStyle} />,
  whatsappFromPhone: <FaWhatsapp style={iconStyle} />,
  tiktok: <SiTiktok style={iconStyle} />,
  vk: <FaVk style={iconStyle} />,
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
        <div
          key={nestedKey}
          style={{
            whiteSpace: 'normal',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '4px',
          }}
        >
          {!['email', 'phone'].includes(key) && (
            <strong style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
              {label}
            </strong>
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
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          marginRight: '8px',
                        }}
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
                              style={phoneBtnStyle}
                            >
                              {icons.telegramFromPhone}
                            </a>
                            <a
                              href={links.viberFromPhone(processedVal)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={phoneBtnStyle}
                            >
                              {icons.viberFromPhone}
                            </a>
                            <a
                              href={links.whatsappFromPhone(processedVal)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={phoneBtnStyle}
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
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          marginRight: '8px',
                        }}
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
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        marginRight: '8px',
                      }}
                    >
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
                            style={phoneBtnStyle}
                          >
                            {icons.telegramFromPhone}
                          </a>
                          <a
                            href={links.viberFromPhone(processedValue)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={phoneBtnStyle}
                          >
                            {icons.viberFromPhone}
                          </a>
                          <a
                            href={links.whatsappFromPhone(processedValue)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={phoneBtnStyle}
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

export const fieldContactsIcons = (
  data,
  { phoneAsIcon = false, iconSize = 12 } = {}
) => {
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
      ? processed.telegram.filter(
          v => v && !String(v).trim().startsWith('УК СМ')
        )
      : String(processed.telegram).trim().startsWith('УК СМ')
        ? []
        : [processed.telegram]
    : [];

  const phoneValues = processed.phone
    ? Array.isArray(processed.phone)
      ? processed.phone.filter(v => v)
      : [processed.phone]
    : [];

  const iconStyle = {
    verticalAlign: 'middle',
    width: `${iconSize}px`,
    height: `${iconSize}px`,
    fontSize: `${iconSize}px`,
  };

  const phoneBtnStyleLocal = {
    color: 'inherit',
    textDecoration: 'none',
    marginLeft: '8px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: `${iconSize + 8}px`,
    height: `${iconSize + 8}px`,
    lineHeight: '0',
    border: `1px solid ${color.white}`,
    borderRadius: '50%',
  };

  const elements = [];

  phoneValues.forEach((val, idx) => {
    const processedVal = String(val).replace(/\s/g, '');
    elements.push(
      <React.Fragment key={`phone-${idx}`}>
        <a
          href={links.phone(processedVal)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: phoneAsIcon ? 'inherit' : color.black, textDecoration: 'none' }}
        >
          {phoneAsIcon ? <FaPhoneFlip style={iconStyle} /> : `+${processedVal}`}
        </a>
        <a
          href={links.telegramFromPhone(`+${val}`)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...phoneBtnStyleLocal, marginLeft: 0, border: 'none' }}
        >
          <FaTelegramPlane style={iconStyle} />
        </a>
        <a
          href={links.viberFromPhone(processedVal)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...phoneBtnStyleLocal, marginLeft: 0, border: 'none' }}
        >
          <FaViber style={iconStyle} />
        </a>
        <a
          href={links.whatsappFromPhone(processedVal)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...phoneBtnStyleLocal, marginLeft: 0, border: 'none' }}
        >
          <FaWhatsapp style={iconStyle} />
        </a>
      </React.Fragment>
    );
  });

  if (processed.email) {
    elements.push(
      <a
        key="email"
        href={links.email(processed.email)}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit', textDecoration: 'none' }}
      >
        <MdEmail style={iconStyle} />
      </a>
    );
  }

  if (processed.facebook) {
    elements.push(
      <a
        key="facebook"
        href={links.facebook(processed.facebook)}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit', textDecoration: 'none' }}
      >
        <FaFacebookF style={iconStyle} />
      </a>
    );
  }

  if (processed.instagram) {
    elements.push(
      <a
        key="instagram"
        href={links.instagram(processed.instagram)}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit', textDecoration: 'none' }}
      >
        <FaInstagram style={iconStyle} />
      </a>
    );
  }

  telegramValues.forEach((val, idx) => {
    elements.push(
      <a
        key={`telegram-${idx}`}
        href={links.telegram(val)}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit', textDecoration: 'none' }}
      >
        <FaTelegramPlane style={iconStyle} />
      </a>
    );
  });

  if (processed.tiktok) {
    elements.push(
      <a
        key="tiktok"
        href={links.tiktok(processed.tiktok)}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit', textDecoration: 'none' }}
      >
        <SiTiktok style={iconStyle} />
      </a>
    );
  }

  if (processed.vk) {
    elements.push(
      <a
        key="vk"
        href={links.vk(processed.vk)}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit', textDecoration: 'none' }}
      >
        <FaVk style={iconStyle} />
      </a>
    );
  }

  if (elements.length === 0) return null;

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      {elements}
    </div>
  );
};
