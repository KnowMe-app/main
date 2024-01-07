import PropTypes from 'prop-types';
import { List, Item } from './ContactList.styled';
import { Contact } from 'components/Contact/Contact';

export function ContactList({ contacts, deleteContact }) {
  return (
    <List>
      {contacts.map(({ id, name, number }) => {
        return (
          <Item key={id}>
            <Contact name={name} number={number} id={id} deleteContact={deleteContact} />
          </Item>
        );
      })}
    </List>
  );
}

ContactList.propTypes = {
  contacts: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      number: PropTypes.string.isRequired,
    })
  ),
  deleteContact: PropTypes.func.isRequired,
};
