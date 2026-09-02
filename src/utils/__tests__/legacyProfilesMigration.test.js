import {
  buildProfileNodesPayloadFromCollections,
  mergeLegacyCollections,
} from '../legacyProfilesMigration';
import {
  listScalarConflicts,
  mergeUserCollectionData,
  mergeUserFieldValue,
} from '../mergeUserCollections';

describe('mergeUserFieldValue', () => {
  it('обʼєднує списки і лишає значення з users останнім', () => {
    // Останній елемент — це те, що бачив звичайний користувач, тож саме він
    // має лишитись останнім і після злиття.
    expect(mergeUserFieldValue(['Ірина'], ['IDClinic'])).toEqual(['IDClinic', 'Ірина']);
    expect(mergeUserFieldValue(['Ірина'], ['Ірина', 'IDClinic'])).toEqual(['IDClinic', 'Ірина']);
  });

  it('розуміє масив, який RTDB віддала обʼєктом', () => {
    expect(mergeUserFieldValue({ 0: 'Ірина' }, { 0: 'IDClinic' })).toEqual(['IDClinic', 'Ірина']);
  });

  it('скаляр проти списку теж стає списком, а не втрачається', () => {
    expect(mergeUserFieldValue('Ірина', ['IDClinic'])).toEqual(['IDClinic', 'Ірина']);
  });

  it('два різні скаляри лишають форму поля, а не роблять із нього список', () => {
    expect(mergeUserFieldValue('Ірина', 'Іра')).toBe('Ірина');
    // Але за явним проханням обидва значення лишаються.
    expect(mergeUserFieldValue('Ірина', 'Іра', { mergeConflictingScalars: true }))
      .toEqual(['Іра', 'Ірина']);
  });

  it('бере те, що є, коли друга колекція мовчить', () => {
    expect(mergeUserFieldValue(undefined, 'Іра')).toBe('Іра');
    expect(mergeUserFieldValue('Ірина', undefined)).toBe('Ірина');
  });
});

describe('mergeLegacyCollections', () => {
  const users = {
    a: { name: ['Ірина'], phone: '380671112233', city: 'Київ' },
    b: { name: 'Олена' },
  };
  const newUsers = {
    a: { name: ['IDClinic'], city: 'Львів', email: 'a@b.c' },
    c: { name: 'Марія' },
  };

  it('зводить обидві колекції в один набір анкет', () => {
    const { profiles, stats } = mergeLegacyCollections({ users, newUsers });

    expect(stats).toMatchObject({ total: 3, both: 1, usersOnly: 1, newUsersOnly: 1 });
    expect(profiles.a.name).toEqual(['IDClinic', 'Ірина']);
    expect(profiles.a.email).toBe('a@b.c');
    expect(profiles.a.userId).toBe('a');
    expect(profiles.c.name).toBe('Марія');
  });

  it('називає поля, де скаляри розійшлись і одне значення лишається позаду', () => {
    const { conflicts, stats } = mergeLegacyCollections({ users, newUsers });

    expect(conflicts.a).toEqual(['city']);
    expect(stats.conflicted).toBe(1);
    expect(listScalarConflicts(users.a, newUsers.a)).toEqual(['city']);
  });

  it('переживає порожній вхід', () => {
    expect(mergeLegacyCollections().stats.total).toBe(0);
    expect(mergeUserCollectionData()).toEqual({});
  });
});

describe('buildProfileNodesPayloadFromCollections', () => {
  const id = 'a'.repeat(28);

  it('розкладає анкету по вузлах і лишає масиви масивами', () => {
    const { payload, stats } = buildProfileNodesPayloadFromCollections({
      users: {
        [id]: {
          name: ['Ірина'],
          surname: 'Бриж',
          blood: '2+',
          phone: ['380671112233', '380509998877'],
          city: 'Київ',
          education: 'вища',
          cycleStatus: 'stimulation',
          lastLogin2: '2026-08-19',
          publish: true,
        },
      },
      newUsers: { [id]: { name: ['IDClinic'] } },
    });

    // Імʼя живе тільки в картці — і воно там масивом, з обома значеннями.
    expect(payload.matchingCards[id].name).toEqual(['IDClinic', 'Ірина']);
    expect(payload.matchingCards[id].surnameShort).toBe('Б.');
    expect(payload.matchingCards[id].feedDate).toBe('2026-08-19');

    // Решта — по своїх вузлах, тим самим роутером, що й кожне збереження.
    expect(payload.profileDetails[id]).toMatchObject({ surname: 'Бриж', blood: '2+', education: 'вища' });
    expect(payload.profileContacts[id].phone).toEqual(['380671112233', '380509998877']);
    expect(payload.profileWorkflow[id]).toEqual({ cycleStatus: 'stimulation' });

    expect(stats.written).toBe(1);
    expect(stats.byNode.matchingCards).toBe(1);
  });

  it('не вигадує «сховано» анкеті, якої не публікували', () => {
    const sources = { users: { [id]: { name: 'Ірина', publish: false, lastLogin2: '2026-08-19' } } };

    // Вузол карток дали, а цієї картки в ньому немає — отже ключа стрічки не
    // було, і анкета лишається неопублікованою, а не схованою.
    const fresh = buildProfileNodesPayloadFromCollections({ ...sources, matchingCards: {} });
    expect(fresh.payload.matchingCards[id]).not.toHaveProperty('feedDate');

    // Вузла карток не дали взагалі — переходу нема звідки взятись, і `publish`
    // береться як є. Це той самий висновок, що й в офлайн-збірки карток.
    const blind = buildProfileNodesPayloadFromCollections(sources);
    expect(blind.payload.matchingCards[id].feedDate).toBe(false);

    // Картка була показаною — тоді `publish: false` справді означає «сховали».
    const withCard = buildProfileNodesPayloadFromCollections({
      ...sources,
      matchingCards: { [id]: { name: 'Ірина', feedDate: '2026-08-19' } },
    });
    expect(withCard.payload.matchingCards[id].feedDate).toBe(false);
  });

  it('називає поля, яким нового місця немає', () => {
    const { unmapped } = buildProfileNodesPayloadFromCollections({
      users: { [id]: { name: 'Ірина', somethingNobodyMapped: 'x', deviceWidth: 320 } },
    });

    expect(unmapped.somethingNobodyMapped).toBe(1);
    // А те, чому місця не дали свідомо, питанням не є.
    expect(unmapped).not.toHaveProperty('deviceWidth');
  });

  it('переживає порожній вхід', () => {
    const { payload, stats } = buildProfileNodesPayloadFromCollections();
    expect(payload).toEqual({});
    expect(stats.written).toBe(0);
  });
});
