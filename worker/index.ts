import { createAuth } from "./auth.js";
import { handleProjects } from "./projects.js";

function apiError(error: unknown): Response {
  if (error instanceof Error && error.name === "ZodError") {
    return Response.json({ error: "The request data is invalid." }, { status: 400 });
  }

  console.error(JSON.stringify({
    level: "error",
    event: "request_failed",
    message: error instanceof Error ? error.message : "Unknown error",
  }));

  const message = error instanceof Error && error.message.startsWith("BETTER_AUTH_SECRET")
    ? error.message
    : "The server could not complete this request.";
  return Response.json({ error: message }, { status: 500 });
}

async function serveFfmpegRuntime(request: Request, env: Env): Promise<Response> {
  const object = await env.MEDIA.get("runtime/ffmpeg-core-0.12.10.wasm");
  if (!object) {
    return Response.json(
      { error: "The video engine has not been seeded in R2. Run the seed:ffmpeg deployment step." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  if (request.headers.get("if-none-match") === object.httpEtag) {
    return new Response(null, { status: 304, headers: { etag: object.httpEtag } });
  }

  return new Response(object.body, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(object.size),
      "content-type": "application/wasm",
      etag: object.httpEtag,
    },
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 404 });
    }

    try {
      if (url.pathname === "/api/runtime/ffmpeg-core-0.12.10.wasm" && request.method === "GET") {
        return await serveFfmpegRuntime(request, env);
      }

      const auth = createAuth(env, request);

      if (url.pathname.startsWith("/api/auth/")) {
        return await auth.handler(request);
      }

      if (url.pathname === "/api/health" && request.method === "GET") {
        return Response.json({ ok: true, service: env.APP_NAME });
      }

      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        return Response.json({ error: "Authentication required." }, { status: 401 });
      }

      if (url.pathname === "/api/me" && request.method === "GET") {
        return Response.json({ user: session.user });
      }

      if (url.pathname === "/api/projects" || url.pathname.startsWith("/api/projects/")) {
        return await handleProjects(request, env, session);
      }

      return Response.json({ error: "Route not found." }, { status: 404 });
    } catch (error) {
      return apiError(error);
    }
  },
} satisfies ExportedHandler<Env>;
