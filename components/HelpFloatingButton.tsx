'use client';

import { Menu, Dialog } from '@headlessui/react';
import {
  IconLifebuoy,
  IconBook,
  IconBrandGithub,
  IconBug,
  IconHistory,
  IconX,
  IconLicense,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

type ChangelogRelease = {
  version: string;
  date: string;
  changes: string[];
};

type ChangeCategory = {
  label: string;
  badge: string;
};

const CHANGE_CATEGORIES: Record<string, ChangeCategory> = {
  added: { label: 'Added', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  fixed: { label: 'Fixed', badge: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  updated: { label: 'Updated', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  removed: { label: 'Removed', badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  remade: { label: 'Remade', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  changed: { label: 'Changed', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  switched: { label: 'Switched', badge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  reverted: { label: 'Reverted', badge: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-300' },
  improved: { label: 'Improved', badge: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' },
};

const CHANGELOG_SOURCES = [
  { id: 'starcat', label: 'Starcat' },
  { id: 'wills', label: 'Wills' },
  { id: 'orbit', label: 'Orbit' },
] as const;
type ChangelogSource = (typeof CHANGELOG_SOURCES)[number]['id'];

function parseChange(change: string): { category: ChangeCategory | null; text: string } {
  const text = change.trim();
  const match = text.match(/^\*{1,2}([A-Za-z]+)\*{1,2}:?\s+/);
  if (match) {
    const category = CHANGE_CATEGORIES[match[1].toLowerCase()];
    if (category) return { category, text: text.slice(match[0].length).trim() };
  }
  return { category: null, text };
}

type VersionResponse = {
  current: string;
  latest: string | null;
  outdated: boolean;
  changelog: ChangelogRelease[];
};

type HelpContextValue = {
  openChangelog: () => void;
  openCopyright: () => void;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  changelog: ChangelogRelease[];
  versionLoading: boolean;
};

const HelpContext = createContext<HelpContextValue>({
  openChangelog: () => {},
  openCopyright: () => {},
  currentVersion: '',
  latestVersion: null,
  updateAvailable: false,
  changelog: [],
  versionLoading: true,
});

export function useHelp() {
  return useContext(HelpContext);
}

const menuItemClasses = clsx(
  'w-full flex items-center gap-3',
  'px-4 py-2.5',
  'text-left text-sm font-normal',
  'text-zinc-600 dark:text-zinc-300',
  'transition-colors duration-150',
  'hover:bg-zinc-100 dark:hover:bg-zinc-700/70',
  'focus:outline-none',
);
const menuIconClasses = 'h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500';

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [showChangelog, setShowChangelog] = useState(false);
  const [showCopyright, setShowCopyright] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [changelog, setChangelog] = useState<ChangelogRelease[]>([]);
  const [versionLoading, setVersionLoading] = useState(true);
  const [changelogSource, setChangelogSource] = useState<ChangelogSource>('starcat');

  const openChangelog = useCallback(() => setShowChangelog(true), []);
  const openCopyright = useCallback(() => setShowCopyright(true), []);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchVersion() {
      setVersionLoading(true);
      try {
        const response = await fetch(`/api/version?source=${changelogSource}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`Version API returned ${response.status}`);
        const data = (await response.json()) as VersionResponse;
        setCurrentVersion(data.current);
        setLatestVersion(data.latest);
        setUpdateAvailable(data.outdated);
        setChangelog(Array.isArray(data.changelog) ? data.changelog : []);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('[HELP] Failed to fetch Orbit version:', error);
        setChangelog([]);
      } finally {
        if (!controller.signal.aborted) setVersionLoading(false);
      }
    }
    fetchVersion();
    return () => controller.abort();
  }, [changelogSource]);

  return (
    <HelpContext.Provider value={{
      openChangelog, openCopyright, currentVersion, latestVersion,
      updateAvailable, changelog, versionLoading,
    }}>
      {children}

      <Dialog open={showCopyright} onClose={() => setShowCopyright(false)} className='relative z-[99999]'>
        <div className='fixed inset-0 bg-black/30 backdrop-blur-[1px]' aria-hidden='true' />
        <div className='fixed inset-0 flex items-center justify-center overflow-y-auto p-4'>
          <Dialog.Panel className='w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-800 p-6 shadow-xl ring-1 ring-black/5 dark:ring-white/5'>
            <div className='flex items-center justify-between gap-4'>
              <Dialog.Title className='text-lg font-semibold text-zinc-900 dark:text-white'>Copyright & Licensing</Dialog.Title>
              <button type='button' onClick={() => setShowCopyright(false)} aria-label='Close copyright and licensing dialog' className='rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'>
                <IconX className='h-5 w-5' stroke={1.75} aria-hidden='true' />
              </button>
            </div>
            <div className='mt-6 space-y-4'>
              <section className='rounded-xl border border-zinc-200 dark:border-zinc-700 p-4'>
                <div class='flex items-start justify-between gap-4'>
                  <div><h3 className='text-sm font-semibold text-zinc-900 dark:text-white'>Orbit</h3><p className='mt-1 text-xs text-zinc-500 dark:text-zinc-400'>© 2025–2026 Planetary</p></div>
                  <span className='rounded-md bg-zinc-100 dark:bg-zinc-700 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300'>GPL-3.0</span>
                </div>
                <p className='mt-3 text-sm text-zinc-500 dark:text-zinc-400'>Orbit is free and open-source software licensed under the GNU General Public License v3.0.</p>
              </section>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      <Dialog open={showChangelog} onClose={() => setShowChangelog(false)} className='relative z-[99999]'>
        <div className='fixed inset-0 bg-black/30 backdrop-blur-[1px]' aria-hidden='true' />
        <div className='fixed inset-0 flex items-center justify-center overflow-y-auto p-4'>
          <Dialog.Panel className='flex w-full max-w-lg max-h-[min(90vh,48rem)] flex-col rounded-2xl bg-white dark:bg-zinc-800 shadow-xl ring-1 ring-black/5 dark:ring-white/5'>
            <div className='flex shrink-0 items-center justify-between gap-4 p-6 pb-4'>
              <div><Dialog.Title className='text-lg font-semibold text-zinc-900 dark:text-white'>Changelog</Dialog.Title><p className='mt-1 text-xs text-zinc-500 dark:text-zinc-400'>Recent releases</p></div>
              <button type='button' onClick={() => setShowChangelog(false)} aria-label='Close changelog dialog' className='rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'><IconX className='h-5 w-5' stroke={1.75} aria-hidden='true' /></button>
            </div>
            <div role='tablist' aria-label='Changelog source' className='flex shrink-0 gap-1 border-b border-zinc-200 dark:border-zinc-700 px-6'>
              {CHANGELOG_SOURCES.map((source) => (
                <button
                  key={source.id}
                  id={`changelog-tab-${source.id}`}
                  type='button'
                  role='tab'
                  aria-selected={changelogSource === source.id}
                  aria-controls='changelog-panel'
                  onClick={() => setChangelogSource(source.id)}
                  className={clsx(
                    'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                    changelogSource === source.id
                      ? 'border-[color:rgb(var(--group-theme))] text-zinc-900 dark:text-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200',
                  )}
                >{source.label}</button>
              ))}
            </div>
            <div id='changelog-panel' role='tabpanel' aria-labelledby={`changelog-tab-${changelogSource}`} className='min-h-0 flex-1 overflow-y-auto px-6 py-5' aria-live='polite' aria-busy={versionLoading}>
              {versionLoading && <p className='py-6 text-sm text-zinc-500 dark:text-zinc-400' role='status'>Loading changelog…</p>}
              {!versionLoading && changelog.length === 0 && <p className='py-6 text-sm text-zinc-500 dark:text-zinc-400'>No changelog entries are currently available.</p>}
              {!versionLoading && changelog.length > 0 && <div className='space-y-4'>
                {changelog.map((release) => <article key={`${changelogSource}-${release.version}-${release.date}`} className='rounded-xl border border-zinc-200 dark:border-zinc-700 p-4'>
                  <header><h3 className='text-sm font-semibold text-zinc-900 dark:text-white'>{release.version}</h3>{release.date && <time dateTime={release.date} className='mt-1 block text-xs text-zinc-400 dark:text-zinc-500'>{release.date}</time>}</header>
                  <div className='mt-3 space-y-2'>{release.changes.map((change, index) => {
                    const { category, text } = parseChange(change);
                    return <div key={`${release.version}-${index}`} className='flex items-start gap-2.5'>
                      {category ? <span className={clsx('mt-px inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', category.badge)}>{category.label}</span> : <span className='mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600' aria-hidden='true' />}
                      <span className='min-w-0 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300'>{text}</span>
                    </div>;
                  })}</div>
                </article>)}
              </div>}
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </HelpContext.Provider>
  );
}

export function HelpFloatingButton() {
  const { openChangelog, openCopyright, currentVersion, latestVersion, updateAvailable, versionLoading } = useHelp();

  return (
    <Menu as='div' className='fixed bottom-[4.5rem] right-6 z-[99998] lg:bottom-6'>
      <Menu.Button type='button' className='flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200/80 dark:border-zinc-600/80 bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shadow-lg transition-all hover:text-[color:rgb(var(--group-theme))] focus:outline-none focus-visible:ring-2' aria-label='Open help and resources menu' title='Help & resources'>
        <IconLifebuoy className='h-6 w-6' stroke={1.75} aria-hidden='true' />
      </Menu.Button>
      <Menu.Items className='absolute right-0 bottom-full mb-2 w-56 rounded-2xl border border-zinc-200/80 dark:border-zinc-600/80 bg-white dark:bg-zinc-800 py-2.5 shadow-xl focus:outline-none'>
        <div className='px-4 pb-2.5 pt-0.5'><p className='text-xs font-semibold text-zinc-900 dark:text-white'>Orbit</p><p className={clsx('mt-0.5 text-[11px]', updateAvailable ? 'font-medium text-red-500' : 'text-zinc-500 dark:text-zinc-400')} aria-live='polite'>{versionLoading ? 'Checking for updates…' : currentVersion ? `v${currentVersion}` : 'Version unavailable'}{updateAvailable && ' · Update available'}</p></div>
        <div className='mx-3 mb-2 h-px bg-zinc-200/80 dark:bg-zinc-600/80' role='separator' />
        <a href='https://docs.planetaryapp.cloud' target='_blank' rel='noopener noreferrer' className={menuItemClasses}><IconBook className={menuIconClasses} stroke={1.5} aria-hidden='true' /><span>Documentation</span></a>
        <a href='https://github.com/planetaryorbit/orbit' target='_blank' rel='noopener noreferrer' className={menuItemClasses}><IconBrandGithub className={menuIconClasses} stroke={1.5} aria-hidden='true' /><span>GitHub</span></a>
        <a href='https://github.com/planetaryorbit/orbit/issues' target='_blank' rel='noopener noreferrer' className={menuItemClasses}><IconBug className={menuIconClasses} stroke={1.5} aria-hidden='true' /><span>Bug Reports</span></a>
        <Menu.Item>{({ active }) => <button type='button' onClick={openChangelog} className={clsx(menuItemClasses, active && 'bg-zinc-100 dark:bg-zinc-700/70')}><IconHistory className={menuIconClasses} stroke={1.5} aria-hidden='true' /><span>Changelog</span></button>}</Menu.Item>
        <div className='mx-3 my-2 h-px bg-zinc-200/80 dark:bg-zinc-600/80' role='separator' />
        <Menu.Item>{({ active }) => <button type='button' onClick={openCopyright} className={clsx(menuItemClasses, active && 'bg-zinc-100 dark:bg-zinc-700/70')}><IconLicense className={menuIconClasses} stroke={1.5} aria-hidden='true' /><span>Copyright & Licensing</span></button>}</Menu.Item>
      </Menu.Items>
    </Menu>
  );
}

export default HelpFloatingButton;
