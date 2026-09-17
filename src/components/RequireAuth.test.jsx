import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';

const LoginProbe = () => {
  const location = useLocation();
  return <div data-testid="login">returnTo:{location.state?.returnTo ?? ''}</div>;
};

const renderAt = (status, path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/login" element={<LoginProbe />} />
      <Route
        path="/matching"
        element={<RequireAuth status={status}><div data-testid="feed">feed</div></RequireAuth>}
      />
    </Routes>
  </MemoryRouter>,
);

describe('RequireAuth', () => {
  // «Ще не знаємо» — не «не увійшов». Поки межа плутала ці два стани, читач із
  // живою сесією встигав побачити форму входу, а екран — змонтуватись без uid.
  it('waits instead of deciding while Firebase has not answered', () => {
    renderAt('pending', '/matching');
    expect(screen.getByTestId('auth-gate-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('feed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();
  });

  it('renders the screen for a signed-in reader', () => {
    renderAt('in', '/matching');
    expect(screen.getByTestId('feed')).toBeInTheDocument();
  });

  // Головне: незалогінений не лишається на захищеному екрані — той екран
  // навіть не монтується, тож нікому починати читати базу без прав.
  it('sends a signed-out reader to the login form and carries the address along', () => {
    renderAt('out', '/matching?q=test');
    expect(screen.getByTestId('login')).toHaveTextContent('returnTo:/matching?q=test');
    expect(screen.queryByTestId('feed')).not.toBeInTheDocument();
  });
});
