import { buildProfileNodePatch, listTouchedProfileNodes } from '../profileNodeWriter';
import { resolveFieldOwnerNode, PROFILE_NODES } from '../profileNodeSchema';
import {
  groupProfileFormFieldsByBlock,
  buildProfileFormBlockHeader,
  resolveProfileFormBlock,
  PROFILE_FORM_BLOCK_IDS,
  PROFILE_FORM_BLOCK_ORDER,
} from 'components/profileFormNodeBlocks';

describe('роутер записів', () => {
  it('веде кожне поле у свій вузол одним патчем від кореня', () => {
    const patch = buildProfileNodePatch('P1', {
      phone: ['+380'],
      surname: 'Коваленко',
      lastAction: 'дзвінок',
      language: 'uk',
    });

    expect(patch).toEqual({
      'profileContacts/P1/phone': ['+380'],
      'profileDetails/P1/surname': 'Коваленко',
      'profileWorkflow/P1/lastAction': 'дзвінок',
      'profileTechnical/P1/language': 'uk',
    });
    expect(listTouchedProfileNodes(patch)).toEqual([
      'profileContacts', 'profileDetails', 'profileTechnical', 'profileWorkflow',
    ]);
  });

  it('не пише в картку стрічки сирих полів', () => {
    // Картка збирається проєкцією з похідними, а не копіюванням: правила бази
    // сирого `name` в ній і не приймуть. Її оновлює syncMatchingCardIndex.
    expect(resolveFieldOwnerNode('name')).toBe(PROFILE_NODES.matchingCards);
    expect(buildProfileNodePatch('P1', { name: 'Оля', birth: '01.01.1990' })).toEqual({});
  });

  it('доносить видалення до нового вузла так само, як до legacy', () => {
    // `null` — це видалення ключа. Якби роутер його відкидав, контакт зникав би
    // з анкети і мовчки лишався в `profileContacts`.
    expect(buildProfileNodePatch('P1', { phone: null })).toEqual({ 'profileContacts/P1/phone': null });
  });

  it('undefined пропускає — у RTDB це «не чіпати», а не «видалити»', () => {
    expect(buildProfileNodePatch('P1', { phone: undefined })).toEqual({});
  });

  it('не чіпає ані службових ключів, ані невідомих полів', () => {
    expect(buildProfileNodePatch('P1', {
      __sourceCollection: 'users',
      __photosHydrated: true,
      unknownLegacyField: 'x',
      accessLevel: 'matching:view',
      deviceWidth: 1080,
      password: 'secret',
    })).toEqual({});
  });

  it('без id не будує нічого', () => {
    expect(buildProfileNodePatch('', { phone: '+380' })).toEqual({});
    expect(buildProfileNodePatch('   ', { phone: '+380' })).toEqual({});
  });
});

describe('блоки форми анкети', () => {
  it('розкладає поля по вузлах, зберігаючи порядок усередині блоку', () => {
    const { fields, blockStarts } = groupProfileFormFieldsByBlock([
      { name: 'birth' },
      { name: 'phone' },
      { name: 'name' },
      { name: 'surname' },
      { name: 'email' },
      { name: 'lastAction' },
    ]);

    expect(fields.map(field => field.name)).toEqual([
      // картка стрічки
      'birth', 'name',
      // контакти
      'phone', 'email',
      // анкета
      'surname',
      // робота з анкетою
      'lastAction',
    ]);

    expect([...blockStarts.entries()]).toEqual([
      ['birth', PROFILE_FORM_BLOCK_IDS.matchingCards],
      ['phone', PROFILE_FORM_BLOCK_IDS.profileContacts],
      ['surname', PROFILE_FORM_BLOCK_IDS.profileDetails],
      ['lastAction', PROFILE_FORM_BLOCK_IDS.profileWorkflow],
    ]);
  });

  it('кожен блок має заголовок і місце в порядку', () => {
    PROFILE_FORM_BLOCK_ORDER.forEach(blockId => {
      const header = buildProfileFormBlockHeader(blockId, { profileId: 'a'.repeat(28) });
      expect(header.title).toBeTruthy();
      expect(header.path).toBeTruthy();
      expect(header.href).toContain('console.firebase.google.com');
    });
  });

  it('посилання веде саме туди, де лежать дані блоку', () => {
    const profileId = 'a'.repeat(28);

    expect(buildProfileFormBlockHeader(PROFILE_FORM_BLOCK_IDS.profileContacts, { profileId }).path)
      .toBe(`profileContacts/${profileId}`);

    // `getInTouch` — персональна позначка адміна, а не поле анкети.
    expect(buildProfileFormBlockHeader(PROFILE_FORM_BLOCK_IDS.getInTouch, { profileId, ownerId: 'ADMIN' }).path)
      .toBe('multiData/getInTouch/ADMIN');

    // Права доступу лишаються в legacy — саме звідти їх читають правила бази.
    expect(buildProfileFormBlockHeader(PROFILE_FORM_BLOCK_IDS.access, { profileId }).path)
      .toBe(`users/${profileId}`);
    expect(buildProfileFormBlockHeader(PROFILE_FORM_BLOCK_IDS.legacy, { profileId: 'short' }).path)
      .toBe('newUsers/short');
  });

  it('кодує слеші так, як їх читає консоль Firebase', () => {
    const { href } = buildProfileFormBlockHeader(PROFILE_FORM_BLOCK_IDS.profileDetails, { profileId: 'P1' });
    expect(href.endsWith('~2FprofileDetails~2FP1')).toBe(true);
  });

  it('невідоме поле лишається в legacy — так само, як у самих даних', () => {
    expect(resolveProfileFormBlock('somethingNobodyMapped')).toBe(PROFILE_FORM_BLOCK_IDS.legacy);
    expect(resolveProfileFormBlock('publish')).toBe(PROFILE_FORM_BLOCK_IDS.legacy);
    expect(resolveProfileFormBlock('accessLevel')).toBe(PROFILE_FORM_BLOCK_IDS.access);
    expect(resolveProfileFormBlock('getInTouch')).toBe(PROFILE_FORM_BLOCK_IDS.getInTouch);
  });
});
