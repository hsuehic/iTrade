// CORS for mobile clients
export const allowedOrigins = [
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'capacitor://localhost',
  'ionic://localhost',
  'https://itrade.ihsueh.com',
  'http://192.168.50.30:3000',
];
