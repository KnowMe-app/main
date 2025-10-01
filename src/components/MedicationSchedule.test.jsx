jest.mock('./StimulationSchedule', () => ({
  deriveScheduleDisplayInfo: jest.fn(),
  formatWeeksDaysToken: jest.fn(),
}));

import { normalizeRows } from 'components/MedicationSchedule';

describe('normalizeRows', () => {
  it('restores default distribution for base medications when only Injesta values remain', () => {
    const schedule = {
      startDate: '2024-01-01',
      medicationOrder: ['progynova', 'aspirin', 'injesta'],
      medications: {
        progynova: { issued: 21, plan: 'progynova' },
        aspirin: { issued: 14, plan: 'aspirin' },
        injesta: { issued: 40, plan: 'injesta' },
      },
    };

    const defaultRows = normalizeRows([], schedule.startDate, schedule);

    const sanitizedRows = defaultRows.map(row => ({
      date: row.date,
      values: { injesta: row.values?.injesta },
    }));

    const normalizedRows = normalizeRows(sanitizedRows, schedule.startDate, schedule);

    for (let index = 0; index < 60; index += 1) {
      expect(normalizedRows[index].values.progynova).toBe(defaultRows[index].values.progynova);
      expect(normalizedRows[index].values.aspirin).toBe(defaultRows[index].values.aspirin);
      expect(normalizedRows[index].values.injesta).toBe(sanitizedRows[index].values.injesta);
    }
  });
});
