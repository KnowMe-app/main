// Insert-variable picker (spec: "поруч з курсивом кнопку... модальне вікно в якому можна обрати
// змінні"): grouped one group per party role (see VARIABLE_PICKER_GROUPS in documentsCatalogUtils
// for the current list - husband/wife/shared/surrogate mother/representative/clinic-by-kind).
// Every item shows its resolved final-format value ("дані відображай
// в фінальному форматі") - the technical {{path}} only surfaces on a long press/hold ("при довгому
// тапі відображай технічні дані"), then a tap inserts it at the field's captured cursor position.
import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { buildVariablePickerGroups } from './documentsCatalogUtils';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(20, 16, 12, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
  box-sizing: border-box;
`;

const Card = styled.div`
  background: var(--km-card);
  border: 1px solid var(--km-border);
  border-radius: 12px;
  width: min(92vw, 420px);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--km-border);
  flex: 0 0 auto;
`;

const HeadTitle = styled.div`
  font-size: 13px;
  font-weight: 700;
`;

const CloseButton = styled.button`
  border: none;
  background: transparent;
  color: var(--km-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 4px;

  &:hover {
    color: var(--km-text);
  }
`;

// The only element that actually scrolls - overscroll-behavior stops a scroll that reaches this
// list's own top/bottom edge from chaining onto the page behind the overlay (the body-scroll-lock
// effect below is the other half of that: it covers the case where the pointer starts outside the
// list, e.g. a swipe on the overlay's own padding).
const Body = styled.div`
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px;
`;

const GroupLabel = styled.div`
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--km-muted);
  padding: 8px 6px 2px;
`;

const EmptyHint = styled.div`
  font-size: 11.5px;
  color: var(--km-muted);
  padding: 2px 6px 6px;
`;

const Item = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 6px 6px;
  font-size: 12.5px;
  color: var(--km-text);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;

  &:hover {
    background: var(--km-accent-light);
  }
`;

const ItemPath = styled.span`
  font-family: monospace;
  color: var(--km-accent);
`;

const LONG_PRESS_MS = 450;

const VariablePickerModal = ({ context, onPick, onClose }) => {
  const [revealedPath, setRevealedPath] = useState(null);
  const pressTimerRef = useRef(null);

  // Locks the page behind the overlay - a touch/wheel that starts outside the list (or scrolls
  // past its edge, see Body's overscroll-behavior above) must never move the page underneath.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => () => clearTimeout(pressTimerRef.current), []);

  const startPress = path => () => {
    clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => setRevealedPath(path), LONG_PRESS_MS);
  };
  const endPress = () => {
    clearTimeout(pressTimerRef.current);
    setRevealedPath(null);
  };

  const groups = buildVariablePickerGroups(context);

  return (
    <Overlay onClick={onClose}>
      <Card onClick={event => event.stopPropagation()}>
        <Head>
          <HeadTitle>Вставити змінну</HeadTitle>
          <CloseButton type="button" onClick={onClose} aria-label="Закрити">×</CloseButton>
        </Head>
        <Body>
          {groups.map(group => (
            <div key={group.label}>
              <GroupLabel>{group.label}</GroupLabel>
              {group.items.length ? group.items.map(item => (
                <Item
                  key={item.path}
                  type="button"
                  onMouseDown={startPress(item.path)}
                  onMouseUp={endPress}
                  onMouseLeave={endPress}
                  onTouchStart={startPress(item.path)}
                  onTouchEnd={endPress}
                  onContextMenu={event => event.preventDefault()}
                  onClick={() => onPick(item.path)}
                  title={item.path}
                >
                  {revealedPath === item.path ? <ItemPath>{item.path}</ItemPath> : item.value}
                </Item>
              )) : <EmptyHint>{context ? 'Немає даних' : 'Оберіть кейс, щоб побачити значення'}</EmptyHint>}
            </div>
          ))}
        </Body>
      </Card>
    </Overlay>
  );
};

export default VariablePickerModal;
