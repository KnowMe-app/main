import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ProfileRow from './ProfileRow';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

applyUkrainianInterface();

// Анкета агенції без особистої ролі кладе назву в `name`, а контактну особу —
// у `surname`; дата народження в ній — контактної особи. Рядок складав з
// цього «Surrohelp M., 43» — імʼя людини й вік організації.
describe('назва організації в рядку стрічки', () => {
  const renderRow = user => render(
    <ProfileRow user={user} isAdmin={false} expanded={false} onToggleExpand={jest.fn()} onCommentSave={jest.fn()} clientComment="" />
  );

  it('агенцію називає назвою — без контактної особи й віку', () => {
    renderRow({ userId: 'AG1', role: 'ag', name: 'Surrohelp', surname: 'Marina', birth: '01.01.1983', city: 'Київ' });
    expect(screen.getByText('Surrohelp')).toBeInTheDocument();
    expect(screen.queryByText(/Marina|M\.|, 4\d/)).not.toBeInTheDocument();
  });

  it('донорку й далі називає іменем з віком', () => {
    renderRow({ userId: 'ED1', role: 'ed', name: 'Оксана', birth: '01.01.1998' });
    expect(screen.getByText(/Оксана, \d+/)).toBeInTheDocument();
  });
});
