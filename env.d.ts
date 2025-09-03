declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_APP_URL: string;
    NEXT_PUBLIC_SOCKET_URL: string;
    NEXT_PUBLIC_FORCE_POLLING?: string;
    PORT: string;
    NODE_ENV: "development" | "production" | "test";
    TWILIO_ACCOUNT_SID?: string;
    TWILIO_AUTH_TOKEN?: string;
    TWILIO_TTL_SECONDS?: string;
  }
}
