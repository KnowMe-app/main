import { collectUpdateProposalAliases, keepProposalAliasesWithTargets } from './profileProposalIndexing';

jest.mock('components/config', () => ({ database: {} }));

it('exports only searchable proposal values keyed by the existing target', () => {
  const active = {
    phone: { added: ['380501234568'], removed: ['380501234567'] },
    email: { from: 'before@example.invalid', to: 'after@example.invalid' },
    city: { to: 'Lviv' },
    accessLevel: { to: 'admin' },
  };
  const aliases = collectUpdateProposalAliases({
    card: {
      first: { cardUserId: 'card', editorUserId: 'first', fields: active },
      second: { cardUserId: 'card', editorUserId: 'second', fields: { phone: { added: ['380501234569'] } } },
      mismatch: { cardUserId: 'elsewhere', fields: { phone: { added: ['380501234566'] } } },
      restricted: { adminOnly: true, fields: { phone: { added: ['380501234565'] } } },
    },
    orphan: { editor: { fields: { name: { to: 'Orphan' } } } },
    draft: { editor: { fields: { name: { to: 'Draft' } } } },
  });

  expect(aliases.card).toEqual({ phone: ['380501234568', '380501234569'], email: ['after@example.invalid'] });
  expect(keepProposalAliasesWithTargets(aliases, { card: {} }, { draft: {} })).toEqual({
    card: aliases.card, draft: aliases.draft,
  });
});
