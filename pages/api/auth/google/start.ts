import prisma from '@/utils/database';
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let clientId = process.env.GOOGLE_APP_ID;
  let secret = process.env.GOOGLE_SECRET;

  if (!clientId || !secret) {
    try {
      const configs = await prisma.instanceConfig.findMany({
        where: {
          key: { in: ['google_id', 'google_secret'] },
        },
      });

      const configMap = configs.reduce<Record<string, any>>((acc, config) => {
        acc[config.key] = typeof config.value === 'string' ? config.value.trim() : config.value;
        return acc;
      }, {});

      clientId ||= configMap.google_id;
      secret ||= configMap.google_secret;
    } catch (error) {
      console.error('Failed to fetch Google OAuth config:', error);
    }
  }

  if (!clientId || !secret) {
    console.error('Missing Google OAuth configuration');
    return res.redirect('/login?error=config_error');
  }

  const baseUrl = getPublicBaseUrl(req);
  if (!baseUrl) {
    return res.redirect('/login?error=config_error');
  }

  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const state = crypto.randomUUID();

  await prisma.oAuthState.create({
    data: {
      state,
      provider: 'google',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const oauth2 = new google.auth.OAuth2(clientId, secret, redirectUri);
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    include_granted_scopes: true,
    state,
    prompt: 'consent',
  });

  res.redirect(authUrl);
}
