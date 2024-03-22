import React, { useState } from 'react';
import { Button, Container } from './App.styled';

export const SubmitForm = () => {
 
  const [language, setLanguage] = useState('en');

const switchLanguage = () => {
  const newLanguage = language === 'en' ? 'uk' : 'en';
  setLanguage(newLanguage);
};
  

  return (
      <Container>
        <Button onClick={switchLanguage}>{language === 'uk' ? 'EN' : 'UK'}</Button>
      </Container>
  );
};