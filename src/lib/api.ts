import type { Project, SourceMetadata } from "../types";

type ApiErrorBody = { error?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof Blob ? {} : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = await response.json() as ApiErrorBody;
    } catch {
      body = {};
    }
    throw new Error(body.error || `Request failed with status ${response.status}.`);
  }

  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export const api = {
  async listProjects(): Promise<Project[]> {
    const data = await request<{ projects: Project[] }>("/api/projects");
    return data.projects;
  },

  async getProject(id: string): Promise<Project> {
    const data = await request<{ project: Project }>(`/api/projects/${id}`);
    return data.project;
  },

  async createProject(name: string): Promise<Project> {
    const data = await request<{ project: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return data.project;
  },

  async updateProject(id: string, changes: Partial<Pick<Project, "name" | "duration" | "width" | "height" | "settings">>): Promise<Project> {
    const data = await request<{ project: Project }>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    });
    return data.project;
  },

  async deleteProject(id: string): Promise<void> {
    await request<void>(`/api/projects/${id}`, { method: "DELETE" });
  },
};

type UploadOptions = {
  projectId: string;
  blob: Blob;
  fileName: string;
  contentType: string;
  kind: "source" | "export";
  metadata?: SourceMetadata;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
};

const PART_SIZE = 8 * 1024 * 1024;

export async function uploadMedia(options: UploadOptions): Promise<Project> {
  const { projectId, blob, fileName, contentType, kind, metadata, onProgress, signal } = options;
  const started = await request<{ key: string; uploadId: string }>(`/api/projects/${projectId}/uploads`, {
    method: "POST",
    body: JSON.stringify({ kind, fileName, contentType, size: blob.size }),
    signal,
  });

  const uploaded: Array<{ partNumber: number; etag: string }> = [];
  const partCount = Math.ceil(blob.size / PART_SIZE);
  const query = `?key=${encodeURIComponent(started.key)}`;

  try {
    for (let index = 0; index < partCount; index += 1) {
      const partNumber = index + 1;
      const part = blob.slice(index * PART_SIZE, Math.min(blob.size, partNumber * PART_SIZE));
      const result = await request<{ partNumber: number; etag: string }>(
        `/api/projects/${projectId}/uploads/${encodeURIComponent(started.uploadId)}/${partNumber}${query}`,
        { method: "PUT", body: part, signal },
      );
      uploaded.push(result);
      onProgress?.(Math.round((partNumber / partCount) * 100));
    }

    const completed = await request<{ project: Project }>(
      `/api/projects/${projectId}/uploads/${encodeURIComponent(started.uploadId)}/complete${query}`,
      {
        method: "POST",
        body: JSON.stringify({
          key: started.key,
          kind,
          parts: uploaded,
          fileName,
          contentType,
          size: blob.size,
          ...metadata,
        }),
        signal,
      },
    );
    return completed.project;
  } catch (error) {
    await fetch(
      `/api/projects/${projectId}/uploads/${encodeURIComponent(started.uploadId)}/abort${query}`,
      { method: "DELETE" },
    ).catch(() => undefined);
    throw error;
  }
}
