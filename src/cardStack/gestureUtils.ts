export const SWIPE_THRESHOLD_RATIO = 0.25;

export function shouldDismissCard(
  translationX: number,
  velocityX: number,
  screenWidth: number
): boolean {
  const threshold = screenWidth * SWIPE_THRESHOLD_RATIO;
  const movedEnough = Math.abs(translationX) > threshold;
  const fastEnough = Math.abs(velocityX) > 800;
  return movedEnough || fastEnough;
}

export function getOffscreenX(
  direction: 'left' | 'right',
  screenWidth: number
): number {
  const factor = direction === 'left' ? -1 : 1;
  return factor * screenWidth * 1.2;
}
