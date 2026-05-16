import { spawn } from 'node:child_process';
import process from 'node:process';

const CI_WORKFLOW = 'ci.yml';
const CI_BRANCH = 'main';
const CI_TIMEOUT_MS = 10 * 60 * 1000;
const CI_POLL_INTERVAL_MS = 15 * 1000;

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
 * @param {{
 * dryRun: boolean,
 * log?: (message: string) => void,
 * run?: typeof runCommand,
 * sleep?: typeof sleep,
 * version: string
 * }} options
 * Release options.
 * @returns {Promise<void>} Resolves when the release flow finishes.
 */
export async function release({ dryRun, log = console.log, run = runCommand, sleep = delay, version }) {
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

    if (command === 'git' && args.join(' ') === 'push') {
      const commitSha = await getCurrentCommitSha({ run });
      await waitForSuccessfulCi({ branch: CI_BRANCH, commitSha, log, run, sleep, workflow: CI_WORKFLOW });
    }
  }
}

/**
 * Gets the current HEAD commit SHA.
 *
 * @param {{ run: typeof runCommand }} options Command runner.
 * @returns {Promise<string>} Current HEAD commit SHA.
 */
async function getCurrentCommitSha({ run }) {
  const result = await run('git', ['rev-parse', 'HEAD']);

  if (result.status !== 0) {
    throw new Error('Command failed: git rev-parse HEAD');
  }

  return result.stdout.trim();
}

/**
 * Waits for the GitHub Actions CI workflow to succeed on a specific commit.
 *
 * @param {{
 * branch?: string,
 * commitSha: string,
 * log?: (message: string) => void,
 * now?: () => number,
 * pollIntervalMs?: number,
 * run?: typeof runCommand,
 * sleep?: typeof sleep,
 * timeoutMs?: number,
 * workflow?: string
 * }} options CI wait options.
 * @returns {Promise<void>} Resolves after CI succeeds.
 */
export async function waitForSuccessfulCi({
  branch = CI_BRANCH,
  commitSha,
  log = console.log,
  now = Date.now,
  pollIntervalMs = CI_POLL_INTERVAL_MS,
  run = runCommand,
  sleep = delay,
  timeoutMs = CI_TIMEOUT_MS,
  workflow = CI_WORKFLOW,
}) {
  const startedAt = now();

  while (now() - startedAt <= timeoutMs) {
    const result = await run('gh', [
      'run',
      'list',
      '--workflow',
      workflow,
      '--branch',
      branch,
      '--commit',
      commitSha,
      '--event',
      'push',
      '--limit',
      '10',
      '--json',
      'databaseId,status,conclusion,url',
    ]);

    if (result.status !== 0) {
      throw new Error(`Command failed: gh run list --workflow ${workflow} --commit ${commitSha}`);
    }

    const runInfo = parseCiRun(result.stdout, commitSha);

    if (!runInfo) {
      log(`Waiting for CI run for ${commitSha} to appear...`);
      await sleep(pollIntervalMs);
      continue;
    }

    if (runInfo.status === 'completed' && runInfo.conclusion === 'success') {
      log(`CI passed for ${commitSha}: ${runInfo.url}`);
      return;
    }

    if (runInfo.status === 'completed') {
      throw new Error(`CI failed for ${commitSha}: ${runInfo.conclusion ?? 'unknown'} (${runInfo.url})`);
    }

    log(`Waiting for CI run ${runInfo.databaseId} on ${commitSha}: ${runInfo.status}`);
    await sleep(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for CI to pass for ${commitSha}.`);
}

/**
 * Parses GitHub Actions run list output and returns the newest matching run.
 *
 * @param {string} stdout JSON output from gh run list.
 * @param {string} commitSha Commit SHA used in the query.
 * @returns {{ conclusion?: string, databaseId: number, status: string, url: string } | undefined} CI run metadata.
 */
function parseCiRun(stdout, commitSha) {
  try {
    const runs = JSON.parse(stdout);

    if (!Array.isArray(runs)) {
      throw new TypeError('Expected an array of GitHub Actions runs.');
    }

    return runs[0];
  } catch (error) {
    throw new Error(`Failed to parse CI run list for ${commitSha}: ${error instanceof Error ? error.message : error}`);
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
 * Sleeps for a fixed duration.
 *
 * @param {number} ms Milliseconds to wait.
 * @returns {Promise<void>} Resolves after the delay.
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
