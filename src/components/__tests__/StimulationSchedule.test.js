jest.mock('../smallCard/actions', () => ({
  handleChange: jest.fn(),
  handleSubmit: jest.fn(),
}));

import { generateSchedule, serializeSchedule } from '../StimulationSchedule';

describe('StimulationSchedule serialization', () => {
  it('stores dates in yyyy-mm-dd format', () => {
    const base = new Date('2024-01-01');
    const sched = generateSchedule(base);
    const serialized = serializeSchedule(sched);
    const lines = serialized.split('\n').filter(Boolean);
    lines.forEach(line => {
      const [dateStr] = line.split(' - ');
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(dateStr).toISOString().slice(0, 10)).toBe(dateStr);
    });
  });
});
