import { AuthenticatedRequest } from '@/lib/withAuth';
import prisma from '@/utils/database';
import { createSession, getSessionByToken } from '@/utils/session';
import cookie from 'cookie';
import { google } from 'googleapis';
import type { NextApiRequest, NextApiResponse } from 'next';

function getPublicBaseUrl(req: NextApiRequest): string {
  const configuredUrl = process.env.NEXTAUTH_URL || process.env.PUBLIC_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');

  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string'
    ? forwardedProto.split(',')[0].trim()
    : req.headers.host?.includes('localhost')
      ? 'http'
      : 'https';
  const host = req.headers.host;

  return host ? `${protocol}://${host}` : '';
}

export default async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error } = req.query;

  if (error) {
    console.error('Google OAuth error:', error);
    return res.redirect('/login?error=oauth_error');
  }

  if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
    return res.redirect('/login?error=missing_params');
  }

  const oauthState = await prisma.oAuthState.findUnique({ where: { state } });
  if (!oauthState || oauthState.provider !== 'google') {
    return res.redirect('/login?error=state-mismatch');
  }
  if (oauthState.expiresAt < new Date()) {
    await prisma.oAuthState.delete({ where: { state } });
    return res.redirect('/login?error=expired_state');
  }

  await prisma.oAuthState.delete({ where: { state } });

  let clientId = process.env.GOOGLE_APP_ID;
  let clientSecret = process.env.GOOGLE_SECRET;
  let emailFiltration = process.env.GOOGLE_EMAIL_FILTRATION;

  if (!clientId || !clientSecret) {
    try {
      const configs = await prisma.instanceConfig.findMany({
        where: {
          key: {
            in: ['google_id', 'google_secret', 'google_email_filtration'],
          },
        },
      });

      const configMap = configs.reduce<Record<string, any>>((acc, config) => {
        acc[config.key] = typeof config.value === 'string' ? config.value.trim() : config.value;
        return acc;
      }, {});

      clientId ||= configMap.google_id;
      clientSecret ||= configMap.google_secret;
      emailFiltration ||= configMap.google_email_filtration;
    } catch (err) {
      console.error('Failed to fetch Google OAuth config:', err);
    }
  }

  if (!clientId || !clientSecret) {
    return res.redirect('/login?error=config_error');
  }

  const baseUrl = getPublicBaseUrl(req);
  if (!baseUrl) return res.redirect('/login?error=config_error');

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${baseUrl}/api/auth/google/callback`,
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token) throw new Error('No access token returned');

    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    const googleId = profile.id;
    if (!googleId) throw new Error('Could not extract Google ID');

    const displayName = profile.name ?? profile.email ?? 'Unknown';
    const avatar = profile.picture ?? null;
    const email = profile.email ?? null;

    if (emailFiltration) {
      const allowedDomain = emailFiltration.toLowerCase().replace(/^@/, '');
      if (!email || !email.toLowerCase().endsWith(`@${allowedDomain}`)) {
        return res.redirect('/login?error=unauthorized-domain');
      }
    }

    const existingGoogle = await prisma.googleUser.findUnique({
      where: { googleUserId: googleId },
    });

    const cookies = cookie.parse(req.headers.cookie || '');
    const sessionToken = cookies.session_token;

    if (sessionToken) {
      const info = await getSessionByToken(sessionToken);
      if (info) {
        await prisma.googleUser.upsert({
          where: { googleUserId: googleId },
          update: {
            username: displayName,
            avatar,
            email,
            robloxUserId: info.userId,
          },
          create: {
            googleUserId: googleId,
            username: displayName,
            avatar,
            email,
            robloxUserId: info.userId,
          },
        });

        return res.redirect('/?action=linked');
      }
    }

    if (!existingGoogle?.robloxUserId) {
      return res.redirect('/login?error=google-not-linked');
    }

    const ipAddress =
      (req.headers['cf-connecting-ip'] as string) ||
      (req.headers['x-real-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';

    const session = await createSession(
      existingGoogle.robloxUserId,
      ipAddress,
      req.headers['user-agent'],
    );

    res.setHeader(
      'Set-Cookie',
      `session_token=${session.token}; Path=/; HttpOnly; SameSite=lax; Max-Age=${60 * 60 * 24 * 30}; ${process.env.NODE_ENV === 'production' ? 'Secure' : ''}`,
    );

    return res.redirect('/');
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return res.redirect('/login?error=oauth_failed');
  }
}
