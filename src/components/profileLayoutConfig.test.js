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
    expect(hero.map(field => field.key)).toEqual(['height', 'weight', 'bmi', 'blood', 'eyeColor', 'experience']);
    expect(quickFacts.map(field => field.key)).toEqual([]);
    expect(sections.map(section => section.title)).toEqual(expect.arrayContaining(['Appearance', 'Main information', 'Donation experience']));
    expect(detailKeys).toEqual(expect.arrayContaining(['breastSize', 'ownKids', 'education', 'cSection']));
    expect(detailKeys).not.toEqual(expect.arrayContaining(hero.map(field => field.key)));
    expect(shouldRenderField(user.emptyValue)).toBe(false);
  });

  it('removes expected reward from matching layout while preserving donor secondary fields', () => {
    const user = {
      userRole: 'ed',
      height: 170,
      weight: 60,
      reward: '5000',
      desiredReward: '6000',
      breastSize: 'C',
      clothingSize: 'M',
      shoeSize: '38',
      glasses: 'No',
      chin: 'Soft',
      lipsShape: 'Full',
      noseShape: 'Straight',
      cSection: 'No',
    };

    const hero = getHeroFields(user, 'ed');
    const quickFacts = getQuickFacts(user, 'ed', { excludeKeys: collectKeys(hero) });
    const sections = getProfileSections(user, 'ed', { excludeKeys: collectKeys([...hero, ...quickFacts]) });
    const detailKeys = sectionFieldKeys(sections);
    const allKeys = [...hero, ...quickFacts, ...sections.flatMap(section => section.fields)].map(field => field.key);

    expect(allKeys).not.toEqual(expect.arrayContaining(['reward', 'desiredReward']));
    expect(detailKeys).toEqual(expect.arrayContaining(['breastSize', 'clothingSize', 'shoeSize', 'glasses', 'chin', 'cSection']));
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
});
