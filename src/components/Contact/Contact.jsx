import PropTypes from 'prop-types';
import { ItemContainer, ItemText, Button } from './Contact.styled';

export function Contact({ id, name, number, deleteContact }) {
  return (
    <ItemContainer>
      <ItemText>{name}: </ItemText>
      <ItemContainer>
        <ItemText>{number}</ItemText>
        <Button type="button" onClick={() => deleteContact(id)}>
          Delete
        </Button>
      </ItemContainer>
    </ItemContainer>
  );
}

Contact.propTypes = {
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  number: PropTypes.string.isRequired,
  deleteContact: PropTypes.func.isRequired,
};
