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
  timeline_duration: number | null;
  settings: string;
  created_at: string;
  updated_at: string;
};

type ClipRow = {
  id: string;
  project_id: string;
  r2_key: string;
  name: string;
  type: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  position: number;
  created_at: string;
};

const projectUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  duration: z.number().finite().nonnegative().max(60 * 60 * 12).optional(),
  width: z.number().int().positive().max(16384).optional(),
  height: z.number().int().positive().max(16384).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const uploadKindSchema = z.enum(["source", "clip", "export"]);
const uploadStartSchema = z.object({
  kind: uploadKindSchema,
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
  kind: uploadKindSchema,
  clipId: z.string().uuid().optional(),
  parts: z.array(uploadedPartSchema).min(1).max(10_000),
  fileName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
  duration: z.number().finite().nonnegative().max(60 * 60 * 12).optional(),
  width: z.number().int().positive().max(16384).optional(),
  height: z.number().int().positive().max(16384).optional(),
});

const PROJECT_SELECT = `SELECT p.id, p.user_id, p.name, p.status, p.source_key, p.export_key,
  p.source_name, p.source_type, p.source_size, p.duration, p.width, p.height, p.settings,
  p.created_at, p.updated_at,
  COALESCE(p.duration, 0) + COALESCE((SELECT SUM(pc.duration) FROM project_clip pc WHERE pc.project_id = p.id), 0)
    AS timeline_duration
  FROM project p`;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function safeSettings(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function publicClip(row: ClipRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    size: row.size,
    duration: row.duration,
    width: row.width,
    height: row.height,
    position: row.position,
  };
}

function sourceClip(row: ProjectRow) {
  if (!row.source_key || !row.source_name || !row.source_type || !row.source_size) return null;
  return {
    id: "source",
    name: row.source_name,
    type: row.source_type,
    size: row.source_size,
    duration: row.duration ?? 0,
    width: row.width ?? 1920,
    height: row.height ?? 1080,
    position: 0,
  };
}

function toProject(row: ProjectRow, appendedClips?: ClipRow[]) {
  const firstClip = sourceClip(row);
  const clips = appendedClips === undefined
    ? []
    : [firstClip, ...appendedClips.map(publicClip)].filter((clip): clip is NonNullable<typeof clip> => Boolean(clip));
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    sourceReady: Boolean(row.source_key),
    exportReady: Boolean(row.export_key),
    sourceName: row.source_name,
    sourceType: row.source_type,
    sourceSize: row.source_size,
    clips,
    duration: row.timeline_duration ?? row.duration,
    width: row.width,
    height: row.height,
    settings: safeSettings(row.settings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("Expected an application/json request body.");
  return await request.json();
}

async function ownedProject(env: Env, userId: string, projectId: string): Promise<ProjectRow | null> {
  return await env.DB.prepare(`${PROJECT_SELECT} WHERE p.id = ? AND p.user_id = ?`)
    .bind(projectId, userId).first<ProjectRow>();
}

async function projectClips(env: Env, projectId: string): Promise<ClipRow[]> {
  const result = await env.DB.prepare(
    `SELECT id, project_id, r2_key, name, type, size, duration, width, height, position, created_at
     FROM project_clip WHERE project_id = ? ORDER BY position ASC`,
  ).bind(projectId).all<ClipRow>();
  return result.results;
}

async function fullProject(env: Env, userId: string, projectId: string) {
  const row = await ownedProject(env, userId, projectId);
  if (!row) return null;
  return toProject(row, await projectClips(env, projectId));
}

function mediaKey(
  userId: string,
  projectId: string,
  kind: "source" | "clip" | "export",
  fileName: string,
  clipId?: string,
): string {
  const extension = fileName.toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0] ?? ".mp4";
  const identity = kind === "clip" && clipId ? clipId : crypto.randomUUID();
  return `${userId}/${projectId}/${kind === "clip" ? "clips" : kind}/${identity}${extension}`;
}

function validOwnedKey(key: string, userId: string, projectId: string): boolean {
  return key.startsWith(`${userId}/${projectId}/`) && !key.includes("..") && !key.startsWith("/");
}

function validClipKey(key: string, userId: string, projectId: string, clipId: string): boolean {
  return key.startsWith(`${userId}/${projectId}/clips/${clipId}.`) && validOwnedKey(key, userId, projectId);
}

