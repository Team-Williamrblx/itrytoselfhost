import { AuthenticatedRequest, withAuth } from '@/lib/withAuth';
import prisma from '@/utils/database';
import type { NextApiRequest, NextApiResponse } from 'next';

export default withAuth(handler);

export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (!req.auth.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({
    where: { userid: BigInt(req.auth.userId) },
    select: { isOwner: true },
  });

  if (!user?.isOwner) {
    return res.status(403).json({ error: 'Access denied. Owner privileges required.' });
  }

  if (req.method === 'GET') {
    try {
      const envGoogleClientID = process.env.GOOGLE_APP_ID;
      const envGoogleClientSecret = process.env.GOOGLE_SECRET;
      const envGoogleEmailFiltration = process.env.GOOGLE_EMAIL_FILTRATION;

      const envDiscordAppID = process.env.DISCORD_APPLICATION_ID;
      const envDCClientSecret = process.env.DISCORD_SECRET;
      const envClientId = process.env.ROBLOX_CLIENT_ID;
      const envClientSecret = process.env.ROBLOX_CLIENT_SECRET;
      const envWorkspaceID = process.env.ROBLOX_WORKSPACE_REDIRECTID;
      const envOAuthOnly = process.env.ROBLOX_OAUTH_ONLY === 'true';

      const usingEnvVars = !!(
        (envClientId && envClientSecret) ||
        envWorkspaceID ||
        (envDiscordAppID && envDCClientSecret) ||
        (envGoogleClientID && envGoogleClientSecret) ||
        envGoogleEmailFiltration
      );

      if (usingEnvVars) {
        const [bgConfig, tintEnabledConfig, tintOpacityConfig] = await Promise.all([
          prisma.instanceConfig.findUnique({ where: { key: 'loginBackground' } }),
          prisma.instanceConfig.findUnique({ where: { key: 'loginBackgroundTintEnabled' } }),
          prisma.instanceConfig.findUnique({ where: { key: 'loginBackgroundTintOpacity' } }),
        ]);

        return res.json({
          robloxClientId: '••••••••',
          robloxClientSecret: '••••••••',
          discordApplicationID: envDiscordAppID ? '••••••••' : '',
          discordClientSecret: envDCClientSecret ? '••••••••' : '',
          oauthOnlyLogin: envOAuthOnly,
          redirectWorkspace: !!envWorkspaceID,
          redirectWID: envWorkspaceID,
          google_id: envGoogleClientID ? '••••••••' : '',
          google_secret: envGoogleClientSecret ? '••••••••' : '',
          google_email_filtration: envGoogleEmailFiltration || null,
          redirectUri: process.env.NEXTAUTH_URL || process.env.PUBLIC_URL
            ? `${process.env.NEXTAUTH_URL || process.env.PUBLIC_URL}/api/auth/roblox/callback`
            : '',
          loginBackground: typeof bgConfig?.value === 'string' ? bgConfig.value : null,
          loginBackgroundTintEnabled:
            typeof tintEnabledConfig?.value === 'boolean' ? tintEnabledConfig.value : true,
          loginBackgroundTintOpacity:
            typeof tintOpacityConfig?.value === 'number' ? tintOpacityConfig.value : 60,
          usingEnvVars: true,
        });
      }

      const configs = await prisma.instanceConfig.findMany({
        where: {
          key: {
            in: [
              'robloxClientId',
              'robloxClientSecret',
              'robloxRedirectUri',
              'oauthOnlyLogin',
              'redirectWorkspace',
              'discordAppID',
              'discordAppSecret',
              'loginBackground',
              'google_id',
              'google_secret',
              'google_email_filtration',
              'loginBackgroundTintEnabled',
              'loginBackgroundTintOpacity',
            ],
          },
        },
      });

      const configMap = configs.reduce<Record<string, any>>((acc, config) => {
        acc[config.key] = config.value;
        return acc;
      }, {});

      return res.json({
        robloxClientId: configMap.robloxClientId || '',
        robloxClientSecret: configMap.robloxClientSecret || '',
        robloxRedirectUri: configMap.robloxRedirectUri || '',
        oauthOnlyLogin: configMap.oauthOnlyLogin || false,
        discordApplicationID: configMap.discordAppID || '',
        discordClientSecret: configMap.discordAppSecret || '',
        usingEnvVars: false,
        redirectWorkspace: configMap.redirectWorkspace || '',
        google_id: configMap.google_id || '',
        google_secret: configMap.google_secret || '',
        google_email_filtration: configMap.google_email_filtration || '',
        loginBackground:
          typeof configMap.loginBackground === 'string' ? configMap.loginBackground : null,
        loginBackgroundTintEnabled:
          typeof configMap.loginBackgroundTintEnabled === 'boolean'
            ? configMap.loginBackgroundTintEnabled
            : true,
        loginBackgroundTintOpacity:
          typeof configMap.loginBackgroundTintOpacity === 'number'
            ? configMap.loginBackgroundTintOpacity
            : 60,
      });
    } catch (error) {
      console.error('Failed to fetch instance config:', error);
      return res.status(500).json({ error: 'Failed to fetch configuration' });
    }
  }

  if (req.method === 'POST') {
    const envClientId = process.env.ROBLOX_CLIENT_ID;
    const envClientSecret = process.env.ROBLOX_CLIENT_SECRET;
    const envWorkspaceID = process.env.ROBLOX_WORKSPACE_REDIRECTID;
    const envDiscordAppID = process.env.DISCORD_APPLICATION_ID;
    const envDCClientSecret = process.env.DISCORD_SECRET;
    const envGoogleClientID = process.env.GOOGLE_APP_ID;
    const envGoogleClientSecret = process.env.GOOGLE_SECRET;
    const envGoogleEmailFiltration = process.env.GOOGLE_EMAIL_FILTRATION;

    const usingEnvVars = !!(
      (envClientId && envClientSecret) ||
      envWorkspaceID ||
      (envDiscordAppID && envDCClientSecret) ||
      (envGoogleClientID && envGoogleClientSecret) ||
      envGoogleEmailFiltration
    );

    if (usingEnvVars) {
      return res.status(403).json({
        error: 'Cannot modify OAuth configuration when environment variables are set',
        usingEnvVars: true,
      });
    }

    const {
      robloxClientId,
      robloxClientSecret,
      robloxRedirectUri,
      oauthOnlyLogin,
      redirectWorkspaceID,
      discordAppId,
      discordSecret,
      google_id,
      google_secret,
      google_email_filtration,
      loginBackgroundTintEnabled,
      loginBackgroundTintOpacity,
    } = req.body;

    try {
      const updates = [
        { key: 'robloxClientId', value: typeof robloxClientId === 'string' ? robloxClientId.trim() : '' },
        { key: 'robloxClientSecret', value: typeof robloxClientSecret === 'string' ? robloxClientSecret.trim() : '' },
        { key: 'robloxRedirectUri', value: typeof robloxRedirectUri === 'string' ? robloxRedirectUri.trim() : '' },
        { key: 'discordAppID', value: typeof discordAppId === 'string' ? discordAppId.trim() : '' },
        { key: 'discordAppSecret', value: typeof discordSecret === 'string' ? discordSecret.trim() : '' },
        { key: 'oauthOnlyLogin', value: oauthOnlyLogin === true },
        { key: 'loginBackgroundTintEnabled', value: typeof loginBackgroundTintEnabled === 'boolean' ? loginBackgroundTintEnabled : true },
        { key: 'loginBackgroundTintOpacity', value: typeof loginBackgroundTintOpacity === 'number' ? Math.min(100, Math.max(0, loginBackgroundTintOpacity)) : 60 },
        { key: 'google_id', value: typeof google_id === 'string' ? google_id.trim() : '' },
        { key: 'google_secret', value: typeof google_secret === 'string' ? google_secret.trim() : '' },
        { key: 'google_email_filtration', value: typeof google_email_filtration === 'string' ? google_email_filtration.trim() : '' },
        { key: 'redirectWorkspace', value: typeof redirectWorkspaceID === 'string' ? redirectWorkspaceID.trim() : '' },
      ];

      await Promise.all(
        updates.map(({ key, value }) =>
          prisma.instanceConfig.upsert({
            where: { key },
            update: { value, updatedAt: new Date() },
            create: { key, value, updatedAt: new Date() },
          }),
        ),
      );

      await cache.del('orbit:auth:config-check');

      return res.json({ success: true, message: 'Configuration saved successfully' });
    } catch (error) {
      console.error('Failed to save instance config:', error);
      return res.status(500).json({ error: 'Failed to save configuration' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
