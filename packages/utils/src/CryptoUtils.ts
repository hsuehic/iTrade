import { createHash, createHmac, randomBytes } from 'crypto';

export class CryptoUtils {
  // Hashing Functions
  static sha256(data: string | Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  static sha512(data: string | Buffer): string {
    return createHash('sha512').update(data).digest('hex');
  }

  static md5(data: string | Buffer): string {
    return createHash('md5').update(data).digest('hex');
  }

  // HMAC Functions
  static hmacSha256(data: string | Buffer, key: string | Buffer): string {
    return createHmac('sha256', key).update(data).digest('hex');
  }

  static hmacSha512(data: string | Buffer, key: string | Buffer): string {
    return createHmac('sha512', key).update(data).digest('hex');
  }

  static hmacMd5(data: string | Buffer, key: string | Buffer): string {
    return createHmac('md5', key).update(data).digest('hex');
  }

  // Base64 Encoding/Decoding
  static base64Encode(data: string | Buffer): string {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    return buffer.toString('base64');
  }

  static base64Decode(data: string): string {
    return Buffer.from(data, 'base64').toString('utf8');
  }

  static base64UrlEncode(data: string | Buffer): string {
    const base64 = this.base64Encode(data);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  static base64UrlDecode(data: string): string {
    // Add padding if necessary
    const padding = 4 - (data.length % 4);
    const paddedData = data + '='.repeat(padding % 4);
    
    // Replace URL-safe characters
    const base64 = paddedData.replace(/-/g, '+').replace(/_/g, '/');
    
    return this.base64Decode(base64);
  }

  // Random Generation
  static generateRandomHex(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  static generateRandomBase64(length: number = 32): string {
    return randomBytes(length).toString('base64');
  }

  static generateRandomString(length: number = 32, charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
    let result = '';
    const bytes = randomBytes(length);
    
    for (let i = 0; i < length; i++) {
      result += charset[bytes[i] % charset.length];
    }
    
    return result;
  }

  static generateNonce(): string {
    return Date.now().toString() + this.generateRandomString(8);
  }

  static generateUUID(): string {
    return randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  }

  // API Signature Generation (Common Patterns)
  
  // Binance-style signature
  static generateBinanceSignature(queryString: string, secretKey: string): string {
    return this.hmacSha256(queryString, secretKey);
  }

  // Generic query string signing
  static signQueryString(params: Record<string, any>, secretKey: string, algorithm: 'sha256' | 'sha512' = 'sha256'): string {
    const queryString = this.buildQueryString(params);
    
    switch (algorithm) {
      case 'sha256':
        return this.hmacSha256(queryString, secretKey);
      case 'sha512':
        return this.hmacSha512(queryString, secretKey);
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  // JWT-style signature (simplified)
  static generateJWTSignature(header: object, payload: object, secretKey: string): string {
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const data = `${encodedHeader}.${encodedPayload}`;
    
    return this.base64UrlEncode(this.hmacSha256(data, secretKey));
  }

  // URL and Query String Utilities
  static buildQueryString(params: Record<string, any>): string {
    return Object.keys(params)
      .sort()
      .map(key => {
        const value = params[key];
        if (value === null || value === undefined) {
          return '';
        }
        return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
      })
      .filter(param => param.length > 0)
      .join('&');
  }

  static parseQueryString(queryString: string): Record<string, string> {
    const params: Record<string, string> = {};
    
    if (!queryString) return params;
    
    const pairs = queryString.replace(/^\?/, '').split('&');
    
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key) {
        params[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    }
    
    return params;
  }

  // Data Integrity
  static calculateChecksum(data: string | Buffer, algorithm: 'md5' | 'sha256' = 'sha256'): string {
    switch (algorithm) {
      case 'md5':
        return this.md5(data);
      case 'sha256':
        return this.sha256(data);
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  static verifyChecksum(data: string | Buffer, expectedChecksum: string, algorithm: 'md5' | 'sha256' = 'sha256'): boolean {
    const actualChecksum = this.calculateChecksum(data, algorithm);
    return actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();
  }

  // Timing-Safe Comparison
  static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }

  // Exchange-Specific Utilities
  
  // Coinbase Pro signature
  static generateCoinbaseSignature(
    timestamp: string,
    method: string,
    requestPath: string,
    body: string,
    secretKey: string
  ): string {
    const message = timestamp + method.toUpperCase() + requestPath + body;
    const decodedSecret = Buffer.from(secretKey, 'base64');
    return createHmac('sha256', decodedSecret).update(message).digest('base64');
  }

  // Kraken signature
  static generateKrakenSignature(
    urlPath: string,
    nonce: string,
    postData: string,
    secretKey: string
  ): string {
    const decodedSecret = Buffer.from(secretKey, 'base64');
    const hash = createHash('sha256').update(nonce + postData).digest();
    const hmac = createHmac('sha512', decodedSecret);
    
    hmac.update(urlPath);
    hmac.update(hash);
    
    return hmac.digest('base64');
  }

  // Huobi signature
  static generateHuobiSignature(
    method: string,
    hostname: string,
    path: string,
    params: Record<string, any>,
    secretKey: string
  ): string {
    const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {} as Record<string, any>);
    
    const queryString = this.buildQueryString(sortedParams);
    const payload = `${method.toUpperCase()}\n${hostname}\n${path}\n${queryString}`;
    
    return this.base64Encode(this.hmacSha256(payload, secretKey));
  }

  // OKX signature
  static generateOKXSignature(
    timestamp: string,
    method: string,
    requestPath: string,
    body: string,
    secretKey: string
  ): string {
    const message = timestamp + method.toUpperCase() + requestPath + body;
    return this.base64Encode(this.hmacSha256(message, secretKey));
  }

  // Utility Methods
  static isValidSignature(signature: string): boolean {
    // Basic validation for hex signatures
    const hexRegex = /^[a-fA-F0-9]+$/;
    return typeof signature === 'string' && signature.length > 0 && hexRegex.test(signature);
  }

  static isValidApiKey(apiKey: string): boolean {
    // Basic validation - should be non-empty string with reasonable length
    return typeof apiKey === 'string' && apiKey.length >= 8 && apiKey.length <= 128;
  }

  static maskApiKey(apiKey: string, visibleChars: number = 4): string {
    if (!apiKey || apiKey.length <= visibleChars * 2) {
      return '*'.repeat(8);
    }
    
    const start = apiKey.slice(0, visibleChars);
    const end = apiKey.slice(-visibleChars);
    const middle = '*'.repeat(Math.max(4, apiKey.length - visibleChars * 2));
    
    return `${start}${middle}${end}`;
  }

  static sanitizeSecretKey(secretKey: string): void {
    // In a real implementation, you might want to overwrite the memory
    // For now, just validate format
    if (!secretKey || secretKey.length < 16) {
      throw new Error('Invalid secret key format');
    }
  }

  // URL Encoding for API calls
  static encodeURIParameter(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    return encodeURIComponent(String(value));
  }

  static buildApiUrl(baseUrl: string, endpoint: string, params?: Record<string, any>): string {
    const url = new URL(endpoint, baseUrl);
    
    if (params) {
      const queryString = this.buildQueryString(params);
      if (queryString) {
        url.search = queryString;
      }
    }
    
    return url.toString();
  }

  // Rate Limiting Helpers
  static generateRateLimitKey(apiKey: string, endpoint: string): string {
    const hashedKey = this.sha256(apiKey).slice(0, 16);
    return `${hashedKey}:${endpoint}`;
  }

  // Data Serialization for Signing
  static serializeForSigning(data: any): string {
    if (typeof data === 'string') {
      return data;
    }
    
    if (typeof data === 'object' && data !== null) {
      return JSON.stringify(data, Object.keys(data).sort());
    }
    
    return String(data);
  }
}
