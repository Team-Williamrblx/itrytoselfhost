import type { NextApiRequest } from 'next';

export function getOAuthRedirectUri(req: NextApiRequest, provider: 'discord' | 'google'): string {
  const configuredBase =
    process.env.PLANETARY_CLOUD_URL || process.env.NEXTAUTH_URL || process.env.PUBLIC_URL;

  let origin: string;
  if (configuredBase) {
    const normalizedBase = /^[a-z][a-z\d+.-]*:\/\//i.test(configuredBase)
      ? configuredBase
      : `https://${configuredBase}`;
    origin = new URL(normalizedBase).origin;
  } else {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = typeof forwardedProto === 'string'
      ? forwardedProto.split(',')[0].trim()
      : req.headers.host?.includes('localhost')
        ? 'http'
        : 'https';
    if (!req.headers.host) throw new Error('Public host is not configured');
    origin = `${protocol}://${req.headers.host}`;
  }

  return new URL(`/api/auth/${provider}/callback`, origin).toString();
}
