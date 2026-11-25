#!/usr/bin/env node

const path = require('node:path');
const { parseArgs } = require('node:util');

const { CliError, checkOutputDirectory, installArtifact, parseJson, printReport, readFile } = require('./migrateProfileProposals');
const { MIGRATION_NODE, profileProposalSnapshotDigest, verifyProfileProposalMigration } = require('./profileProposalMigration');
const {
  PROFILE_PROPOSAL_CONTROL, PROFILE_PROPOSAL_LIVE, LEGACY_PROFILE_PROPOSAL_PATHS, UNIFIED_PROFILE_PROPOSAL_PATHS,
} = require('../src/utils/profileProposalStoragePaths');

const own = (object, key) => (Object.prototype.hasOwnProperty.call(object ?? {}, key) ? object[key] : undefined);
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
const entries = branch => (branch != null && typeof branch === 'object'
  ? Object.entries(branch).filter(([key]) => key !== '.priority') : []);
const child = (root, route) => route.split('/').reduce(own, root);
const scalar = value => (object(value) ? own(value, '.value') : value);
const clone = value => structuredClone(value);
const fail = (code, report) => { throw Object.assign(new Error(code), { code, report }); };
const terminalCreateStatuses = new Set(['accepted', 'archived', 'rejected']);

const validSegment = key => key.length > 0 && Buffer.byteLength(key, 'utf8') <= 768
  && !/[.#$[\]/]/.test(key) && [...key].every(character => character >= ' ' && character !== '\u007f');

const slotFromPath = (sourcePath, family) => {
  const prefix = `${LEGACY_PROFILE_PROPOSAL_PATHS[family]}/`;
  if (typeof sourcePath !== 'string' || !sourcePath.startsWith(prefix)) return null;
  const parts = sourcePath.slice(prefix.length).split('/');
  return parts.length === 2 && parts.every(validSegment) ? parts : null;
};

const headRows = (root, family) => entries(child(root, LEGACY_PROFILE_PROPOSAL_PATHS[family]))
  .flatMap(([parent, group]) => entries(group).map(([key, row]) => [parent, key, row]));

const hasPublication = row => {
  const status = scalar(own(row, 'status'));
  return status === 'publishing' || (!terminalCreateStatuses.has(status)
    && (own(row, 'publicationAttemptId') != null || own(row, 'publicationActorUid') != null));
};

const requireFrozen = root => {
  const control = own(root, PROFILE_PROPOSAL_CONTROL);
  if (scalar(own(control, 'activeWriter')) !== 'frozen') fail('CUTOVER_REQUIRES_FROZEN_WRITER');
  if (own(control, 'cleanupLease') != null) fail('CUTOVER_CLEANUP_IN_PROGRESS');
  if (headRows(root, 'create').some(([, , row]) => hasPublication(row))
    || headRows(root, 'update').some(([, , row]) => own(row, 'reviewClaim') != null)) {
    fail('CUTOVER_REVIEW_IN_PROGRESS');
  }
};

// Вкладені ключі DB лишаються адресами автора, картки та події. Object.fromEntries
// зберігає навіть спеціальні JS-імена на кшталт `constructor` звичайними ключами.
const byPair = (source, rows) => {
  const groups = new Map();
  for (const [parent, key, value] of rows) {
    const group = groups.get(parent) ?? new Map();
    group.set(key, value);
    groups.set(parent, group);
  }
  return withPriority(source, [...groups].map(([parent, group]) => [
    parent, withPriority(own(source, parent), [...group]),
  ]));
};

const withPriority = (source, values) => {
  const priority = own(source, '.priority');
  return Object.fromEntries(values.length && priority != null ? [...values, ['.priority', clone(priority)]] : values);
};

const indexLive = (live, relativePath, value) => {
  if (!entries(value).length) return;
  const segments = relativePath.split('/');
  const leaf = segments.pop();
  const target = segments.reduce((node, key) => (node[key] ??= {}), live);
  target[leaf] = value;
};

const countRows = branch => entries(branch).reduce((total, [, group]) => total + entries(group).length, 0);
const actionable = new Set(['pending', 'private', 'historical']);

const buildHeads = (root, archive) => {
  const live = { create: [], update: [] };
  const heldCreates = new Set();
  const heldUpdates = new Map();
  const deletedTargets = new Set();
  const heldKeys = new Set();
  const materializedOwners = new Set();

  function holdSlot(sourcePath) {
    const create = slotFromPath(sourcePath, 'create');
    if (create) heldCreates.add(create[1]);
    const update = slotFromPath(sourcePath, 'update');
    if (!update) return;
    const [card, editor] = update;
    const editors = heldUpdates.get(card) ?? new Set();
    editors.add(editor);
    heldUpdates.set(card, editors);
  }

  for (const [key, record] of entries(archive.records)) {
    const supportedFamily = ['create', 'update'].find(family => slotFromPath(record.sourcePath, family));
    if (!actionable.has(record.disposition) || !supportedFamily) {
      heldKeys.add(key);
      holdSlot(record.sourcePath);
      const update = slotFromPath(record.sourcePath, 'update');
      if (update && record.targetKind === 'deleted') deletedTargets.add(update[0]);
      continue;
    }
    const [parent, id] = slotFromPath(record.sourcePath, supportedFamily);
    const source = child(root, record.sourcePath);
    if (!object(source)) fail('CUTOVER_INVALID_HEAD_SOURCE');
    const head = clone(source);
    if (supportedFamily === 'update' && record.targetKind === 'draft' && object(head.proposal)
      && own(head.proposal, 'targetCreateProposalId') == null) {
      // План міграції вже довів, що ціль — саме ця чернетка. Після переходу
      // редактор керованої пропозиції перевіряє цей зв’язок під час збереження.
      head.proposal.targetCreateProposalId = parseJson(Buffer.from(record.proposalJson)).targetCreateProposalId;
    }
    live[supportedFamily].push([parent, id, head]);
    if (supportedFamily === 'create') materializedOwners.add(`${parent}/${id}`);
  }
  for (const [, item] of entries(archive.unmapped)) {
    if (item.reason !== 'legacy_update_without_delta') holdSlot(item.sourcePath);
  }

  return { live, heldKeys, heldCreates, heldUpdates, deletedTargets, materializedOwners };
};

const buildHistory = (root, archive, heads) => {
  const rows = { createHistory: [], updateHistory: [] };
  let heldHistory = 0;
  for (const [, record] of entries(archive.history)) {
    const family = ['createHistory', 'updateHistory'].find(name => slotFromPath(record.sourcePath, name));
    const heldHead = heads.heldKeys.has(record.proposalKey);
    if (!family || heldHead) {
      heldHistory += 1;
      continue;
    }
    const [card, eventId] = slotFromPath(record.sourcePath, family);
    const source = child(root, record.sourcePath);
    const operation = family === 'createHistory' ? 'create' : 'update';
    const sourceCards = [scalar(own(source, 'cardId')), scalar(own(source, 'cardUserId'))].filter(value => value != null);
    const sourceOperation = scalar(own(source, 'operation'));
    if (!object(source) || sourceCards.some(id => id !== card) || (sourceOperation != null && sourceOperation !== operation)
      || heads.deletedTargets.has(card) || (operation === 'create' && heads.heldCreates.has(card))
      || (operation === 'update' && heads.heldUpdates.get(card)?.has(scalar(own(source, 'editorUserId'))))) {
      heldHistory += 1;
      continue;
    }
    rows[family].push([card, eventId, { operation, cardId: card, ...clone(source) }]);
  }
  return { rows, heldHistory };
};

const buildOwnerPointers = (root, heads) => {
  const source = child(root, LEGACY_PROFILE_PROPOSAL_PATHS.owners);
  const pointers = entries(source).filter(([cardId, owner]) => (
    typeof scalar(owner) === 'string' && heads.materializedOwners.has(`${scalar(owner)}/${cardId}`)
  ));
  return withPriority(source, pointers.map(([cardId, owner]) => [cardId, clone(owner)]));
};

const buildTargetsByEditor = (root, heads) => {
  const source = child(root, LEGACY_PROFILE_PROPOSAL_PATHS.byEditor);
  const rows = entries(source).flatMap(([editor, targets]) => entries(targets)
    .filter(([cardId]) => !heads.deletedTargets.has(cardId) && !heads.heldUpdates.get(cardId)?.has(editor))
    .map(([cardId, timestamp]) => [editor, cardId, clone(timestamp)]));
  return byPair(source, rows);
};

const prepareProfileProposalCutover = (root, { allowHeld = false } = {}) => {
  requireFrozen(root);
  const archive = own(root?.multiData, MIGRATION_NODE);
  const { live: previousLive, ...sealedArchive } = archive ?? {};
  const sealedRoot = previousLive == null ? root : {
    ...root,
    multiData: { ...root.multiData, [MIGRATION_NODE]: sealedArchive },
  };
  const { sourceDigest, stageDigest } = verifyProfileProposalMigration(sealedRoot);
  const heads = buildHeads(root, sealedArchive);
  const { rows: history, heldHistory } = buildHistory(root, sealedArchive, heads);
  const live = {};
  const branches = {
    ...Object.fromEntries(Object.entries({ ...heads.live, ...history }).map(([family, rows]) => [
      family, byPair(child(root, LEGACY_PROFILE_PROPOSAL_PATHS[family]), rows),
    ])),
    owners: buildOwnerPointers(root, heads),
    // Заявка на ідентичність лишається обмеженням навіть коли запис чекає звірки.
    identityClaims: clone(child(root, LEGACY_PROFILE_PROPOSAL_PATHS.identityClaims)),
    byEditor: buildTargetsByEditor(root, heads),
    contributors: clone(child(root, LEGACY_PROFILE_PROPOSAL_PATHS.contributors)),
  };
  for (const [family, branch] of Object.entries(branches)) {
    indexLive(live, UNIFIED_PROFILE_PROPOSAL_PATHS[family].slice(PROFILE_PROPOSAL_LIVE.length + 1), branch);
  }
  const liveDigest = profileProposalSnapshotDigest(live);
  const report = {
    activeWriter: 'frozen', sourceDigest, stageDigest, liveDigest,
    counts: {
      create: heads.live.create.length, update: heads.live.update.length,
      createHistory: history.createHistory.length, updateHistory: history.updateHistory.length,
      owners: entries(branches.owners).length, identityClaims: entries(branches.identityClaims).length,
      targetsByEditor: countRows(branches.byEditor), contributors: countRows(branches.contributors),
      held: heads.heldKeys.size, unmapped: entries(sealedArchive.unmapped).length, archiveOnlyHistory: heldHistory,
    },
  };
  if (!allowHeld && (report.counts.held || report.counts.unmapped || heldHistory)) fail('CUTOVER_HELD_RECORDS', report);
  if (previousLive != null && profileProposalSnapshotDigest(previousLive) !== liveDigest) fail('CUTOVER_LIVE_CONFLICT');
  return { patch: { [PROFILE_PROPOSAL_LIVE]: live }, report };
};

const usage = 'Usage\n'
  + '  node scripts/prepareProfileProposalCutover.js --snapshot FROZEN_STAGED_EXPORT [--allow-held] [--output PRIVATE_PATCH.json]\n'
  + '\nThe default prints a dry-run report. --output writes only the frozen live patch to a local file.\n';

const patchesMatch = (left, right) => profileProposalSnapshotDigest(parseJson(left)) === profileProposalSnapshotDigest(parseJson(right));

const main = argv => {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      snapshot: { type: 'string' }, output: { type: 'string' }, 'allow-held': { type: 'boolean' }, help: { type: 'boolean' },
    },
  });
  if (options.help && argv.length === 1) return process.stdout.write(usage);
  if (options.help || !options.snapshot?.trim() || (options.output !== undefined && !options.output.trim())) {
    fail('CUTOVER_INVALID_ARGUMENTS');
  }
  const root = parseJson(readFile(options.snapshot));
  const { patch, report } = prepareProfileProposalCutover(root, { allowHeld: options['allow-held'] });
  if (options.output) {
    const file = path.resolve(options.output);
    checkOutputDirectory(path.dirname(file));
    installArtifact(file, Buffer.from(`${JSON.stringify(patch, null, 2)}\n`), patchesMatch);
  }
  printReport(report);
  return undefined;
};

module.exports = { prepareProfileProposalCutover };

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error.report) printReport(error.report);
    const code = /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code || '') ? ` (${error.code})` : '';
    const detail = error instanceof CliError ? ` ${error.message}` : '';
    process.stderr.write(`Cutover preparation failed${code}.${detail}\n`);
    process.exitCode = 1;
  }
}
