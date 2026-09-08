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
  it('останні пологи стоять у смузі давністю, а не датою', () => {
    // Точний день пологів — подія з життя людини, і в картці, відкритій усім,
    // йому не місце. Питання читача — скільки минуло.
    const born = new Date();
    born.setMonth(born.getMonth() - 14);
    const iso = `${born.getFullYear()}-${String(born.getMonth() + 1).padStart(2, '0')}-${String(born.getDate()).padStart(2, '0')}`;
    const hero = getHeroFields({ userRole: 'ed', ownKids: '2', lastDelivery: iso }, 'ed');
    const cell = hero.find(field => field.key === 'lastDelivery');

    expect(cell?.label).toBe('Since birth');
    expect(cell?.value).toBe('14 mo');
    expect(cell?.value).not.toMatch(/\d{2}\.\d{2}\.\d{2}/);
  });

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
    // Пологи, останні й кесарів стоять у смузі показників поруч із тілом:
    // для участі в програмі вони важать не менше за зріст та ІМТ, а лежали
    // рядками в «Основному», де їх доводилось вишукувати.
    expect(hero.map(field => field.key)).toEqual(['height', 'weight', 'bmi', 'blood', 'ownKids', 'cSection', 'experience']);
    expect(hero.find(field => field.key === 'experience')?.label).toBe('Donations');
    // `ownKids` у формі — це «Кількість пологів», тож число лишається числом:
    // «є / немає» ховало і його, і сам сенс поля. Підпис теж каже саме про
    // пологи: «Births» читалось як «діти», яких це поле не рахує.
    expect(hero.find(field => field.key === 'ownKids')?.label).toBe('Deliveries');
    expect(quickFacts.map(field => field.key)).toEqual([]);
    // «Donation experience» тут більше не збирається: досвід донацій і кесарів
    // переїхали у смугу показників, а решта полів секції в цій анкеті порожня —
    // і порожня секція не малюється.
    expect(sections.map(section => section.title)).toEqual(expect.arrayContaining(['Appearance', 'Main information']));
    expect(sections.map(section => section.title)).not.toContain('Donation experience');
    expect(detailKeys).toEqual(expect.arrayContaining(['breastSize', 'education']));
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
    expect(getProfileRole({ role: 'sm' })).toBe('sm');
    expect(getProfileRole({ role: 'surrogate_mother' })).toBe('sm');
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
