'use client';

import { IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';

type ChangelogRelease = {
  version: string;
  date: string;
  changes: string[];
  image?: string;
};

type VersionResponse = {
  changelog: ChangelogRelease[];
};

const DISMISSED_RELEASE_KEY = 'orbit:workspace-changelog-dismissed:starcat';
const REFRESH_INTERVAL = 15 * 60 * 1000;

export default function WorkspaceChangelogNotice() {
  const [release, setRelease] = useState<ChangelogRelease | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  const refresh = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch('/api/version?source=starcat', {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;

      const data = (await response.json()) as VersionResponse;
      const latestRelease = data.changelog?.[0] ?? null;
      if (!latestRelease) return;

      let dismissed: string | null = null;
      try {
        dismissed = window.localStorage.getItem(DISMISSED_RELEASE_KEY);
      } catch {
        // Continue showing the notice when local storage is unavailable.
      }

      setDismissedVersion(dismissed);
      setRelease(latestRelease);
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('[WORKSPACE] Failed to fetch changelog notice:', error);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const interval = window.setInterval(() => {
      void refresh(controller.signal);
    }, REFRESH_INTERVAL);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [refresh]);

  const dismiss = () => {
    if (!release) return;
    try {
      window.localStorage.setItem(DISMISSED_RELEASE_KEY, release.version);
    } catch {
      // The current notice is still hidden for this render if storage is unavailable.
    }
    setDismissedVersion(release.version);
  };

  if (!release || dismissedVersion === release.version) return null;

  return (
    <aside
      aria-label='New changelog update'
      className='sticky top-0 z-30 mx-4 mb-4 mt-4 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 shadow-md dark:border-amber-900/70 dark:bg-zinc-900 sm:mx-6'
    >
      <div className='flex items-start gap-4 p-4'>
        {release.image && (
          <img
            src={release.image}
            alt=''
            className='h-16 w-16 shrink-0 rounded-lg object-cover sm:h-20 sm:w-20'
            loading='lazy'
            referrerPolicy='no-referrer'
          />
        )}
        <div className='min-w-0 flex-1'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300'>
                New Starcat update
              </p>
              <h2 className='mt-1 text-base font-semibold text-zinc-900 dark:text-white'>
                {release.version}
              </h2>
              {release.date && (
                <time dateTime={release.date} className='mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400'>
                  {release.date}
                </time>
              )}
            </div>
            <button
              type='button'
              onClick={dismiss}
              aria-label='Dismiss changelog update'
              className='rounded-md p-1 text-zinc-500 hover:bg-amber-100 hover:text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-zinc-800 dark:hover:text-white'
            >
              <IconX className='h-4 w-4' aria-hidden='true' />
            </button>
          </div>
          {release.changes.length > 0 && (
            <ul className='mt-2 list-inside list-disc space-y-1 text-sm text-zinc-700 dark:text-zinc-300'>
              {release.changes.slice(0, 3).map((change, index) => (
                <li key={`${release.version}-${index}`}>{change}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
