declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_APP_URL: string;
    NEXT_PUBLIC_SOCKET_URL: string;
    PORT: string;
    NODE_ENV: "development" | "production" | "test";
  }
}
