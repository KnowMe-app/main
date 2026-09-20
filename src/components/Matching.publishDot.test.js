import React from 'react';
import fs from 'fs';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileRow from './ProfileRow';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

// Цятка публікації живе в трьох місцях — рядок стрічки, плитка галереї й
// відкрита картка, — і всі три мусять читати той самий стан і слати той самий
// намір.

const published = { userId: 'ID0001', name: 'Оксана', city: 'Черкаси', publish: true, lastLogin2: '2026-09-19' };
const hidden = { userId: 'ID0002', name: 'Ірина', city: 'Львів', publish: false, feedDate: false };

const renderRow = (user, props = {}) => render(
  <ProfileRow
    user={user}
    isAdmin
    expanded={false}
    onToggleExpand={jest.fn()}
    onOpen={jest.fn()}
    onCommentSave={jest.fn()}
    clientComment=""
    {...props}
  />
);

applyUkrainianInterface();

describe('цятка публікації в рядку стрічки', () => {
  it('дотик іде в обробник і не відкриває картку', () => {
    const onTogglePublish = jest.fn();
    const onOpen = jest.fn();

    renderRow(published, { onTogglePublish, onOpen });
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати зі стрічки' }));

    expect(onTogglePublish).toHaveBeenCalledWith(published);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('сховану картку цятка пропонує повернути', () => {
    const onTogglePublish = jest.fn();

    renderRow(hidden, { onTogglePublish });
    fireEvent.click(screen.getByRole('button', { name: 'Показати у стрічці' }));

    expect(onTogglePublish).toHaveBeenCalledWith(hidden);
  });
});

describe('Matching.jsx: намір цятки', () => {
  const source = fs.readFileSync(require.resolve('./Matching.jsx'), 'utf8');

  // Дата повернення в стрічку їде з дотиком. Без неї писач шукає її у вузлах і
  // знаходить або дату заведення картки, або нічого — див.
  // `config.publishToggle.test.js`.
  it('«показати у стрічці» шле дату поруч із publish', () => {
    expect(source).toContain(
      "newValue ? { publish: true, lastLogin2: nextFeedDate } : { publish: false },",
    );
  });

  // Відкрита картка приїжджає догідратованою, і анкета накриває собою
  // оптимістичний `publish`. Стан цятки тому читається з ключа стрічки, який
  // анкета не несе.
  it('цятка у відкритій картці читає стан карткою, а не полем publish', () => {
    expect(source).toContain('<AdminToggle published={isMatchingCardPublished(user)}');
    expect(source).not.toContain('<AdminToggle published={user.publish}');
  });
});
