import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import styled, { keyframes } from 'styled-components';

const LONG_PRESS_THRESHOLD = 650;

export const COLOR_OPTIONS = [
  {
    key: 'none',
    label: 'Без кольору',
    background: 'white',
    border: '#d0d0d0',
    text: 'black',
  },
  {
    key: 'morning',
    label: 'Ранок',
    background: '#fff4e5',
    border: '#ffb74d',
    text: '#e65100',
  },
  {
    key: 'noon',
    label: 'Обід',
    background: '#e3f2fd',
    border: '#64b5f6',
    text: '#0d47a1',
  },
  {
    key: 'evening',
    label: 'Вечір',
    background: '#ede7f6',
    border: '#9575cd',
    text: '#4527a0',
  },
];

export const reorderPulse = keyframes`
  0% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
  100% { transform: translateY(0); }
`;

const MenuContainer = styled.div`
  position: fixed;
  top: ${({ $anchor }) => `${$anchor.y}px`};
  left: ${({ $anchor }) => `${$anchor.x}px`};
  transform: translate(-50%, 8px);
  background: white;
  border: 1px solid #d0d0d0;
  border-radius: 10px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  padding: 6px;
  z-index: 20;
  min-width: 160px;
`;

const MenuList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const MenuItem = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid ${({ $border }) => $border};
  border-radius: 8px;
  background: ${({ $background }) => $background};
  color: ${({ $text }) => $text};
  cursor: pointer;
  font-size: 13px;
  transition: transform 0.12s ease, box-shadow 0.12s ease;

  &:hover,
  &:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
    outline: none;
  }
`;

const MenuHint = styled.span`
  display: block;
  padding: 4px 6px 0;
  color: #666;
  font-size: 12px;
`;

const LongPressWrapper = ({ onLongPress, children, threshold = LONG_PRESS_THRESHOLD, captureContext = false }) => {
  const timerRef = useRef(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const trigger = useCallback(
    event => {
      clear();
      if (typeof onLongPress === 'function') {
        onLongPress(event);
      }
    },
    [clear, onLongPress],
  );

  const handlePointerDown = useCallback(
    event => {
      if (typeof event?.persist === 'function') {
        event.persist();
      }
      clear();
      timerRef.current = setTimeout(() => trigger(event), threshold);
    },
    [clear, trigger, threshold],
  );

  const handleContextMenu = useCallback(
    event => {
      if (captureContext) {
        event.preventDefault();
        trigger(event);
      }
    },
    [captureContext, trigger],
  );

  const child = React.Children.only(children);

  const injectedProps = useMemo(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerUp: clear,
      onPointerLeave: clear,
      onContextMenu: event => {
        if (typeof child.props.onContextMenu === 'function') {
          child.props.onContextMenu(event);
        }
        handleContextMenu(event);
      },
    }),
    [child.props, clear, handleContextMenu, handlePointerDown],
  );

  return React.cloneElement(child, injectedProps);
};

const ColorContextMenu = ({ anchor, onSelect, onClose }) => {
  useEffect(() => {
    if (!onClose) return undefined;
    const handle = event => {
      if (!event.target.closest('[data-color-menu]')) {
        onClose();
      }
    };
    window.addEventListener('pointerdown', handle);
    return () => window.removeEventListener('pointerdown', handle);
  }, [onClose]);

  const handleSelect = option => {
    if (typeof onSelect === 'function') {
      onSelect(option);
    }
  };

  return (
    <MenuContainer data-color-menu $anchor={anchor}>
      <MenuList>
        {COLOR_OPTIONS.map(option => (
          <MenuItem
            key={option.key}
            type="button"
            $background={option.background}
            $border={option.border}
            $text={option.text}
            onClick={() => handleSelect(option)}
          >
            <span>{option.label}</span>
            <span>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <rect width="14" height="14" rx="3" fill={option.background} stroke={option.border} />
              </svg>
            </span>
          </MenuItem>
        ))}
      </MenuList>
      <MenuHint>Виберіть колір відповідно до часу прийому</MenuHint>
    </MenuContainer>
  );
};

const resolveCellVisuals = ({ status, colorKey }) => {
  if (status === 'negative') {
    return { border: '#ef5350', text: '#b71c1c', background: '#ffebee' };
  }

  const custom = COLOR_OPTIONS.find(option => option.key === colorKey && option.key !== 'none');
  if (custom) {
    return { border: custom.border, text: custom.text, background: custom.background };
  }

  if (status === 'positive') {
    return { border: '#66bb6a', text: '#1b5e20', background: '#e8f5e9' };
  }

  const reset = COLOR_OPTIONS.find(option => option.key === 'none');
  return { border: reset.border, text: reset.text, background: reset.background };
};

export { LongPressWrapper, ColorContextMenu, resolveCellVisuals, LONG_PRESS_THRESHOLD };
