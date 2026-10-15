import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

const renderRow = ({ user = parents, publishedUser, expanded = true, programsContext, anketaRole, onToggleExpand = jest.fn() } = {}) => render(
  <ProfileRow
    user={user}
    publishedUser={publishedUser || user}
    isAdmin={false}
    expanded={expanded}
    onToggleExpand={onToggleExpand}
    onCommentSave={jest.fn()}
    clientComment=""
    language="uk"
    programsContext={programsContext}
    anketaRole={anketaRole}
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

// Анкета батьків поруч з іншою роллю: розділи ті самі, а стоять там, де
// картка розгортається. Поки їх малювала сама розкладка батьків, у картці з
// двома ролями як шукають і побажання не бачив ніхто.
describe('анкета батьків у картці з кількома ролями', () => {
  const parentFields = {
    seeking: 'both',
    parentVia: 'clinic',
    parentPreferences: { donor: { eyeColor: 'Brown' } },
  };

  it('донорка, яка ще й батьки: розділи батьків — у «Детальніше»', () => {
    const user = { userId: 'EDIP1', role: ['ed', 'ip'], name: 'Оля', moreInfo_main: 'Про себе коротко.', ...parentFields };
    renderRow({ user, expanded: true, programsContext: { viewerType: 'sm', facts: {} } });
    expect(screen.getByTestId('parent-seeking')).toHaveTextContent('Шукають донорку ооцитів та сурогатну маму');
    expect(within(screen.getByTestId('parent-via')).getByText('Через клініку')).toBeInTheDocument();
    expect(wishChip(screen.getByTestId('parent-donor-wishes'), 'Очі: карі')).toBeInTheDocument();
  });

  it('агенція, яка ще й батьки: розділи батьків розгортаються під «Більше про агенцію»', () => {
    const user = {
      userId: 'AGIP1', role: ['ag', 'ip'], name: 'Мрія',
      moreInfo_main: 'Працюємо з 2015 року, супровід донорок у Києві й Грузії.', ...parentFields,
    };
    const onToggleExpand = jest.fn();
    const { rerender } = renderRow({ user, expanded: false, onToggleExpand });
    expect(screen.queryByTestId('parent-via')).not.toBeInTheDocument();
    const about = screen.getByTestId('organisation-about');
    fireEvent.click(within(about).getByRole('button', { name: 'Більше про біологічних батьків' }));
    expect(onToggleExpand).toHaveBeenCalledWith('AGIP1');

    rerender(
      <ProfileRow user={user} isAdmin={false} expanded onToggleExpand={onToggleExpand} onCommentSave={jest.fn()} clientComment="" language="uk" {...actions} />
    );
    expect(within(screen.getByTestId('organisation-about')).getByTestId('parent-via')).toHaveTextContent('Через клініку');
    expect(within(screen.getByTestId('organisation-about')).getByRole('button', { name: 'Згорнути' })).toBeInTheDocument();
  });

  it('картка «донорка + агенція + батьки»: розділи батьків — у рядку організації, разом із «кого шукають»', () => {
    const user = { userId: 'EDAGIP1', role: ['ed', 'ag', 'ip'], name: 'Оля', agencyName: 'Мрія', ...parentFields };
    const { unmount } = renderRow({ user, expanded: true, anketaRole: 'ed' });
    expect(screen.queryByTestId('parent-via')).not.toBeInTheDocument();
    unmount();

    renderRow({ user, expanded: true, anketaRole: 'ag' });
    expect(screen.getByTestId('parent-seeking')).toBeInTheDocument();
    expect(within(screen.getByTestId('organisation-about')).getByTestId('parent-via')).toHaveTextContent('Через клініку');
  });

  // Дочитана анкета несе й сховані ролі (`withLazyPhotos` кладе її поверх
  // картки), тож межа видимості — картка стрічки, `publishedUser`.
  it('сховану анкету батьків розгорнута картка не показує', () => {
    const user = { userId: 'EDIP2', role: ['ed', 'ip'], name: 'Оля', moreInfo_main: 'Про себе коротко.', ...parentFields };
    renderRow({ user, publishedUser: { userId: 'EDIP2', role: 'ed', name: 'Оля' }, expanded: true });
    expect(screen.queryByTestId('parent-seeking')).not.toBeInTheDocument();
    expect(screen.queryByTestId('parent-via')).not.toBeInTheDocument();
  });

  it('сховану агенцію дочитана анкета не повертає: картка лишається карткою батьків', () => {
    const user = { userId: 'AGIP2', role: ['ag', 'ip'], name: 'Олена', agencyName: 'Мрія', ...parentFields };
    renderRow({ user, publishedUser: { userId: 'AGIP2', role: 'ip', name: 'Олена' }, expanded: false });
    expect(screen.queryByTestId('organisation-about')).not.toBeInTheDocument();
    expect(screen.queryByText(/Мрія/)).not.toBeInTheDocument();
    expect(screen.getByTestId('row-details-toggle')).toHaveTextContent('Більше про біологічних батьків');
  });

  it('прочитана проєкція без анкети: рядок організації кличе розгортання «Більше про біологічних батьків»', () => {
    const user = { userId: 'EDAGIP2', role: ['ed', 'ag', 'ip'], name: 'Оля', seekingRole: 'sm', seeking: 'sm', __matchingSummary: true };
    renderRow({ user, expanded: false, anketaRole: 'ag' });
    expect(screen.getByTestId('row-details-toggle')).toHaveTextContent('Більше про біологічних батьків');
  });
});
