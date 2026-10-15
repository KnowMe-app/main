import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ParentProfileFields } from './RoleProfileFields';
import { applyUkrainianInterface } from '../../testUtils/interfaceLanguage';

applyUkrainianInterface();

const mountFields = (state, props = {}) => {
  const onCommit = jest.fn();
  render(<ParentProfileFields state={state} onCommit={onCommit} language="uk" {...props} />);
  return onCommit;
};

describe('«Кого шукаєте» біологічних батьків', () => {
  it('кого шукаєте — кількох, і агенцію з клінікою теж', () => {
    const onCommit = mountFields({ seeking: 'both' });
    expect(screen.getByRole('button', { name: 'Донорку ооцитів' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Сурогатну маму' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Агенцію' }));
    expect(onCommit).toHaveBeenLastCalledWith('seeking', 'ed,sm,ag');
    fireEvent.click(screen.getByRole('button', { name: 'Сурогатну маму' }));
    expect(onCommit).toHaveBeenLastCalledWith('seeking', 'ed');
  });

  it('побажання до донорки — вибір з довідника, і дотик записує значення довідника', () => {
    const onCommit = mountFields({ seeking: 'ed' });
    expect(screen.getByText('Бажано у донорки')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('parent-wish-eyeColor')).getByRole('button', { name: 'Карі' }));
    expect(onCommit).toHaveBeenCalledWith('parentPreferences', { donor: { eyeColor: 'Brown' } });
  });

  it('вищу освіту знімає повторний дотик', () => {
    const onCommit = mountFields({ seeking: 'both', parentPreferences: { donor: { education: 'Higher' } } });
    const higher = within(screen.getByTestId('parent-wish-education')).getByRole('button', { name: 'Вища освіта' });
    expect(higher).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(higher);
    expect(onCommit).toHaveBeenCalledWith('parentPreferences', null);
  });

  it('тим, хто шукає сурогатну маму, зовнішності донорки не пропонує', () => {
    mountFields({ seeking: 'sm' });
    expect(screen.queryByText('Бажано у донорки')).not.toBeInTheDocument();
  });

  it('«Як шукаєте» необовʼязкове: повторний дотик знімає вибір', () => {
    const onCommit = mountFields({ seeking: 'ed', parentVia: 'clinic' });
    fireEvent.click(screen.getByRole('button', { name: 'Через клініку' }));
    expect(onCommit).toHaveBeenCalledWith('parentVia', null);
  });

  // Групу крові, зріст і місце тепер задає програма — нового форма не питає,
  // а записане показує, доки його не стерли.
  it('«Де програма» й старі побажання — лише записані', () => {
    mountFields({ seeking: 'ed' });
    expect(screen.queryByText('Де програма')).not.toBeInTheDocument();
    expect(screen.queryByText('Записано раніше — тепер це вимоги програми')).not.toBeInTheDocument();
  });

  it('записане раніше видно й можна стерти', () => {
    mountFields(
      { seeking: 'ed', programLocation: 'Київ', parentPreferences: { donor: { blood: '1+' } } },
      { showProgramLocation: true },
    );
    expect(screen.getByDisplayValue('Київ')).toBeInTheDocument();
    expect(screen.getByText('Записано раніше — тепер це вимоги програми')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1+')).toBeInTheDocument();
  });

  // Перейшли з «донорку» на «сурогатну маму»: побажання до донорки картка вже
  // не показує, а форма не ховає — стоїть окремо, і стерти його можна одним
  // дотиком, не повертаючи «донорку».
  it('побажання до донорки, коли шукають СМ, — окремо, і стираються одним дотиком', () => {
    const onCommit = mountFields({
      seeking: 'sm',
      parentPreferences: { donor: { eyeColor: 'Brown', education: 'Higher' }, surrogate: { ageTo: '35' } },
    });
    expect(screen.queryByTestId('parent-wish-eyeColor')).not.toBeInTheDocument();
    const aside = screen.getByTestId('parent-set-aside-donor');
    expect(aside).toHaveTextContent('Ви зараз не шукаєте донорку');
    expect(aside).toHaveTextContent('Очі: карі · вища освіта');
    fireEvent.click(within(aside).getByRole('button', { name: 'Стерти' }));
    expect(onCommit).toHaveBeenCalledWith('parentPreferences', { surrogate: { ageTo: '35' } });
  });

  it('записане для СМ, коли шукають донорку, — так само', () => {
    const onCommit = mountFields({ seeking: 'ed', parentPreferences: { surrogate: { location: 'Грузія' } } });
    expect(screen.queryByDisplayValue('Грузія')).not.toBeInTheDocument();
    const aside = screen.getByTestId('parent-set-aside-surrogate');
    expect(aside).toHaveTextContent('Грузія');
    fireEvent.click(within(aside).getByRole('button', { name: 'Стерти' }));
    expect(onCommit).toHaveBeenCalledWith('parentPreferences', null);
  });

  it('вільний текст, записаний колись у побажання, лишається обраним варіантом', () => {
    mountFields({ seeking: 'ed', parentPreferences: { donor: { eyeColor: 'блакитні' } } });
    expect(within(screen.getByTestId('parent-wish-eyeColor')).getByRole('button', { name: 'блакитні' }))
      .toHaveAttribute('aria-pressed', 'true');
  });
});
