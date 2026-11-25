#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual, parseArgs } = require('node:util');

const usage = 'Usage\n'
  + '  node scripts/migrateProfileProposals.js --snapshot FILE\n'
  + '  node scripts/migrateProfileProposals.js --snapshot FILE --verify\n'
  + '  node scripts/migrateProfileProposals.js --snapshot FILE --apply --output DIRECTORY\n'
  + '  node scripts/migrateProfileProposals.js --snapshot STAGED_FILE --rollback --output DIRECTORY\n'
  + '\nAll modes work with local files. The default prints a dry-run report.\n';

class CliError extends Error {}

const readOptions = args => {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        snapshot: { type: 'string' },
        output: { type: 'string' },
        apply: { type: 'boolean' },
        verify: { type: 'boolean' },
        rollback: { type: 'boolean' },
        help: { type: 'boolean' },
      },
    }));
  } catch {
    throw new CliError('Invalid arguments. Run with --help for the supported options.');
  }
  if (values.help && args.length === 1) return values;
  const modes = [values.apply, values.verify, values.rollback].filter(Boolean);
  const writesFiles = Boolean(values.apply || values.rollback);
  if (values.help || !values.snapshot?.trim() || modes.length > 1
    || (writesFiles ? !values.output?.trim() : values.output !== undefined)) {
    throw new CliError('Specify one snapshot and use --output only with --apply or --rollback.');
  }
  return values;
};

const parseJson = bytes => {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new CliError('A snapshot file contains invalid JSON.');
  }
};

const readFile = (file, { privateFile = false, optional = false } = {}) => {
  const { O_RDONLY, O_NONBLOCK, O_NOFOLLOW } = fs.constants;
  let descriptor;
  try {
    descriptor = fs.openSync(file, O_RDONLY | O_NONBLOCK | (privateFile ? O_NOFOLLOW : 0));
    const stats = fs.fstatSync(descriptor);
    if (!stats.isFile() || (privateFile && (stats.mode & 0o077) !== 0)) {
      throw new CliError('Use regular snapshot files and keep migration artifacts private.');
    }
    return fs.readFileSync(descriptor);
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
};

const readArtifact = file => readFile(file, { privateFile: true, optional: true });

const syncDirectory = directory => {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
};

const checkOutputDirectory = (directory, { create } = {}) => {
  if (create) {
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
      syncDirectory(path.dirname(directory));
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  const stats = fs.lstatSync(directory);
  if (!stats.isDirectory() || (stats.mode & 0o077) !== 0) {
    throw new CliError('Use a private output directory that permits access only to its owner.');
  }
};

const sameSnapshot = (left, right) => isDeepStrictEqual(parseJson(left), parseJson(right));

// Опублікувати готовий файл одним посиланням. Повторний запуск перевіряє
// файл, який встиг записати інший процес, і ніколи не відкриває його на запис.
const installArtifact = (file, bytes, matches = sameSnapshot) => {
  const directory = path.dirname(file);
  const saved = readArtifact(file);
  if (saved && !matches(saved, bytes)) {
    throw new CliError('An existing migration artifact differs from the expected result.');
  }
  if (saved) {
    syncDirectory(directory);
    return saved;
  }

  const scratch = fs.mkdtempSync(path.join(directory, '.migration-'));
  const temporary = path.join(scratch, 'snapshot.json');
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }

    try {
      fs.linkSync(temporary, file);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const installed = readArtifact(file);
    if (!installed || !matches(installed, bytes)) {
      throw new CliError('A concurrent migration wrote a different artifact.');
    }
    syncDirectory(directory);
    return installed;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
};

const printReport = report => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
const sameBytes = (left, right) => left.equals(right);

const applyMigration = (options, bytes, source, migration) => {
  const staged = migration.stageProfileProposalMigration(source);
  const report = migration.verifyProfileProposalMigration(staged);
  const alreadyStaged = source.multiData?.[migration.MIGRATION_NODE] != null;
  const directory = path.resolve(options.output);
  checkOutputDirectory(directory, { create: !alreadyStaged });

  const backupFile = path.join(directory, 'backup.json');
  const stagedFile = path.join(directory, 'staged.json');
  const previousStage = readArtifact(stagedFile);
  const previousRollback = readArtifact(path.join(directory, 'rolled-back.json'));
  const backup = readArtifact(backupFile);
  if (!backup && (alreadyStaged || previousStage || previousRollback)) {
    throw new CliError('A staged snapshot requires its verified original backup.');
  }
  if (backup) {
    migration.rollbackProfileProposalMigration(staged, parseJson(backup));
    if (previousRollback && !sameBytes(previousRollback, backup)) {
      throw new CliError('The restored snapshot differs from its original backup.');
    }
  }

  if (alreadyStaged) syncDirectory(directory);
  else installArtifact(backupFile, bytes);
  installArtifact(stagedFile, Buffer.from(`${JSON.stringify(staged, null, 2)}\n`));
  return report;
};

const rollbackMigration = (options, source, migration) => {
  const directory = path.resolve(options.output);
  checkOutputDirectory(directory);
  const backup = readArtifact(path.join(directory, 'backup.json'));
  if (!backup) throw new CliError('The original migration backup is required.');
  const staged = readArtifact(path.join(directory, 'staged.json'));
  if (!staged || !isDeepStrictEqual(parseJson(staged), source)) {
    throw new CliError('Use the verified staged snapshot from the migration bundle.');
  }
  migration.rollbackProfileProposalMigration(source, parseJson(backup));
  const report = migration.verifyProfileProposalMigration(source);
  installArtifact(path.join(directory, 'rolled-back.json'), backup, sameBytes);
  return report;
};

const main = args => {
  const options = readOptions(args);
  if (options.help) {
    process.stdout.write(usage);
    return;
  }
  const migration = require('./profileProposalMigration');
  const bytes = readFile(options.snapshot);
  const snapshot = parseJson(bytes);
  if (options.apply) printReport(applyMigration(options, bytes, snapshot, migration));
  else if (options.rollback) printReport(rollbackMigration(options, snapshot, migration));
  else if (options.verify) printReport(migration.verifyProfileProposalMigration(snapshot));
  else printReport(migration.planProfileProposalMigration(snapshot).report);
};

module.exports = { CliError, checkOutputDirectory, installArtifact, parseJson, printReport, readFile };

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const code = /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code || '') ? ` (${error.code})` : '';
    const message = error instanceof CliError ? error.message : `Migration failed${code}.`;
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
