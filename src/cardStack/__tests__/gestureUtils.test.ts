import { shouldDismissCard, getOffscreenX, SWIPE_THRESHOLD_RATIO } from '../gestureUtils';

describe('gesture utilities', () => {
  const width = 400;

  test('should dismiss when translation exceeds threshold', () => {
    expect(shouldDismissCard(width * SWIPE_THRESHOLD_RATIO + 1, 0, width)).toBe(true);
  });

  test('should dismiss when velocity high', () => {
    expect(shouldDismissCard(0, 900, width)).toBe(true);
  });

  test('getOffscreenX returns correct sign', () => {
    expect(getOffscreenX('left', width)).toBeLessThan(0);
    expect(getOffscreenX('right', width)).toBeGreaterThan(0);
  });
});
