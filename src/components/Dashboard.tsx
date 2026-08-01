import {
  ArrowRightIcon,
  FilmStripIcon,
  PlusIcon,
  SignOutIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Project } from "../types";
import { api } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { formatBytes, formatDate, formatDuration } from "../lib/format";
import { navigate } from "../lib/navigation";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";

export function Dashboard({ userName }: { userName: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      setProjects(await api.listProjects());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Projects could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      const project = await api.createProject(name.trim());
      navigate(`/editor/${project.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project could not be created.");
      setCreating(false);
    }
  }

  async function remove(project: Project) {
    if (!window.confirm(`Delete “${project.name}” and its stored media?`)) return;
    try {
      await api.deleteProject(project.id);
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project could not be deleted.");
    }
  }

  async function signOut() {
    await authClient.signOut();
    navigate("/");
  }

  return (
    <div className="dashboard-shell">
      <header className="app-header">
        <Brand />
        <div className="app-header-actions">
          <ThemeToggle />
          <button className="icon-button" type="button" onClick={signOut} aria-label="Sign out" title="Sign out"><SignOutIcon /></button>
        </div>
      </header>
      <main className="dashboard-main">
        <section className="dashboard-heading">
          <div>
            <p>Welcome back, {userName.split(" ")[0]}</p>
            <h1>Your video projects</h1>
          </div>
          <button className="button primary" type="button" onClick={() => setShowCreate(true)}><PlusIcon /> New project</button>
        </section>

        {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Retry</button></div>}

        {loading ? (
          <div className="project-skeleton" aria-label="Loading projects">{Array.from({ length: 3 }, (_, index) => <span key={index} />)}</div>
        ) : projects.length === 0 ? (
          <section className="empty-projects">
            <FilmStripIcon />
            <h2>Start with one clip</h2>
            <p>Create a project, add a video, then shape it on the timeline.</p>
            <button className="button primary" type="button" onClick={() => setShowCreate(true)}>Create project</button>
          </section>
        ) : (
          <section className="project-list" aria-label="Projects">
            {projects.map((project) => (
              <article className="project-row" key={project.id}>
                <button className="project-open" type="button" onClick={() => navigate(`/editor/${project.id}`)}>
                  <span className="project-thumbnail"><FilmStripIcon /></span>
                  <span className="project-details">
                    <strong>{project.name}</strong>
                    <small>{project.sourceReady ? `${project.width ?? 0} × ${project.height ?? 0}  |  ${formatDuration(project.duration)}  |  ${formatBytes(project.sourceSize)}` : "No source video yet"}</small>
                  </span>
                  <span className="project-updated">Edited {formatDate(project.updatedAt)}</span>
                  <ArrowRightIcon />
                </button>
                <button className="project-delete" type="button" onClick={() => void remove(project)} aria-label={`Delete ${project.name}`} title="Delete project"><TrashIcon /></button>
              </article>
            ))}
          </section>
        )}
      </main>

      {showCreate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowCreate(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
            <button className="modal-close icon-button" type="button" onClick={() => setShowCreate(false)} aria-label="Close"><XIcon /></button>
            <h2 id="new-project-title">Create a video project</h2>
            <p>You can rename it at any time.</p>
            <form onSubmit={create}>
              <label><span>Project name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="Evening walk" /></label>
              <button className="button primary" type="submit" disabled={creating || name.trim().length === 0}>{creating ? "Creating..." : "Open editor"}</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
