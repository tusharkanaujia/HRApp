import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { Employee } from '../types';
import { computeLayout, NODE_W, NODE_H } from '../utils/treeLayout';
import { statusDotColor } from './StatusBadge';

export interface OrgTreeViewHandle {
  exportToPng: (filename: string) => Promise<void>;
  exportToPdf: (filename: string) => Promise<void>;
}

interface Props {
  focalId: string;
  employees: Employee[];
  onSelectEmployee?: (id: string) => void;
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const COMPANY_COLORS: Record<string, string> = {
  'Ancient Builders Constructions LLC': '#3b82f6',
  'MBM Gulf Electromechanical LLC': '#14b8a6',
  'Noor Al Yemen Air Condition Cont. Co. LLC': '#f97316',
};

const DIV_COLORS: Record<string, string> = {
  CIVIL: '#f59e0b',
  MEP: '#8b5cf6',
  FACTORY: '#10b981',
  ADMIN: '#3b82f6',
  GENERAL: '#64748b',
};

function OrgTreeView({ focalId, employees, onSelectEmployee }: Props, ref: React.Ref<OrgTreeViewHandle>) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const panZoomRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  // Start with only the focal node expanded (shows its direct reports)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([focalId]));

  // Reset expansion and center when focal changes
  useEffect(() => {
    setExpanded(new Set([focalId]));
  }, [focalId]);

  const toggleExpand = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { nodes, edges } = computeLayout(focalId, employees, expanded);

