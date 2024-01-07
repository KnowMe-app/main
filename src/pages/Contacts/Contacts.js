import React, { useEffect } from 'react';
import { Container, TitleH1, TitleH2 } from 'components/App.styled';
import { ContactForm } from 'components/ContactForm/ContactForm';
import { ContactList } from 'components/ContactList/ContactList';
import { Filter } from 'components/Filter/Filter';
import { useDispatch, useSelector } from 'react-redux';
import { getContacts, getError, getLoading } from 'redux/contacts/contactsSlice';
import { fetchContacts, addContact, deleteContact } from 'redux/contacts/operations';
import { addFilter, getFilter } from 'redux/contacts/filterSlice';
import { Loader } from 'components/Loader/Loader';

export default function Contacts (){
  const contacts = useSelector(getContacts);
  const filter = useSelector(getFilter);
  const isLoading = useSelector(getLoading);
  const error = useSelector(getError);
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchContacts());
  }, [dispatch]);

  const handleSubmit = newContact => {
    const dublicate = contacts.find(({ name }) => name.toLowerCase().includes(newContact.name.toLowerCase()));
    if (dublicate) {
      alert(`${newContact} is already in contacts`);
      return;
    }
    dispatch(addContact(newContact));
  };
  const changeFilter = e => dispatch(addFilter(e.currentTarget.value));
  const delContact = id => dispatch(deleteContact(id));
  const randerContacts = () => contacts.filter(contact => contact.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <Container>
        {error ? (
          <p>Please try again later. The problem occurred. ${error}</p>
        ) : (
          <>
            {isLoading ? (
              <Loader />
            ) : (
              <>
                <TitleH1>Phonebook</TitleH1>
                <ContactForm onSubmitData={handleSubmit} />
                <TitleH2>Contacts</TitleH2>
                <Filter value={filter} changeFilter={changeFilter} />
                {contacts.length ? (
                  <ContactList contacts={randerContacts()} deleteContact={delContact} />
                ) : (
                  <p>Oh, dear, you have no friends:( Get out of your chair and do something with your life ;)</p>
                )}
              </>
            )}
          </>
        )}
      </Container>
    </>
  );
}
