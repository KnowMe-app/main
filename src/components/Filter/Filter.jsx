import PropTypes from 'prop-types';
import { FilterContainer, LabelText, Label, Input } from './Filter.styled';

export function Filter({ value, changeFilter }) {
  return (
    <FilterContainer>
      <Label>
        <LabelText>Find contacts by name</LabelText>
        <Input type="text" value={value} onChange={changeFilter} />
      </Label>
    </FilterContainer>
  );
}

Filter.propTypes = {
  value: PropTypes.string.isRequired,
  changeFilter: PropTypes.func.isRequired,
};
