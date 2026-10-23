import React from 'react';
import { render, screen } from '@testing-library/react';
import { ScreenErrorBoundary, isChunkLoadError } from './ScreenErrorBoundary';

const Throw = ({ error }) => {
  throw error;
};

const chunkError = () => {
  const error = new Error('Loading chunk 931 failed.\n(error: https://knowme-app.github.io/main/static/js/931.45a2e14e.chunk.js)');
  error.name = 'ChunkLoadError';
  return error;
};

// Екрани вантажаться окремими файлами, і вкладка, відкрита до деплою, просить
// файл попередньої збірки, якого вже немає. Лікує це перезавантаження —
// рівно один раз, а не по колу.
describe('ScreenErrorBoundary', () => {
  const originalLocation = window.location;
  let reload;

  beforeEach(() => {
    reload = jest.fn();
    delete window.location;
    window.location = { ...originalLocation, reload };
    sessionStorage.clear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    window.location = originalLocation;
    console.error.mockRestore();
  });

  it('впізнає збій завантаження файлу екрана', () => {
    expect(isChunkLoadError(chunkError())).toBe(true);
    expect(isChunkLoadError(new Error('Loading CSS chunk 12 failed'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });

  it('перезавантажує сторінку на збої файлу екрана, але не двічі поспіль', () => {
    const { unmount } = render(<ScreenErrorBoundary resetKey="/a"><Throw error={chunkError()} /></ScreenErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
    unmount();

    render(<ScreenErrorBoundary resetKey="/b"><Throw error={chunkError()} /></ScreenErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('звичайну помилку екрана показує, а не перезавантажує', () => {
    render(<ScreenErrorBoundary resetKey="/a"><Throw error={new Error('boom')} /></ScreenErrorBoundary>);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
