const { TextDecoder, TextEncoder } = require('util');

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}

jest.mock('components/smallCard/actions', () => ({
  handleChange: jest.fn(),
  handleSubmit: jest.fn(),
}));

const {
  mergeScheduleWithClipboardData,
  parseStimulationEvents,
} = require('components/MedicationSchedule');

describe('mergeScheduleWithClipboardData', () => {
  it('preserves existing base medication doses when clipboard starts later', () => {
    const baseSchedule = {
      startDate: '2024-01-01',
      medicationOrder: ['progynova'],
      medications: {
        progynova: {
          issued: 21,
          displayValue: '',
          label: 'Прогінова',
          short: 'PG',
          plan: 'progynova',
          startDate: '2024-01-01',
        },
      },
      rows: [
        { date: '2024-01-01', values: { progynova: 1 } },
        { date: '2024-01-02', values: { progynova: 1 } },
        { date: '2024-01-03', values: { progynova: 2 } },
      ],
    };

    const clipboardSchedule = {
      startDate: '2024-01-03',
      medicationOrder: ['custom-med'],
      medications: {
        'custom-med': {
          issued: 6,
          displayValue: '',
          label: 'Custom med',
          short: 'CM',
          plan: 'custom',
          startDate: '2024-01-03',
        },
      },
      rows: [
        { date: '2024-01-03', values: { 'custom-med': 2 } },
        { date: '2024-01-04', values: { 'custom-med': 2 } },
      ],
    };

    const merged = mergeScheduleWithClipboardData(baseSchedule, clipboardSchedule);

    expect(merged.startDate).toBe('2024-01-01');
    expect(merged.medicationOrder).toEqual(['progynova', 'custom-med']);

    expect(merged.rows[0]).toMatchObject({
      date: '2024-01-01',
      values: { progynova: 1, 'custom-med': '' },
    });

    expect(merged.rows[1]).toMatchObject({
      date: '2024-01-02',
      values: { progynova: 1, 'custom-med': '' },
    });

    expect(merged.rows[2]).toMatchObject({
      date: '2024-01-03',
      values: { progynova: 2, 'custom-med': 2 },
    });

    expect(merged.rows[3]).toMatchObject({
      date: '2024-01-04',
      values: { progynova: '', 'custom-med': 2 },
    });

    expect(merged.medications.progynova.plan).toBe('progynova');
    expect(merged.medications['custom-med']).toMatchObject({
      label: 'Custom med',
      issued: 6,
    });
  });
});

describe('parseStimulationEvents', () => {
  it('omits stimulation entries that only include prefixes', () => {
    const events = parseStimulationEvents(
      [
        { date: '2024-05-01', label: '10т2д' },
        { date: '2024-05-02', label: '19й день' },
        { date: '2024-05-03', label: '10т2д контроль УЗД' },
        { date: '2024-05-04', label: 'Контроль крові' },
      ],
      '2024-05-01'
    );

    const descriptions = events.map(event => event.description);

    expect(descriptions).toEqual(['10т2д • контроль УЗД', 'Контроль крові']);
  });
});
