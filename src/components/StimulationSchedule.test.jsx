import {
  adjustItemForDate,
  buildCustomEventLabel,
  computeCustomDateAndLabel,
  splitCustomEventEntries,
} from 'components/StimulationSchedule';

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
      label: '20й день Перенос',
    };

    const adjusted = adjustItemForDate(transferItem, transferDate, {
      baseDate,
      transferDate,
    });

    expect(adjusted.label).toBe('20й день Перенос');
  });

  it('keeps week-day prefix for distant base-relative custom events without transfer', () => {
    const baseDate = new Date(2024, 0, 1);
    const distant = new Date(baseDate);
    distant.setDate(distant.getDate() + 21 * 7 + 5);

    const customItem = {
      key: 'ap-custom-note',
      date: new Date(distant),
      label: '21т6д контроль',
    };

    const adjusted = adjustItemForDate(customItem, distant, {
      baseDate,
      transferDate: null,
    });

    expect(adjusted.label).toBe('21т6д контроль');
  });
});

describe('buildCustomEventLabel', () => {
  it('adds day prefix for custom events between stimulation start and transfer', () => {
    const baseDate = new Date(2024, 0, 10);
    const transferDate = new Date(2024, 0, 18);
    const customDate = new Date(2024, 0, 15);

    const label = buildCustomEventLabel(customDate, baseDate, transferDate, 'контроль');

    expect(label).toBe('6й день контроль');
  });
});

describe('computeCustomDateAndLabel', () => {
  it('prefers pre-cycle base for custom events before the main stimulation visit 1', () => {
    const visitOne = new Date(2025, 0, 16);
    const preCycleBase = new Date(2024, 11, 24);

    const result = computeCustomDateAndLabel(
      '28.12.2024 міс',
      visitOne,
      visitOne,
      null,
      preCycleBase,
    );

    expect(result.label).toBe('5й день міс');
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

