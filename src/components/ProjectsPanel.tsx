import React, { useEffect, useState } from 'react';
import { listProjects, deleteProject } from '../lib/projectStorage';
import type { StoredProjectMeta } from '../lib/projectStorage';

interface ProjectsPanelProps {
  onLoad: (id: string) => void;
  onClose: () => void;
}

function relativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function ProjectsPanel({ onLoad, onClose }: ProjectsPanelProps) {
  const [projects, setProjects] = useState<StoredProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadList() {
    try {
      const list = await listProjects();
      setProjects(list);
    } catch (err) {
      console.error('Failed to list projects', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList();
  }, []);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await deleteProject(id);
      await loadList();
    } catch (err) {
      console.error('Failed to delete project', err);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  return (
    <div className="projects-panel" onClick={onClose} onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className="panel-box" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <span className="panel-title">MY PROJECTS</span>
          <button className="panel-close-btn" onClick={onClose} title="Close">✕</button>
        </div>

        {loading && (
          <div className="projects-empty">LOADING...</div>
        )}

        {!loading && projects.length === 0 && (
          <div className="projects-empty">
            NO SAVED PROJECTS YET.<br />
            USE "SAVE" TO STORE YOUR WORK.
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div className="projects-grid">
            {projects.map(p => (
              <div
                key={p.id}
                className="project-card"
                onClick={() => onLoad(p.id)}
                title={p.name}
              >
                <div className="card-thumbnail">
                  {p.thumbnail
                    ? <img src={p.thumbnail} alt={p.name} />
                    : <span className="card-thumb-placeholder">?</span>
                  }
                </div>
                <div className="card-info">
                  <span className="card-name">{p.name}</span>
                  <span className="card-date">{relativeDate(p.timestamp)}</span>
                </div>
                <button
                  className="card-delete"
                  onClick={e => handleDelete(e, p.id)}
                  title="Delete project"
                >🗑</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
