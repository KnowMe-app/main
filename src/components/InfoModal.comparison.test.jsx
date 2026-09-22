import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { InfoModal } from './InfoModal';

it('restores comparison scroll and locks/restores the page body', () => {
  const scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  document.body.style.color = 'red';
  const original = document.body.getAttribute('style');
  const comparisonScrollRef = { current: 120 };
  const content = () => <table><tbody><tr><td>Comparison</td></tr></tbody></table>;
  const { unmount } = render(<InfoModal text="compareCards" CompareCards={content} comparisonScrollRef={comparisonScrollRef} />);
  const panel = screen.getByRole('dialog', { name: 'Порівняти картки' });
  expect(panel.scrollTop).toBe(120);
  expect(getComputedStyle(panel).overflowY).toBe('auto');
  expect(document.body.style.position).toBe('fixed');
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.scroll(panel, { target: { scrollTop: 340 } });
  expect(comparisonScrollRef.current).toBe(340);
  unmount();
  expect(document.body.getAttribute('style')).toBe(original);
  expect(scrollTo).toHaveBeenCalled();
  scrollTo.mockRestore();
  document.body.removeAttribute('style');
});
