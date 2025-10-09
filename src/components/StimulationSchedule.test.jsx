import {
  adjustItemForDate,
  buildCustomEventLabel,
  computeCustomDateAndLabel,
  deriveScheduleDisplayInfo,
  generateSchedule,
  shouldUsePregnancyToken,
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

  it('restores default visit description for visits after the first before transfer', () => {
    const baseDate = new Date(2024, 3, 1);
    const transferDate = new Date(2024, 3, 20);
    const visitThree = {
      key: 'visit3',
      date: new Date(baseDate),
      label: '7й день',
    };

    const targetDate = new Date(baseDate);
    targetDate.setDate(baseDate.getDate() + 6);

    const adjusted = adjustItemForDate(visitThree, targetDate, {
      baseDate,
      transferDate,
    });

    expect(adjusted.label).toBe('7й день Прийом');
  });
});

describe('generateSchedule', () => {
  it('adds default description to visits after the first', () => {
    const baseDate = new Date(2024, 4, 10);
    const schedule = generateSchedule(baseDate);
    const visit2 = schedule.find(item => item.key === 'visit2');
    const visit3 = schedule.find(item => item.key === 'visit3');
    const visit4 = schedule.find(item => item.key === 'visit4');

    expect(visit2.label).toContain('Прийом');
    expect(visit3.label.endsWith('Прийом')).toBe(true);
    expect(visit4.label.endsWith('Прийом')).toBe(true);
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

describe('deriveScheduleDisplayInfo', () => {
  it('hides duplicate day-only description when it matches numeric secondary label', () => {
    const date = new Date(2024, 6, 6);
    const result = deriveScheduleDisplayInfo({ date, label: '06.07 сб 2й день' });

    expect(result.secondaryLabel).toBe('2');
    expect(result.displayLabel).toBe('');
  });

  it('keeps ordinal day indicator after the first week without converting to week tokens', () => {
    const date = new Date(2024, 9, 29);
    const result = deriveScheduleDisplayInfo({ date, label: '29.10 вт 8й день' });

    expect(result.secondaryLabel).toBe('8');
    expect(result.displayLabel).not.toContain('1т1д');
  });
});

describe('shouldUsePregnancyToken', () => {
  it('returns false for events within thirty days after transfer', () => {
    const transfer = new Date(2024, 0, 10);
    const hcg = new Date(transfer);
    hcg.setDate(hcg.getDate() + 12);

    expect(shouldUsePregnancyToken(hcg, transfer)).toBe(false);
  });

  it('returns true once more than thirty days have passed after transfer', () => {
    const transfer = new Date(2024, 0, 10);
    const followUp = new Date(transfer);
    followUp.setDate(followUp.getDate() + 31);

    expect(shouldUsePregnancyToken(followUp, transfer)).toBe(true);
  });
});

