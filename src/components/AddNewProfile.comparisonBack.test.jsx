import React, { useEffect, useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import fs from 'fs';
import path from 'path';

// Run the screen's navigation handlers against the actual browser history,
// without mounting its unrelated import/admin panels or connecting Firebase.
const source = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');
const handlers = source.slice(source.indexOf('  const openComparedCard ='), source.indexOf('  const [moreActionsState,'));
const bindHandlers = new Function('useEffect', 'location', 'navigate', 'comparisonReturnRef', 'search', 'setSearch', 'setState', 'setShowInfoModal', 'toast', `${handlers}\nreturn openComparedCard;`);

const refresh = jest.fn(async () => {});
const Harness = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const comparisonReturnRef = useRef(null);
  const [card, setState] = useState({});
  const [search, setSearch] = useState('phone query');
  const [modal, setShowInfoModal] = useState('compareCards');
  const open = bindHandlers(useEffect, location, navigate, comparisonReturnRef, search, setSearch, setState, setShowInfoModal, { error: jest.fn() });
  return <>
    <div data-testid="state">{JSON.stringify({ card, modal, search, url: location.search })}</div>
    {modal === 'compareCards' && <button onClick={() => open({ userId: 'B' }, refresh)}>A ↔ B</button>}
  </>;
};

it('browser Back restores the comparison and search after opening either card', async () => {
  refresh.mockResolvedValue(undefined);
  window.history.replaceState({}, '', '/add?search=phone');
  render(<BrowserRouter><Harness /></BrowserRouter>);
  fireEvent.click(screen.getByText('A ↔ B'));
  expect(JSON.parse(screen.getByTestId('state').textContent)).toMatchObject({ card: { userId: 'B' }, modal: false });
  expect(window.location.search).toContain('userId=B');
  await act(async () => window.history.back());
  expect(await screen.findByText('A ↔ B')).not.toBeNull();
  expect(JSON.parse(screen.getByTestId('state').textContent)).toMatchObject({ card: {}, modal: 'compareCards', search: 'phone query' });
  expect(window.location.search).toBe('?search=phone');
  expect(refresh).toHaveBeenCalledTimes(1);
});
