import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, sendEmailVerification } from 'firebase/auth';
import { auth } from './config';
import styled from 'styled-components';

const VerifyButton = styled.button`
  width: 100%;
  min-height: 44px;
  padding: 10px 16px;
  border: none;
  border-radius: var(--km-radius);
  background: ${({ disabled }) => (disabled ? 'var(--km-border)' : 'linear-gradient(135deg, var(--km-accent) 0%, var(--km-accent-mid) 100%)')};
  color: ${({ disabled }) => (disabled ? 'var(--km-muted)' : '#fff')};
  font-family: var(--km-font);
  font-size: 14px;
  font-weight: 700;
  text-align: center;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  transition: filter 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    filter: ${({ disabled }) => (disabled ? 'none' : 'brightness(1.05)')};
  }
`;

    export   const VerifyEmail = () => {

        const language = 'uk';
        const timeValue = 180 // 180 секунд = 3 хвилин
        const [countdown, setCountdown] = useState(
          () => Number(localStorage.getItem('countdown')) || timeValue
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
                  console.log('sendEmailVerification(user) :>> ',);
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
                  return timeValue;
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

      return (
          <VerifyButton
            type="button"
            disabled={isCounting}
            onClick={handleVerifyAgain}
          >
            {!isCounting ? 'Підтвердити email' : (
              <>
                {language === 'uk' ? 'Лист відправлено. Повторити через ' : 'Verify again in '}
                {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                {language === 'uk' ? ' хв' : ' min'}
              </>
            )}
          </VerifyButton>
      );
    }
