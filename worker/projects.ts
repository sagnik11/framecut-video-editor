import { z } from "zod";
import type { Auth } from "./auth.js";

type Session = Awaited<ReturnType<Auth["api"]["getSession"]>>;

type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  status: string;
  source_key: string | null;
  export_key: string | null;
  source_name: string | null;
  source_type: string | null;
  source_size: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  settings: string;
  created_at: string;
  updated_at: string;
};

const projectUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  duration: z.number().finite().nonnegative().max(60 * 60 * 12).optional(),
  width: z.number().int().positive().max(16384).optional(),
  height: z.number().int().positive().max(16384).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const uploadStartSchema = z.object({
  kind: z.enum(["source", "export"]),
  fileName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
});

const uploadedPartSchema = z.object({
  partNumber: z.number().int().min(1).max(10_000),
  etag: z.string().min(1).max(256),
});

const uploadCompleteSchema = z.object({
  key: z.string().min(1),
  kind: z.enum(["source", "export"]),
  parts: z.array(uploadedPartSchema).min(1).max(10_000),
  fileName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
  duration: z.number().finite().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function safeSettings(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function toProject(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    sourceReady: Boolean(row.source_key),
    exportReady: Boolean(row.export_key),
    sourceName: row.source_name,
    sourceType: row.source_type,
    sourceSize: row.source_size,
    duration: row.duration,
    width: row.width,
    height: row.height,
    settings: safeSettings(row.settings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Expected an application/json request body.");
  }
  return await request.json();
}

async function ownedProject(env: Env, userId: string, projectId: string): Promise<ProjectRow | null> {
  return await env.DB.prepare(
    `SELECT id, user_id, name, status, source_key, export_key, source_name, source_type,
      source_size, duration, width, height, settings, created_at, updated_at
     FROM project WHERE id = ? AND user_id = ?`,
  ).bind(projectId, userId).first<ProjectRow>();
}

function mediaKey(userId: string, projectId: string, kind: "source" | "export", fileName: string): string {
  const extension = fileName.toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0] ?? ".mp4";
  return `${userId}/${projectId}/${kind}/${crypto.randomUUID()}${extension}`;
}

function validOwnedKey(key: string, userId: string, projectId: string): boolean {
  return key.startsWith(`${userId}/${projectId}/`) && !key.includes("..") && !key.startsWith("/");
}

async function serveMedia(request: Request, env: Env, key: string): Promise<Response> {
  const object = await env.MEDIA.get(key, { range: request.headers });
  if (!object) return json({ error: "Media not found." }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=0, must-revalidate");
  headers.set("etag", object.httpEtag);

  let status = 200;
  if (object.range && "offset" in object.range && typeof object.range.offset === "number") {
    const length = object.range.length ?? object.size - object.range.offset;
    headers.set("content-range", `bytes ${object.range.offset}-${object.range.offset + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    status = 206;
  }

  return new Response(object.body, { status, headers });
}

export async function handleProjects(request: Request, env: Env, session: NonNullable<Session>): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const userId = session.user.id;

  if (segments.length === 2) {
    if (request.method === "GET") {
      const result = await env.DB.prepare(
        `SELECT id, user_id, name, status, source_key, export_key, source_name, source_type,
          source_size, duration, width, height, settings, created_at, updated_at
         FROM project WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100`,
      ).bind(userId).all<ProjectRow>();
      return json({ projects: result.results.map(toProject) });
    }

    if (request.method === "POST") {
      const body = z.object({ name: z.string().trim().min(1).max(80) }).parse(await readJson(request));
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO project (id, user_id, name, status, settings, created_at, updated_at) VALUES (?, ?, ?, 'draft', '{}', ?, ?)",
      ).bind(id, userId, body.name, now, now).run();
      const project = await ownedProject(env, userId, id);
      return json({ project: project ? toProject(project) : null }, 201);
    }

    return json({ error: "Method not allowed." }, 405);
  }

  const projectId = segments[2];
  if (!projectId) return json({ error: "Project not found." }, 404);
  const project = await ownedProject(env, userId, projectId);
  if (!project) return json({ error: "Project not found." }, 404);

  if (segments.length === 3) {
    if (request.method === "GET") return json({ project: toProject(project) });

    if (request.method === "PATCH") {
      const body = projectUpdateSchema.parse(await readJson(request));
      const nextName = body.name ?? project.name;
      const nextDuration = body.duration ?? project.duration;
      const nextWidth = body.width ?? project.width;
      const nextHeight = body.height ?? project.height;
      const nextSettings = body.settings ? JSON.stringify(body.settings) : project.settings;
      const now = new Date().toISOString();
      await env.DB.prepare(
        "UPDATE project SET name = ?, duration = ?, width = ?, height = ?, settings = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      ).bind(nextName, nextDuration, nextWidth, nextHeight, nextSettings, now, projectId, userId).run();
      const updated = await ownedProject(env, userId, projectId);
      return json({ project: updated ? toProject(updated) : null });
    }

    if (request.method === "DELETE") {
      const keys = [project.source_key, project.export_key].filter((key): key is string => Boolean(key));
      if (keys.length > 0) await env.MEDIA.delete(keys);
      await env.DB.prepare("DELETE FROM project WHERE id = ? AND user_id = ?").bind(projectId, userId).run();
      return new Response(null, { status: 204 });
    }

    return json({ error: "Method not allowed." }, 405);
  }

  if (segments[3] === "media" && request.method === "GET") {
    const kind = segments[4];
    const key = kind === "source" ? project.source_key : kind === "export" ? project.export_key : null;
    if (!key) return json({ error: "Media not found." }, 404);
    return await serveMedia(request, env, key);
  }

  if (segments[3] !== "uploads") return json({ error: "Route not found." }, 404);

  if (segments.length === 4 && request.method === "POST") {
    const body = uploadStartSchema.parse(await readJson(request));
    const maxUpload = Number(env.MAX_UPLOAD_BYTES);
    if (!Number.isFinite(maxUpload) || body.size > maxUpload) {
      return json({ error: "The file exceeds this deployment's upload limit." }, 413);
    }
    const key = mediaKey(userId, projectId, body.kind, body.fileName);
    const upload = await env.MEDIA.createMultipartUpload(key, {
      httpMetadata: { contentType: body.contentType },
      customMetadata: { userId, projectId, kind: body.kind, originalName: body.fileName },
    });
    return json({ key, uploadId: upload.uploadId });
  }

  const uploadId = segments[4];
  if (!uploadId) return json({ error: "Upload not found." }, 404);
  const key = url.searchParams.get("key") ?? "";
  if (!validOwnedKey(key, userId, projectId)) return json({ error: "Invalid upload key." }, 400);
  const upload = env.MEDIA.resumeMultipartUpload(key, uploadId);

  if (segments.length === 6 && segments[5] === "complete" && request.method === "POST") {
    const body = uploadCompleteSchema.parse(await readJson(request));
    if (body.key !== key || !validOwnedKey(body.key, userId, projectId)) {
      return json({ error: "Invalid upload key." }, 400);
    }
    await upload.complete(body.parts);
    const now = new Date().toISOString();
    if (body.kind === "source") {
      await env.DB.prepare(
        `UPDATE project SET source_key = ?, source_name = ?, source_type = ?, source_size = ?,
          duration = COALESCE(?, duration), width = COALESCE(?, width), height = COALESCE(?, height),
          status = 'ready', updated_at = ? WHERE id = ? AND user_id = ?`,
      ).bind(key, body.fileName, body.contentType, body.size, body.duration ?? null, body.width ?? null, body.height ?? null, now, projectId, userId).run();
      if (project.source_key && project.source_key !== key) await env.MEDIA.delete(project.source_key);
    } else {
      await env.DB.prepare(
        "UPDATE project SET export_key = ?, status = 'exported', updated_at = ? WHERE id = ? AND user_id = ?",
      ).bind(key, now, projectId, userId).run();
      if (project.export_key && project.export_key !== key) await env.MEDIA.delete(project.export_key);
    }
    const updated = await ownedProject(env, userId, projectId);
    return json({ project: updated ? toProject(updated) : null });
  }

  if (segments.length === 6 && segments[5] === "abort" && request.method === "DELETE") {
    await upload.abort();
    return new Response(null, { status: 204 });
  }

  if (segments.length === 6 && request.method === "PUT") {
    const partNumber = Number(segments[5]);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000 || !request.body) {
      return json({ error: "Invalid upload part." }, 400);
    }
    const part = await upload.uploadPart(partNumber, request.body);
    return json({ partNumber: part.partNumber, etag: part.etag });
  }

  return json({ error: "Route not found." }, 404);
}
