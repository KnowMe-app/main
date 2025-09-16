import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import StimulationSchedule from '../StimulationSchedule';

jest.mock('../smallCard/actions', () => ({
  handleChange: jest.fn(),
  handleSubmit: jest.fn(),
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const formatServerDate = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

describe('StimulationSchedule', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  const renderComponent = async userData => {
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.render(<StimulationSchedule userData={userData} setState={jest.fn()} />);
    });
  };

  it('renders schedule for pregnant users', async () => {
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    const userData = {
      userId: 'test-user',
      lastCycle: formatServerDate(base),
      cycleStatus: 'pregnant',
    };

    await renderComponent(userData);

    expect(container.textContent).toContain('1й день');
  });

  it('renders schedule when lastDelivery implies pregnancy', async () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const lastCycle = new Date(today);
    lastCycle.setDate(today.getDate() - 28);
    const futureDelivery = new Date(today);
    futureDelivery.setDate(today.getDate() + 14);

    const userData = {
      userId: 'future-delivery',
      lastCycle: formatServerDate(lastCycle),
      lastDelivery: formatServerDate(futureDelivery),
    };

    await renderComponent(userData);

    expect(container.textContent).toContain('1й день');
  });
});
