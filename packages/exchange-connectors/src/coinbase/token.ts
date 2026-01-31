import * as crypto from 'crypto';

import * as jwt from 'jsonwebtoken';

import { BASE_URL, ALGORITHM, JWT_ISSUER } from './constants';

export function generateToken(
  requestMethod: string,
  requestPath: string,
  apiKey: string,
  apiSecret: string,
): string {
  const uri = `${requestMethod} ${BASE_URL}${requestPath}`;
  const payload = {
    iss: JWT_ISSUER,
    nbf: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 120,
    sub: apiKey,
    uri,
  };

  const header = {
    alg: ALGORITHM,
    kid: apiKey,
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const options: jwt.SignOptions = {
    algorithm: ALGORITHM as jwt.Algorithm,
    header: header,
  };

  const normalizePemKey = (secretKey: string) => {
    const withNewlines = secretKey.includes('\\n')
      ? secretKey.replace(/\\n/g, '\n')
      : secretKey;
    const trimmed = withNewlines.trim();
    const beginMatch = trimmed.match(/-----BEGIN [^-]+-----/);
    const endMatch = trimmed.match(/-----END [^-]+-----/);

    if (!beginMatch || !endMatch) {
      return trimmed;
    }

    const header = beginMatch[0];
    const footer = endMatch[0];
    const body = trimmed.replace(header, '').replace(footer, '').replace(/\s+/g, '');
    if (!body) {
      return trimmed;
    }

    const wrappedBody = body.match(/.{1,64}/g)?.join('\n') ?? body;
    return `${header}\n${wrappedBody}\n${footer}`;
  };

  const normalizedSecret = normalizePemKey(apiSecret);

  return jwt.sign(payload, normalizedSecret as string, options);
}
