import {
  PROFILE_DRAFT_CARD_FIELDS,
  buildProfileDraftCard,
  profileDraftCardToMutation,
} from './profileDraftCard';

const draft = {
  cardId: 'draft-1',
  operation: 'create',
  createdBy: 'author-1',
  status: 'pendingReview',
  revision: 3,
  proposalId: '["create","author-1","draft-1"]',
  updatedAt: 1700000000000,
  data: {
    name: ['Олена'],
    surname: 'Коваленко',
    city: 'Київ',
    role: 'ed',
    height: '168',
    blood: '3+',
    phone: '380501112233',
    email: 'olena@example.com',
    telegram: 'olena_k',
    moreInfo_main: 'Про себе',
    accessLevel: 'admin',
  },
};

describe('картка чернетки', () => {
  it('несе лише поля проєкції й адресу чернетки — без контактів', () => {
    const card = buildProfileDraftCard('draft-1', draft);
    expect(card).toMatchObject({
      name: ['Олена'],
      surnameShort: 'К.',
      city: 'Київ',
      role: 'ed',
      height: '168',
      rh: '+',
      createdBy: 'author-1',
      status: 'pendingReview',
      revision: 3,
      proposalId: draft.proposalId,
      updatedAt: draft.updatedAt,
    });
    const allowed = new Set([...PROFILE_DRAFT_CARD_FIELDS, 'createdBy', 'status', 'revision', 'proposalId', 'updatedAt']);
    Object.keys(card).forEach(key => expect(allowed.has(key)).toBe(true));
    expect(JSON.stringify(card)).not.toMatch(/380501112233|olena@example\.com|olena_k|Коваленко|Про себе|admin/);
  });

  it('повернута автору чернетка лишається видимою, прийнята — ні', () => {
    expect(buildProfileDraftCard('draft-1', { ...draft, status: 'private' })?.status).toBe('private');
    expect(buildProfileDraftCard('draft-1', { ...draft, status: 'accepted' })).toBeNull();
    expect(buildProfileDraftCard('draft-1', { ...draft, operation: 'update' })).toBeNull();
  });

  it('читається назад як чернетка з даними проєкції', () => {
    const mutation = profileDraftCardToMutation('draft-1', buildProfileDraftCard('draft-1', draft));
    expect(mutation).toMatchObject({
      cardId: 'draft-1',
      operation: 'create',
      createdBy: 'author-1',
      status: 'pendingReview',
      revision: 3,
      proposalId: draft.proposalId,
      projectionOnly: true,
    });
    expect(mutation.data).toMatchObject({ userId: 'draft-1', name: ['Олена'], city: 'Київ', surname: 'К.' });
    expect(mutation.data.phone).toBeUndefined();
    expect(profileDraftCardToMutation('draft-1', null)).toBeNull();
    expect(profileDraftCardToMutation('draft-1', { name: 'x', status: 'pendingReview' })).toBeNull();
  });
});
