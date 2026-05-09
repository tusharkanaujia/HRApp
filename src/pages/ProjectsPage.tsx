import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../store';
import { deleteProject } from '../store/projectsSlice';
import { addActivity } from '../store/activitySlice';
import { makeActivity } from '../utils/activityHelpers';
import type { Project } from '../types';
import AddProjectModal from '../components/AddProjectModal';
import { useAuth } from '../hooks/useAuth';
import { Plus, Trash2, MapPin, Calendar, Pencil } from 'lucide-react';

const TYPE_COLORS: Record<string, string> = {
  CIVIL: 'bg-amber-100 text-amber-700',
  MEP: 'bg-purple-100 text-purple-700',
  FACTORY: 'bg-blue-100 text-blue-700',
  GENERAL: 'bg-slate-100 text-slate-600',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  ON_HOLD: 'bg-orange-100 text-orange-700',
};

export default function ProjectsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { canEdit, currentUser } = useAuth();
  const projects = useSelector((s: RootState) => s.projects.list);
  const employees = useSelector((s: RootState) => s.employees.list);
  const [showModal, setShowModal] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = projects.filter(p => {
    const matchType = !filterType || p.type === filterType;
    const matchStatus = !filterStatus || p.status === filterStatus;
    return matchType && matchStatus;
  });

  const empCount = (projectId: string) => employees.filter(e => e.projectIds.includes(projectId)).length;

  const handleDelete = (id: string) => {
    const proj = projects.find(p => p.id === id);
    dispatch(deleteProject(id));
    if (proj) dispatch(addActivity(makeActivity('DELETE_PROJECT', 'project', id, proj.name, currentUser)));
    setConfirmDelete(null);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Projects</h1>
          <p className="text-slate-400 text-sm mt-0.5">{filtered.length} projects</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={16} /> Register Project
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-6 flex gap-3">
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="">All Types</option>
          {['CIVIL', 'MEP', 'FACTORY', 'GENERAL'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          {['ACTIVE', 'COMPLETED', 'ON_HOLD'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-4">
        {filtered.map(project => {
          const count = empCount(project.id);
          return (
            <div
              key={project.id}
              onClick={() => navigate(`/org-chart?view=project&project=${project.id}`)}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col group hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${TYPE_COLORS[project.type]}`}>
                      {project.type}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[project.status]}`}>
                      {project.status.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm truncate">{project.name}</h3>
                  <p className="text-xs text-slate-400 font-mono">{project.code}</p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition ml-2 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); setEditProject(project); }}
                      className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                      title="Edit project"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDelete(project.id); }}
                      className="p-1.5 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg"
                      title="Delete project"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {project.location && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                  <MapPin size={11} />
                  {project.location}
                </div>
              )}

              {(project.startDate || project.endDate) && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                  <Calendar size={11} />
                  {project.startDate && <span>{project.startDate}</span>}
                  {project.startDate && project.endDate && <span>→</span>}
                  {project.endDate && <span>{project.endDate}</span>}
                </div>
              )}

              {project.description && (
                <p className="text-xs text-slate-500 mt-2 line-clamp-2">{project.description}</p>
              )}

              <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  <strong className="text-slate-600">{count}</strong> staff assigned
                </span>
                {count > 0 && (
                  <div className="flex -space-x-1">
                    {employees
                      .filter(e => e.projectIds.includes(project.id))
                      .slice(0, 4)
                      .map(e => (
                        <div
                          key={e.id}
                          className="w-5 h-5 rounded-full bg-blue-200 border border-white flex items-center justify-center text-[8px] font-bold text-blue-700"
                          title={e.name}
                        >
                          {e.name[0]}
                        </div>
                      ))}
                    {count > 4 && (
                      <div className="w-5 h-5 rounded-full bg-slate-200 border border-white flex items-center justify-center text-[8px] text-slate-500">
                        +{count - 4}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-16 text-center text-slate-400">No projects found</div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4">
            <h3 className="font-semibold text-slate-800 mb-2">Delete Project?</h3>
            <p className="text-sm text-slate-500 mb-6">
              This will remove <strong>{projects.find(p => p.id === confirmDelete)?.name}</strong>.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-slate-300 rounded-lg py-2 text-sm">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}

      {showModal && <AddProjectModal onClose={() => setShowModal(false)} />}
      {editProject && <AddProjectModal project={editProject} onClose={() => setEditProject(null)} />}
    </div>
  );
}
