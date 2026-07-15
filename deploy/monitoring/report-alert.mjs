import process from 'node:process';

const [key, outcome] = process.argv.slice(2);
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const runUrl = `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;

if (!key || !outcome) {
  throw new Error('Usage: report-alert.mjs <public|backups> <step-outcome>');
}
if (!repository || !token || !process.env.GITHUB_RUN_ID) {
  throw new Error('GitHub Actions context is required');
}

const title = key === 'public'
  ? '[monitor] Public infrastructure alert'
  : '[monitor] Backup or restore alert';
const issues = await github(`/repos/${repository}/issues?state=all&per_page=100`);
const existing = issues.find((issue) => !issue.pull_request && issue.title === title);

if (outcome !== 'success') {
  const body = [
    'Automated MapKluss monitoring failed.',
    '',
    `Run: ${runUrl}`,
    '',
    'Open the run log, identify the failed check, and keep this issue open until a healthy run closes it.',
  ].join('\n');
  if (!existing) {
    await github(`/repos/${repository}/issues`, { method: 'POST', body: { title, body } });
    console.log('Opened monitoring alert issue');
  } else {
    await github(`/repos/${repository}/issues/${existing.number}`, {
      method: 'PATCH',
      body: { state: 'open', body },
    });
    console.log('Refreshed monitoring alert issue');
  }
  process.exitCode = 1;
} else if (existing?.state === 'open') {
  await github(`/repos/${repository}/issues/${existing.number}`, {
    method: 'PATCH',
    body: {
      state: 'closed',
      state_reason: 'completed',
      body: `${existing.body || ''}\n\nRecovered automatically: ${runUrl}`.trim(),
    },
  });
  console.log('Closed recovered monitoring alert issue');
} else {
  console.log('Monitoring is healthy; no open alert issue');
}

async function github(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'mapkluss-monitor',
      'x-github-api-version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${method} ${pathname} returned ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}
