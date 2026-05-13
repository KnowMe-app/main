import {
  getHeroFields,
  getProfilePhotos,
  getProfileRole,
  getProfileSections,
  getQuickFacts,
  shouldRenderField,
} from './profileLayoutConfig';

jest.mock('./smallCard/utilCalculateAge', () => ({ utilCalculateAge: () => 29 }));
jest.mock('./normalizeLocation', () => ({
  normalizeCountry: value => value,
  normalizeRegion: value => value,
}));
jest.mock('../utils/convertDriveLinkToImage', () => ({ convertDriveLinkToImage: value => value }));

describe('profileLayoutConfig', () => {
  it('builds egg donor photo, hero facts, and donor groups while hiding empty fields', () => {
    const user = {
      userRole: 'ed',
      photos: ['hero.jpg', 'gallery.jpg'],
      height: 170,
      weight: 60,
      blood: 'O+',
      eyeColor: 'Green',
      hairColor: '-',
      ownKids: '0',
      education: 'University',
      experience: 'Yes',
      emptyValue: '-',
    };

    expect(getProfileRole(user)).toBe('ed');
    expect(getProfilePhotos(user)).toEqual(['hero.jpg', 'gallery.jpg']);
    expect(getHeroFields(user, 'ed').map(field => field.key)).toEqual(['height', 'weight', 'bmi', 'blood', 'eyeColor', 'experience']);
    expect(getQuickFacts(user, 'ed')).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'ownKids', value: 'No' }),
    ]));
    expect(getProfileSections(user, 'ed').map(section => section.title)).toEqual(expect.arrayContaining(['Appearance', 'Main information', 'Donation experience']));
    expect(shouldRenderField(user.emptyValue)).toBe(false);
  });

  it('keeps intended parents layout free of donor-only physical facts when absent', () => {
    const user = {
      userRole: 'ip',
      country: 'Ukraine',
      city: 'Kyiv',
      maritalStatus: 'Married',
      programInterest: 'Egg donation',
      height: '',
      weight: '',
    };

    const quickFactKeys = getQuickFacts(user, 'ip').map(field => field.key);
    expect(quickFactKeys).toEqual(['country', 'city', 'maritalStatus', 'programInterest']);
    expect(quickFactKeys).not.toEqual(expect.arrayContaining(['height', 'weight', 'bmi']));
  });

  it('prioritizes agency-specific sections and supports profiles without photos', () => {
    const user = {
      role: 'ag',
      agencyName: 'Bright Future',
      country: 'USA',
      city: 'Austin',
      services: 'Donor matching',
      website: 'https://example.com',
      photos: [],
    };

    expect(getProfileRole(user)).toBe('ag');
    expect(getProfilePhotos(user)).toEqual([]);
    expect(getHeroFields(user, 'ag').map(field => field.key)).toEqual(['country', 'city', 'services', 'website']);
    expect(getProfileSections(user, 'ag').map(section => section.title)).toEqual(['Agency details', 'Contacts']);
  });
});
