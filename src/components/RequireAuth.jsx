import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { LOGIN_ROUTE, buildReturnToFromLocation } from 'utils/authRedirect';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const GateWrap = styled.div`
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const GateSpinner = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--km-border, #e3e3e3);
  border-top-color: var(--km-accent, #b98b5e);
  animation: ${spin} 0.8s linear infinite;
`;

/**
 * Межа входу: екран не монтується, поки не відомо, хто читач.
 *
 * Стан входу приїжджає від Firebase асинхронно, і «ще не знаємо» — це не
 * «не залогінений». Поки екран вантажився без цієї межі, `Matching`
 * монтувався одразу й починав збирати деку без жодного uid: кожен запит до
 * `matchingCards` відлітав з `Permission denied`, автодовантаження рахувало це
 * за «сторінка не дала карток» і питало знову — незалогінена вкладка тримала
 * відкритий сокет до бази й слала десятки запитів на секунду, а на екрані
 * назавжди лишався скелетон.
 *
 * `status`:
 *   'pending' — відповіді від Firebase ще немає, показуємо очікування;
 *   'in'      — читач увійшов, пускаємо далі;
 *   'out'     — читач не увійшов, ведемо на форму входу разом з адресою,
 *               з якої він сюди прийшов.
 */
export const RequireAuth = ({ status, children }) => {
  const location = useLocation();

  if (status === 'pending') {
    return (
      <GateWrap role="status" aria-live="polite" data-testid="auth-gate-pending">
        <GateSpinner aria-hidden="true" />
      </GateWrap>
    );
  }

  if (status !== 'in') {
    return (
      <Navigate
        to={LOGIN_ROUTE}
        replace
        state={{ returnTo: buildReturnToFromLocation(location) }}
      />
    );
  }

  return children;
};

export default RequireAuth;
