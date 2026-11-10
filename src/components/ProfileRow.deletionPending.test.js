import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ProfileRow from './ProfileRow';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

// Стрічка адміна показує й сховані анкети, тож видалений власником акаунт,
// якого ще не очистили, стояв поруч із новою реєстрацією тієї ж людини й
// читався дублем. Плашка каже, що ця картка вже видалена.
applyUkrainianInterface();

const user = { userId: 'xsyCP2avdlTwtEZQJh4Fa90ZTO83', name: 'Олександр', role: 'ed', feedDate: false };

const renderRow = props => render(
  <ProfileRow user={user} expanded={false} onToggleExpand={jest.fn()} onCommentSave={jest.fn()} clientComment="" {...props} />,
);

describe('ProfileRow deletion-pending badge', () => {
  it('marks a deleted account for the admin', () => {
    renderRow({ isAdmin: true, deletionPending: true });
    expect(screen.getByTestId('deletion-pending-badge')).toHaveTextContent('Акаунт видалено · чекає очищення бази');
  });

  it('stays silent for a card outside the queue', () => {
    renderRow({ isAdmin: true, deletionPending: false });
    expect(screen.queryByTestId('deletion-pending-badge')).not.toBeInTheDocument();
  });

  it('never shows to a non-admin reader', () => {
    renderRow({ isAdmin: false, deletionPending: true });
    expect(screen.queryByTestId('deletion-pending-badge')).not.toBeInTheDocument();
  });
});
