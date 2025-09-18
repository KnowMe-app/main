import React from 'react';
import {
  FaFacebookF,
  FaInstagram,
  FaTelegramPlane,
  FaViber,
  FaWhatsapp,
  FaVk,
  FaGlobe,
} from 'react-icons/fa';
import { FaPhoneVolume } from 'react-icons/fa6';
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
  marginLeft: '4px',
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
    otherLink: <FaGlobe style={iconStyle} />,
    phone: <FaPhoneVolume style={iconStyle} />,
    email: <MdEmail style={iconStyle} />,
  };

  const copyButtonStyle = {
    color: 'inherit',
    textDecoration: 'none',
    cursor: 'pointer',
  };

  const fallbackCopyText = text => {
    if (typeof document === 'undefined' || !text) {
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      document.execCommand('copy');
    } catch (error) {
      console.error('Fallback copy failed', error);
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const copyTextToClipboard = text => {
    if (!text) {
      return;
    }

    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackCopyText(text);
      });
    } else {
      fallbackCopyText(text);
    }
  };

  const renderContactContent = (contactKey, processedValueForLink, displayValue) => {
    const valueString =
      typeof processedValueForLink === 'string'
        ? processedValueForLink
        : String(processedValueForLink ?? '');

    const hasWhitespace = contactKey === 'telegram' && /\s/.test(valueString);

    if (hasWhitespace) {
      const trimmedValue = valueString.trim();

      const handleCopy = event => {
        event.preventDefault();
        event.stopPropagation();

        if (!trimmedValue) {
          return;
        }

        copyTextToClipboard(trimmedValue);
      };

      const handleKeyDown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          handleCopy(event);
        }
      };

      return (
        <span
          role="button"
          tabIndex={0}
          onClick={handleCopy}
          onKeyDown={handleKeyDown}
          style={copyButtonStyle}
        >
          {displayValue}
        </span>
      );
    }

    return (
      <a
        href={links[contactKey](processedValueForLink)}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit', textDecoration: 'none' }}
      >
        {displayValue}
      </a>
    );
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
            gap: '2px',
          }}
        >
          {label && (
            <strong style={{ marginRight: '2px', display: 'flex', alignItems: 'center' }}>
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
                    const displayVal =
                      key === 'otherLink' && processedVal.length > 25
                        ? `${processedVal.slice(0, 25)}...`
                        : processedVal;
                    const contactElement = renderContactContent(
                      key,
                      processedVal,
                      key === 'phone' ? `+${processedVal}` : displayVal
                    );
                    return (
                      <span
                        key={`${nestedKey}-${idx}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          marginRight: '8px',
                        }}
                      >
                        {contactElement}
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
                  const displayValue =
                    key === 'otherLink' && processedValue.length > 25
                      ? `${processedValue.slice(0, 25)}...`
                      : processedValue;
                  const contactElement = renderContactContent(
                    key,
                    processedValue,
                    key === 'phone' ? `+${processedValue}` : displayValue
                  );
                  return (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        marginRight: '8px',
                      }}
                    >
                      {contactElement}
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

  const linkStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: `${iconSize + 8}px`,
    height: `${iconSize + 8}px`,
    margin: 0,
    padding: 0,
    border: 'none',
    textDecoration: 'none',
    color: 'inherit',
    lineHeight: '0',
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
          style={
            phoneAsIcon
              ? linkStyle
              : {
                  ...linkStyle,
                  width: 'auto',
                  height: 'auto',
                  color: color.black,
                  lineHeight: 'normal',
                }
          }
        >
          {phoneAsIcon ? <FaPhoneVolume style={iconStyle} /> : `+${processedVal}`}
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
  });

  if (processed.email) {
    elements.push(
      <a
        key="email"
        href={links.email(processed.email)}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
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
        style={linkStyle}
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
        style={linkStyle}
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
        style={linkStyle}
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
        style={linkStyle}
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
        style={linkStyle}
      >
        <FaVk style={iconStyle} />
      </a>
    );
  }

  if (processed.otherLink) {
    const others = Array.isArray(processed.otherLink)
      ? processed.otherLink.filter(v => v)
      : [processed.otherLink];
    others.forEach((val, idx) => {
      elements.push(
        <a
          key={`otherLink-${idx}`}
          href={links.otherLink(val)}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          <FaGlobe style={iconStyle} />
        </a>
      );
    });
  }

  if (elements.length === 0) return null;

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      {elements}
    </div>
  );
};
