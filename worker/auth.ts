import { betterAuth } from "better-auth";

function readSecret(env: Env): string {
  const value = Reflect.get(env, "BETTER_AUTH_SECRET");
  if (typeof value !== "string" || value.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be configured with at least 32 characters.");
  }
  return value;
}

export function createAuth(env: Env, request: Request) {
  const origin = new URL(request.url).origin;

  return betterAuth({
    appName: env.APP_NAME,
    baseURL: origin,
    basePath: "/api/auth",
    database: env.DB,
    secret: readSecret(env),
    trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    advanced: {
      cookiePrefix: "framecut",
      useSecureCookies: origin.startsWith("https://"),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
