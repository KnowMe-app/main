import { useState } from 'react';
import PropTypes from 'prop-types';
import { Container, InputContainer, Input, LabelText, Button } from './ContactForm.styled';

export function ContactForm({ onSubmitData }) {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');

  const handelChange = e => {
    const { name, value } = e.currentTarget;
    if (name === 'name') setName(value);
    else setNumber(value);
  };

  const handleSubmit = e => {
    e.preventDefault();
    const obj = {
      name,
      number,
    };
    onSubmitData(obj);
    setName('');
    setNumber('');
  };

  return (
    <Container>
      <form onSubmit={handleSubmit}>
        <InputContainer>
          <label>
            <LabelText>Name</LabelText>

            <Input
              value={name}
              onChange={handelChange}
              placeholder="Chris Pratt"
              type="text"
              name="name"
              pattern="^[a-zA-Zа-яА-Я]+(([' -][a-zA-Zа-яА-Я ])?[a-zA-Zа-яА-Я]*)*$"
              title="Name may contain only letters, apostrophe, dash and spaces. For example Adrian, Jacob Mercer, Charles de Batz de Castelmore d'Artagnan"
              required
            />
          </label>
          <label>
            <LabelText>Number</LabelText>

            <Input
              value={number}
              onChange={handelChange}
              placeholder="055-066-77-88"
              type="tel"
              name="number"
              pattern="\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}"
              title="Phone number must be digits and can contain spaces, dashes, parentheses and can start with +"
              required
            />
          </label>
        </InputContainer>
        <Button type="submit">Add contact</Button>
      </form>
    </Container>
  );
}

ContactForm.propTypes = {
  onSubmitData: PropTypes.func.isRequired,
};
