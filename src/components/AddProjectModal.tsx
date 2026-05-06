import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { addProject, updateProject } from '../store/projectsSlice';
import type { Project, ProjectType, ProjectStatus } from '../types';
import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
  project?: Project;
}

export default function AddProjectModal({ onClose, project }: Props) {
  const dispatch = useDispatch();
  const isEdit = !!project;

  const [form, setForm] = useState({
    name:        project?.name        ?? '',
    code:        project?.code        ?? '',
    type:        project?.type        ?? ('CIVIL' as ProjectType),
    status:      project?.status      ?? ('ACTIVE' as ProjectStatus),
    location:    project?.location    ?? '',
    description: project?.description ?? '',
    startDate:   project?.startDate   ?? '',
    endDate:     project?.endDate     ?? '',
  });

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const proj: Project = {
      ...form,
      id: isEdit ? project!.id : `p${Date.now()}`,
    };
    dispatch(isEdit ? updateProject(proj) : addProject(proj));
    onClose();
  };

  const labelCls = 'block text-xs font-medium text-slate-600 mb-1';
  const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {isEdit ? 'Edit Project' : 'Register New Project'}
            </h2>
            {isEdit && (
              <p className="text-xs text-slate-400 mt-0.5">{project.code} · {project.name}</p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Project Name *</label>
              <input required className={inputCls} value={form.name} onChange={set('name')} placeholder="e.g. Marina Tower" />
            </div>
            <div>
              <label className={labelCls}>Code *</label>
              <input required className={inputCls} value={form.code} onChange={set('code')} placeholder="e.g. MRT" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Type</label>
              <select className={inputCls} value={form.type} onChange={set('type')}>
                {(['CIVIL', 'MEP', 'FACTORY', 'GENERAL'] as ProjectType[]).map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={form.status} onChange={set('status')}>
                {(['ACTIVE', 'COMPLETED', 'ON_HOLD'] as ProjectStatus[]).map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Location</label>
            <input className={inputCls} value={form.location} onChange={set('location')} placeholder="e.g. Dubai Marina" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Start Date</label>
              <input type="date" className={inputCls} value={form.startDate} onChange={set('startDate')} />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <input type="date" className={inputCls} value={form.endDate} onChange={set('endDate')} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea className={inputCls} rows={3} value={form.description} onChange={set('description')} />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
              {isEdit ? 'Save Changes' : 'Register Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
