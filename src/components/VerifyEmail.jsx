import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, sendEmailVerification } from 'firebase/auth';
import { auth } from './config';
import { fontSize } from './styles';
import styled from 'styled-components';
import {SubmitButton} from './ProfileScreen';

const ButtonText = styled.span`
font-size: ${fontSize.biggest}px;
margin-bottom: 20px;
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
          <div>
            <SubmitButton 
            disabled={isCounting} 
            onClick={handleVerifyAgain} 
            style={{backgroundColor: isCounting ? 'gray' : null }}
            >
            {!isCounting ? 'Підтвердити email':
            (
              <ButtonText style={{fontSize: fontSize.big, textAlign: 'center', color: 'white' }}>
                {language==='uk'? 'Лист відправлено. Повторити через ':'Verify again in '}
                {Math.floor(countdown / 60)}:{countdown % 60}
                {language==='uk'? ' хв':' min'}
              </ButtonText>
            )}
            </SubmitButton>
            
          </div>
      );
    }
