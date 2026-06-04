import { forwardRef, useImperativeHandle, useRef, useLayoutEffect, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Pencil, Plus, Trash2, Type, X, RotateCcw, Undo2, Redo2, Spline } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { RootState } from '../store';
import { useAuth } from '../hooks/useAuth';
import { useUndoRedo } from '../hooks/useUndoRedo';
import {
  setCorporateFont, setCardOverride, addCorporateCard, updateAddedCard, deleteCorporateCard,
  addCorporateEdge, removeCorporateEdge, resetCorporateChart, replaceCorporateChart,
} from '../store/corporateChartSlice';
import type { CorporateAddedCard, CorporateChartConfig } from '../types';

// Sections new cards can be added to. `variant` is the card style; `width` is
// the fallback card width (the photo-card layout uses a uniform width).
const SECTIONS: { id: string; label: string; variant: string; width: number }[] = [
  { id: 'ed-depts',  label: 'ED · Departments',        variant: 'cv-dept', width: 124 },
  { id: 'ceo-depts', label: 'CEO · Departments',       variant: 'cv-dept', width: 124 },
  { id: 'ops-pd',    label: 'Ops · Project Directors', variant: 'cv-pd',   width: 124 },
  { id: 'ops-pm',    label: 'Ops · Project Managers',  variant: 'cv-pm',   width: 124 },
  { id: 'ops-dh',    label: 'Ops · Dept. Heads',       variant: 'cv-dh',   width: 124 },
];

// Base connector set (parent card key → child card key), matching the org.
// Keys are the cards' data-card / data-emp ids. 'side' edges are the dashed
// PA/secretary links.
const BASE_EDGES: { from: string; to: string; type?: 'normal' | 'side' }[] = [
  { from: 'ecorp13', to: 'e60', type: 'side' },   // Board → PA Malak
  { from: 'ecorp13', to: 'e351' },                // Board → ED
  { from: 'ecorp13', to: 'ecorp01' },             // Board → CEO
  { from: 'ecorp13', to: 'ecorp02' },             // Board → Ops
  // ED
  { from: 'e351', to: 'e97', type: 'side' },      // ED → Secretary Rhizalyn
  { from: 'e351', to: 'pmv' },
  { from: 'e351', to: 'e154' },
  { from: 'e351', to: 'e86' },
  { from: 'e351', to: 'e64' },
  { from: 'e351', to: 'e403' },
  // CEO
  { from: 'ecorp01', to: 'e31', type: 'side' },   // CEO → Secretary Jeramie
  { from: 'ecorp01', to: 'e407' },                // MBM GM
  { from: 'ecorp01', to: 'e411' },
  { from: 'ecorp01', to: 'interiors' },
  { from: 'ecorp01', to: 'ecorp09' },
  { from: 'ecorp01', to: 'e402' },
  { from: 'ecorp01', to: 'e410' },
  { from: 'ecorp01', to: 'e23' },
  { from: 'ecorp01', to: 'e416' },
  { from: 'ecorp01', to: 'e98' },
  { from: 'ecorp01', to: 'e401' },
  { from: 'ecorp01', to: 'e59' },
  // Ops → PD / PM / DH
  { from: 'ecorp02', to: 'e418' },
  { from: 'ecorp02', to: 'e323' },
  { from: 'ecorp02', to: 'e378' },
  { from: 'ecorp02', to: 'e189' },
  { from: 'ecorp02', to: 'e251' },
  { from: 'ecorp02', to: 'ecorp04' },
  { from: 'ecorp02', to: 'e45' },
  { from: 'ecorp02', to: 'e186' },
  { from: 'ecorp02', to: 'ecorp05' },
  { from: 'ecorp02', to: 'e301' },
  { from: 'ecorp02', to: 'e390' },
  { from: 'ecorp02', to: 'e298' },
  { from: 'ecorp02', to: 'e10' },
];

const edgeId = (e: { from: string; to: string }) => `${e.from}->${e.to}`;

