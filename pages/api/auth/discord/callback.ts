import { AuthenticatedRequest } from '@/lib/withAuth';
import Package from '@/package.json';
import prisma from '@/utils/database';
import { createSession, getSessionByToken } from '@/utils/session';
import { getOAuthRedirectUri } from '@/utils/oauthRedirectUri';
import axios from 'axios';
import * as cookie from 'cookie';
import type { NextApiResponse } from 'next';

 type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
};

type DiscordUserResponse = {
  id: string;
  username: string;
  avatar: string | null;
};

export default async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error } = req.query;
  if (error) return res.redirect('/login?error=oauth_error');
  if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
    return res.redirect('/login?error=missing_params');
  }

  const oauthState = await prisma.oAuthState.findUnique({ where: { state } });
  if (!oauthState || oauthState.provider !== 'discord') {
    return res.redirect('/login?error=invalid_state');
  }
  if (oauthState.expiresAt < new Date()) {
    await prisma.oAuthState.delete({ where: { state } });
    return res.redirect('/login?error=expired_state');
  }
  await prisma.oAuthState.delete({ where: { state } });

  let clientId = process.env.DISCORD_APPLICATION_ID;
  let clientSecret = process.env.DISCORD_SECRET;
  if (!clientId || !clientSecret) {
    const configs = await prisma.instanceConfig.findMany({
      where: { key: { in: ['discordAppID', 'discordAppSecret'] } },
    });
    const configMap = configs.reduce<Record<string, unknown>>((acc, config) => {
      acc[config.key] = typeof config.value === 'string' ? config.value.trim() : config.value;
      return acc;
    }, {});
    clientId ||= typeof configMap.discordAppID === 'string' ? configMap.discordAppID : undefined;
    clientSecret ||= typeof configMap.discordAppSecret === 'string' ? configMap.discordAppSecret : undefined;
  }
  if (!clientId || !clientSecret) return res.redirect('/login?error=config_error');

  let redirectUri: string;
  try {
    redirectUri = getOAuthRedirectUri(req, 'discord');
  } catch (error) {
    console.error('Invalid public URL for Discord OAuth:', error);
    return res.redirect('/login?error=config_error');
  }

  try {
    const tokenResponse = await axios.post<DiscordTokenResponse>(
      'https://discord.com/api/v10/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': `orbit/${Package.version}`,
        },
      },
    );

    const userResponse = await axios.get<DiscordUserResponse>(
      'https://discord.com/api/v10/users/@me',
      {
        headers: {
          Authorization: `Bearer ${tokenResponse.data.access_token}`,
          'User-Agent': `orbit/${Package.version}`,
        },
      },
    );

    const discordUser = userResponse.data;
    const discordUserId = BigInt(discordUser.id);
    const existingDiscord = await prisma.discordUser.findUnique({ where: { discordUserId } });
    const cookies = cookie.parse(req.headers.cookie || '');
    const sessionToken = cookies.session_token;

    if (sessionToken) {
      const info = await getSessionByToken(sessionToken);
      if (info) {
        await prisma.discordUser.upsert({
          where: { discordUserId },
          update: {
            username: discordUser.username,
            avatar: discordUser.avatar,
            robloxUserId: info.userId,
          },
          create: {
            discordUserId,
            username: discordUser.username,
            avatar: discordUser.avatar,
            robloxUserId: info.userId,
          },
        });
        return res.redirect('/?action=linked');
      }
    }

    if (!existingDiscord?.robloxUserId) return res.redirect('/login?error=not_linked');

    const ipAddress =
      (req.headers['cf-connecting-ip'] as string) ||
      (req.headers['x-real-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const session = await createSession(
      existingDiscord.robloxUserId,
      ipAddress,
      req.headers['user-agent'],
    );

    res.setHeader(
      'Set-Cookie',
      `session_token=${session.token}; Path=/; HttpOnly; SameSite=lax; Max-Age=${60 * 60 * 24 * 7}; ${process.env.NODE_ENV === 'production' ? 'Secure' : ''}`,
    );
    return res.redirect('/');
  } catch (err) {
    console.error('Discord OAuth error:', err);
    if (axios.isAxiosError(err)) console.error(err.response?.data);
    return res.redirect('/login?error=oauth_failed');
  }
}
