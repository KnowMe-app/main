import React, { useState } from 'react';
import { Button, Container } from './App.styled';
import { termsAndConditions } from 'pages/Home/termsAndConditions';
import { BrowserRouter } from 'react-router-dom';

export const App = () => {
 
  const [language, setLanguage] = useState('en');

const switchLanguage = () => {
  const newLanguage = language === 'en' ? 'uk' : 'en';
  setLanguage(newLanguage);
};
  
   const getParagraphStyle = style => {
     const fontSize = {
       titleMain: 26,
       title: 22,
       small: 20,
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
    <BrowserRouter basename="/Privacy_Policy">
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
    </BrowserRouter>
  );
};