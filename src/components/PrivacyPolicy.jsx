import React, { useState } from 'react';
import { Button, Container } from './App.styled';
import { termsAndConditions } from './termsAndConditions';

export const PrivacyPolicy = () => {
 
  const [language, setLanguage] = useState('en');

const switchLanguage = () => {
  const newLanguage = language === 'en' ? 'uk' : 'en';
  setLanguage(newLanguage);
};
  
   const getParagraphStyle = style => {
     const fontSize = {
       titleMain: 22,
       title: 18,
       small: 14,
     }; 

     const fontStyle = style === 'headerItalic' || style === 'list' ? 'italic' : 'normal';
     const fontWeight = ['header', 'titleMain', 'title', 'textMain'].includes(style) ? 'bold' : 'normal';
     const textAlign = style === 'headerItalic' ? 'right' : ['title', 'titleMain', 'header'].includes(style) ? 'center' : 'auto';
const marginBottom = style === 'titleMain' || style === 'title' || style === 'headerItalic' || style === 'header' ? 20: 5;
const marginTop = style === 'titleMain' || style === 'title' || style === 'headerItalic' || style === 'header' ? 20 : 5;

     return {
       fontSize: fontSize[style] || fontSize.small,
       fontWeight,
       fontStyle,
       marginVertical: 5,
       color: style === 'header' ? '#805300' : 'black',
       textAlign,
       marginBottom,
       marginTop,
     };
   };


  return (
      <Container>
        <Button onClick={switchLanguage}>{language === 'uk' ? 'EN' : 'UK'}</Button>
        <div>
          {termsAndConditions.map((paragraph, index) => (
            <div key={index} style={getParagraphStyle(paragraph.style)}>
              <p>{language ? paragraph[language] : paragraph.en}</p>
            </div>
          ))}
        </div>
      </Container>
  );
};