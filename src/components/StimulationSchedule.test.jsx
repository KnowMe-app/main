jest.mock('components/smallCard/actions', () => ({
  handleChange: jest.fn(),
  handleSubmit: jest.fn(),
}));

import { adjustItemForDate } from 'components/StimulationSchedule';

describe('adjustItemForDate', () => {
  it('preserves transfer day numbering when recalculating on the transfer date', () => {
    const baseDate = new Date(2023, 5, 1);
    const transferDate = new Date(2023, 5, 20, 14, 30);

    const transferItem = {
      key: 'transfer',
      date: new Date(transferDate),
      label: '20й день (перенос)',
    };

    const adjusted = adjustItemForDate(transferItem, transferDate, {
      baseDate,
      transferDate,
    });

    expect(adjusted.label).toBe('20й день (перенос)');
  });
});
