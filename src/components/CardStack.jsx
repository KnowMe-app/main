import React, { useState, useRef } from 'react';
import styled from 'styled-components';

const SWIPE_THRESHOLD = 0.25 * window.innerWidth;

const Container = styled.div`
  position: relative;
  width: 90%;
  max-width: 400px;
  height: 60vh;
  margin: 0 auto;
`;

const BaseCard = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  background-size: cover;
  background-position: center;
  background-color: #fff;
  will-change: transform;
`;

const StackedCard = styled(BaseCard)`
  transform: ${({ rotate }) => `rotate(${rotate}deg)`};
  transition: transform 0.3s ease;
`;

const TopCardStyled = styled(BaseCard)`
  cursor: grab;
  touch-action: none;
`;

const DescWrapper = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  padding: 20px;
  color: #333;
`;

function DescriptionCard({ user }) {
  return (
    <DescWrapper>
      <div>
        {`${user.name || ''} ${user.surname || ''}`.trim()}
        {user.age ? `, ${user.age}` : ''}
      </div>
      {user.city && <div>{user.city}</div>}
    </DescWrapper>
  );
}

function TopCard({ user, onSwipe, setSwiping }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const start = useRef(null);
  const time = useRef(0);

  const handlePointerDown = e => {
    e.preventDefault();
    start.current = { x: e.clientX, y: e.clientY };
    time.current = Date.now();
    setDragging(true);
    setSwiping(true);
  };

  const handlePointerMove = e => {
    if (!dragging) return;
    setPos({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
  };

  const handleEnd = e => {
    if (!dragging) return;
    const dx = pos.x;
    const dt = Date.now() - time.current;
    const velocityX = dx / dt * 1000;
    let dir = null;
    if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(velocityX) > 800) {
      dir = dx > 0 ? 'right' : 'left';
      const finalX = dir === 'right' ? window.innerWidth * 1.2 : -window.innerWidth * 1.2;
      setPos({ x: finalX, y: pos.y });
      setTimeout(() => onSwipe(dir), 300);
    } else {
      setPos({ x: 0, y: 0 });
    }
    setDragging(false);
    setSwiping(false);
  };

  const transform = `translate(${pos.x}px, ${pos.y}px) rotate(${pos.x / 15}deg)`;
  const transition = dragging ? 'none' : 'transform 0.3s ease-out';
  const photo = user.photos && user.photos[0];

  return (
    <TopCardStyled
      style={{ backgroundImage: photo ? `url(${photo})` : undefined, transform, transition }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handleEnd}
      onPointerLeave={handleEnd}
      onPointerCancel={handleEnd}
    >
      {!photo && <DescriptionCard user={user} />}
    </TopCardStyled>
  );
}

export function CardStack({ users }) {
  const [index, setIndex] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const handleSwipe = () => setIndex(i => i + 1);

  const visible = users.slice(index, index + 3);

  return (
    <Container>
      {visible[2] && (
        <StackedCard
          rotate={-2}
          style={{ backgroundImage: visible[2].photos && visible[2].photos[0] ? `url(${visible[2].photos[0]})` : undefined }}
        >
          {(!visible[2].photos || !visible[2].photos[0]) && <DescriptionCard user={visible[2]} />}
        </StackedCard>
      )}
      {visible[1] && (
        <StackedCard
          rotate={swiping ? 0 : 2}
          style={{ backgroundImage: visible[1].photos && visible[1].photos[0] ? `url(${visible[1].photos[0]})` : undefined }}
        >
          {(!visible[1].photos || !visible[1].photos[0]) && <DescriptionCard user={visible[1]} />}
        </StackedCard>
      )}
      {visible[0] && (
        <TopCard user={visible[0]} onSwipe={handleSwipe} setSwiping={setSwiping} />
      )}
    </Container>
  );
}

