import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ProfileRow from './ProfileRow';
import { applyEnglishInterface, applyUkrainianInterface } from '../testUtils/interfaceLanguage';

// «Про агенцію» стояло першим після назви й відсувало програми на другий
// екран. Тепер це «Більше про агенцію» в самому низу картки — під реакціями.
const actions = {
  primaryAction: { title: 'Не цікаво', icon: '✕', onClick: jest.fn() },
  secondaryAction: { title: 'Подобається', icon: '♥', onClick: jest.fn() },
};
const renderRow = (user, language) => render(
  <ProfileRow
    user={user}
    isAdmin={false}
    expanded={false}
    onToggleExpand={jest.fn()}
    onCommentSave={jest.fn()}
    clientComment=""
    language={language}
    {...actions}
  />
);
const follows = (first, second) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('«Більше про …» внизу картки', () => {
  applyUkrainianInterface();

  it('агенція: розділ підписаний «Більше про агенцію» і стоїть після реакцій', () => {
    renderRow({ userId: 'AG1', role: 'ag', name: 'Surrohelp', moreInfo_main: 'Працюємо з 2015 року, супровід донорок у Києві й Грузії.' }, 'uk');
    const about = screen.getByTestId('organisation-about');
    expect(about).toHaveTextContent('Більше про агенцію');
    expect(follows(screen.getByTestId('row-reactions'), about)).toBe(true);
  });

  it('біологічні батьки — «Більше про біологічних батьків» після реакцій', () => {
    renderRow({ userId: 'IP1', role: 'ip', name: 'Олена', moreInfo_main: 'Шукаємо донорку' }, 'uk');
    const toggle = screen.getByTestId('row-details-toggle');
    expect(toggle).toHaveTextContent('Більше про біологічних батьків');
    expect(follows(screen.getByTestId('row-reactions'), toggle)).toBe(true);
  });
});

describe('«Більше про …» мовою інтерфейсу', () => {
  applyEnglishInterface();

  it('клініка — «More about the clinic»', () => {
    renderRow({ userId: 'CL1', role: 'cl', name: 'Clinic', moreInfo_main: 'Repro clinic in Kyiv since 2010, full IVF cycle.' }, 'en');
    expect(screen.getByTestId('organisation-about')).toHaveTextContent('More about the clinic');
  });
});
