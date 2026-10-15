import {
  PARENT_DONOR_WISH_FIELDS,
  buildParentDetailSections,
  isHigherEducationWish,
  isWishSelected,
  listParentWishItems,
  listWishChoices,
  parseWishList,
  resolveParentWishGroups,
  toggleWish,
} from '../parentWishes';
import { applyUkrainianInterface } from '../../testUtils/interfaceLanguage';

applyUkrainianInterface();

const [EYES, HAIR] = PARENT_DONOR_WISH_FIELDS;
const option = (field, placeholder) => field.options.find(item => item.placeholder === placeholder && !item.legacy);

describe('побажання батьків — значення з довідників, а не вільний текст', () => {
  it('рядок через кому — список без порожніх і повторів', () => {
    expect(parseWishList('Brown, Green; brown, ')).toEqual(['Brown', 'Green']);
    expect(parseWishList(['Brown', ' ', 'Green'])).toEqual(['Brown', 'Green']);
    expect(parseWishList(undefined)).toEqual([]);
  });

  it('дотик додає варіант, повторний — знімає', () => {
    const once = toggleWish('', EYES, option(EYES, 'Brown'));
    expect(once).toBe('Brown');
    const twice = toggleWish(once, EYES, option(EYES, 'Green'));
    expect(twice).toBe('Brown, Green');
    expect(toggleWish(twice, EYES, option(EYES, 'Brown'))).toBe('Green');
  });

  // «Карі» в довіднику двічі (Brown і Hazel), «Брюнетка» — це й «Темне»:
  // записане колись іншим словом мусить читатись як той самий вибір.
  it('однакові за змістом значення довідника — один вибір', () => {
    expect(isWishSelected('Hazel', EYES, option(EYES, 'Brown'))).toBe(true);
    expect(isWishSelected('Dark', HAIR, option(HAIR, 'Brunette'))).toBe(true);
    expect(toggleWish('Dark', HAIR, option(HAIR, 'Brunette'))).toBe('');
  });

  it('записаний вільний текст не губиться: стоїть окремим варіантом', () => {
    const choices = listWishChoices('блакитні, Brown', EYES);
    const recorded = choices.filter(choice => choice.recorded);
    expect(recorded.map(choice => choice.placeholder)).toEqual(['блакитні']);
    expect(choices.filter(choice => choice.placeholder === 'Brown')).toHaveLength(1);
    expect(toggleWish('блакитні, Brown', EYES, recorded[0])).toBe('Brown');
  });

  it('освіта в побажаннях — «вища», зокрема записана словами', () => {
    expect(isHigherEducationWish('Higher')).toBe(true);
    expect(isHigherEducationWish('вища')).toBe(true);
    expect(isHigherEducationWish('')).toBe(false);
  });
});