// Person names are stored upper-cased — render them in proper case.
const niceName = (s: string) => (s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

// Designations are upper-cased too, but keep short acronyms (CFO, CCO, HSE,
// IT, BD, GRO, QA/QC…) intact while title-casing the rest.
const niceTitle = (s: string) =>
  (s || '').split(/\s+/).map(w => {
    if (/^[A-Z]{2,}\/[A-Z]{2,}$/.test(w)) return w;        // QA/QC
    if (/^[A-Z0-9.&-]{1,4}$/.test(w)) return w;            // CFO, CCO, HSE, IT, BD, &
    return w.toLowerCase().replace(/(^|[-/])([a-z])/g, (_m, p, c) => p + c.toUpperCase());
  }).join(' ');

export interface CorporateOrgChartHandle {
  exportToPng: (filename: string) => Promise<void>;
  exportToPdf: (filename: string) => Promise<void>;
}

// A modern "photo-card" Corporate Organization Chart: clean white canvas,
// rounded-square headshot cards (gradient accent per branch), gradient section
// pills, and thin arrowed connectors that follow the cards. Top management
// (Board + ED/CEO/Ops) is emphasised with larger photos and a stronger accent.
// Each person card carries a `data-emp` id → clicking opens that employee.
// CSS is scoped under `.corp-org`.

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap');

.corp-org, .corp-org *, .corp-org *::before, .corp-org *::after { box-sizing: border-box; margin: 0; padding: 0; }

.corp-org {
  position: relative;
  font-family: var(--cff, 'Inter', system-ui, sans-serif);
  background: #eef2f7;
  width: 100%; height: 100%; overflow: auto;
  padding: 20px;
}

/* Global text-color override (opt-in) */
.corp-org.cc-color .clabel,
.corp-org.cc-color .cname,
.corp-org.cc-color .ctitle,
.corp-org.cc-color .csub,
.corp-org.cc-color .cpill,
.corp-org.cc-color .cext { color: var(--ccc) !important; }

/* Edit mode: cards become selectable/highlightable/draggable */
.corp-org.editing .card { outline: 1px dashed transparent; outline-offset: 3px; border-radius: 12px; cursor: move; }
.corp-org.editing .card:hover { outline-color: #94a3b8; }
.corp-org .card.corp-selected { outline: 2px solid #2563eb !important; outline-offset: 3px; border-radius: 12px; }

/* ── PAGE SHELL ── */
.corp-org .page {
  background: #ffffff;
  border-radius: 18px;
  box-shadow: 0 18px 50px rgba(15,23,42,.12);
  max-width: 1640px;
  margin: 0 auto;
  overflow: hidden;
  position: relative;
  z-index: 0; /* stacking context so the -1 edge layer sits above bg, below cards */
  padding-bottom: 26px;
}

/* ── HEADER ── */
.corp-org .hdr {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 30px 40px 6px;
}
.corp-org .hdr h1 { font-size: 27px; font-weight: 800; color: #1e293b; letter-spacing: 1px; line-height: 1.02; text-transform: uppercase; }
.corp-org .hdr h1 span { display: block; font-weight: 800; color: #94a3b8; letter-spacing: 7px; }
.corp-org .hdr-sub { font-size: 9.5px; color: #b6c0cf; margin-top: 10px; max-width: 250px; line-height: 1.6; }
.corp-org .hdr-dots { display: flex; gap: 7px; margin-top: 9px; }
.corp-org .hdr-dots i { width: 13px; height: 13px; border-radius: 50%; }
.corp-org .hdr-dots i:nth-child(1) { background: #a78bfa; }
.corp-org .hdr-dots i:nth-child(2) { background: #60a5fa; }
.corp-org .hdr-dots i:nth-child(3) { background: #34d399; }
.corp-org .hdr-brand { display: flex; align-items: center; gap: 11px; }
.corp-org .hdr-brand .logo { width: 32px; height: 32px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #7dd3fc, #2563eb 70%); box-shadow: inset -3px -3px 6px rgba(0,0,0,.2); }
.corp-org .hdr-brand .bn { font-size: 13px; font-weight: 700; color: #334155; line-height: 1.15; border-left: 2px solid #cbd5e1; padding-left: 11px; }
.corp-org .hdr-brand .bn small { display: block; font-weight: 500; color: #94a3b8; font-size: 11px; }

/* ── CONTENT ── */
.corp-org .content { padding: 4px 30px 6px; position: relative; }
.corp-org .tier { display: flex; align-items: flex-start; justify-content: center; }
.corp-org .cols { display: flex; align-items: flex-start; justify-content: center; gap: 26px; margin-top: 58px; }
.corp-org .col { display: flex; flex-direction: column; align-items: center; gap: 12px; flex: 1; max-width: 460px; }
.corp-org .grid { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: center; gap: 20px 16px; width: 100%; }
.corp-org .grp { margin-top: 18px; } /* spacing above a section pill that follows a grid */

/* ── CONNECTOR LAYER ── */
.corp-org .corp-edges { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: -1; overflow: visible; }
.corp-org .corp-edges path { pointer-events: none; }
.corp-org.linking .corp-edges { z-index: 30; }
.corp-org.linking .corp-edges path { pointer-events: stroke; cursor: pointer; }
.corp-org.linking .corp-edges path:hover { stroke: #ef4444 !important; stroke-width: 3 !important; }
.corp-org.linking .card { cursor: crosshair !important; }
.corp-org .card.corp-link-src { outline: 2px solid #22c55e !important; outline-offset: 3px; border-radius: 12px; }

/* ── CARD (vertical photo card) ── */
.corp-org .card { position: relative; display: flex; flex-direction: column; align-items: center; width: 124px; flex-shrink: 0; background: transparent;
  --a1: #a78bfa; --a2: #7c3aed; --accent: #7c3aed; --pill: #f1ecff; }
.corp-org .card[data-emp] { cursor: pointer; }
.corp-org .card-inner { display: flex; flex-direction: column; align-items: center; text-align: center; width: 100%; }
.corp-org .card-inner.has-photo { gap: 9px; }

/* Photo: rounded square with an offset gradient "card" behind it. */
.corp-org .cphoto {
  width: 62px; height: 62px; border-radius: 16px;
  background: #e2e8f0 center/cover no-repeat;
  position: relative; z-index: 1;
  box-shadow: 0 7px 16px rgba(15,23,42,.16);
}
.corp-org .cphoto::before {
  content: ''; position: absolute; inset: 0; border-radius: 16px; z-index: -1;
  background: linear-gradient(140deg, var(--a1), var(--a2));
  transform: translate(-6px, 7px);
}

.corp-org .cbody { display: flex; flex-direction: column; align-items: center; }
.corp-org .clabel { font-size: calc(7.5px * var(--cfs,1)); font-weight: 800; letter-spacing: .7px; text-transform: uppercase; color: var(--accent); margin-bottom: 1px; }
.corp-org .cname  { font-size: calc(12.5px * var(--cfs,1)); font-weight: 700; color: #1f2937; line-height: 1.22; }
.corp-org .ctitle { font-size: calc(8px * var(--cfs,1)); font-weight: 600; letter-spacing: .8px; text-transform: uppercase; color: #9aa6b6; margin-top: 4px; }
.corp-org .cbody .ctitle:first-of-type::before { content: '— '; color: #cbd5e1; }
.corp-org .cbody .ctitle:first-of-type::after  { content: ' —'; color: #cbd5e1; }
.corp-org .csub   { font-size: calc(7.5px * var(--cfs,1)); color: #b9c2cf; margin-top: 3px; font-style: italic; }
.corp-org .cpill  { display: inline-block; font-size: calc(7.5px * var(--cfs,1)); font-weight: 700; color: var(--accent); background: var(--pill); padding: 2px 8px; border-radius: 10px; margin-top: 6px; letter-spacing: .2px; }
.corp-org .cext   { font-size: calc(7px * var(--cfs,1)); color: #c0c9d6; margin-top: 2px; }

/* ── PER-BRANCH ACCENTS ── */
/* Top management — bigger photos + stronger accent. */
.corp-org .cv-board { width: 200px; --a1: #818cf8; --a2: #4f46e5; --accent: #4338ca; --pill: #eef0ff; }
.corp-org .cv-board .cphoto { width: 96px; height: 96px; border-radius: 22px; }
.corp-org .cv-board .cphoto::before { transform: translate(-9px, 10px); border-radius: 22px; }
.corp-org .cv-board .cname { font-size: calc(17px * var(--cfs,1)); }

.corp-org .cv-ed  { width: 168px; --a1: #a78bfa; --a2: #7c3aed; --accent: #6d28d9; --pill: #f1ecff; }
.corp-org .cv-ceo { width: 168px; --a1: #60a5fa; --a2: #2563eb; --accent: #1d4ed8; --pill: #e7efff; }
.corp-org .cv-ops { width: 168px; --a1: #34d399; --a2: #059669; --accent: #047857; --pill: #e3f7ef; }
.corp-org .cv-ed .cphoto, .corp-org .cv-ceo .cphoto, .corp-org .cv-ops .cphoto { width: 80px; height: 80px; border-radius: 20px; }
.corp-org .cv-ed .cphoto::before, .corp-org .cv-ceo .cphoto::before, .corp-org .cv-ops .cphoto::before { transform: translate(-8px, 9px); border-radius: 20px; }
.corp-org .cv-ed .cname, .corp-org .cv-ceo .cname, .corp-org .cv-ops .cname { font-size: calc(14.5px * var(--cfs,1)); }

/* Section-scoped accents */
.corp-org [data-section="ed-depts"] .card  { --a1: #a78bfa; --a2: #7c3aed; --accent: #6d28d9; --pill: #f1ecff; }
.corp-org [data-section="ceo-depts"] .card { --a1: #60a5fa; --a2: #2563eb; --accent: #1d4ed8; --pill: #e7efff; }
.corp-org [data-section="ops-pd"] .card    { --a1: #c084fc; --a2: #9333ea; --accent: #7e22ce; --pill: #f6ecff; }
.corp-org [data-section="ops-pm"] .card    { --a1: #2dd4bf; --a2: #0d9488; --accent: #0f766e; --pill: #def7f3; }
.corp-org [data-section="ops-dh"] .card    { --a1: #38bdf8; --a2: #0284c7; --accent: #0369a1; --pill: #e2f2fd; }
.corp-org .cv-mbm { --a1: #60a5fa; --a2: #1d4ed8; --accent: #1e40af; --pill: #e7efff; }
.corp-org .cv-hr  { --a1: #f472b6; --a2: #db2777; --accent: #be185d; --pill: #fde7f1; }
.corp-org .cv-side { width: 108px; --a1: #cbd5e1; --a2: #94a3b8; --accent: #64748b; --pill: #eef2f7; }
.corp-org .cv-side .cphoto { width: 44px; height: 44px; border-radius: 12px; }
.corp-org .cv-side .cphoto::before { transform: translate(-4px, 5px); border-radius: 12px; }
.corp-org .cv-side .cname { font-size: calc(10px * var(--cfs,1)); }
.corp-org .cv-side .ctitle:first-of-type::before, .corp-org .cv-side .ctitle:first-of-type::after { content: ''; }

/* ── SECTION PILLS (gradient border) ── */
.corp-org .sec-pill {
  font-size: calc(9px * var(--cfs,1)); font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
  padding: 6px 15px; border-radius: 14px; color: var(--pc, #7c3aed);
  background: linear-gradient(#fff,#fff) padding-box, linear-gradient(135deg, var(--p1,#a78bfa), var(--p2,#7c3aed)) border-box;
  border: 2px solid transparent;
  box-shadow: 0 3px 8px rgba(15,23,42,.07);
  white-space: nowrap;
}
.corp-org .sp-ed   { --p1:#a78bfa; --p2:#7c3aed; --pc:#6d28d9; }
.corp-org .sp-ceo  { --p1:#60a5fa; --p2:#2563eb; --pc:#1d4ed8; }
.corp-org .sp-ops  { --p1:#34d399; --p2:#059669; --pc:#047857; }
.corp-org .sp-mbm  { --p1:#60a5fa; --p2:#1d4ed8; --pc:#1e40af; }
.corp-org .sp-dept { --p1:#93c5fd; --p2:#3b82f6; --pc:#1d4ed8; }
.corp-org .sp-pd   { --p1:#c084fc; --p2:#9333ea; --pc:#7e22ce; }
.corp-org .sp-pm   { --p1:#2dd4bf; --p2:#0d9488; --pc:#0f766e; }
.corp-org .sp-dh   { --p1:#38bdf8; --p2:#0284c7; --pc:#0369a1; }

/* ── FOOTER ── */
.corp-org .foot { text-align: center; font-size: 8.5px; color: #b6c0cf; margin-top: 22px; letter-spacing: .3px; }
`;

const CHART_HTML = `
<div class="page">

<!-- HEADER -->
<div class="hdr">
  <div class="hdr-left">
    <h1>Organizational <span>Chart</span></h1>
    <div class="hdr-sub">All companies — ABC &amp; MBM Gulf construction group. Reporting lines and key leadership at a glance.</div>
    <div class="hdr-dots"><i></i><i></i><i></i></div>
  </div>
  <div class="hdr-brand">
    <div class="logo"></div>
    <div class="bn">ABC Group<small>MBM Gulf</small></div>
  </div>
</div>

<!-- CHART BODY -->
<div class="content">

  <!-- TIER 0 — BOARD (centered) + PA to the side -->
  <div class="tier">
    <div style="flex:1; display:flex; justify-content:flex-end;"></div>
    <div class="card cv-board" data-emp="ecorp13">
      <div class="card-inner">
        <div class="clabel">Governing Body</div>
        <div class="cname" data-sync="name">Board of Directors</div>
        <div class="ctitle">Head Office</div>
      </div>
    </div>
    <div style="flex:1; display:flex; justify-content:flex-start;">
      <div class="card cv-side" data-emp="e60" style="margin-top:24px; margin-left:14px;">
        <div class="card-inner">
          <div class="clabel">PA to MD</div>
          <div class="cname" data-sync="name">Malak Benoudjafer</div>
        </div>
      </div>
    </div>
  </div>

  <!-- TIER 1+2 — THREE COLUMNS: ED | CEO | OPS -->
  <div class="cols">

    <!-- COLUMN A — EXECUTIVE DIRECTOR -->
    <div class="col">
      <div class="sec-pill sp-ed">Executive Director</div>
      <div class="card cv-ed" data-emp="e351">
        <div class="card-inner">
          <div class="cname" data-sync="name">Ziya Akhtar</div>
          <div class="ctitle">Executive Director</div>
          <div class="csub">→ Board of Directors · indirect line to CEO</div>
        </div>
      </div>
      <div class="card cv-side" data-emp="e97">
        <div class="card-inner">
          <div class="clabel">Secretary to ED</div>
          <div class="cname" data-sync="name">Rhizalyn</div>
        </div>
      </div>

      <div class="sec-pill sp-ed grp">Depts. reporting to ED</div>
      <div class="grid" data-section="ed-depts">
        <div class="card cv-dept" data-card="pmv"><div class="card-inner"><div class="cname">PMV &amp; Logistics</div></div></div>
        <div class="card cv-dept" data-emp="e154"><div class="card-inner"><div class="cname">Factory</div><div class="ctitle" data-sync="person">Fadi · Div. Manager</div></div></div>
        <div class="card cv-dept" data-emp="e86"><div class="card-inner"><div class="cname">Public Relations</div><div class="ctitle" data-sync="person">Saeed Al Falasi · GRO Mgr</div></div></div>
        <div class="card cv-dept" data-emp="e64"><div class="card-inner"><div class="cname">Legal</div><div class="ctitle" data-sync="person">Raid · Mgr – Legal</div></div></div>
        <div class="card cv-hr" data-emp="e403"><div class="card-inner"><div class="clabel">Human Resources</div><div class="cname" data-sync="name">Rajesh Nair</div><div class="ctitle" data-sync="title">Director – HR</div></div></div>
      </div>
    </div>

    <!-- COLUMN B — CEO -->
    <div class="col">
      <div class="sec-pill sp-ceo">Chief Executive Officer</div>
      <div class="card cv-ceo" data-emp="ecorp01">
        <div class="card-inner">
          <div class="cname" data-sync="name">Harish Wadkar</div>
          <div class="ctitle">Chief Executive Officer</div>
          <div class="csub">→ Board · ⤵ Rajesh Nair (indirect)</div>
        </div>
      </div>
      <div class="card cv-side" data-emp="e31">
        <div class="card-inner">
          <div class="clabel">Secretary to CEO</div>
          <div class="cname" data-sync="name">Jeramie Pantas</div>
        </div>
      </div>

      <div class="sec-pill sp-mbm grp">MBM Gulf</div>
      <div class="grid">
        <div class="card cv-mbm" data-emp="e407"><div class="card-inner"><div class="clabel">General Manager</div><div class="cname" data-sync="name">Jai Shankar</div><div class="ctitle">MBM Gulf</div></div></div>
      </div>

      <div class="sec-pill sp-dept grp">10 Departments</div>
      <div class="grid" data-section="ceo-depts">
        <div class="card cv-dept" data-emp="e411"><div class="card-inner"><div class="cname">Accounts &amp; Finance</div><div class="ctitle" data-sync="person">Mohit Kumar · CFO</div><div class="cext">Ext 131</div></div></div>
        <div class="card cv-dept" data-card="interiors"><div class="card-inner"><div class="cname">Interiors</div><div class="ctitle">Pooja · PD – Fit Outs</div></div></div>
        <div class="card cv-dept" data-emp="ecorp09"><div class="card-inner"><div class="cname">Stores</div><div class="ctitle" data-sync="name">Manoj Kumar</div><div class="ctitle" data-sync="title">Mgr – Stores</div></div></div>
        <div class="card cv-dept" data-emp="e402"><div class="card-inner"><div class="cname">Procurement</div><div class="ctitle" data-sync="person">Mohd. Yousuff</div><div class="cext">Ext 192</div></div></div>
        <div class="card cv-dept" data-emp="e410"><div class="card-inner"><div class="cname">IT</div><div class="ctitle" data-sync="name">Abdullah</div><div class="ctitle" data-sync="title">Manager – IT</div></div></div>
        <div class="card cv-dept" data-emp="e23"><div class="card-inner"><div class="cname">BD Approvals</div><div class="ctitle" data-sync="name">Pooja Chavan</div><div class="ctitle" data-sync="title">Sr Exe – BD</div></div></div>
        <div class="card cv-dept" data-emp="e416"><div class="card-inner"><div class="cname">Commercials</div><div class="ctitle" data-sync="name">Lokesh Kumar</div><div class="ctitle" data-sync="title">Dir – Commercial</div></div></div>
        <div class="card cv-dept" data-emp="e98"><div class="card-inner"><div class="cname">Tender &amp; Estimation</div><div class="ctitle" data-sync="person">Rajesh · Dir BD &amp; Est.</div></div></div>
        <div class="card cv-dept" data-emp="e401"><div class="card-inner"><div class="cname">Cost Control / Comm.</div><div class="ctitle" data-sync="person">Satya Addala · CCO</div><div class="cext">Ext 205</div></div></div>
        <div class="card cv-dept" data-emp="e59"><div class="card-inner"><div class="cname">Planning</div><div class="ctitle" data-sync="name">Ghulsan Kumar</div><div class="ctitle" data-sync="title">Planning Mgr</div></div></div>
      </div>
    </div>

    <!-- COLUMN C — OPERATIONS DIRECTOR -->
    <div class="col">
      <div class="sec-pill sp-ops">Operations Director</div>
      <div class="card cv-ops" data-emp="ecorp02">
        <div class="card-inner">
          <div class="cname">Liam Column</div>
          <div class="ctitle">Operations Director</div>
          <div class="csub">→ CEO</div>
        </div>
      </div>

      <div class="sec-pill sp-pd grp">Project Directors</div>
      <div class="grid" data-section="ops-pd">
        <div class="card cv-pd" data-emp="e418"><div class="card-inner"><div class="cname" data-sync="name">Gajendra Kumar</div><div class="ctitle" data-sync="title">Project Director</div><div class="cpill">TBD</div></div></div>
        <div class="card cv-pd" data-emp="e323"><div class="card-inner"><div class="cname" data-sync="name">Krishnamohan Rao</div><div class="ctitle" data-sync="title">Project Director</div><div class="cpill">Lagoon (53,61&amp;65)</div></div></div>
        <div class="card cv-pd" data-emp="e378"><div class="card-inner"><div class="cname" data-sync="name">Punyamurthi</div><div class="ctitle" data-sync="title">Project Director</div><div class="cpill">W Residences</div></div></div>
        <div class="card cv-pd" data-emp="e189"><div class="card-inner"><div class="cname" data-sync="name">Philip Watson</div><div class="ctitle" data-sync="title">Project Director</div><div class="cpill">Bay 2</div></div></div>
        <div class="card cv-pd" data-emp="e251"><div class="card-inner"><div class="cname" data-sync="name">Abdul Kader</div><div class="ctitle" data-sync="title">Project Director</div><div class="cpill">Deira Islands</div></div></div>
        <div class="card cv-pd" data-emp="ecorp04"><div class="card-inner"><div class="cname" data-sync="name">Prabhu</div><div class="ctitle" data-sync="title">Project Director</div><div class="cpill">Eywa</div></div></div>
      </div>

      <div class="sec-pill sp-pm grp">Project Managers</div>
      <div class="grid" data-section="ops-pm">
        <div class="card cv-pm" data-emp="e45"><div class="card-inner"><div class="cname" data-sync="name">Abu Jalala</div><div class="ctitle" data-sync="title">Project Manager</div><div class="cpill">13 Farm House</div></div></div>
        <div class="card cv-pm" data-emp="e186"><div class="card-inner"><div class="cname" data-sync="name">Parth</div><div class="ctitle" data-sync="title">Project Manager</div><div class="cpill">Bay 2</div></div></div>
        <div class="card cv-pm" data-emp="ecorp05"><div class="card-inner"><div class="cname" data-sync="name">Jagdeshian</div><div class="ctitle" data-sync="title">Project Manager</div><div class="cpill">Deira Islands</div></div></div>
        <div class="card cv-pm" data-emp="e301"><div class="card-inner"><div class="cname" data-sync="name">Andrew Samuel / Akram</div><div class="ctitle" data-sync="title">Project Manager</div><div class="cpill">Eywa</div></div></div>
      </div>

      <div class="sec-pill sp-dh grp">Dept. Heads</div>
      <div class="grid" data-section="ops-dh">
        <div class="card cv-dh" data-emp="e390"><div class="card-inner"><div class="clabel">HSE</div><div class="cname" data-sync="name">Rockey Vibin</div><div class="ctitle" data-sync="title">Sr. HSE Manager</div></div></div>
        <div class="card cv-dh" data-emp="e298"><div class="card-inner"><div class="clabel">Quality Control</div><div class="cname" data-sync="name">Anil</div><div class="ctitle" data-sync="title">QA/QC Manager</div></div></div>
        <div class="card cv-dh" data-emp="e10"><div class="card-inner"><div class="clabel">Technical</div><div class="cname" data-sync="name">Anoop David</div><div class="ctitle" data-sync="title">Technical Manager</div></div></div>
      </div>
    </div>

  </div><!-- end .cols -->

  <div class="foot">For internal use only &nbsp;·&nbsp; Confidential &nbsp;·&nbsp; Click any card to open &amp; edit the employee</div>

</div><!-- end .content -->
</div><!-- end .page -->
`;

function CorporateOrgChart(_props: object, ref: React.Ref<CorporateOrgChartHandle>) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { canEdit } = useAuth();
  const employees = useSelector((s: RootState) => s.employees.list);
  const config = useSelector((s: RootState) => s.corporateChart);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [editMode, setEditMode] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [fontOpen, setFontOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSrc, setLinkSrc] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // bump to recompute connector geometry (resize)

  const font = config.font ?? {};
  const cards = useMemo(() => config.cards ?? {}, [config.cards]);
  const added = useMemo(() => config.added ?? [], [config.added]);

  // Effective connector set = base (minus removed) + user-added.
  const edges = useMemo(() => {
    const removed = new Set(config.edges?.removed ?? []);
    const base = BASE_EDGES.filter(e => !removed.has(edgeId(e)));
    const extra = (config.edges?.added ?? []).map(e => ({ ...e, type: e.type ?? 'normal' as const }));
    return [...base, ...extra];
  }, [config.edges]);
  const addedEdgeIds = useMemo(() => new Set((config.edges?.added ?? []).map(edgeId)), [config.edges]);

  // Undo/redo over the whole chart config. recordEdit() snapshots the current
  // config before each edit; undo/redo replace the config (and persist).
  const history = useUndoRedo<CorporateChartConfig>();
  const recordEdit = () => history.record(config);
  const doUndo = () => { const snap = history.undo(config); if (snap) { dispatch(replaceCorporateChart(snap)); setSelectedKey(null); } };
  const doRedo = () => { const snap = history.redo(config); if (snap) { dispatch(replaceCorporateChart(snap)); setSelectedKey(null); } };

  // Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) while editing. Ignore when typing in a field.
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); doRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, config]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute connector geometry on resize (layout can reflow/wrap).
  useEffect(() => {
    const onResize = () => setTick(t => t + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Build one HTML string for an added card so it matches the photo-card style.
  const addedCardHtml = (c: CorporateAddedCard, sec: typeof SECTIONS[number]) => {
    const inner =
      `<div class="card-inner">` +
      (c.label ? `<div class="clabel">${escapeHtml(c.label)}</div>` : '') +
      (c.line1 ? `<div class="cname">${escapeHtml(c.line1)}</div>` : '') +
      (c.line2 ? `<div class="ctitle">${escapeHtml(c.line2)}</div>` : '') +
      `</div>`;
    return `<div class="card ${c.variant} corp-added" data-card="${c.key}" data-added="1" style="width:${c.width || sec.width}px;">${inner}</div>`;
  };

  // Single reconcile pass: inject photo slots, live name/title sync, per-card
  // overrides, (re)create added cards, selection highlight, then draw edges.
  // Idempotent — added nodes are tagged .corp-added and cleared at the top.
  useLayoutEffect(() => {
    const root = wrapperRef.current;
    if (!root) return;

    // 0. Clear previously injected added cards + connector layer.
    root.querySelectorAll('.corp-added, .corp-edges').forEach(el => el.remove());

    // Give a card a photo slot: wrap its existing text into .cbody and prepend a
    // .cphoto. Idempotent — guarded by .has-photo so re-runs don't re-wrap.
    const ensurePhoto = (card: HTMLElement) => {
      const inner = card.querySelector<HTMLElement>('.card-inner');
      if (!inner || inner.classList.contains('has-photo')) return;
      const body = document.createElement('div');
      body.className = 'cbody';
      while (inner.firstChild) body.appendChild(inner.firstChild);
      const photo = document.createElement('div');
      photo.className = 'cphoto';
      inner.append(photo, body);
      inner.classList.add('has-photo');
    };

    // 0b. Every card gets a photo slot (blank placeholder by default).
    root.querySelectorAll<HTMLElement>('.card').forEach(ensurePhoto);

    // 1. Live sync of names/titles from employees + fill the photo from photoUrl.
    const byId = new Map(employees.map(e => [e.id, e]));
    root.querySelectorAll<HTMLElement>('[data-emp]').forEach(card => {
      const e = byId.get(card.getAttribute('data-emp') || '');
      if (!e) return;
      const photo = card.querySelector<HTMLElement>('.cphoto');
      if (photo) photo.style.backgroundImage = e.photoUrl ? `url("${e.photoUrl}")` : '';
      card.querySelectorAll<HTMLElement>('[data-sync]').forEach(el => {
        const mode = el.getAttribute('data-sync');
        if (mode === 'name') el.textContent = niceName(e.name);
        else if (mode === 'title') el.textContent = niceTitle(e.designation || '');
        else if (mode === 'person') el.textContent = niceName(e.name) + (e.designation ? ` · ${niceTitle(e.designation)}` : '');
      });
    });

    // 2. Per base-card overrides. Always reset first so cleared fields revert.
    root.querySelectorAll<HTMLElement>('.card').forEach(card => {
      if (card.classList.contains('corp-added')) return;
      const key = card.getAttribute('data-card') || card.getAttribute('data-emp');
      // reset
      card.style.display = '';
      card.querySelectorAll<HTMLElement>('.clabel,.cname,.ctitle,.csub,.cpill,.cext').forEach(t => { t.style.color = ''; });
      const photo = card.querySelector<HTMLElement>('.cphoto');
      if (photo) photo.style.backgroundColor = ''; // revert any prior photo-color override (keeps the headshot image)
      if (!key) return;
      card.style.transform = '';
      card.style.zIndex = '';
      const ov = cards[key];
      if (!ov) return;
      if (ov.hidden) { card.style.display = 'none'; return; }
      if (ov.bg && photo) { photo.style.backgroundColor = ov.bg; }
      if (ov.fg) card.querySelectorAll<HTMLElement>('.clabel,.cname,.ctitle,.csub,.cpill,.cext').forEach(t => { t.style.color = ov.fg!; });
      if (ov.dx || ov.dy) { card.style.transform = `translate(${ov.dx ?? 0}px, ${ov.dy ?? 0}px)`; card.style.zIndex = '20'; }
      const set = (sel: string, v?: string) => { if (v != null) { const el = card.querySelector(sel); if (el) el.textContent = v; } };
      set('.clabel', ov.label);
      set('.cname', ov.line1);
      set('.ctitle', ov.line2);
    });

    // 3. (Re)create added cards in their sections.
    for (const c of added) {
      const sec = SECTIONS.find(s => s.id === c.section);
      if (!sec) continue;
      const host = root.querySelector<HTMLElement>(`[data-section="${c.section}"]`);
      if (!host) continue;
      host.insertAdjacentHTML('beforeend', addedCardHtml(c, sec));
      const el = host.querySelector<HTMLElement>(`[data-card="${c.key}"]`);
      if (el) {
        ensurePhoto(el);
        const photo = el.querySelector<HTMLElement>('.cphoto');
        if (c.bg && photo) photo.style.backgroundColor = c.bg;
        if (c.fg) el.querySelectorAll<HTMLElement>('.clabel,.cname,.ctitle').forEach(t => { t.style.color = c.fg!; });
        if (c.dx || c.dy) { el.style.transform = `translate(${c.dx ?? 0}px, ${c.dy ?? 0}px)`; el.style.zIndex = '20'; }
      }
    }

    // 4. Selection + link-source highlight.
    root.querySelectorAll('.card.corp-selected, .card.corp-link-src').forEach(el => el.classList.remove('corp-selected', 'corp-link-src'));
    if (selectedKey) {
      const el = root.querySelector<HTMLElement>(`.card[data-card="${selectedKey}"], .card[data-emp="${selectedKey}"]`);
      el?.classList.add('corp-selected');
    }
    if (linkSrc) {
      const el = root.querySelector<HTMLElement>(`.card[data-card="${linkSrc}"], .card[data-emp="${linkSrc}"]`);
      el?.classList.add('corp-link-src');
    }

    // 5. Draw the dynamic connector layer between live card positions, so lines
    //    follow moved cards. Measured relative to the .page box.
    const page = root.querySelector<HTMLElement>('.page');
    if (page) {
      const pr = page.getBoundingClientRect();
      const cardEl = (key: string) =>
        page.querySelector<HTMLElement>(`.card[data-card="${key}"], .card[data-emp="${key}"]`);
      const box = (key: string) => {
        const el = cardEl(key);
        if (!el || el.style.display === 'none') return null;
        const r = el.getBoundingClientRect();
        return { x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height };
      };
      const paths: string[] = [];
      for (const e of edges) {
        const a = box(e.from); const b = box(e.to);
        if (!a || !b) continue;
        const id = `${e.from}->${e.to}`;
        if (e.type === 'side') {
          // Connect the facing edges, whichever side the child is on.
          const aCx = a.x + a.w / 2, bCx = b.x + b.w / 2;
          const sx = bCx >= aCx ? a.x + a.w : a.x;
          const tx = bCx >= aCx ? b.x : b.x + b.w;
          const sy = a.y + a.h / 2, ty = b.y + b.h / 2;
          paths.push(`<path data-edge="${id}" d="M ${sx} ${sy} L ${tx} ${ty}" stroke="#cbd5e1" stroke-width="1.4" stroke-dasharray="4 3" fill="none" />`);
        } else {
          // Photos sit near the top of each card — aim the connector at the
          // photo centre (~36px down) rather than the very top of the card box.
          const childTop = b.y + 8;
          const sx = a.x + a.w / 2, sy = a.y + a.h;
          const tx = b.x + b.w / 2, ty = childTop;
          const midY = sy + (ty - sy) / 2;
          paths.push(`<path data-edge="${id}" d="M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}" stroke="#cbd5e1" stroke-width="1.6" fill="none" marker-end="url(#corp-arrow)" />`);
        }
      }
      const defs = `<defs><marker id="corp-arrow" markerWidth="8" markerHeight="8" refX="5.5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#cbd5e1" /></marker></defs>`;
      const w = page.scrollWidth, h = page.scrollHeight;
      page.insertAdjacentHTML('afterbegin',
        `<svg class="corp-edges" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}${paths.join('')}</svg>`);
    }
  }, [employees, cards, added, selectedKey, edges, font, linkSrc, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drag-to-move (edit mode) ──────────────────────────────────────────────
  const dragRef = useRef<{ key: string; el: HTMLElement; startX: number; startY: number; baseDx: number; baseDy: number; moved: boolean } | null>(null);
  const justDraggedRef = useRef(false);

  const offsetOf = (key: string): { dx: number; dy: number } => {
    const a = added.find(c => c.key === key);
    if (a) return { dx: a.dx ?? 0, dy: a.dy ?? 0 };
    const o = cards[key];
    return { dx: o?.dx ?? 0, dy: o?.dy ?? 0 };
  };

  const onCorpDragMove = (ev: MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const ddx = ev.clientX - d.startX;
    const ddy = ev.clientY - d.startY;
    if (Math.abs(ddx) > 3 || Math.abs(ddy) > 3) d.moved = true;
    d.el.style.transform = `translate(${d.baseDx + ddx}px, ${d.baseDy + ddy}px)`;
    d.el.style.zIndex = '50';
  };

  const onCorpDragUp = (ev: MouseEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    window.removeEventListener('mousemove', onCorpDragMove);
    window.removeEventListener('mouseup', onCorpDragUp);
    if (!d) return;
    if (!d.moved) {
      // a plain click — restore the persisted transform and let onClick select
      d.el.style.transform = (d.baseDx || d.baseDy) ? `translate(${d.baseDx}px, ${d.baseDy}px)` : '';
      d.el.style.zIndex = (d.baseDx || d.baseDy) ? '20' : '';
      return;
    }
    justDraggedRef.current = true;
    const dx = Math.round(d.baseDx + (ev.clientX - d.startX));
    const dy = Math.round(d.baseDy + (ev.clientY - d.startY));
    recordEdit();
    if (added.some(c => c.key === d.key)) dispatch(updateAddedCard({ key: d.key, patch: { dx, dy } }));
    else dispatch(setCardOverride({ key: d.key, patch: { dx, dy } }));
    setSelectedKey(d.key);
  };

  const onCorpMouseDown = (e: React.MouseEvent) => {
    if (!editMode || linkMode) return; // no card-drag while linking
    const cardEl = (e.target as HTMLElement).closest<HTMLElement>('.card');
    if (!cardEl) return;
    const key = cardEl.getAttribute('data-card') || cardEl.getAttribute('data-emp');
    if (!key) return;
    e.preventDefault(); // suppress text selection while dragging
    const base = offsetOf(key);
    dragRef.current = { key, el: cardEl, startX: e.clientX, startY: e.clientY, baseDx: base.dx, baseDy: base.dy, moved: false };
    window.addEventListener('mousemove', onCorpDragMove);
    window.addEventListener('mouseup', onCorpDragUp);
  };

  // Click: link mode → add/remove links; edit mode → select; else open employee.
  const onChartClick = (e: React.MouseEvent) => {
    if (justDraggedRef.current) { justDraggedRef.current = false; return; } // ignore click after a drag
    const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
    if (editMode && linkMode) {
      // Click a connector to delete it.
      const pathEl = (e.target as HTMLElement).closest('path[data-edge]');
      if (pathEl) {
        const id = pathEl.getAttribute('data-edge')!;
        recordEdit();
        dispatch(removeCorporateEdge({ id, isBase: !addedEdgeIds.has(id) }));
        return;
      }
      const key = card?.getAttribute('data-card') || card?.getAttribute('data-emp') || null;
      if (!key) { setLinkSrc(null); return; }       // clicked empty → cancel
      if (!linkSrc) { setLinkSrc(key); return; }     // pick source
      if (linkSrc !== key) { recordEdit(); dispatch(addCorporateEdge({ from: linkSrc, to: key, type: 'normal' })); }
      setLinkSrc(null);                               // link made (or same card) → reset
      return;
    }
    if (editMode) {
      const key = card?.getAttribute('data-card') || card?.getAttribute('data-emp') || null;
      setSelectedKey(key);
      setAdding(false);
      return;
    }
    const id = card?.getAttribute('data-emp');
    if (id) navigate(`/employees/${id}`);
  };

  const capture = async (): Promise<HTMLCanvasElement | null> => {
    const page = wrapperRef.current?.querySelector<HTMLElement>('.page');
    if (!page) return null;
    return html2canvas(page, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false });
  };

  useImperativeHandle(ref, () => ({
    async exportToPng(filename: string) {
      const canvas = await capture();
      if (!canvas) return;
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = filename;
      link.click();
    },
    async exportToPdf(filename: string) {
      const canvas = await capture();
      if (!canvas) return;
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'pt', format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height, undefined, 'FAST');
      pdf.save(filename);
    },
  }), []);

  // ── Selected card editing helpers ─────────────────────────────────────────
  const selectedAdded = added.find(c => c.key === selectedKey);
  const selectedOverride = selectedKey ? cards[selectedKey] : undefined;
  const patchSelected = (patch: Record<string, unknown>) => {
    if (!selectedKey) return;
    recordEdit();
    if (selectedAdded) dispatch(updateAddedCard({ key: selectedKey, patch }));
    else dispatch(setCardOverride({ key: selectedKey, patch }));
  };
  const deleteSelected = () => {
    if (!selectedKey) return;
    recordEdit();
    dispatch(deleteCorporateCard({ key: selectedKey, isAdded: !!selectedAdded }));
    setSelectedKey(null);
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        ref={wrapperRef}
        className={`corp-org ${editMode ? 'editing' : ''} ${linkMode ? 'linking' : ''} ${font.color ? 'cc-color' : ''}`}
        style={{
          ['--cff' as string]: font.family || `'Inter', system-ui, sans-serif`,
          ['--cfs' as string]: font.scale ?? 1,
          ['--ccc' as string]: font.color || 'inherit',
        } as React.CSSProperties}
        onClick={onChartClick}
        onMouseDown={onCorpMouseDown}
      >
        <style>{CSS}</style>
        <div dangerouslySetInnerHTML={{ __html: CHART_HTML }} />
      </div>

      {/* Edit toolbar (editors only) */}
      {canEdit && (
        <div className="absolute top-3 right-3 z-40 flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => { setEditMode(m => !m); setSelectedKey(null); setAdding(false); setFontOpen(false); setLinkMode(false); setLinkSrc(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow ${
              editMode ? 'bg-blue-600 text-white' : 'bg-white/90 text-slate-700 border border-slate-200 hover:bg-white'
            }`}
          >
            <Pencil size={13} /> {editMode ? 'Done' : 'Edit chart'}
          </button>
          {editMode && (
            <>
              <button onClick={doUndo} disabled={!history.canUndo} title="Undo (Ctrl+Z)" className="flex items-center justify-center w-8 h-8 rounded-lg shadow bg-white/90 text-slate-700 border border-slate-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
                <Undo2 size={14} />
              </button>
              <button onClick={doRedo} disabled={!history.canRedo} title="Redo (Ctrl+Shift+Z)" className="flex items-center justify-center w-8 h-8 rounded-lg shadow bg-white/90 text-slate-700 border border-slate-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
                <Redo2 size={14} />
              </button>
              <button
                onClick={() => { setLinkMode(m => !m); setLinkSrc(null); setSelectedKey(null); setAdding(false); setFontOpen(false); }}
                title="Link tool — click two cards to connect; click a line to delete"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow ${
                  linkMode ? 'bg-emerald-600 text-white' : 'bg-white/90 text-slate-700 border border-slate-200 hover:bg-white'
                }`}
              >
                <Spline size={13} /> {linkMode ? 'Linking…' : 'Link'}
              </button>
              <button onClick={() => { setFontOpen(o => !o); setAdding(false); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow bg-white/90 text-slate-700 border border-slate-200 hover:bg-white">
                <Type size={13} /> Font
              </button>
              <button onClick={() => { setAdding(a => !a); setSelectedKey(null); setFontOpen(false); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow bg-white/90 text-slate-700 border border-slate-200 hover:bg-white">
                <Plus size={13} /> Add card
              </button>
            </>
          )}
        </div>
      )}

      {/* Font popover */}
      {editMode && fontOpen && (
        <div className="absolute top-14 right-3 z-40 bg-white rounded-xl shadow-lg border border-slate-200 p-3 w-60 text-xs text-slate-700" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2"><span className="font-semibold text-slate-600">Chart font (global)</span><button onClick={() => setFontOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={13} /></button></div>
          <label className="block text-slate-500 mb-1">Family</label>
          <select value={font.family ?? ''} onChange={e => { recordEdit(); dispatch(setCorporateFont({ family: e.target.value || null })); }} className="w-full border border-slate-200 rounded-md px-2 py-1 mb-2">
            <option value="">Default (Inter)</option>
            <option value="Arial, Helvetica, sans-serif">Arial</option>
            <option value="'Segoe UI', system-ui, sans-serif">Segoe UI</option>
            <option value="Georgia, 'Times New Roman', serif">Georgia / Serif</option>
            <option value="'Courier New', monospace">Monospace</option>
          </select>
          <label className="block text-slate-500 mb-1">Size · {Math.round((font.scale ?? 1) * 100)}%</label>
          <input type="range" min={0.8} max={1.5} step={0.05} value={font.scale ?? 1} onChange={e => { recordEdit(); dispatch(setCorporateFont({ scale: parseFloat(e.target.value) })); }} className="w-full mb-2" />
          <label className="block text-slate-500 mb-1">Text color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={font.color ?? '#1e293b'} onChange={e => { recordEdit(); dispatch(setCorporateFont({ color: e.target.value })); }} className="w-8 h-7 rounded border border-slate-200 cursor-pointer" />
            <button onClick={() => { recordEdit(); dispatch(setCorporateFont({ color: null })); }} className="text-slate-500 hover:text-red-500 px-1.5 py-1 rounded hover:bg-slate-100">Default</button>
          </div>
          <button onClick={() => { recordEdit(); dispatch(resetCorporateChart()); }} className="mt-3 w-full flex items-center justify-center gap-1 text-slate-500 hover:text-red-600 border border-slate-200 rounded-md py-1 hover:bg-slate-50"><RotateCcw size={11} /> Reset all chart edits</button>
        </div>
      )}

      {/* Add-card panel */}
      {editMode && adding && (
        <AddCardPanel onClose={() => setAdding(false)} onAdd={c => { recordEdit(); dispatch(addCorporateCard(c)); setAdding(false); setSelectedKey(c.key); }} />
      )}

      {/* Selected-card editor */}
      {editMode && selectedKey && (
        <CardEditorPanel
          title={selectedAdded ? 'Added card' : 'Card'}
          override={selectedAdded ?? selectedOverride}
          onPatch={patchSelected}
          onDelete={deleteSelected}
          onClose={() => setSelectedKey(null)}
        />
      )}

      {editMode && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 text-[11px] text-white/90 bg-slate-900/70 rounded-full px-3 py-1" onClick={e => e.stopPropagation()}>
          {linkMode
            ? (linkSrc ? 'Click the target card to connect · click a line to delete · Esc-ish: click empty to cancel' : 'Click a source card, then a target card to link · click a line to delete')
            : 'Drag a card to move it · click to edit color & text · lines follow automatically · use “Link” to fix connections'}
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
}

// Panel to edit the selected card's photo color and text lines.
function CardEditorPanel({ title, override, onPatch, onDelete, onClose }: {
  title: string;
  override?: { bg?: string; fg?: string; label?: string; line1?: string; line2?: string; dx?: number; dy?: number };
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ov = override ?? {};
  return (
    <div className="absolute top-14 right-3 z-40 bg-white rounded-xl shadow-lg border border-slate-200 p-3 w-64 text-xs text-slate-700" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-slate-600">{title}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>
      </div>

      <label className="block text-slate-500 mb-1">Label (small caps)</label>
      <input value={ov.label ?? ''} placeholder="(unchanged)" onChange={e => onPatch({ label: e.target.value })} className="w-full border border-slate-200 rounded-md px-2 py-1 mb-2" />
      <label className="block text-slate-500 mb-1">Name line</label>
      <input value={ov.line1 ?? ''} placeholder="(unchanged)" onChange={e => onPatch({ line1: e.target.value })} className="w-full border border-slate-200 rounded-md px-2 py-1 mb-2" />
      <label className="block text-slate-500 mb-1">Title line</label>
      <input value={ov.line2 ?? ''} placeholder="(unchanged)" onChange={e => onPatch({ line2: e.target.value })} className="w-full border border-slate-200 rounded-md px-2 py-1 mb-2" />

      <div className="flex items-center gap-3 mb-3">
        <div>
          <label className="block text-slate-500 mb-1">Photo color</label>
          <div className="flex items-center gap-1">
            <input type="color" value={ov.bg ?? '#e2e8f0'} onChange={e => onPatch({ bg: e.target.value })} className="w-8 h-7 rounded border border-slate-200 cursor-pointer" />
            <button onClick={() => onPatch({ bg: null })} className="text-slate-400 hover:text-red-500" title="Clear"><X size={12} /></button>
          </div>
        </div>
        <div>
          <label className="block text-slate-500 mb-1">Text</label>
          <div className="flex items-center gap-1">
            <input type="color" value={ov.fg ?? '#1e293b'} onChange={e => onPatch({ fg: e.target.value })} className="w-8 h-7 rounded border border-slate-200 cursor-pointer" />
            <button onClick={() => onPatch({ fg: null })} className="text-slate-400 hover:text-red-500" title="Clear"><X size={12} /></button>
          </div>
        </div>
      </div>

      {(ov.dx || ov.dy) ? (
        <button onClick={() => onPatch({ dx: null, dy: null })} className="w-full flex items-center justify-center gap-1.5 text-slate-600 border border-slate-200 rounded-md py-1.5 hover:bg-slate-50 mb-2">
          <RotateCcw size={12} /> Reset position
        </button>
      ) : null}

      <button onClick={onDelete} className="w-full flex items-center justify-center gap-1.5 text-red-600 border border-red-200 rounded-md py-1.5 hover:bg-red-50 font-medium">
        <Trash2 size={13} /> Remove card
      </button>
    </div>
  );
}

// Panel to add a new card into a section.
function AddCardPanel({ onAdd, onClose }: { onAdd: (c: CorporateAddedCard) => void; onClose: () => void }) {
  const [section, setSection] = useState(SECTIONS[1].id);
  const [label, setLabel] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const sec = SECTIONS.find(s => s.id === section)!;
  return (
    <div className="absolute top-14 right-3 z-40 bg-white rounded-xl shadow-lg border border-slate-200 p-3 w-64 text-xs text-slate-700" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-slate-600">Add card</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>
      </div>
      <label className="block text-slate-500 mb-1">Section</label>
      <select value={section} onChange={e => setSection(e.target.value)} className="w-full border border-slate-200 rounded-md px-2 py-1 mb-2">
        {SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <label className="block text-slate-500 mb-1">Label (small caps)</label>
      <input value={label} onChange={e => setLabel(e.target.value)} className="w-full border border-slate-200 rounded-md px-2 py-1 mb-2" />
      <label className="block text-slate-500 mb-1">Name line</label>
      <input value={line1} onChange={e => setLine1(e.target.value)} className="w-full border border-slate-200 rounded-md px-2 py-1 mb-2" />
      <label className="block text-slate-500 mb-1">Title line</label>
      <input value={line2} onChange={e => setLine2(e.target.value)} className="w-full border border-slate-200 rounded-md px-2 py-1 mb-3" />
      <button
        onClick={() => onAdd({ key: `add-${Date.now().toString(36)}`, section, variant: sec.variant, width: sec.width || undefined, label: label || undefined, line1: line1 || undefined, line2: line2 || undefined })}
        disabled={!label && !line1 && !line2}
        className="w-full bg-blue-600 text-white rounded-md py-1.5 font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        Add to {sec.label}
      </button>
    </div>
  );
}

export default forwardRef(CorporateOrgChart);
