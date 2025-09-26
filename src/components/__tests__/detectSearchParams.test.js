jest.mock('../../utils/parseUkTrigger', () => ({
  parseUkTriggerQuery: jest.fn(() => null),
}));

import { detectSearchParams } from '../../components/SearchBar';
import { parseUkTriggerQuery } from '../../utils/parseUkTrigger';

describe('detectSearchParams', () => {
  beforeEach(() => {
    parseUkTriggerQuery.mockReturnValue(null);
  });

  it('falls back to other when no platform is detected', () => {
    expect(detectSearchParams('УК Агент Надія')).toEqual({
      key: 'other',
      value: 'УК Агент Надія',
    });
  });

  it('detects VK urls with identifiers', () => {
    expect(detectSearchParams('https://vk.com/id123456')).toEqual({
      key: 'vk',
      value: 'id123456',
    });
  });

  it('detects VK identifiers without domain', () => {
    expect(detectSearchParams('club987654')).toEqual({
      key: 'vk',
      value: 'club987654',
    });
  });
});
