import {
  parseStimulationScheduleEntries,
  getStimulationScheduleSortInfo,
  compareStimulationScheduleSortInfo,
  sortUsersByStimulationSchedule,
} from '../stimulationScheduleSort';

describe('stimulationScheduleSort utilities', () => {
  it('parses string schedules and marks descriptive events', () => {
    const schedule = [
      '2024-07-01\tvisit1\t01.07 пн',
      '2024-07-10\tvisit2\t10.07 ср 6т2д Прийом',
      '2024-07-15\ttransfer\t15.07 пн перенос',
    ].join('\n');

    const entries = parseStimulationScheduleEntries(schedule);

    expect(entries).toHaveLength(3);
    expect(entries[0].isoDate).toBe('2024-07-01');
    expect(entries[0].hasMeaningfulDescription).toBe(false);
    expect(entries[1].isoDate).toBe('2024-07-10');
    expect(entries[1].hasMeaningfulDescription).toBe(true);
    expect(entries[2].description.toLowerCase()).toContain('перенос');
  });

  it('computes sort info with beacon and next events', () => {
    const schedule = [
      '2024-07-01\tvisit1\t01.07 пн',
      '2024-07-10\tvisit2\t10.07 ср 6т2д Прийом',
    ].join('\n');

    const info = getStimulationScheduleSortInfo(schedule, {
      today: new Date('2024-07-05T12:00:00Z'),
    });

    const entries = parseStimulationScheduleEntries(schedule);
    const beacon = entries[1];

    expect(info.beaconTimestamp).toBe(beacon.date.getTime());
    expect(info.nextTimestamp).toBe(beacon.date.getTime());
    expect(info.firstTimestamp).toBe(entries[0].date.getTime());
  });

  it('sorts users prioritising beacon events and next occurrences', () => {
    const cycleUsers = [
      {
        userId: 'b',
        stimulationSchedule: [
          '2024-07-06\tvisit1\t06.07 сб',
          '2024-07-08\tvisit2\t08.07 пн Прийом',
        ].join('\n'),
      },
      {
        userId: 'a',
        stimulationSchedule: [
          '2024-07-06\tvisit1\t06.07 сб 2й день',
          '2024-07-12\tvisit2\t12.07 пт Прийом',
        ].join('\n'),
      },
      {
        userId: 'c',
        stimulationSchedule: [
          { date: '2024-07-09', label: '09.07 вт 3й день Прийом' },
          { date: '2024-07-15', label: '15.07 пн' },
        ],
      },
    ];

    const annotated = sortUsersByStimulationSchedule(cycleUsers, {
      today: new Date('2024-07-05T00:00:00Z'),
      fallbackComparator: (left, right) =>
        (left.getInTouch || '').localeCompare(right.getInTouch || ''),
    });

    const order = annotated.map(item => item.user.userId);
    expect(order).toEqual(['a', 'b', 'c']);

    const infoA = annotated[0].sortInfo;
    const infoC = annotated[2].sortInfo;
    expect(
      compareStimulationScheduleSortInfo(infoA, infoC) < 0,
    ).toBe(true);
  });
});
