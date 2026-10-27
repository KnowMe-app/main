import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { LOGIN_ROUTE, buildReturnToFromLocation } from 'utils/authRedirect';
import { readRememberedViewerId } from 'utils/rememberedSession';

const run = keyframes`
  from { transform: translateX(-100%); }
  to { transform: translateX(260%); }
`;

// Геометрія — та сама, що в `.km-splash` з `public/index.html`: на весь
// екран і з власним тлом. Тут стояло `min-height: 60vh` — знак центрувався в
// 60 % висоти, тобто вище за заставку, і на кожному екрані на різну відстань:
// після заставки лого підстрибувало, а під блоком лишалась смуга іншого тла.
const GateWrap = styled.div`
  position: fixed;
  inset: 0;
  background: var(--km-bg, #faf9f7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
`;

// Той самий знак, що й заставка в `public/index.html`: спінер після неї
// читався як другий, інший екран очікування, а лейбл — і є очікування.
const GateMark = styled.div`
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--km-text, #1a1a1a);

  span {
    color: var(--km-accent, #c9600f);
  }
`;

const GateBar = styled.div`
  width: 112px;
  height: 3px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--km-accent, #c9600f) 16%, transparent);
  overflow: hidden;

  span {
    display: block;
    width: 40%;
    height: 100%;
    border-radius: inherit;
    background: var(--km-accent, #c9600f);
    animation: ${run} 1.1s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    span {
      width: 100%;
      opacity: 0.5;
      animation: none;
    }
  }
`;

const LoadingMark = () => (
  <>
    <GateMark aria-hidden="true">
      KnowMe<span>.</span>
    </GateMark>
    <GateBar aria-hidden="true">
      <span />
    </GateBar>
  </>
);

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
 *
 * `allowRemembered` — екран, який на 'pending' уже можна показати з кеша
 * пристрою, якщо пристрій памʼятає сесію (`readRememberedViewerId`). Сам
 * Firebase перед відповіддю ходить на сервер Google перевірити сесію, і на
 * телефоні це помітні частки секунди заставки на кожному перезавантаженні.
 * Такий екран мусить сам не питати базу до відповіді Firebase (стрічка
 * запускає свої запити з `onAuthStateChanged`); скаже Firebase 'out' — межа
 * поведе на вхід, як і без цього.
 */
export const RequireAuth = ({ status, allowRemembered = false, children }) => {
  const location = useLocation();

  if (status === 'pending' && allowRemembered && readRememberedViewerId()) {
    return children;
  }

  if (status === 'pending') {
    return (
      <GateWrap role="status" aria-live="polite" data-testid="auth-gate-pending">
        <LoadingMark />
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

/**
 * Очікування екрана, код якого ще їде (`React.lazy` у `App.jsx`). Той самий
 * знак, що й у межі входу й у заставці: людина бачить одне «зачекайте», а не
 * лейбл, а слідом за ним спінер.
 */
export const ScreenLoading = () => (
  <GateWrap role="status" aria-live="polite" data-testid="screen-loading">
    <LoadingMark />
  </GateWrap>
);

export default RequireAuth;