  // Bounding box — use reduce to avoid call-stack limit with large arrays
  const minX = nodes.reduce((m, n) => Math.min(m, n.x - NODE_W / 2), Infinity) - 60;
  const maxX = nodes.reduce((m, n) => Math.max(m, n.x + NODE_W / 2), -Infinity) + 60;
  const minY = nodes.reduce((m, n) => Math.min(m, n.y - NODE_H / 2), Infinity) - 60;
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y + NODE_H / 2), -Infinity) + 60;
  const svgW = nodes.length ? maxX - minX : 0;
  const svgH = nodes.length ? maxY - minY : 0;

  const centerOnFocal = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const focalNode = nodes.find(n => n.isFocal);
    setTransform({ x: clientWidth / 2 - (focalNode?.x ?? 0), y: clientHeight / 2 - (focalNode?.y ?? 0), scale: 1 });
  }, [nodes]);

  // Center on load and when focal changes
  useEffect(() => { centerOnFocal(); }, [focalId]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform(t => ({ ...t, scale: Math.max(0.15, Math.min(3, t.scale * factor)) }));
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    drag.current = { startX: e.clientX, startY: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    setTransform(t => ({ ...t, x: d.tx + e.clientX - d.startX, y: d.ty + e.clientY - d.startY }));
  }, []);

  const onMouseUp = useCallback(() => { drag.current = null; }, []);

  const handleNodeClick = (id: string) => {
    if (onSelectEmployee) onSelectEmployee(id);
    else navigate(`/org-chart?emp=${id}`);
  };

  // Capture the full pan-zoom content to a canvas via an offscreen clone (doesn't disturb the live view).
  const captureCanvas = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const panZoom = panZoomRef.current;
    if (!panZoom || nodes.length === 0) return null;

    // Widen node cards in the export so long names/designations have room to breathe.
    const NODE_SCALE = 1.4;
    const PAD = 100;

    const clone = panZoom.cloneNode(true) as HTMLDivElement;
    clone.style.transform = `translate(${-minX + PAD}px, ${-minY + PAD}px)`;

    // Disable text truncation so full names are visible.
    clone.querySelectorAll<HTMLElement>('.truncate').forEach((el) => {
      el.style.textOverflow = 'clip';
      el.style.overflow = 'visible';
      el.style.whiteSpace = 'normal';
      el.style.wordBreak = 'break-word';
    });

    // Widen each node card so wrapped text has room. The node cards are absolutely positioned
    // children of the pan-zoom div with explicit pixel widths/heights set inline.
    Array.from(clone.children).forEach((child) => {
      const el = child as HTMLElement;
      const w = parseFloat(el.style.width);
      const h = parseFloat(el.style.height);
      if (Number.isFinite(w) && w > 50 && w < 400) {
        el.style.width = `${w * NODE_SCALE}px`;
        el.style.height = `${h * NODE_SCALE}px`;
        el.style.left = `${parseFloat(el.style.left) - (w * (NODE_SCALE - 1)) / 2}px`;
        el.style.top = `${parseFloat(el.style.top) - (h * (NODE_SCALE - 1)) / 2}px`;
      }
    });

    // Bump small text sizes for readability in print/zoom-out.
    clone.querySelectorAll<HTMLElement>('p, span').forEach((el) => {
      const cs = window.getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if (fs > 0 && fs < 14) el.style.fontSize = `${Math.round(fs * 1.3)}px`;
    });

    const captureW = svgW + PAD * 2;
    const captureH = svgH + PAD * 2;

    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-99999px';
    wrapper.style.top = '0';
    wrapper.style.width = `${captureW}px`;
    wrapper.style.height = `${captureH}px`;
    wrapper.style.backgroundColor = '#f8fafc';
    wrapper.style.overflow = 'visible';
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
      return await html2canvas(wrapper, {
        backgroundColor: '#f8fafc',
        scale: 2,
        width: captureW,
        height: captureH,
        useCORS: true,
        logging: false,
      });
    } finally {
      document.body.removeChild(wrapper);
    }
  }, [minX, minY, svgW, svgH, nodes.length]);

  useImperativeHandle(ref, () => ({
    async exportToPng(filename: string) {
      const canvas = await captureCanvas();
      if (!canvas) return;
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = filename;
      link.click();
    },
    async exportToPdf(filename: string) {
      const canvas = await captureCanvas();
      if (!canvas) return;
      // JPEG is much smaller than PNG inside a PDF (16 MB → ~1 MB) at minimal quality cost.
      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'pt', format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height, undefined, 'FAST');
      pdf.save(filename);
    },
  }), [captureCanvas]);

  if (nodes.length === 0) {
    return <div className="flex items-center justify-center h-full text-slate-400">No hierarchy data</div>;
  }

  return (
    <div
      ref={containerRef}
      className="org-tree-container w-full h-full overflow-hidden relative bg-slate-50"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Dot grid background */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
        <defs>
          <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#cbd5e1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {/* Pan/zoom container */}
      <div
        ref={panZoomRef}
        style={{
          position: 'absolute',
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          zIndex: 1,
        }}
      >
        {/* Edges SVG */}
        <svg
          style={{
            position: 'absolute',
            left: minX, top: minY,
            width: svgW, height: svgH,
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          {edges.map((edge, i) => {
            const fx = edge.fx - minX;
            const fy = edge.fy - minY + NODE_H / 2;
            const tx = edge.tx - minX;
            const ty = edge.ty - minY - NODE_H / 2;
            const midY = (fy + ty) / 2;
            return (
              <path
                key={i}
                d={`M ${fx} ${fy} C ${fx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`}
                stroke="#94a3b8"
                strokeWidth="1.5"
                fill="none"
              />
            );
          })}
        </svg>

        {/* Node cards */}
        {nodes.map(({ employee: emp, x, y, isFocal, isAncestor, childCount, isExpanded }) => {
          const compColor = COMPANY_COLORS[emp.company] ?? '#64748b';
          const dotColor = statusDotColor(emp.status);
          const hasChildren = childCount > 0;

          return (
            <div
              key={emp.id}
              style={{
                position: 'absolute',
                left: x - NODE_W / 2,
                top: y - NODE_H / 2,
                width: NODE_W,
                height: NODE_H,
                zIndex: isFocal ? 10 : 2,
              }}
            >
              <div
                className={`w-full h-full rounded-xl bg-white shadow-md flex flex-col justify-between px-3 pt-2.5 pb-1.5 transition-shadow hover:shadow-lg ${
                  isFocal ? 'ring-2 ring-blue-500 shadow-blue-100' :
                  isAncestor ? 'ring-1 ring-slate-300 opacity-80' : ''
                }`}
                style={{ borderLeft: `4px solid ${compColor}` }}
              >
                {/* Top: avatar + name */}
                <div
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => handleNodeClick(emp.id)}
                >
                  <div
                    className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: compColor }}
                  >
                    {initials(emp.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[11px] font-semibold text-slate-800 truncate leading-tight">{emp.name}</p>
                      <span className="text-[9px] text-slate-400 font-mono flex-shrink-0">#{emp.empId}</span>
                    </div>
                    <p className="text-[9px] text-slate-500 truncate leading-tight">{emp.designation}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
                      <span className="text-[9px] text-slate-400 truncate">{emp.department}</span>
                    </div>
                    {emp.workingLocation && (
                      <p className="text-[9px] text-slate-400 truncate leading-tight mt-0.5 italic">{emp.workingLocation}</p>
                    )}
                  </div>
                </div>

                {/* Bottom: division badge + expand/collapse button */}
                <div className="flex items-center justify-between mt-1">
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-medium text-white"
                    style={{ backgroundColor: DIV_COLORS[emp.division] ?? '#64748b' }}
                  >
                    {emp.division}
                  </span>

                  {hasChildren && !isAncestor && (
                    <button
                      onClick={e => toggleExpand(emp.id, e)}
                      className={`flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                        isExpanded
                          ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                      title={isExpanded ? 'Collapse' : `Expand (${childCount})`}
                    >
                      {isExpanded
                        ? <ChevronDown size={9} />
                        : <ChevronRight size={9} />
                      }
                      {!isExpanded && <span>{childCount}</span>}
                    </button>
                  )}

                  {isFocal && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700">YOU</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-20">
        {[
          { label: '+', action: () => setTransform(t => ({ ...t, scale: Math.min(3, t.scale * 1.2) })) },
          { label: '−', action: () => setTransform(t => ({ ...t, scale: Math.max(0.15, t.scale / 1.2) })) },
          { label: '⊙', action: centerOnFocal },
        ].map(({ label, action }) => (
          <button
            key={label}
            onClick={action}
            className="w-8 h-8 bg-white shadow rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-bold border border-slate-200"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow border border-slate-100 p-3 z-20 text-xs space-y-1">
        <p className="font-semibold text-slate-600 mb-1.5">Division</p>
        {Object.entries(DIV_COLORS).map(([div, color]) => (
          <div key={div} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: color }} />
            <span className="text-slate-500">{div}</span>
          </div>
        ))}
      </div>

      {/* Hint */}
      <div className="absolute top-4 right-4 text-xs text-slate-400 bg-white/80 rounded px-2 py-1 z-20">
        Scroll to zoom · Drag to pan · Click node to select · ▶ to expand
      </div>
    </div>
  );
}

export default forwardRef(OrgTreeView);
