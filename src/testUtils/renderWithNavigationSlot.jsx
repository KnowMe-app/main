import React from 'react';
import { render } from '@testing-library/react';
import { PrimaryNavigationSlotProvider, usePrimaryNavigationSlotState } from '../components/PrimaryNavigationSlot';

/*
 * Стрілка «назад», меню й підпис вкладки живуть у рядку спільної навігації
 * (`PrimaryNavigation`), а не на сторінці. Сюїти, що рендерять саму сторінку,
 * бачать їх через цей зонд — без роутера й `NavLink`, яких ці сюїти не мають.
 */
const NavigationSlotProbe = () => {
  const slot = usePrimaryNavigationSlotState();
  return (
    <div data-testid="navigation-slot" data-workspace={slot?.workspaceLabel || ''}>
      {slot?.onBack && <button type="button" aria-label="Назад" onClick={slot.onBack} />}
    </div>
  );
};

export const renderWithNavigationSlot = ui => render(
  <PrimaryNavigationSlotProvider>
    <NavigationSlotProbe />
    {ui}
  </PrimaryNavigationSlotProvider>,
);

export default renderWithNavigationSlot;
