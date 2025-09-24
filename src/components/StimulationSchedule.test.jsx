import { adjustItemForDate, splitCustomEventEntries } from 'components/StimulationSchedule';

jest.mock('components/smallCard/actions', () => ({
  handleChange: jest.fn(),
  handleSubmit: jest.fn(),
}));

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

describe('splitCustomEventEntries', () => {
  it('splits multi-line input into separate entries', () => {
    const input = '13.01 прийом\n16.01 міс\n\n22.01 прийом';
    expect(splitCustomEventEntries(input)).toEqual([
      '13.01 прийом',
      '16.01 міс',
      '22.01 прийом',
    ]);
  });

  it('splits single-line input with multiple dates', () => {
    const input =
      '13.01 прийом на 21й день. Вкололи диф 16.01 міс 22.01 прийом. Анна теж ок.';
    expect(splitCustomEventEntries(input)).toEqual([
      '13.01 прийом на 21й день. Вкололи диф',
      '16.01 міс',
      '22.01 прийом. Анна теж ок.',
    ]);
  });
});
