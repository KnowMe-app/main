import React, { useState } from 'react';
import styled, { css } from 'styled-components';
import { FaUser, FaTelegramPlane, FaFacebookF, FaInstagram, FaVk, FaMailBulk, FaPhone } from 'react-icons/fa';
import {fieldsMain} from './formFields';


const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background-color: #f0f0f0;
  height: 100vh;
`;

const InputDiv = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  margin: 10px 0;
  padding: 10px;
  background-color: #fff;
  border: 1px solid #ccc;
  border-radius: 5px;
  width: ${({ width }) => width || '300px'};
  /* width: '300px'; */
`;

const InputField = styled.input`
  border: none;
  outline: none;
  flex: 1;
  padding-left: 10px;
  pointer-events: auto;
`;

const Label = styled.label`
  position: absolute;
  left: 30px;
  top: 50%;
  transform: translateY(-50%);
  transition: all 0.3s ease;
  color: gray;
  pointer-events: none;

  ${({ isActive }) =>
    isActive &&
    css`
      left: 10px;
      top: 0;
      transform: translateY(-100%);
      font-size: 12px;
      color: orange;
    `}
`;

const SubmitButton = styled.button`
  margin-top: 20px;
  padding: 10px 20px;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;

  &:hover {
    background-color: #45a049;
  }
`;

const iconMap = {
  user: <FaUser style={{ color: 'orange' }} />,
  mail: <FaMailBulk style={{ color: 'orange' }} />,
  phone: <FaPhone style={{ color: 'orange' }} />,
  'telegram-plane': <FaTelegramPlane style={{ color: 'orange' }} />,
  'facebook-f': <FaFacebookF style={{ color: 'orange' }} />,
  instagram: <FaInstagram style={{ color: 'orange' }} />,
  vk: <FaVk style={{ color: 'orange' }} />,
};

export const ProfileScreen = () => {
  const [state, setState] = useState({
    name: '',
    surname: '',
    email: '',
    phone: '',
    telegram: '',
    facebook: '',
    instagram: '',
    modifiedUser: '',
    vk: '',
    weight: '',
    blood: '',
    ownKids: '',
    reward: '',
  });

  const [focused, setFocused] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setState((prevState) => ({
      ...prevState,
      [name]: value,
    }));
    console.log('handleChange :>> ', state.name);
  };

  const handleFocus = (name) => {
    setFocused(name);
    console.log('handleFocus');
  };

  const handleBlur = () => {
    setFocused(null);
    console.log('handleBlur');
  };

  const handleSubmit = () => {
    console.log('Form Data:', state);
  };
  return (
    <Container>
      {fieldsMain.map((field) => (
        <InputDiv key={field.name} width={field.width}>
          {iconMap[field.svg]}
          <InputField
            name={field.name}
            // placeholder=""
            value={state[field.name]}
            onChange={handleChange}
            onFocus={() => handleFocus(field.name)}
            onBlur={handleBlur}
          />
          <Label isActive={focused === field.name || state[field.name]}>
            {field.ukrainianHint || field.hint || field.placeholder}
          </Label>
        </InputDiv>
      ))}
       <SubmitButton onClick={handleSubmit}>Submit</SubmitButton>
    </Container>
  );
};

export default ProfileScreen;
