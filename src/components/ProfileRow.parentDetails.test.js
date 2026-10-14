import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import ProfileRow from './ProfileRow';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

applyUkrainianInterface();

const actions = {
  primaryAction: { title: 'Не цікаво', icon: '✕', onClick: jest.fn() },
  secondaryAction: { title: 'Подобається', icon: '♥', onClick: jest.fn() },
};

const parents = {
  userId: 'IP1',
  role: 'ip',
  name: 'Олена й Андрій',
  seeking: 'ed',
  parentVia: 'clinic',
  programLocation: 'Київ',
  moreInfo_main: 'Ми разом девʼять років і мріємо про першу дитину.',
  parentPreferences: { donor: { eyeColor: 'Brown', hairColor: 'Brunette, Shoten', education: 'Higher' } },
};

const renderRow = ({ expanded = true, programsContext } = {}) => render(
  <ProfileRow
    user={parents}
    isAdmin={false}
    expanded={expanded}
    onToggleExpand={jest.fn()}
    onCommentSave={jest.fn()}
    clientComment=""
    language="uk"
    programsContext={programsContext}
    {...actions}
  />
);

// Чіп побажання — пункт списку, що несе цей текст (позначка «✓» — поруч).
const wishChip = (container, text) => within(container)
  .getAllByRole('listitem')
  .find(item => item.textContent.endsWith(text));

describe('картка біологічних батьків у стрічці', () => {
  // Рядок до розгортання — лише те, що є в картці стрічки: як шукають і де
  // програма приїжджали з анкетою і зсували рядок під пальцем.
  it('до розгортання каже лише, кого шукають', () => {
    renderRow({ expanded: false });
    const line = screen.getByTestId('parent-seeking');
    expect(line).toHaveTextContent('Шукають донорку ооцитів');
    expect(line).not.toHaveTextContent('Київ');
    expect(line).not.toHaveTextContent('клініку');
  });

  it('«Більше про біологічних батьків» — про нас, як шукають, де програма, побажання', () => {
    renderRow({ programsContext: { viewerType: 'ed', facts: { eyeColor: 'Hazel', hairColor: 'Fair', education: 'Master' } } });
    expect(screen.getByText('Про нас')).toBeInTheDocument();
    expect(screen.getByText('Ми разом девʼять років і мріємо про першу дитину.')).toBeInTheDocument();
    expect(within(screen.getByTestId('parent-via')).getByText('Через клініку')).toBeInTheDocument();
    expect(within(screen.getByTestId('parent-place')).getByText('Київ')).toBeInTheDocument();
    const wishes = screen.getByTestId('parent-donor-wishes');
    expect(wishChip(wishes, 'Очі: карі')).toHaveAttribute('data-match', 'true');
    expect(wishChip(wishes, 'Волосся: брюнетка, шатенка')).not.toHaveAttribute('data-match');
    expect(wishChip(wishes, 'вища освіта')).toHaveAttribute('data-match', 'true');
  });

  it('не донорці позначок збігу не ставить', () => {
    renderRow({ programsContext: { viewerType: 'sm', facts: { eyeColor: 'Brown' } } });
    const wishes = screen.getByTestId('parent-donor-wishes');
    expect(wishChip(wishes, 'Очі: карі')).not.toHaveAttribute('data-match');
  });

  it('донорських розділів (обличчя, освіта, розміри) у батьків немає', () => {
    renderRow({ programsContext: { viewerType: 'ed', facts: {} } });
    expect(screen.queryByText('Про себе')).not.toBeInTheDocument();
  });
});