function validKindKey(
  key: string,
  userId: string,
  projectId: string,
  kind: "source" | "clip" | "export",
  clipId?: string,
): boolean {
  if (kind === "clip") return Boolean(clipId) && validClipKey(key, userId, projectId, clipId ?? "");
  return key.startsWith(`${userId}/${projectId}/${kind}/`) && validOwnedKey(key, userId, projectId);
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

async function deleteClip(env: Env, userId: string, project: ProjectRow, clipId: string): Promise<Response> {
  const appended = await projectClips(env, project.id);
  if (clipId === "source") {
    const replacement = appended[0];
    if (!replacement) return json({ error: "A project must keep at least one clip." }, 400);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE project SET source_key = ?, source_name = ?, source_type = ?, source_size = ?,
          duration = ?, width = ?, height = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      ).bind(
        replacement.r2_key, replacement.name, replacement.type, replacement.size, replacement.duration,
        replacement.width, replacement.height, now, project.id, userId,
      ),
      env.DB.prepare("DELETE FROM project_clip WHERE id = ? AND project_id = ?").bind(replacement.id, project.id),
      env.DB.prepare("UPDATE project_clip SET position = position - 1 WHERE project_id = ? AND position > ?")
        .bind(project.id, replacement.position),
    ]);
    if (project.source_key && project.source_key !== replacement.r2_key) await env.MEDIA.delete(project.source_key);
  } else {
    const clip = appended.find((item) => item.id === clipId);
    if (!clip) return json({ error: "Clip not found." }, 404);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM project_clip WHERE id = ? AND project_id = ?").bind(clip.id, project.id),
      env.DB.prepare("UPDATE project_clip SET position = position - 1 WHERE project_id = ? AND position > ?")
        .bind(project.id, clip.position),
      env.DB.prepare("UPDATE project SET updated_at = ? WHERE id = ? AND user_id = ?").bind(now, project.id, userId),
    ]);
    await env.MEDIA.delete(clip.r2_key);
  }
  return json({ project: await fullProject(env, userId, project.id) });
}

