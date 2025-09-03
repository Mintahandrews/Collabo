// Render-specific socket configuration
import { ServerOptions } from "socket.io";

// Define allowed origins
const allowedOrigins = [
  process.env.NEXT_PUBLIC_APP_URL || '',
  'http://localhost:3000',
  'https://localhost:3000'
];

// Render-specific configuration
export const renderSocketConfig: Partial<ServerOptions> = {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  transports: ['websocket', 'polling'],
  path: '/socket.io',
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
