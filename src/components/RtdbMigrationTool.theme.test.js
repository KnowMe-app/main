/**
 * Сторінка адмінська, але тема на ній та сама, що всюди. Захардкожений `#fff` без
 * `color` тут одного разу вже дав білі написи на білих кнопках у темній темі —
 * тест ловить саме це: кольори беруться з токенів, а не з літералів.
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';

import RtdbMigrationTool from './RtdbMigrationTool';

jest.mock('./config', () => ({ auth: { currentUser: { uid: 'admin-uid' } } }));

const source = fs.readFileSync(path.join(__dirname, 'RtdbMigrationTool.jsx'), 'utf8');

describe('RtdbMigrationTool', () => {
  it('малює вхідні кнопки з читабельними написами до завантаження файлів', () => {
    render(
      <MemoryRouter>
        <RtdbMigrationTool />
      </MemoryRouter>,
    );

    expect(screen.getByText('Load users.json')).toBeInTheDocument();
    expect(screen.getByText('Load newUsers.json')).toBeInTheDocument();
    expect(screen.getByText('Спершу завантажте users.json або newUsers.json.')).toBeInTheDocument();
  });

  it('не тримає захардкожених кольорів фону чи тексту', () => {
    // Коментарі не рахуються: у них hex згадується як опис старої помилки.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    expect(code.match(/#[0-9a-fA-F]{3,8}\b/g) || []).toEqual([]);
  });
});
