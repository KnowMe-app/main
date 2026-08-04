import { sanitizeNewUsersPayload, sanitizeTechnicalPayload } from './formFields';

describe('profile payload sanitizers', () => {
  it.each([
    ['users', sanitizeTechnicalPayload],
    ['newUsers', sanitizeNewUsersPayload],
  ])('keeps reaction metadata local for %s payloads', (_collection, sanitizePayload) => {
    expect(sanitizePayload({
      userId: 'profile-1',
      name: 'Profile',
      _reactionType: 'Like/Dislike',
    })).toEqual({
      userId: 'profile-1',
      name: 'Profile',
    });
  });
});
