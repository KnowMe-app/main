import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import usePhotoSwipe from './usePhotoSwipe';
import PhotoSwipeStage from './PhotoSwipeStage';

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

  it('фото їде за пальцем, а відпущене доїжджає переходом з двох шарів', () => {
    const StageHarness = () => {
      const swipe = usePhotoSwipe({ photos: ['a', 'b'], complete: true });
      return (
        <div data-testid="box" {...swipe.handlers}>
          <PhotoSwipeStage swipe={swipe} photo={swipe.current} />
        </div>
      );
    };
    render(<StageHarness />);
    const box = screen.getByTestId('box');
    const stage = screen.getByTestId('photo-swipe-stage');
    const layers = () => screen.queryAllByTestId('photo-layer');
    const srcs = () => layers().map(img => img.getAttribute('src'));

    expect(srcs()).toEqual(['a']);
    fireEvent.touchStart(box, { touches: [{ clientX: 200, clientY: 10 }] });
    fireEvent.touchMove(box, { touches: [{ clientX: 170, clientY: 11 }] });
    // Під час жесту видно сусіда, а зміщення лежить у змінній сцени.
    expect(stage.style.getPropertyValue('--photo-drag')).toBe('-30px');
    expect(srcs()).toContain('b');

    fireEvent.touchEnd(box, { changedTouches: [{ clientX: 100, clientY: 12 }] });
    // Старий знімок виїжджає, новий заїжджає — обидва в DOM, поки йде анімація.
    expect(srcs()).toEqual(['a', 'b']);
    expect(stage.style.getPropertyValue('--photo-start')).toBe('-30px');

    fireEvent.animationEnd(layers().find(img => img.getAttribute('src') === 'b'));
    expect(srcs()).toEqual(['b']);
  });

  it('короткий швидкий змах гортає й без повного порогу', () => {
    render(<Harness photos={['a', 'b']} complete onRequestPhotos={jest.fn()} />);
    const node = screen.getByTestId('photo');
    fireEvent.touchStart(node, { touches: [{ clientX: 200, clientY: 10 }] });
    fireEvent.touchMove(node, { touches: [{ clientX: 190, clientY: 10 }] });
    fireEvent.touchEnd(node, { changedTouches: [{ clientX: 175, clientY: 10 }] });
    expect(node.textContent).toBe('b');
  });

  it('недотягнутий свайп лишає те саме фото', () => {
    render(<Harness photos={['a', 'b']} complete onRequestPhotos={jest.fn()} />);
    const node = screen.getByTestId('photo');
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    fireEvent.touchStart(node, { touches: [{ clientX: 200, clientY: 10 }] });
    fireEvent.touchMove(node, { touches: [{ clientX: 180, clientY: 10 }] });
    now.mockReturnValue(1600);
    fireEvent.touchEnd(node, { changedTouches: [{ clientX: 175, clientY: 10 }] });
    now.mockRestore();
    expect(node.textContent).toBe('a');
  });
});
