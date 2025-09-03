// Render-specific socket configuration
import { ServerOptions } from "socket.io";

// Define allowed origins
const allowedOrigins = [
  process.env.NEXT_PUBLIC_APP_URL || '',
  'http://localhost:3000',
  'https://localhost:3000'
];

// Allow typical Render domains and localhost; if NEXT_PUBLIC_APP_URL is unset or mismatched,
// this function will still allow the incoming origin to prevent accidental CORS blocks.
const onrenderPattern = /^https?:\/\/([a-z0-9-]+\.)*onrender\.com$/i;
const localhostPattern = /^https?:\/\/localhost(:\d+)?$/i;

const corsOrigin = (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
  // Allow non-browser clients with no origin
  if (!origin) return callback(null, true);

  // Allow exact explicit origins
  const explicit = allowedOrigins.filter(Boolean) as string[];
  if (explicit.includes(origin)) return callback(null, true);

  // Allow Render service domains and localhost by default
  if (onrenderPattern.test(origin) || localhostPattern.test(origin)) return callback(null, true);

  // Otherwise, block
  return callback(null, false);
};

// Render-specific configuration
export const renderSocketConfig: Partial<ServerOptions> = {
  cors: {
    origin: corsOrigin as any,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  transports: ['websocket', 'polling'],
  path: '/socket.io',
  // Disable compression to avoid issues with certain reverse proxies
  perMessageDeflate: false,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  allowEIO3: true,
  maxHttpBufferSize: 1e8, // 100 MB
  // Render-specific settings
  cookie: {
    name: 'collabo_io',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production'
  }
};

// Health check endpoint for Render
export const healthCheckPath = '/health';

// Render service information
export const renderServiceInfo = {
  serviceType: 'web',
  buildCommand: 'npm run build',
  startCommand: 'npm run start',
  envVars: [
    'NODE_ENV',
    'PORT',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_SOCKET_URL'
  ]
};
