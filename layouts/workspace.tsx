import WorkspaceBirthdayPrompt from '@/components/bdayprompt';
import WorkspaceChangelogNotice from '@/components/WorkspaceChangelogNotice';
import Sidebar from '@/components/sidebar';
import type { LayoutProps } from '@/layoutTypes';
import { workspacestate } from '@/state';
import axios from 'axios';
import clsx from 'clsx';
/* eslint-disable react-hooks/rules-of-hooks */
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useRecoilState } from 'recoil';

const workspace: LayoutProps = ({ children }) => {
  const [workspace, setWorkspace] = useRecoilState(workspacestate);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const handleRouteChangeStart = () => setLoading(true);
    const handleRouteChangeComplete = () => setLoading(false);
    router.events.on('routeChangeStart', handleRouteChangeStart);
    router.events.on('routeChangeComplete', handleRouteChangeComplete);
    router.events.on('routeChangeError', handleRouteChangeComplete);

    return () => {
      router.events.off('routeChangeStart', handleRouteChangeStart);
      router.events.off('routeChangeComplete', handleRouteChangeComplete);
      router.events.off('routeChangeError', handleRouteChangeComplete);
    };
  }, [router.events]);

  useEffect(() => {
    async function getworkspace() {
      try {
        const res = await axios.get('/api/workspace/' + router.query.id);
        setWorkspace(res.data.workspace);
      } catch {
        router.push('/');
      }
    }
    if (router.query.id) getworkspace();
  }, [router.query.id, setWorkspace, router]);

  return (
    <div className='h-screen bg-zinc-50 dark:bg-zinc-950'>
      <Head>
        <title>{workspace.groupName ? `Orbit - ${workspace.groupName}` : 'Loading...'}</title>
        <link rel='icon' href={`${workspace.groupThumbnail}`} />
      </Head>
      <div className='flex h-screen overflow-hidden'>
        <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
        <main
          className={clsx(
            'flex-1 transition-all duration-300 overflow-y-auto bg-zinc-50 dark:bg-zinc-950',
            'pb-20 lg:pb-0',
          )}
        >
          {router.query.id && <WorkspaceChangelogNotice />}
          <div className='relative z-10'>{children}</div>
          {router.query.id && <WorkspaceBirthdayPrompt workspaceId={router.query.id as string} />}
        </main>
      </div>
    </div>
  );
};

export default workspace;
