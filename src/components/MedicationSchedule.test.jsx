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
  applyDefaultDistribution,
  mergeScheduleWithClipboardData,
  buildStimulationEventLookup,
  cleanMedicationEventComment,
  evaluateIssuedInput,
} = require('components/MedicationSchedule');

const buildRows = (count, medicationKey) =>
  Array.from({ length: count }, (_, index) => ({
    date: `2024-01-${String(index + 1).padStart(2, '0')}`,
    values: { [medicationKey]: '' },
  }));

describe('applyDefaultDistribution (progynova)', () => {
  it('distributes issued tablets using the updated default ramp', () => {
    const medicationKey = 'progynova';
    const rows = buildRows(15, medicationKey);
    const schedule = {
      startDate: '2024-01-01',
      medicationOrder: [medicationKey],
      medications: {
        [medicationKey]: {
          issued: 21,
          plan: 'progynova',
          startDate: '2024-01-01',
        },
      },
    };

    const distributed = applyDefaultDistribution(rows, schedule);
    const doses = distributed.map(row => row.values[medicationKey]);

    expect(doses.slice(0, 11)).toEqual(['', 1, 1, 2, 2, 3, 3, 3, 3, 3, '']);
    expect(doses.slice(11)).toEqual(['', '', '', '']);
    const totalUsed = doses.reduce((sum, value) => sum + (Number(value) || 0), 0);
    expect(totalUsed).toBe(21);
  });

  it('keeps the ten week taper with a gradual decrease to one tablet', () => {
    const medicationKey = 'progynova';
    const rows = buildRows(90, medicationKey);
    const schedule = {
      startDate: '2024-01-01',
      medicationOrder: [medicationKey],
      medications: {
        [medicationKey]: {
          issued: 500,
          plan: 'progynova',
          startDate: '2024-01-01',
        },
      },
    };

    const distributed = applyDefaultDistribution(rows, schedule);
    const doseOnDay = dayNumber => distributed[dayNumber - 1].values[medicationKey];

    expect(doseOnDay(70)).toBe(3);
    expect(doseOnDay(71)).toBe(2);
    expect(doseOnDay(72)).toBe(2);
    expect(doseOnDay(75)).toBe(2);
    expect(doseOnDay(76)).toBe(1);
    expect(doseOnDay(80)).toBe(1);
    expect(doseOnDay(81)).toBe('');
  });

  it('reduces dosage stepwise after pregnancy confirmation', () => {
    const medicationKey = 'progynova';
    const rows = buildRows(120, medicationKey);
    const schedule = {
      startDate: '2024-01-01',
      medicationOrder: [medicationKey],
      medications: {
        [medicationKey]: {
          issued: 500,
          plan: 'progynova',
          startDate: '2024-01-01',
        },
      },
      pregnancyConfirmationDay: 20,
    };

    const distributed = applyDefaultDistribution(rows, schedule);
    const doseOnDay = dayNumber => distributed[dayNumber - 1].values[medicationKey];

    expect(doseOnDay(20)).toBe(3);
    expect(doseOnDay(21)).toBe(2);
    expect(doseOnDay(25)).toBe(2);
    expect(doseOnDay(26)).toBe(1);
    expect(doseOnDay(30)).toBe(1);
    expect(doseOnDay(31)).toBe('');
  });
});

describe('applyDefaultDistribution (metypred)', () => {
  it('tapers to half a tablet for five days after pregnancy confirmation', () => {
    const medicationKey = 'metypred';
    const rows = buildRows(40, medicationKey);
    const schedule = {
      startDate: '2024-01-01',
      medicationOrder: [medicationKey],
      medications: {
        [medicationKey]: {
          issued: 60,
          plan: 'metypred',
          startDate: '2024-01-01',
        },
      },
      pregnancyConfirmationDay: 10,
    };

    const distributed = applyDefaultDistribution(rows, schedule);
    const doseOnDay = dayNumber => distributed[dayNumber - 1].values[medicationKey];

    expect(doseOnDay(10)).toBe(1);
    expect(doseOnDay(11)).toBe(0.5);
    expect(doseOnDay(15)).toBe(0.5);
    expect(doseOnDay(16)).toBe('');
    expect(doseOnDay(25)).toBe('');
  });
});

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

describe('buildStimulationEventLookup', () => {
  it('uses generated defaults when stimulation schedule is missing', () => {
    const baseDate = '2024-02-05';

    const lookup = buildStimulationEventLookup(undefined, baseDate, {
      fallbackBaseDate: baseDate,
    });

    expect(lookup.events.length).toBeGreaterThan(0);

    const [firstEvent] = lookup.events;

    const comment = cleanMedicationEventComment(firstEvent);
    expect(comment).toBeTruthy();
  });
});

describe('cleanMedicationEventComment', () => {
  it('removes numeric day prefixes with "й день" wording', () => {
    const event = {
      labelValue: '24й день Прийом',
      secondaryLabel: '24',
    };

    expect(cleanMedicationEventComment(event)).toBe('Прийом');
  });

  it('removes numeric day prefixes with hyphenated wording', () => {
    const event = {
      labelValue: '12-й день контроль',
      secondaryLabel: '12',
    };

    expect(cleanMedicationEventComment(event)).toBe('контроль');
  });

  it('keeps existing behaviour for week/day tokens', () => {
    const event = {
      labelValue: '8т6д УЗД',
      secondaryLabel: '8т6д',
    };

    expect(cleanMedicationEventComment(event)).toBe('УЗД');
  });
});

describe('evaluateIssuedInput', () => {
  it('allows clearing the issued value without restoring the previous number', () => {
    const result = evaluateIssuedInput('', 120);

    expect(result).toEqual({ issued: '', displayValue: '' });
  });

  it('treats whitespace-only values as empty input', () => {
    const result = evaluateIssuedInput('   ', 75);

    expect(result).toEqual({ issued: '', displayValue: '' });
  });
});