export async function handleProjects(request: Request, env: Env, session: NonNullable<Session>): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const userId = session.user.id;

  if (segments.length === 2) {
    if (request.method === "GET") {
      const result = await env.DB.prepare(
        `${PROJECT_SELECT} WHERE p.user_id = ? ORDER BY p.updated_at DESC LIMIT 100`,
      ).bind(userId).all<ProjectRow>();
      return json({ projects: result.results.map((row) => toProject(row)) });
    }
    if (request.method === "POST") {
      const body = z.object({ name: z.string().trim().min(1).max(80) }).parse(await readJson(request));
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO project (id, user_id, name, status, settings, created_at, updated_at) VALUES (?, ?, ?, 'draft', '{}', ?, ?)",
      ).bind(id, userId, body.name, now, now).run();
      return json({ project: await fullProject(env, userId, id) }, 201);
    }
    return json({ error: "Method not allowed." }, 405);
  }

  const projectId = segments[2];
  if (!projectId) return json({ error: "Project not found." }, 404);
  const project = await ownedProject(env, userId, projectId);
  if (!project) return json({ error: "Project not found." }, 404);

  if (segments.length === 3) {
    if (request.method === "GET") return json({ project: await fullProject(env, userId, projectId) });
    if (request.method === "PATCH") {
      const body = projectUpdateSchema.parse(await readJson(request));
      const now = new Date().toISOString();
      await env.DB.prepare(
        "UPDATE project SET name = ?, duration = ?, width = ?, height = ?, settings = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      ).bind(
        body.name ?? project.name,
        body.duration ?? project.duration,
        body.width ?? project.width,
        body.height ?? project.height,
        body.settings ? JSON.stringify(body.settings) : project.settings,
        now, projectId, userId,
      ).run();
      return json({ project: await fullProject(env, userId, projectId) });
    }
    if (request.method === "DELETE") {
      const appended = await projectClips(env, projectId);
      const keys = [project.source_key, project.export_key, ...appended.map((clip) => clip.r2_key)]
        .filter((key): key is string => Boolean(key));
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

  if (segments[3] === "clips") {
    const clipId = segments[4];
    if (!clipId) return json({ error: "Clip not found." }, 404);
    if (segments.length === 5 && request.method === "DELETE") return await deleteClip(env, userId, project, clipId);
    if (segments.length === 6 && segments[5] === "media" && request.method === "GET") {
      if (clipId === "source" && project.source_key) return await serveMedia(request, env, project.source_key);
      const clip = await env.DB.prepare(
        "SELECT r2_key FROM project_clip WHERE id = ? AND project_id = ?",
      ).bind(clipId, projectId).first<{ r2_key: string }>();
      if (!clip) return json({ error: "Clip not found." }, 404);
      return await serveMedia(request, env, clip.r2_key);
    }
    return json({ error: "Route not found." }, 404);
  }

  if (segments[3] !== "uploads") return json({ error: "Route not found." }, 404);

  if (segments.length === 4 && request.method === "POST") {
    const body = uploadStartSchema.parse(await readJson(request));
    const maxUpload = Number(env.MAX_UPLOAD_BYTES);
    if (!Number.isFinite(maxUpload) || body.size > maxUpload) {
      return json({ error: "The file exceeds this deployment's upload limit." }, 413);
    }
    let clipId: string | undefined;
    if (body.kind === "clip") {
      if (!project.source_key) return json({ error: "Upload the first clip before adding another." }, 400);
      const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM project_clip WHERE project_id = ?")
        .bind(projectId).first<{ count: number }>();
      if ((count?.count ?? 0) >= 19) return json({ error: "A timeline can contain up to 20 clips." }, 400);
      clipId = crypto.randomUUID();
    }
    const key = mediaKey(userId, projectId, body.kind, body.fileName, clipId);
    const upload = await env.MEDIA.createMultipartUpload(key, {
      httpMetadata: { contentType: body.contentType },
      customMetadata: { userId, projectId, kind: body.kind, originalName: body.fileName, ...(clipId ? { clipId } : {}) },
    });
    return json({ key, uploadId: upload.uploadId, ...(clipId ? { clipId } : {}) });
  }

  const uploadId = segments[4];
  if (!uploadId) return json({ error: "Upload not found." }, 404);
  const key = url.searchParams.get("key") ?? "";
  if (!validOwnedKey(key, userId, projectId)) return json({ error: "Invalid upload key." }, 400);
  const upload = env.MEDIA.resumeMultipartUpload(key, uploadId);

  if (segments.length === 6 && segments[5] === "complete" && request.method === "POST") {
    const body = uploadCompleteSchema.parse(await readJson(request));
    if (body.key !== key || !validKindKey(body.key, userId, projectId, body.kind, body.clipId)) {
      return json({ error: "Invalid upload key." }, 400);
    }
    if (body.kind === "clip" && (!body.clipId || !validClipKey(key, userId, projectId, body.clipId))) {
      return json({ error: "Invalid clip upload." }, 400);
    }
    if (body.kind === "clip" && (body.duration === undefined || body.width === undefined || body.height === undefined)) {
      return json({ error: "Clip metadata is required." }, 400);
    }
    await upload.complete(body.parts);
    const now = new Date().toISOString();
    try {
      if (body.kind === "source") {
        await env.DB.prepare(
          `UPDATE project SET source_key = ?, source_name = ?, source_type = ?, source_size = ?,
            duration = COALESCE(?, duration), width = COALESCE(?, width), height = COALESCE(?, height),
            status = 'ready', updated_at = ? WHERE id = ? AND user_id = ?`,
        ).bind(
          key, body.fileName, body.contentType, body.size, body.duration ?? null, body.width ?? null,
          body.height ?? null, now, projectId, userId,
        ).run();
        if (project.source_key && project.source_key !== key) await env.MEDIA.delete(project.source_key);
      } else if (body.kind === "clip") {
        const position = await env.DB.prepare(
          "SELECT COALESCE(MAX(position), 0) + 1 AS position FROM project_clip WHERE project_id = ?",
        ).bind(projectId).first<{ position: number }>();
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO project_clip (id, project_id, r2_key, name, type, size, duration, width, height, position, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            body.clipId, projectId, key, body.fileName, body.contentType, body.size, body.duration,
            body.width, body.height, position?.position ?? 1, now,
          ),
          env.DB.prepare("UPDATE project SET status = 'ready', updated_at = ? WHERE id = ? AND user_id = ?")
            .bind(now, projectId, userId),
        ]);
      } else {
        await env.DB.prepare(
          "UPDATE project SET export_key = ?, status = 'exported', updated_at = ? WHERE id = ? AND user_id = ?",
        ).bind(key, now, projectId, userId).run();
        if (project.export_key && project.export_key !== key) await env.MEDIA.delete(project.export_key);
      }
    } catch (error) {
      await env.MEDIA.delete(key).catch(() => undefined);
      throw error;
    }
    return json({ project: await fullProject(env, userId, projectId) });
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
