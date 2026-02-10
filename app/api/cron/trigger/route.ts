import { NextRequest, NextResponse } from 'next/server';

/**
 * Call this URL from cron-job.org at precise times to trigger the GitHub ingest workflow.
 * GET or POST: ?secret=YOUR_CRON_SECRET&workflow=15m|hourly
 * Or header: x-cron-secret: YOUR_CRON_SECRET
 *
 * Env: CRON_SECRET, GITHUB_TOKEN, GITHUB_REPO (e.g. "owner/repo")
 */
export async function GET(req: NextRequest) {
  return trigger(req);
}

export async function POST(req: NextRequest) {
  return trigger(req);
}

async function trigger(req: NextRequest) {
  const secret =
    req.nextUrl.searchParams.get('secret') ??
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const workflow = req.nextUrl.searchParams.get('workflow') ?? '15m';

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (workflow !== '15m' && workflow !== 'hourly') {
    return NextResponse.json({ error: 'workflow must be 15m or hourly' }, { status: 400 });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    return NextResponse.json(
      { error: 'Missing GITHUB_TOKEN or GITHUB_REPO' },
      { status: 500 }
    );
  }

  const workflowId = workflow === '15m' ? 'ingest-15m.yml' : 'ingest-hourly.yml';
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: process.env.GITHUB_REF ?? 'main' }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `GitHub API ${res.status}: ${text}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, workflow });
}
