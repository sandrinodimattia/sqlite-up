import { spawn } from 'node:child_process';
import process from 'node:process';

/**
 * Parses CLI arguments for the release helper.
 *
 * @param {string[]} args CLI arguments after the script path.
 * @returns {{ dryRun: boolean, version: string }} Parsed release options.
 */
export function parseReleaseArgs(args) {
  const dryRun = args.includes('--dry-run');
  const positionalArgs = args.filter((arg) => arg !== '--dry-run' && arg !== '--');
  const version = positionalArgs[0];

  if (!version || positionalArgs.length !== 1) {
    throw new Error('Usage: pnpm run release -- <version> [--dry-run]');
  }

  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version)) {
    throw new Error('Version must be plain semver like 0.2.0, without a leading "v".');
  }

  return { dryRun, version };
}

/**
 * Creates the ordered command plan used by the release helper.
 *
 * @param {string} version Plain semver version.
 * @returns {[string, string[]][]} Command plan.
 */
export function createReleasePlan(version) {
  const tagName = `v${version}`;

  return [
    ['git', ['status', '--porcelain']],
    ['git', ['branch', '--show-current']],
    ['gh', ['auth', 'status']],
    ['git', ['fetch', '--tags', 'origin']],
    ['git', ['rev-parse', '--verify', tagName]],
    ['gh', ['release', 'view', tagName]],
    ['pnpm', ['run', 'build']],
    ['npm', ['version', version, '--no-git-tag-version']],
    ['git', ['add', 'package.json', 'pnpm-lock.yaml']],
    ['git', ['commit', '-m', `chore: release ${version}`]],
    ['git', ['push']],
    ['gh', ['release', 'create', tagName, '--target', 'main', '--title', tagName, '--generate-notes']],
  ];
}

/**
 * Runs the release flow.
 *
 * @param {{ dryRun: boolean, log?: (message: string) => void, run?: typeof runCommand, version: string }} options
 * Release options.
 * @returns {Promise<void>} Resolves when the release flow finishes.
 */
export async function release({ dryRun, log = console.log, run = runCommand, version }) {
  const plan = createReleasePlan(version);

  for (const [command, args] of plan) {
    const isMutation = isMutatingCommand(command, args);
    if (dryRun && isMutation) {
      log(`[dry-run] ${formatCommand(command, args)}`);
      continue;
    }

    log(formatCommand(command, args));
    const result = await run(command, args);

    if (command === 'git' && args.join(' ') === 'status --porcelain' && result.stdout.trim()) {
      throw new Error('Working tree must be clean before releasing.');
    }

    if (command === 'git' && args.join(' ') === 'branch --show-current' && result.stdout.trim() !== 'main') {
      throw new Error('Releases must be created from main.');
    }

    if (command === 'git' && args[0] === 'rev-parse' && result.status === 0) {
      throw new Error(`Tag ${args[2]} already exists.`);
    }

    if (command === 'gh' && args[0] === 'release' && args[1] === 'view' && result.status === 0) {
      throw new Error(`GitHub release ${args[2]} already exists.`);
    }

    const expectedMissingResource =
      (command === 'git' && args[0] === 'rev-parse') ||
      (command === 'gh' && args[0] === 'release' && args[1] === 'view');

    if (result.status !== 0 && !expectedMissingResource) {
      throw new Error(`Command failed: ${formatCommand(command, args)}`);
    }
  }
}

/**
 * Runs a child process and captures stdout.
 *
 * @param {string} command Executable name.
 * @param {string[]} args Executable arguments.
 * @returns {Promise<{ status: number, stdout: string }>} Command result.
 */
function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    const stdout = [];

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.on('close', (status) => resolve({ status: status ?? 1, stdout: stdout.join('') }));
  });
}

/**
 * Checks whether a planned command changes repository or GitHub state.
 *
 * @param {string} command Executable name.
 * @param {string[]} args Executable arguments.
 * @returns {boolean} True when the command mutates state.
 */
function isMutatingCommand(command, args) {
  return (
    (command === 'npm' && args[0] === 'version') ||
    (command === 'git' && ['add', 'commit', 'push'].includes(args[0])) ||
    (command === 'gh' && args[0] === 'release' && args[1] === 'create')
  );
}

/**
 * Formats a command for logging.
 *
 * @param {string} command Executable name.
 * @param {string[]} args Executable arguments.
 * @returns {string} Shell-like command string.
 */
function formatCommand(command, args) {
  return [command, ...args].join(' ');
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  try {
    await release(parseReleaseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