describe('«Більше про біологічних батьків»', () => {
  const parents = {
    parentVia: 'clinic',
    programLocation: 'Київ',
    parentPreferences: {
      donor: { eyeColor: 'Brown, Green', hairColor: 'Brunette', education: 'Higher' },
    },
  };

  it('каже, як шукають і де програма', () => {
    const sections = buildParentDetailSections(parents, {}, 'uk');
    expect(sections.find(section => section.key === 'parent-via')).toMatchObject({ title: 'Як шукають', text: 'Через клініку' });
    expect(sections.find(section => section.key === 'parent-place')).toMatchObject({ title: 'Де програма', text: 'Київ' });
  });

  it('донорці позначає «✓ як у вас» лише там, де збігається', () => {
    const viewer = { type: 'ed', facts: { eyeColor: 'Hazel', hairColor: 'Fair', education: 'Master' } };
    const wishes = buildParentDetailSections(parents, viewer, 'uk').find(section => section.key === 'parent-donor-wishes');
    const byKey = Object.fromEntries(wishes.items.map(item => [item.key, item]));
    expect(byKey.eyeColor).toMatchObject({ label: 'Очі', text: 'карі, зелені', match: true });
    expect(byKey.hairColor).toMatchObject({ label: 'Волосся', text: 'брюнетка', match: false });
    expect(byKey.education).toMatchObject({ text: 'вища освіта', match: true });
    expect(wishes.note).toContain('Побажання не відсіюють');
  });

  it('СМ і агенція бачать побажання без позначок і без пояснення до них', () => {
    const viewer = { type: 'sm', facts: { eyeColor: 'Brown' } };
    const wishes = buildParentDetailSections(parents, viewer, 'uk').find(section => section.key === 'parent-donor-wishes');
    expect(wishes.items.every(item => item.match === false)).toBe(true);
    expect(wishes.note).toBe('');
  });

  // Групу крові, зріст, вік і місце для СМ тепер задає програма, але
  // записане раніше читачі й далі бачать — без позначки збігу.
  it('записане до програм показує як є', () => {
    const sections = buildParentDetailSections({
      parentPreferences: { donor: { blood: '1+', heightFrom: '165' }, surrogate: { ageTo: '35', location: 'Грузія' } },
    }, { type: 'ed', facts: {} }, 'uk');
    const donor = sections.find(section => section.key === 'parent-donor-wishes');
    expect(donor.items.map(item => item.text)).toEqual(['1+', 'зріст від 165 см']);
    const surrogate = sections.find(section => section.key === 'parent-surrogate-wishes');
    expect(surrogate.items.map(item => item.text)).toEqual(['вік до 35', 'Грузія']);
  });

  it('порожня анкета — порожньо', () => {
    expect(buildParentDetailSections({}, { type: 'ed' }, 'uk')).toEqual([]);
  });

  // Батьки перейшли з «донорку» на «сурогатну маму»: записані побажання до
  // донорки лишаються в анкеті (форма дає їх стерти), але картка їх не
  // показує — і навпаки.
  it('побажання до того, кого вже не шукають, картка не показує', () => {
    const prefs = { donor: { eyeColor: 'Brown' }, surrogate: { ageTo: '35' } };
    const keysFor = seeking => buildParentDetailSections({ seeking, parentPreferences: prefs }, {}, 'uk').map(section => section.key);
    expect(keysFor('sm')).toEqual(['parent-surrogate-wishes']);
    expect(keysFor('ed')).toEqual(['parent-donor-wishes']);
    expect(keysFor('both')).toEqual(['parent-donor-wishes', 'parent-surrogate-wishes']);
    expect(keysFor(undefined)).toEqual(['parent-donor-wishes', 'parent-surrogate-wishes']);
  });
});

describe('чиї побажання чинні', () => {
  it('за тим, кого шукають; невідоме не ховає нічого', () => {
    expect(resolveParentWishGroups('ed')).toEqual({ donor: true, surrogate: false });
    expect(resolveParentWishGroups('sm')).toEqual({ donor: false, surrogate: true });
    expect(resolveParentWishGroups('both')).toEqual({ donor: true, surrogate: true });
    expect(resolveParentWishGroups('')).toEqual({ donor: true, surrogate: true });
    // Агенція чи клініка в наборі побажань не ховає.
    expect(resolveParentWishGroups('ed,ag')).toEqual({ donor: true, surrogate: false });
    expect(resolveParentWishGroups('ag,cl')).toEqual({ donor: true, surrogate: true });
  });

  it('записане словами — для форми, без позначок збігу', () => {
    const prefs = { donor: { hairColor: 'Dark', education: 'Higher', blood: '1+' }, surrogate: { location: 'Грузія' } };
    expect(listParentWishItems(prefs, 'donor', 'uk').map(item => [item.label || '', item.text]))
      .toEqual([['Волосся', 'темне'], ['', 'вища освіта'], ['Група крові', '1+']]);
    expect(listParentWishItems(prefs, 'surrogate', 'uk').map(item => item.text)).toEqual(['Грузія']);
    expect(listParentWishItems({}, 'donor', 'uk')).toEqual([]);
  });
});
