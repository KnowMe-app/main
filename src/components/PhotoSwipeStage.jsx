import React from 'react';
import styled, { css, keyframes } from 'styled-components';

/*
 * Сцена гортання фото — рядок стрічки й плитка галереї (`usePhotoSwipe`).
 *
 * Досі знімок мінявся миттєво: палець проводив по фото, і за мить на його
 * місці стояло інше, без жодного звʼязку з жестом. Тепер фото їде за пальцем,
 * з-за краю виглядає сусід, а відпущене доїжджає пружною кривою з того
 * місця, де його покинули. Знімок, що йде, відступає вглиб (менший і
 * темніший) — так видно, котрий із двох «головний».
 *
 * Покадрове зміщення живе в CSS-змінній `--photo-drag` на самій сцені: її
 * пише хук напряму, без перемальовування рядка на кожен touchmove.
 */

// Крива з довгим мʼяким доїздом — так поводяться нативні галереї.
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const DURATION_MS = 460;

const slideIn = keyframes`
  from {
    transform: translate3d(calc(var(--photo-dir) * 100% + var(--photo-start)), 0, 0) scale(1.04);
  }
  to {
    transform: translate3d(0, 0, 0) scale(1);
  }
`;

const slideOut = keyframes`
  from {
    transform: translate3d(var(--photo-start), 0, 0) scale(1);
    filter: brightness(1);
  }
  to {
    transform: translate3d(calc(var(--photo-dir) * -34%), 0, 0) scale(0.92);
    filter: brightness(0.55);
  }
`;

const Stage = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* Свій контекст накладання: шари всередині мають z-index, і без нього
   * вони лягали б поверх лічильника й плашки ролі, що стоять над сценою. */
  z-index: 0;
  --photo-drag: 0px;
`;

const Layer = styled.img`
  && {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    backface-visibility: hidden;
    will-change: transform;
    opacity: ${({ $loading }) => ($loading ? 0.6 : 1)};
    transition: opacity 0.2s ease;
  }

  ${({ $kind }) => $kind === 'current' && css`
    && {
      z-index: 1;
      transform: translate3d(var(--photo-drag), 0, 0);
    }
  `}

  ${({ $kind }) => ($kind === 'prev' || $kind === 'next') && css`
    && {
      z-index: 1;
      transform: translate3d(
        calc(${$kind === 'next' ? '100%' : '-100%'} + var(--photo-drag)),
        0,
        0
      );
    }
  `}

  /* Повернення на місце — той самий доїзд, що й у переходу. */
  ${({ $snapping }) => $snapping && css`
    && {
      transition: transform ${DURATION_MS * 0.7}ms ${EASE}, opacity 0.2s ease;
    }
  `}

  ${({ $kind }) => $kind === 'incoming' && css`
    && {
      z-index: 2;
      box-shadow: 0 0 28px rgba(0, 0, 0, 0.35);
      animation: ${slideIn} ${DURATION_MS}ms ${EASE} both;
    }
  `}

  ${({ $kind }) => $kind === 'outgoing' && css`
    && {
      z-index: 1;
      pointer-events: none;
      animation: ${slideOut} ${DURATION_MS}ms ${EASE} both;
    }
  `}

  @media (prefers-reduced-motion: reduce) {
    && {
      animation: none;
      transition: opacity 0.2s ease;
    }
  }
`;

const PhotoSwipeStage = ({ swipe, photo, loading = false }) => {
  const { stageRef, dragPhase, prevPhoto, nextPhoto, transition, onSettled } = swipe;
  const snapping = dragPhase === 'snap';
  const vars = transition
    ? { '--photo-dir': transition.direction, '--photo-start': `${transition.offset}px` }
    : undefined;

  return (
    <Stage ref={stageRef} style={vars}>
      {transition && (
        <Layer
          key={`out-${transition.id}`}
          src={transition.from}
          alt=""
          aria-hidden="true"
          decoding="async"
          $kind="outgoing"
        />
      )}
      <Layer
        key={`photo-${photo}`}
        src={photo}
        alt=""
        loading="lazy"
        decoding="async"
        $kind={transition ? 'incoming' : 'current'}
        $snapping={snapping}
        $loading={loading}
        onAnimationEnd={transition ? onSettled : undefined}
      />
      {prevPhoto && prevPhoto !== photo && (
        <Layer src={prevPhoto} alt="" aria-hidden="true" decoding="async" $kind="prev" $snapping={snapping} />
      )}
      {nextPhoto && nextPhoto !== photo && nextPhoto !== prevPhoto && (
        <Layer src={nextPhoto} alt="" aria-hidden="true" decoding="async" $kind="next" $snapping={snapping} />
      )}
    </Stage>
  );
};

export default PhotoSwipeStage;
