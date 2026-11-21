import { randomUUID } from 'node:crypto';
import prisma from '@/utils/database';
import { getOAuthRedirectUri } from '@/utils/oauthRedirectUri';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let clientId = process.env.DISCORD_APPLICATION_ID;
  if (!clientId) {
    try {
      const config = await prisma.instanceConfig.findUnique({ where: { key: 'discordAppID' } });
      clientId = typeof config?.value === 'string' ? config.value.trim() : undefined;
    } catch (error) {
      console.error('Failed to fetch Discord OAuth config:', error);
    }
  }

  if (!clientId) {
    console.error('Missing Discord OAuth configuration');
    return res.status(500).json({ error: 'OAuth configuration error' });
  }

  let redirectUri: string;
  try {
    redirectUri = getOAuthRedirectUri(req, 'discord');
  } catch (error) {
    console.error('Invalid public URL for Discord OAuth:', error);
    return res.status(500).json({ error: 'OAuth redirect URL configuration error' });
  }

  const state = randomUUID();
  await prisma.oAuthState.create({
    data: {
      state,
      provider: 'discord',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const authUrl = new URL('https://discord.com/oauth2/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'identify');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);

  return res.redirect(authUrl.toString());
}
