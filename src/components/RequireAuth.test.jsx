import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';

const LoginProbe = () => {
  const location = useLocation();
  return <div data-testid="login">returnTo:{location.state?.returnTo ?? ''}</div>;
};

const renderAt = (status, path, { allowRemembered = false } = {}) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/login" element={<LoginProbe />} />
      <Route
        path="/matching"
        element={<RequireAuth status={status} allowRemembered={allowRemembered}><div data-testid="feed">feed</div></RequireAuth>}
      />
    </Routes>
  </MemoryRouter>,
);

const rememberSession = ownerId => {
  window.localStorage.setItem('isLoggedIn', 'true');
  window.localStorage.setItem('ownerId', ownerId);
};

describe('RequireAuth', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

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

  // Стрічка показує деку з кеша ще до відповіді Firebase — якщо пристрій
  // памʼятає сесію. Firebase перед відповіддю ходить на сервер Google, і на
  // телефоні це частки секунди заставки на кожному перезавантаженні.
  it('shows a screen that allows it from a remembered session while Firebase answers', () => {
    rememberSession('uid-a');
    renderAt('pending', '/matching', { allowRemembered: true });
    expect(screen.getByTestId('feed')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-gate-pending')).not.toBeInTheDocument();
  });

  it('keeps waiting when the device remembers no session', () => {
    window.localStorage.setItem('ownerId', 'uid-a');
    renderAt('pending', '/matching', { allowRemembered: true });
    expect(screen.getByTestId('auth-gate-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('feed')).not.toBeInTheDocument();
  });

  it('keeps waiting on a screen that does not allow it', () => {
    rememberSession('uid-a');
    renderAt('pending', '/matching');
    expect(screen.getByTestId('auth-gate-pending')).toBeInTheDocument();
  });

  // Памʼять сесії не перебиває відповіді Firebase: «не увійшов» — це вхід.
  it('still sends a signed-out reader to login despite a remembered session', () => {
    rememberSession('uid-a');
    renderAt('out', '/matching', { allowRemembered: true });
    expect(screen.getByTestId('login')).toBeInTheDocument();
    expect(screen.queryByTestId('feed')).not.toBeInTheDocument();
  });
});
