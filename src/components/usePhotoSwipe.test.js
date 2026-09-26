import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import usePhotoSwipe from './usePhotoSwipe';

const Harness = ({ photos, complete, onRequestPhotos, onParentTouch, onParentClick }) => {
  const swipe = usePhotoSwipe({ photos, complete, onRequestPhotos });
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div onTouchStart={onParentTouch} onClick={onParentClick}>
      <div data-testid="photo" {...swipe.handlers}>{swipe.current}</div>
      <span data-testid="count">{`${swipe.index + 1}/${swipe.total}`}</span>
    </div>
  );
};

const swipeLeft = node => {
  fireEvent.touchStart(node, { touches: [{ clientX: 200, clientY: 10 }] });
  fireEvent.touchEnd(node, { changedTouches: [{ clientX: 100, clientY: 12 }] });
  fireEvent.click(node);
};

describe('usePhotoSwipe', () => {
  it('на перший свайп просить перелік фото й гортає, щойно він приїхав', () => {
    const onRequestPhotos = jest.fn();
    const onParentTouch = jest.fn();
    const onParentClick = jest.fn();
    const { rerender } = render(
      <Harness
        photos={['avatar']}
        onRequestPhotos={onRequestPhotos}
        onParentTouch={onParentTouch}
        onParentClick={onParentClick}
      />,
    );

    swipeLeft(screen.getByTestId('photo'));
    expect(onRequestPhotos).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('photo').textContent).toBe('avatar');
    // Жест належить фото: реакція рядка й відкриття картки його не бачать.
    expect(onParentTouch).not.toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();

    rerender(
      <Harness
        photos={['avatar', 'second', 'third']}
        complete
        onRequestPhotos={onRequestPhotos}
        onParentTouch={onParentTouch}
        onParentClick={onParentClick}
      />,
    );
    expect(screen.getByTestId('photo').textContent).toBe('second');
    expect(screen.getByTestId('count').textContent).toBe('2/3');

    swipeLeft(screen.getByTestId('photo'));
    expect(screen.getByTestId('photo').textContent).toBe('third');
    expect(onRequestPhotos).toHaveBeenCalledTimes(1);
  });

  it('картка з одним фото й повним переліком свайп не перехоплює', () => {
    const onParentTouch = jest.fn();
    render(<Harness photos={['only']} complete onRequestPhotos={jest.fn()} onParentTouch={onParentTouch} />);

    fireEvent.touchStart(screen.getByTestId('photo'), { touches: [{ clientX: 200, clientY: 10 }] });
    expect(onParentTouch).toHaveBeenCalled();
  });
});
