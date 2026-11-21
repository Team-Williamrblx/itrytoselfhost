import packageJson from '@/package.json';
import cache from '@/utils/cache';
import type { NextApiRequest, NextApiResponse } from 'next';
import Parser from 'rss-parser';
import semver from 'semver';

type ChangelogRelease = {
  version: string;
  date: string;
  changes: string[];
};

type VersionResponse = {
  current: string;
  latest: string | null;
  outdated: boolean;
  changelog: ChangelogRelease[];
};

const CACHE_TTL = 60 * 60;
const VERSION_CACHE_KEY = 'orbit:github:version';
const CHANGELOG_FEED_URL = 'https://lumenate.usercue.app/api/changelog/rss';
const rssParser = new Parser();

const CHANNEL_RANK: Record<string, number> = {
  beta: 0,
  nightly: 1,
  stable: 2,
};

function normalizeVersion(version: string): string {
  return version
    .trim()
    .replace(/^v/i, '')
    .replace(
      /^(\d+\.\d+\.\d+)(beta|nightly)(?:[.-]?(\d+))?$/i,
      (_, base, channel, number) => `${base}-${channel.toLowerCase()}${number ? `.${number}` : ''}`,
    );
}

function parseVersion(version: string) {
  const normalized = normalizeVersion(version);
  const parsed = semver.parse(normalized);

  if (!parsed) {
    return null;
  }

  const prerelease = parsed.prerelease;

  let channel = 'stable';
  let channelNumber = 0;

  if (typeof prerelease[0] === 'string') {
    channel = prerelease[0].toLowerCase();

    if (typeof prerelease[1] === 'number') {
      channelNumber = prerelease[1];
    }
  }

  return {
    parsed,
    channel,
    channelRank: CHANNEL_RANK[channel] ?? -1,
    channelNumber,
  };
}

function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);

  if (!parsedA || !parsedB) {
    return 0;
  }

  const baseA = `${parsedA.parsed.major}.${parsedA.parsed.minor}.${parsedA.parsed.patch}`;
  const baseB = `${parsedB.parsed.major}.${parsedB.parsed.minor}.${parsedB.parsed.patch}`;

  const baseComparison = semver.compare(baseA, baseB);

  if (baseComparison !== 0) {
    return baseComparison;
  }

  if (parsedA.channelRank !== parsedB.channelRank) {
    return parsedA.channelRank - parsedB.channelRank;
  }

  return parsedA.channelNumber - parsedB.channelNumber;
}

function extractChanges(content: string): string[] {
  const text = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:li|p|div|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");

  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•]|\d+\.)\s*/, ''))
    .filter(Boolean);
}

async function getChangelog(): Promise<ChangelogRelease[]> {
  const response = await fetch(CHANGELOG_FEED_URL, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Changelog feed returned ${response.status}`);
  }

  const feed = await rssParser.parseString(await response.text());

  return feed.items.slice(0, 5).map((item) => {
    const title = item.title?.trim() ?? 'Changelog';
    const versionMatch = title.match(/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/i);
    const publishedDate = item.isoDate ?? item.pubDate;
    const parsedDate = publishedDate ? new Date(publishedDate) : null;
    const date = parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toISOString().slice(0, 10)
      : '';
    const content = item.content ?? item.contentSnippet ?? item.summary ?? '';

    return {
      version: versionMatch ? normalizeVersion(versionMatch[1]) : title,
      date,
      changes: extractChanges(content),
    };
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VersionResponse | { error: string }>,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  const current = packageJson.version;
  let changelog: ChangelogRelease[] = [];

  try {
    changelog = await getChangelog();
  } catch (error) {
    console.error('[VERSION] Failed to fetch changelog feed:', error);
  }

  try {
    let latest = await cache.get<string>(VERSION_CACHE_KEY);

    if (!latest) {
      const response = await fetch(
        'https://api.github.com/repos/PlanetaryOrbit/orbit/releases?per_page=1',
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Orbit',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`GitHub returned ${response.status}`);
      }

      const releases = await response.json();

      if (!Array.isArray(releases) || releases.length === 0) {
        throw new Error('No Orbit releases found');
      }

      const release = releases[0];

      if (release.draft || typeof release.tag_name !== 'string') {
        throw new Error('Invalid latest Orbit release');
      }

      latest = normalizeVersion(release.tag_name);

      if (!semver.valid(latest)) {
        throw new Error(`Invalid Orbit version: ${latest}`);
      }

      await cache.set(VERSION_CACHE_KEY, latest, CACHE_TTL);
    }

    const outdated = compareVersions(current, latest) !== 0;

    return res.status(200).json({
      current,
      latest,
      outdated,
      changelog,
    });
  } catch (error) {
    console.error('[VERSION] Failed to check GitHub version:', error);

    return res.status(200).json({
      current,
      latest: null,
      outdated: false,
      changelog,
    });
  }
}
