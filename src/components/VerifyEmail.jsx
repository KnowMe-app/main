import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, sendEmailVerification } from 'firebase/auth';
import { MdMarkEmailRead } from 'react-icons/md';
import { auth } from './config';
import { ItemDescription, ItemIcon, ItemLabel, MenuItem } from './ProfileDotsMenu.styled';
import { useAppSettings } from '../hooks/useAppSettings';
import { uiText } from '../utils/uiTranslations';

// 180 секунд — стільки Firebase просить зачекати між листами.
const RESEND_DELAY_SECONDS = 180;

/**
 * Підтвердження пошти — рядок меню, а не банер у ньому.
 *
 * Це єдина дія меню трьох крапок, яку малює чужий файл, і саме тому вона
 * виглядала чужою: суцільна жовтогаряча плашка на всю ширину серед рядків
 * «значок — підпис — пояснення», а під нею без жодного відступу йшло «Вийти».
 * Відступ там і не міг узятись: рядки розсуває сусідський селектор `& + &` на
 * `MenuItem`, а плашка стояла в окремій обгортці, тобто розривала сусідство.
 * Головною дією вона лишається, але мовою самого меню — `$active`, так само як
 * позначений поточний екран у навігації.
 *
 * Говорить вона теж мовою інтерфейсу: `language` тут був жорстко вписаний
 * рядком `'uk'`, тож в англійському меню цей один рядок лишався українським.
 */
export const VerifyEmail = () => {
  const { language } = useAppSettings();
  const [countdown, setCountdown] = useState(
    () => Number(localStorage.getItem('countdown')) || RESEND_DELAY_SECONDS
  );
  const [isCounting, setIsCounting] = useState(
    () => JSON.parse(localStorage.getItem('isCounting')) || false
  );

  const handleVerifyAgain = () => {
    try {
      const unsubscribe = onAuthStateChanged(auth, async user => {
        if (user) {
          localStorage.setItem('ownerId', user.uid);
          try {
            await sendEmailVerification(user);
            setIsCounting(true);
          } catch (error) {
            if (error.code === 'auth/too-many-requests') {
              console.log('Забагато запитів');
            } else {
              console.log('Помилка надсилання підтвердження');
            }
          }
        } else {
          localStorage.removeItem('ownerId');
        }
      });
      return () => {
        unsubscribe();
      };
    } catch (error) {
      console.log('Error in UserRoleScreen :>> ', error);
    }
  };

  useEffect(() => {
    let timer;

    if (isCounting) {
      timer = setInterval(() => {
        setCountdown(prevCountdown => {
          if (prevCountdown === 0) {
            clearInterval(timer);
            setIsCounting(false);
            return RESEND_DELAY_SECONDS;
          }
          const newCountdown = prevCountdown - 1;
          localStorage.setItem('countdown', newCountdown);
          return newCountdown;
        });
      }, 1000);
    }

    return () => clearInterval(timer);
  }, [isCounting]);

  useEffect(() => {
    localStorage.setItem('isCounting', JSON.stringify(isCounting));
  }, [isCounting]);

  const waiting = `${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}`;

  return (
    <MenuItem
      type="button"
      role="menuitem"
      $active={!isCounting}
      disabled={isCounting}
      onClick={handleVerifyAgain}
    >
      <ItemIcon><MdMarkEmailRead /></ItemIcon>
      <span>
        <ItemLabel>{uiText('Підтвердити email', language)}</ItemLabel>
        <ItemDescription>
          {isCounting
            ? uiText('Лист надіслано — повторити через {time} хв', language, { time: waiting })
            : uiText('Надіслати лист із підтвердженням на вашу пошту', language)}
        </ItemDescription>
      </span>
    </MenuItem>
  );
};
