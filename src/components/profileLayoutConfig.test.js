import {
  getHeroFields,
  getProfilePhotos,
  getProfileAge,
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

const collectKeys = fields => [...new Set(fields.flatMap(field => [field.key, ...(field.sourceKeys || [])]))];
const sectionFieldKeys = sections => sections.flatMap(section => section.fields.map(field => field.key));

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
      breastSize: 'B',
      ownKids: '0',
      education: 'University',
      experience: 'Yes',
      cSection: 'No',
      emptyValue: '-',
    };

    const hero = getHeroFields(user, 'ed');
    const quickFacts = getQuickFacts(user, 'ed', { excludeKeys: collectKeys(hero) });
    const sections = getProfileSections(user, 'ed', { excludeKeys: collectKeys([...hero, ...quickFacts]) });
    const detailKeys = sectionFieldKeys(sections);

    expect(getProfileRole(user)).toBe('ed');
    expect(getProfilePhotos(user)).toEqual(['hero.jpg', 'gallery.jpg']);
    expect(hero.map(field => field.key)).toEqual(['height', 'weight', 'bmi', 'blood', 'experience']);
    expect(hero.find(field => field.key === 'experience')?.label).toBe('Exp');
    expect(quickFacts.map(field => field.key)).toEqual([]);
    expect(sections.map(section => section.title)).toEqual(expect.arrayContaining(['Appearance', 'Main information', 'Donation experience']));
    expect(detailKeys).toEqual(expect.arrayContaining(['breastSize', 'ownKids', 'education', 'cSection']));
    expect(detailKeys).not.toEqual(expect.arrayContaining(hero.map(field => field.key)));
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

    const hero = getHeroFields(user, 'ip');
    const quickFactKeys = getQuickFacts(user, 'ip', { excludeKeys: collectKeys(hero) }).map(field => field.key);
    const detailKeys = sectionFieldKeys(getProfileSections(user, 'ip', { excludeKeys: collectKeys(hero) }));
    expect(quickFactKeys).toEqual([]);
    expect([...quickFactKeys, ...detailKeys]).not.toEqual(expect.arrayContaining(['height', 'weight', 'bmi', 'breastSize']));
  });

  it('prioritizes agency-specific sections and keeps contacts in the Contacts section only', () => {
    const user = {
      role: 'ag',
      agencyName: 'Bright Future',
      country: 'USA',
      city: 'Austin',
      services: 'Donor matching',
      website: 'https://example.com',
      telegram: '@agency',
      photos: [],
    };

    const hero = getHeroFields(user, 'ag');
    const quickFacts = getQuickFacts(user, 'ag', { excludeKeys: collectKeys(hero) });
    const sections = getProfileSections(user, 'ag', { excludeKeys: collectKeys([...hero, ...quickFacts]) });
    const agencyDetails = sections.find(section => section.title === 'Agency details');
    const contacts = sections.find(section => section.title === 'Contacts');

    expect(getProfileRole(user)).toBe('ag');
    expect(getProfilePhotos(user)).toEqual([]);
    expect(hero.map(field => field.key)).toEqual(['country', 'city', 'services']);
    expect(agencyDetails.fields.map(field => field.key)).toEqual(['agencyName']);
    expect(contacts.fields.map(field => field.key)).toEqual(['telegram', 'website']);
  });

  it('does not render expected reward anywhere in Matching layout sections', () => {
    const user = {
      role: 'ed',
      reward: '5000 EUR',
      desiredReward: '6000 EUR',
      height: 170,
      weight: 60,
      experience: 'Yes',
    };

    const hero = getHeroFields(user, 'ed');
    const quickFacts = getQuickFacts(user, 'ed', { excludeKeys: collectKeys(hero) });
    const sections = getProfileSections(user, 'ed', { excludeKeys: collectKeys([...hero, ...quickFacts]) });
    const allFields = [...hero, ...quickFacts, ...sections.flatMap(section => section.fields)];

    expect(allFields.map(field => field.key)).not.toEqual(expect.arrayContaining(['reward', 'desiredReward']));
    expect(allFields.map(field => field.label.toLowerCase())).not.toEqual(expect.arrayContaining(['expected reward', 'desired reward']));
    expect(allFields.map(field => field.value)).not.toEqual(expect.arrayContaining(['5000 EUR', '6000 EUR']));
  });

  it('prefers canonical role over stale userRole and normalizes aliases', () => {
    const user = {
      role: 'agency',
      userRole: 'ed',
      agencyName: 'Canonical Agency',
      services: 'Matching',
    };

    expect(getProfileRole(user)).toBe('ag');
    expect(getProfileSections(user).map(section => section.title)).toEqual(expect.arrayContaining(['Agency details']));
    expect(getProfileRole({ role: 'egg_donor' })).toBe('ed');
    expect(getProfileRole({ role: 'intended parents' })).toBe('ip');
    expect(getProfileRole({ role: 'sm' })).toBe('other');
  });

  it('uses the latest array value on Matching and hides fields removed with an empty latest value', () => {
    const removedBirthUser = {
      userRole: 'ed',
      birth: ['25.09.1996', ''],
      height: ['165', ''],
      weight: ['94', ''],
      blood: ['3+', ''],
      experience: ['0', ''],
      telegram: ['@old', ''],
      website: ['old.example', 'new.example'],
    };
    const updatedBirthUser = {
      userRole: 'ed',
      birth: ['25.09.1996', '26.09.1996'],
      height: ['160', '165'],
      weight: ['90', '94'],
    };

    expect(getProfileAge(removedBirthUser)).toBe('');
    expect(getHeroFields(removedBirthUser, 'ed')).toEqual([]);
    expect(getProfileSections(removedBirthUser, 'ed')
      .find(section => section.title === 'Contacts')?.fields
      .map(field => [field.key, field.value])).toEqual([['website', 'new.example']]);
    expect(shouldRenderField(['25.09.1996', ''])).toBe(false);
    expect(getProfileAge(updatedBirthUser)).toBe('29');
    expect(getHeroFields(updatedBirthUser, 'ed').map(field => [field.key, field.value])).toEqual([
      ['height', '165'],
      ['weight', '94'],
      ['bmi', '35'],
    ]);
  });

});
