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

// Sections new cards can be added to, with the wrapper/stub + card style each
// uses so an added card matches its neighbours.
const SECTIONS: { id: string; label: string; variant: string; wrap: string; stub: string; width: number }[] = [
  { id: 'ed-depts',  label: 'ED · Departments',        variant: 'cv-dept', wrap: 'plain', stub: '',    width: 0   },
  { id: 'ceo-depts', label: 'CEO · Departments',       variant: 'cv-dept', wrap: 'cd',    stub: 'cdv', width: 84  },
  { id: 'ops-pd',    label: 'Ops · Project Directors', variant: 'cv-pd',   wrap: 'cpd',   stub: 'pdv', width: 104 },
  { id: 'ops-pm',    label: 'Ops · Project Managers',  variant: 'cv-pm',   wrap: 'cpm',   stub: 'pmv', width: 112 },
  { id: 'ops-dh',    label: 'Ops · Dept. Heads',       variant: 'cv-dh',   wrap: 'cdh',   stub: 'dhv', width: 160 },
];

// Base connector set (parent card key → child card key), matching the A3.
// Keys are the cards' data-card / data-emp ids. 'side' edges are the dashed
// PA/secretary links drawn horizontally.
const BASE_EDGES: { from: string; to: string; type?: 'normal' | 'side' }[] = [
  { from: 'ecorp13', to: 'e60', type: 'side' },   // Board → PA Malak
  { from: 'ecorp13', to: 'e351' },                // Board → ED
  { from: 'ecorp13', to: 'ecorp01' },             // Board → CEO
  { from: 'ecorp13', to: 'ecorp02' },             // Board → Ops (A3 bridge)
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

// Pixel-faithful reproduction of the hand-designed A3 "Corporate Organization
// Chart" (Rev 002). The markup, text, layout and colors are kept exactly as in
// the supplied HTML/PDF; the only behavioural change is that each person card
// carries a `data-emp` id, so clicking it opens that employee in the app for
// editing. CSS is scoped under `.corp-org` so the bespoke `.card`/`.row`/
// `.content` rules don't clash with the rest of the app.

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap');

.corp-org, .corp-org *, .corp-org *::before, .corp-org *::after { box-sizing: border-box; margin: 0; padding: 0; }

.corp-org {
  position: relative;
  font-family: var(--cff, 'Inter', system-ui, sans-serif);
  background: linear-gradient(135deg, #0f1c3a 0%, #1a3a5c 50%, #0f2d1e 100%);
  width: 100%; height: 100%; overflow: auto;
  padding: 16px;
}

/* Global text-color override (opt-in) */
.corp-org.cc-color .clabel,
.corp-org.cc-color .cname,
.corp-org.cc-color .ctitle,
.corp-org.cc-color .csub,
.corp-org.cc-color .cpill,
.corp-org.cc-color .cext { color: var(--ccc) !important; }

/* Edit mode: cards become selectable/highlightable/draggable */
.corp-org.editing .card { outline: 1px dashed transparent; outline-offset: 1px; cursor: move; }
.corp-org.editing .card:hover { outline-color: #94a3b8; }
.corp-org .card.corp-selected { outline: 2px solid #2563eb !important; outline-offset: 1px; box-shadow: 0 0 0 3px rgba(37,99,235,.25); }

/* ── PAGE SHELL ── */
.corp-org .page {
  background: #f4f6fa;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,.45);
  max-width: 1560px;
  margin: 0 auto;
  overflow: hidden;
  position: relative;
  z-index: 0; /* establish a stacking context so the -1 edge layer sits above the page bg, below cards */
}

/* ── HEADER BAND ── */
.corp-org .hdr {
  background: linear-gradient(100deg, #0d1f42 0%, #1a3a6c 40%, #0e3020 100%);
  padding: 16px 20px 14px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 3px solid #c9a227;
  position: relative;
}
.corp-org .hdr-left { display: flex; flex-direction: column; }
.corp-org .hdr h1 { font-size: 17px; font-weight: 800; color: #fff; letter-spacing: 1.2px; text-transform: uppercase; }
.corp-org .hdr h1 span { color: #c9a227; }
.corp-org .hdr-sub { font-size: 9.5px; color: rgba(255,255,255,.55); margin-top: 3px; letter-spacing: .5px; }
.corp-org .hdr-badge { display: flex; gap: 8px; align-items: center; }
.corp-org .badge { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); color: rgba(255,255,255,.75); font-size: 9px; font-weight: 600; padding: 3px 9px; border-radius: 12px; letter-spacing: .4px; text-transform: uppercase; }
.corp-org .badge.gold { background: rgba(201,162,39,.2); border-color: #c9a227; color: #f0d060; }

/* ── CONTENT AREA ── */
.corp-org .content { padding: 14px 12px 10px; }

/* ── CONNECTOR LINES ── */
/* The hand-built A3 connectors are hidden (kept for spacing) — connectors are
   now drawn by the dynamic SVG layer so they follow moved cards. */
.corp-org .vl { width: 2px; margin: 0 auto; flex-shrink: 0; visibility: hidden; }
.corp-org .hl { height: 2px; flex-shrink: 0; visibility: hidden; }
.corp-org .cdv, .corp-org .pdv, .corp-org .pmv, .corp-org .dhv,
.corp-org .corp-conn { visibility: hidden; }

/* Dynamic connector layer */
.corp-org .corp-edges { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: -1; overflow: visible; }
.corp-org .corp-edges path { pointer-events: none; }
.corp-org.linking .corp-edges { z-index: 30; }
.corp-org.linking .corp-edges path { pointer-events: stroke; cursor: pointer; }
.corp-org.linking .corp-edges path:hover { stroke: #ef4444 !important; stroke-width: 3 !important; }
.corp-org.linking .card { cursor: crosshair !important; }
.corp-org .card.corp-link-src { outline: 2px solid #22c55e !important; outline-offset: 1px; }
.corp-org .c-navy  { background: #1a3268; }
.corp-org .c-blue  { background: #1e5f8e; }
.corp-org .c-green { background: #1a5c3a; }
.corp-org .c-purp  { background: #5e2a8a; }
.corp-org .c-orng  { background: #c96520; }
.corp-org .c-viol  { background: #8a5ac0; }
.corp-org .c-teal  { background: #1a8a8a; }
.corp-org .c-sky   { background: #2a7cc0; }
.corp-org .c-rose  { background: #c03070; }

/* ── CARD BASE ── */
.corp-org .card { border-radius: 8px; position: relative; flex-shrink: 0; overflow: hidden; }
.corp-org .card::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; }
.corp-org .card[data-emp] { cursor: pointer; transition: filter .12s, box-shadow .12s; }
.corp-org .card[data-emp]:hover { filter: brightness(1.04); box-shadow: 0 5px 16px rgba(0,0,0,.2); }
.corp-org .card-inner { padding: 6px 9px 6px 11px; }
.corp-org .clabel  { font-size: calc(7px * var(--cfs,1)); font-weight: 700; letter-spacing: .8px; text-transform: uppercase; margin-bottom: 1px; }
.corp-org .cname   { font-size: calc(11px * var(--cfs,1)); font-weight: 800; line-height: 1.2; }
.corp-org .ctitle  { font-size: calc(8px * var(--cfs,1)); font-weight: 500; line-height: 1.35; margin-top: 1px; }
.corp-org .csub    { font-size: calc(7.5px * var(--cfs,1)); font-weight: 400; margin-top: 1px; opacity: .75; }
.corp-org .cpill   { display: inline-block; font-size: calc(7px * var(--cfs,1)); font-weight: 700; padding: 1px 5px; border-radius: 8px; margin-top: 3px; letter-spacing: .3px; }
.corp-org .cext { font-size: calc(7px * var(--cfs,1)); opacity: .6; margin-top: 1px; }

/* ── PHOTO AVATAR ── */
/* Blank round placeholder on the left of every person card. The avatar is
   injected by the reconcile pass into [data-emp] cards; existing card text is
   wrapped into .cbody so the two sit side-by-side. (No real image yet.) */
.corp-org .card-inner.has-photo { display: flex; align-items: center; gap: 8px; }
.corp-org .cbody { min-width: 0; flex: 1; }
.corp-org .cphoto {
  flex-shrink: 0;
  width: calc(26px * var(--cfs,1));
  height: calc(26px * var(--cfs,1));
  border-radius: 50%;
  background: #e2e8f0 center/cover no-repeat;
  border: 1px solid rgba(0,0,0,.12);
  box-shadow: inset 0 1px 2px rgba(0,0,0,.1);
}
/* Bigger avatar + light border on the large dark leadership cards. */
.corp-org .cv-board .cphoto,
.corp-org .cv-ed .cphoto,
.corp-org .cv-ceo .cphoto,
.corp-org .cv-ops .cphoto,
.corp-org .cv-mbm .cphoto {
  width: calc(42px * var(--cfs,1));
  height: calc(42px * var(--cfs,1));
  background: rgba(255,255,255,.15);
  border-color: rgba(255,255,255,.35);
}
/* Small dashed PA / secretary cards keep a compact avatar. */
.corp-org .cv-side .cphoto { width: calc(22px * var(--cfs,1)); height: calc(22px * var(--cfs,1)); }

/* ── CARD VARIANTS ── */
.corp-org .cv-board { background: linear-gradient(135deg, #0d1f42 0%, #1a3a6e 100%); box-shadow: 0 4px 16px rgba(13,31,66,.4), inset 0 1px 0 rgba(255,255,255,.08); border: 1px solid #2a4a8e; }
.corp-org .cv-board::before { background: #c9a227; }
.corp-org .cv-board .clabel { color: #c9a227; }
.corp-org .cv-board .cname  { color: #fff; font-size: calc(15px * var(--cfs,1)); }
.corp-org .cv-board .ctitle { color: rgba(255,255,255,.65); }

.corp-org .cv-ed { background: linear-gradient(135deg, #124a70 0%, #1e6ea0 100%); box-shadow: 0 3px 12px rgba(18,74,112,.35), inset 0 1px 0 rgba(255,255,255,.08); border: 1px solid #2a80b8; }
.corp-org .cv-ed::before { background: #5bc8f0; }
.corp-org .cv-ed .clabel { color: #90d8f8; }
.corp-org .cv-ed .cname  { color: #fff; }
.corp-org .cv-ed .ctitle { color: rgba(255,255,255,.72); }
.corp-org .cv-ed .csub   { color: rgba(255,255,255,.5); }

.corp-org .cv-ceo { background: linear-gradient(135deg, #0e3f27 0%, #1a6040 100%); box-shadow: 0 3px 12px rgba(14,63,39,.35), inset 0 1px 0 rgba(255,255,255,.08); border: 1px solid #2a8058; }
.corp-org .cv-ceo::before { background: #4cd894; }
.corp-org .cv-ceo .clabel { color: #7ee8b0; }
.corp-org .cv-ceo .cname  { color: #fff; }
.corp-org .cv-ceo .ctitle { color: rgba(255,255,255,.72); }
.corp-org .cv-ceo .csub   { color: rgba(255,255,255,.5); }

.corp-org .cv-ops { background: linear-gradient(135deg, #3a1060 0%, #6030a0 100%); box-shadow: 0 3px 12px rgba(58,16,96,.35), inset 0 1px 0 rgba(255,255,255,.08); border: 1px solid #8040c0; }
.corp-org .cv-ops::before { background: #c090ff; }
.corp-org .cv-ops .clabel { color: #d0a8ff; }
.corp-org .cv-ops .cname  { color: #fff; }
.corp-org .cv-ops .ctitle { color: rgba(255,255,255,.72); }

.corp-org .cv-dept { background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.08); border: 1px solid #f0c8a0; }
.corp-org .cv-dept::before { background: #e07030; }
.corp-org .cv-dept .clabel { color: #b05020; }
.corp-org .cv-dept .cname  { color: #5a2800; font-size: calc(9px * var(--cfs,1)); }
.corp-org .cv-dept .ctitle { color: #804020; }
.corp-org .cv-dept .cext   { color: #a06040; }

.corp-org .cv-hr { background: #fff5f8; box-shadow: 0 2px 8px rgba(0,0,0,.08); border: 1px solid #f0a0c0; }
.corp-org .cv-hr::before { background: #c03070; }
.corp-org .cv-hr .clabel { color: #901050; }
.corp-org .cv-hr .cname  { color: #600030; font-size: calc(9px * var(--cfs,1)); }
.corp-org .cv-hr .ctitle { color: #901050; }

.corp-org .cv-mbm { background: linear-gradient(135deg, #0a3060 0%, #1050a0 100%); box-shadow: 0 2px 10px rgba(10,48,96,.3); border: 1px solid #2060c0; }
.corp-org .cv-mbm::before { background: #60c0ff; }
.corp-org .cv-mbm .clabel { color: #90d0ff; }
.corp-org .cv-mbm .cname  { color: #fff; }
.corp-org .cv-mbm .ctitle { color: rgba(255,255,255,.7); }

.corp-org .cv-pd { background: #faf5ff; box-shadow: 0 2px 8px rgba(0,0,0,.07); border: 1px solid #c8a0e8; }
.corp-org .cv-pd::before { background: #8040c0; }
.corp-org .cv-pd .clabel { color: #6020a0; }
.corp-org .cv-pd .cname  { color: #3a1060; font-size: calc(9px * var(--cfs,1)); }
.corp-org .cv-pd .ctitle { color: #6030a0; }
.corp-org .cv-pd .cpill  { background: #ede0ff; color: #5020a0; border: 1px solid #c8a0e8; }

.corp-org .cv-pm { background: #f0fafa; box-shadow: 0 2px 8px rgba(0,0,0,.07); border: 1px solid #80c8c8; }
.corp-org .cv-pm::before { background: #1a8a8a; }
.corp-org .cv-pm .clabel { color: #0a6060; }
.corp-org .cv-pm .cname  { color: #083838; font-size: calc(9px * var(--cfs,1)); }
.corp-org .cv-pm .ctitle { color: #1a6060; }
.corp-org .cv-pm .cpill  { background: #d8f4f4; color: #0a5858; border: 1px solid #80c8c8; }

.corp-org .cv-dh { background: #f0f6ff; box-shadow: 0 2px 8px rgba(0,0,0,.07); border: 1px solid #80a8d8; }
.corp-org .cv-dh::before { background: #2a7cc0; }
.corp-org .cv-dh .clabel { color: #0a4878; }
.corp-org .cv-dh .cname  { color: #082848; }
.corp-org .cv-dh .ctitle { color: #1a5888; }
.corp-org .cv-dh .csub   { color: #2a70a0; font-weight: 600; font-size: 7px; }

.corp-org .cv-side { background: #fdf8ff; box-shadow: 0 2px 6px rgba(0,0,0,.06); border: 1px dashed #b080d0; }
.corp-org .cv-side::before { background: #b080d0; }
.corp-org .cv-side .cname  { color: #4a1880; font-size: 9.5px; }
.corp-org .cv-side .ctitle { color: #7040a8; }

/* ── SECTION HEADER PILLS ── */
.corp-org .sec-pill { font-size: 7.5px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; padding: 2px 8px; border-radius: 10px; margin-bottom: 4px; display: inline-block; }
.corp-org .sp-pd   { background: #ede0ff; color: #5020a0; border: 1px solid #c8a0e8; }
.corp-org .sp-pm   { background: #d8f4f4; color: #0a5858; border: 1px solid #80c8c8; }
.corp-org .sp-dh   { background: #deeeff; color: #0a3868; border: 1px solid #80a8d8; }
.corp-org .sp-dept { background: #fff0e0; color: #804020; border: 1px solid #e8a860; }
.corp-org .sp-ed   { background: #e0f0ff; color: #1040a0; border: 1px solid #80b0e0; }
.corp-org .sp-mbm  { background: #d0e8ff; color: #003870; border: 1px solid #60a0e0; }

/* ── INDIRECT DOTTED ARROW ── */
.corp-org .indirect-row { display: flex; align-items: center; gap: 3px; margin-top: 4px; padding-top: 3px; border-top: 1px solid rgba(192,48,112,.2); }
.corp-org .indirect-line { flex: 1; border-top: 2px dashed #c03070; height: 0; }
.corp-org .indirect-label { font-size: 6.5px; font-weight: 700; color: #c03070; white-space: nowrap; background: #fff0f6; padding: 1px 4px; border-radius: 3px; border: 1px solid #f0a0c0; }

/* ── NOTE BOX ── */
.corp-org .notebox { background: linear-gradient(135deg, #fffae8 0%, #fff8e0 100%); border: 1px solid #e8c840; border-left: 4px solid #c9a227; border-radius: 6px; padding: 8px 12px; font-size: 9px; line-height: 1.65; color: #4a3800; box-shadow: 0 2px 8px rgba(200,160,0,.1); }
.corp-org .notebox strong { color: #2a1800; }

/* ── LEGEND ── */
.corp-org .legend-wrap { background: #fff; border-top: 2px solid #e0e4ec; padding: 10px 14px 8px; display: flex; flex-direction: column; gap: 6px; }
.corp-org .legend-row { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.corp-org .li { display: flex; align-items: center; gap: 5px; font-size: 9px; color: #444; }
.corp-org .ld { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
.corp-org .ld-dash { width: 20px; height: 0; border-top: 2px dashed #c03070; flex-shrink: 0; }
.corp-org .legend-footer { text-align: center; font-size: 8px; color: #aaa; }

/* ── FLEX HELPERS ── */
.corp-org .col { display: flex; flex-direction: column; align-items: center; }
.corp-org .row { display: flex; align-items: flex-start; justify-content: center; }

/* ── DEPARTMENT / PD / PM / DH COMB CONNECTORS ── */
.corp-org .cd { display: flex; flex-direction: column; align-items: center; }
.corp-org .cd > .cdv { width: 2px; height: 8px; background: #e07030; }
.corp-org .cpd { display: flex; flex-direction: column; align-items: center; }
.corp-org .cpd > .pdv { width: 2px; height: 8px; background: #8040c0; }
.corp-org .cpm { display: flex; flex-direction: column; align-items: center; }
.corp-org .cpm > .pmv { width: 2px; height: 8px; background: #1a8a8a; }
.corp-org .cdh { display: flex; flex-direction: column; align-items: center; }
.corp-org .cdh > .dhv { width: 2px; height: 8px; background: #2a7cc0; }
`;

const CHART_HTML = `
<div class="page">

<!-- HEADER -->
<div class="hdr">
  <div class="hdr-left">
    <h1>Corporate <span>Organization</span> Chart &nbsp;—&nbsp; All Companies</h1>
  </div>
</div>

<!-- CHART BODY -->
<div class="content">
<div class="col" style="gap:0; width:100%;">

  <!-- ── BOARD OF DIRECTORS ── -->
  <div class="row" style="align-items:center; gap:10px; margin-bottom:0;">
    <div style="width:150px;"></div>
    <div class="card cv-board" data-emp="ecorp13" style="width:200px;">
      <div class="card-inner" style="padding:10px 12px 10px 14px; text-align:center;">
        <div class="clabel">Governing Body</div>
        <div class="cname" data-sync="name" style="font-size:calc(16px*var(--cfs,1)); letter-spacing:.3px;">Board of Directors</div>
        <div class="ctitle">Head Office</div>
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:6px; width:150px;">
      <div class="corp-conn" style="border-top:2px dashed rgba(176,128,208,.7); width:20px; flex-shrink:0;"></div>
      <div class="card cv-side" data-emp="e60" style="width:130px;">
        <div class="card-inner">
          <div class="clabel" style="color:#8040b0;">PA to MD</div>
          <div class="cname" data-sync="name">Malak Benoudjafer</div>
        </div>
      </div>
    </div>
  </div>

  <!-- vertical stem from Board -->
  <div class="vl c-navy" style="height:16px;"></div>

  <!-- ── HORIZONTAL BRIDGE: ED | CEO | OPS ── -->
  <div style="display:flex; align-items:flex-start; justify-content:center; width:100%; position:relative;">
    <div style="flex:1; max-width:320px; display:flex; flex-direction:column; align-items:center;">
      <div class="hl c-navy" style="width:55%; align-self:flex-end;"></div>
      <div class="vl c-navy" style="height:12px;"></div>
    </div>
    <div style="display:flex; flex-direction:column; align-items:center; flex-shrink:0;">
      <div class="hl c-navy" style="width:260px;"></div>
      <div class="vl c-navy" style="height:12px;"></div>
    </div>
    <div style="flex:1; max-width:720px; display:flex; flex-direction:column; align-items:center;">
      <div class="hl c-navy" style="width:55%; align-self:flex-start;"></div>
      <div class="vl c-navy" style="height:12px;"></div>
    </div>
  </div>

  <!-- ── LEVEL 2: THREE COLUMNS ── -->
  <div class="row" style="align-items:flex-start; gap:10px; width:100%; flex-wrap:nowrap;">

    <!-- COLUMN A — ZIYA (ED) -->
    <div class="col" style="flex:0 0 auto; width:240px;">

      <div class="row" style="align-items:center; gap:5px;">
        <div class="card cv-side" data-emp="e97" style="width:96px;">
          <div class="card-inner" style="padding:5px 7px 5px 9px;">
            <div class="clabel" style="color:#8040b0;">Secretary to ED</div>
            <div class="cname" data-sync="name" style="font-size:calc(9px*var(--cfs,1));">Rhizalyn</div>
          </div>
        </div>
        <div class="corp-conn" style="border-top:2px dashed #b080d0; width:12px; flex-shrink:0;"></div>
        <div class="card cv-ed" data-emp="e351" style="width:136px;">
          <div class="card-inner" style="padding:8px 9px 8px 13px;">
            <div class="clabel">Executive Director</div>
            <div class="cname" data-sync="name" style="font-size:calc(13px*var(--cfs,1));">Ziya Akhtar</div>
            <div class="csub">→ Board of Directors</div>
            <div style="font-size:6.5px; color:rgba(255,200,80,.8); margin-top:1px; font-style:italic;">indirect line to CEO</div>
          </div>
        </div>
      </div>

      <div class="vl c-blue" style="height:10px;"></div>
      <div class="sec-pill sp-ed" style="margin-bottom:4px;">Depts. reporting to ED</div>

      <!-- Vertical stack with left bracket -->
      <div style="display:flex; align-items:stretch; gap:0; width:220px;">
        <div class="corp-conn" style="width:3px; background:linear-gradient(180deg,#e07030,#c05020); border-radius:2px; flex-shrink:0;"></div>
        <div data-section="ed-depts" style="display:flex; flex-direction:column; gap:3px; flex:1; padding-left:0;">

          <div class="cbrow" style="display:flex; align-items:center; gap:0;">
            <div class="corp-conn" style="width:12px; height:2px; background:#e07030; flex-shrink:0;"></div>
            <div class="card cv-dept" data-card="pmv" style="flex:1;">
              <div class="card-inner" style="padding:4px 8px 4px 10px; text-align:left;">
                <div class="cname">PMV &amp; Logistics</div>
              </div>
            </div>
          </div>

          <div class="cbrow" style="display:flex; align-items:center; gap:0;">
            <div class="corp-conn" style="width:12px; height:2px; background:#e07030; flex-shrink:0;"></div>
            <div class="card cv-dept" data-emp="e154" style="flex:1;">
              <div class="card-inner" style="padding:4px 8px 4px 10px; text-align:left;">
                <div class="cname">Factory</div>
                <div class="ctitle" data-sync="person">Fadi &nbsp;·&nbsp; Div. Manager</div>
              </div>
            </div>
          </div>

          <div class="cbrow" style="display:flex; align-items:center; gap:0;">
            <div class="corp-conn" style="width:12px; height:2px; background:#e07030; flex-shrink:0;"></div>
            <div class="card cv-dept" data-emp="e86" style="flex:1;">
              <div class="card-inner" style="padding:4px 8px 4px 10px; text-align:left;">
                <div class="cname">Public Relations</div>
                <div class="ctitle" data-sync="person">Saeed Al Falasi &nbsp;·&nbsp; GRO Mgr</div>
              </div>
            </div>
          </div>

          <div class="cbrow" style="display:flex; align-items:center; gap:0;">
            <div class="corp-conn" style="width:12px; height:2px; background:#e07030; flex-shrink:0;"></div>
            <div class="card cv-dept" data-emp="e64" style="flex:1;">
              <div class="card-inner" style="padding:4px 8px 4px 10px; text-align:left;">
                <div class="cname">Legal</div>
                <div class="ctitle" data-sync="person">Raid &nbsp;·&nbsp; Mgr – Legal</div>
              </div>
            </div>
          </div>

          <!-- HR — special dual-report box -->
          <div class="cbrow" style="display:flex; align-items:center; gap:0;">
            <div class="corp-conn" style="width:12px; height:2px; background:#c03070; flex-shrink:0;"></div>
            <div class="card cv-hr" data-emp="e403" style="flex:1;">
              <div class="card-inner" style="padding:4px 8px 4px 10px; text-align:left;">
                <div class="clabel">Human Resources</div>
                <div class="cname" data-sync="name">Rajesh Nair</div>
                <div class="ctitle" data-sync="title">Director – HR</div>
                <div class="indirect-row">
                  <div class="indirect-line"></div>
                  <div class="indirect-label">⤳ CEO (indirect)</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div><!-- end Ziya col -->

    <!-- COLUMN B — HARISH (CEO) -->
    <div class="col" style="flex:1; max-width:490px; min-width:380px;">

      <div class="row" style="align-items:center; gap:6px;">
        <div class="card cv-ceo" data-emp="ecorp01" style="width:178px;">
          <div class="card-inner" style="padding:9px 10px 9px 14px;">
            <div class="clabel">Chief Executive Officer</div>
            <div class="cname" data-sync="name" style="font-size:calc(14px*var(--cfs,1));">Harish Wadkar</div>
            <div class="csub">→ Board of Directors</div>
            <div style="font-size:6.5px; color:rgba(180,255,200,.65); margin-top:2px; padding-top:2px; border-top:1px dashed rgba(255,255,255,.2); font-style:italic;">⤵ Rajesh Nair (indirect)</div>
          </div>
        </div>
        <div class="corp-conn" style="border-top:2px dashed rgba(150,150,160,.6); width:12px; flex-shrink:0;"></div>
        <div class="card cv-side" data-emp="e31" style="width:120px;">
          <div class="card-inner" style="padding:5px 7px 5px 9px;">
            <div class="clabel" style="color:#8040b0;">Secretary to CEO</div>
            <div class="cname" data-sync="name" style="font-size:calc(9px*var(--cfs,1));">Jeramie Pantas</div>
          </div>
        </div>
      </div>

      <div class="vl c-green" style="height:10px;"></div>

      <!-- Two branches: MBM Gulf | 10 Departments -->
      <div style="position:relative; display:flex; gap:0; align-items:flex-start; justify-content:center; width:100%;">
        <div class="hl c-green" style="position:absolute; top:0; left:18%; right:18%;"></div>

        <!-- MBM GULF -->
        <div class="col" style="flex:1; max-width:175px;">
          <div class="vl c-green" style="height:10px;"></div>
          <div class="sec-pill sp-mbm">MBM Gulf</div>
          <div class="card cv-mbm" data-emp="e407" style="width:158px;">
            <div class="card-inner" style="padding:7px 9px 7px 13px;">
              <div class="clabel">General Manager</div>
              <div class="cname" data-sync="name" style="font-size:calc(12px*var(--cfs,1));">Jai Shankar</div>
              <div class="ctitle">MBM Gulf</div>
            </div>
          </div>
        </div>

        <!-- 10 DEPARTMENTS -->
        <div class="col" style="flex:1; max-width:320px;">
          <div class="vl c-green" style="height:10px;"></div>
          <div class="sec-pill sp-dept">10 Departments</div>
          <div data-section="ceo-depts" style="position:relative; display:flex; flex-wrap:wrap; justify-content:center; gap:3px; max-width:320px;">
            <div class="corp-conn" style="position:absolute; top:0; left:3%; right:3%; height:2px; background:#e07030;"></div>
            <div class="cd"><div class="cdv"></div><div class="card cv-dept" data-emp="e411" style="width:84px;"><div class="card-inner" style="padding:4px 6px 4px 9px;text-align:left;"><div class="cname">Accounts &amp; Finance</div><div class="ctitle" data-sync="person">Mohit Kumar · CFO</div><div class="cext">Ext 131</div></div></div></div>
            <div class="cd"><div class="cdv"></div><div class="card cv-dept" data-card="interiors" style="width:84px;"><div class="card-inner" style="padding:4px 6px 4px 9px;text-align:left;"><div class="cname">Interiors</div><div class="ctitle">Pooja · PD – Fit Outs</div></div></div></div>
            <div class="cd"><div class="cdv"></div><div class="card cv-dept" data-emp="ecorp09" style="width:84px;"><div class="card-inner" style="padding:4px 6px 4px 9px;text-align:left;"><div class="cname">Stores</div><div class="ctitle" data-sync="name">Manoj Kumar</div><div class="ctitle" data-sync="title">Mgr – Stores</div></div></div></div>
            <div class="cd"><div class="cdv"></div><div class="card cv-dept" data-emp="e402" style="width:84px;"><div class="card-inner" style="padding:4px 6px 4px 9px;text-align:left;"><div class="cname">Procurement</div><div class="ctitle" data-sync="person">Mohd. Yousuff</div><div class="cext">Ext 192</div></div></div></div>
            <div class="cd"><div class="cdv"></div><div class="card cv-dept" data-emp="e410" style="width:84px;"><div class="card-inner" style="padding:4px 6px 4px 9px;text-align:left;"><div class="cname">IT</div><div class="ctitle" data-sync="name">Abdullah</div><div class="ctitle" data-sync="title">Manager – IT</div></div></div></div>
            <div class="cd"><div class="cdv"></div><div class="card cv-dept" data-emp="e23" style="width:84px;"><div class="card-inner" style="padding:4px 6px 4px 9px;text-align:left;"><div class="cname">BD Approvals</div><div class="ctitle" data-sync="name">Pooja Chavan</div><div class="ctitle" data-sync="title">Sr Exe – BD</div></div></div></div>
            <div class="cd"><div class="cdv"></div><div class="card cv-dept" data-emp="e416" style="width:84px;"><div class="card-inner" style="padding:4px 6px 4px 9px;text-align:left;"><div class="cname">Commercials</div><div class="ctitle" data-sync="name">Lokesh Kumar</div><div class="ctitle" data-sync="title">Dir – Commercial</div></div></div></div>
            <div class="cd"><div class="cdv"></div><div class="card cv-dept" data-emp="e98" style="width:84px;"><div class="card-inner" style="padding:4px 6px 4px 9px;text-align:left;"><div class="cname">Tender &amp; Estimation</div><div class="ctitle" data-sync="person">Rajesh · Dir BD &amp; Est.</div></div></div></div>
            <div class="cd"><div class="cdv"></div><div class="card cv-dept" data-emp="e401" style="width:84px;"><div class="card-inner" style="padding:4px 6px 4px 9px;text-align:left;"><div class="cname">Cost Control / Comm.</div><div class="ctitle" data-sync="person">Satya Addala · CCO</div><div class="cext">Ext 205</div></div></div></div>
            <div class="cd"><div class="cdv"></div><div class="card cv-dept" data-emp="e59" style="width:84px;"><div class="card-inner" style="padding:4px 6px 4px 9px;text-align:left;"><div class="cname">Planning</div><div class="ctitle" data-sync="name">Ghulsan Kumar</div><div class="ctitle" data-sync="title">Planning Mgr</div></div></div></div>
          </div>
        </div>

      </div>
    </div><!-- end CEO col -->

    <!-- COLUMN C — LIAM (OPS) -->
    <div class="col" style="flex:1; max-width:720px; min-width:480px;">

      <div class="card cv-ops" data-emp="ecorp02" style="width:200px;">
        <div class="card-inner" style="padding:9px 10px 9px 14px; text-align:center;">
          <div class="clabel">Operations Director</div>
          <div class="cname" style="font-size:calc(14px*var(--cfs,1));">Liam Column</div>
          <div class="ctitle">Reports to: CEO</div>
        </div>
      </div>

      <div class="vl c-purp" style="height:10px;"></div>

      <!-- Three branches: PD | PM | DH -->
      <div style="position:relative; display:flex; gap:0; align-items:flex-start; justify-content:center; width:100%;">
        <div class="hl c-purp" style="position:absolute; top:0; left:5%; right:5%;"></div>

        <!-- PROJECT DIRECTORS (6) -->
        <div class="col" style="flex:2; max-width:360px;">
          <div class="vl c-viol" style="height:10px;"></div>
          <div class="sec-pill sp-pd">Project Directors</div>
          <div data-section="ops-pd" style="position:relative; display:flex; flex-wrap:wrap; justify-content:center; gap:3px; max-width:350px;">
            <div class="corp-conn" style="position:absolute; top:0; left:3%; right:3%; height:2px; background:#8040c0;"></div>
            <div class="cpd"><div class="pdv"></div><div class="card cv-pd" data-emp="e418" style="width:104px;"><div class="card-inner" style="padding:5px 7px 5px 11px;text-align:left;"><div class="cname" data-sync="name">Gajendra Kumar</div><div class="ctitle" data-sync="title">Project Director</div><div class="cpill">TBD</div></div></div></div>
            <div class="cpd"><div class="pdv"></div><div class="card cv-pd" data-emp="e323" style="width:104px;"><div class="card-inner" style="padding:5px 7px 5px 11px;text-align:left;"><div class="cname" data-sync="name">Krishnamohan Rao</div><div class="ctitle" data-sync="title">Project Director</div><div class="cpill">Lagoon (53,61&amp;65)</div></div></div></div>
            <div class="cpd"><div class="pdv"></div><div class="card cv-pd" data-emp="e378" style="width:104px;"><div class="card-inner" style="padding:5px 7px 5px 11px;text-align:left;"><div class="cname" data-sync="name">Punyamurthi</div><div class="ctitle" data-sync="title">Project Director</div><div class="cpill">W Residences</div></div></div></div>
            <div class="cpd"><div class="pdv"></div><div class="card cv-pd" data-emp="e189" style="width:104px;"><div class="card-inner" style="padding:5px 7px 5px 11px;text-align:left;"><div class="cname" data-sync="name">Philip Watson</div><div class="ctitle" data-sync="title">Project Director</div><div class="cpill">Bay 2</div></div></div></div>
            <div class="cpd"><div class="pdv"></div><div class="card cv-pd" data-emp="e251" style="width:104px;"><div class="card-inner" style="padding:5px 7px 5px 11px;text-align:left;"><div class="cname" data-sync="name">Abdul Kader</div><div class="ctitle" data-sync="title">Project Director</div><div class="cpill">Deira Islands</div></div></div></div>
            <div class="cpd"><div class="pdv"></div><div class="card cv-pd" data-emp="ecorp04" style="width:104px;"><div class="card-inner" style="padding:5px 7px 5px 11px;text-align:left;"><div class="cname" data-sync="name">Prabhu</div><div class="ctitle" data-sync="title">Project Director</div><div class="cpill">Eywa</div></div></div></div>
          </div>
        </div>

        <!-- PROJECT MANAGERS (4) -->
        <div class="col" style="flex:1.5; max-width:250px;">
          <div class="vl c-teal" style="height:10px;"></div>
          <div class="sec-pill sp-pm">Project Managers</div>
          <div data-section="ops-pm" style="position:relative; display:flex; flex-wrap:wrap; justify-content:center; gap:3px; max-width:240px;">
            <div class="corp-conn" style="position:absolute; top:0; left:4%; right:4%; height:2px; background:#1a8a8a;"></div>
            <div class="cpm"><div class="pmv"></div><div class="card cv-pm" data-emp="e45" style="width:112px;"><div class="card-inner" style="padding:5px 7px 5px 11px;text-align:left;"><div class="cname" data-sync="name">Abu Jalala</div><div class="ctitle" data-sync="title">Project Manager</div><div class="cpill">13 Farm House</div></div></div></div>
            <div class="cpm"><div class="pmv"></div><div class="card cv-pm" data-emp="e186" style="width:112px;"><div class="card-inner" style="padding:5px 7px 5px 11px;text-align:left;"><div class="cname" data-sync="name">Parth</div><div class="ctitle" data-sync="title">Project Manager</div><div class="cpill">Bay 2</div></div></div></div>
            <div class="cpm"><div class="pmv"></div><div class="card cv-pm" data-emp="ecorp05" style="width:112px;"><div class="card-inner" style="padding:5px 7px 5px 11px;text-align:left;"><div class="cname" data-sync="name">Jagdeshian</div><div class="ctitle" data-sync="title">Project Manager</div><div class="cpill">Deira Islands</div></div></div></div>
            <div class="cpm"><div class="pmv"></div><div class="card cv-pm" data-emp="e301" style="width:112px;"><div class="card-inner" style="padding:5px 7px 5px 11px;text-align:left;"><div class="cname" data-sync="name">Andrew Samuel / Akram</div><div class="ctitle" data-sync="title">Project Manager</div><div class="cpill">Eywa</div></div></div></div>
          </div>
        </div>

        <!-- DEPT HEADS (3) -->
        <div class="col" style="flex:1; max-width:200px;">
          <div class="vl c-sky" style="height:10px;"></div>
          <div class="sec-pill sp-dh">Dept. Heads</div>
          <div data-section="ops-dh" style="position:relative; display:flex; flex-direction:column; align-items:center; gap:3px; width:168px;">
            <div class="corp-conn" style="position:absolute; top:0; left:12%; right:12%; height:2px; background:#2a7cc0;"></div>
            <div class="cdh"><div class="dhv"></div><div class="card cv-dh" data-emp="e390" style="width:160px;"><div class="card-inner" style="padding:5px 8px 5px 12px;text-align:left;"><div class="clabel">HSE</div><div class="cname" data-sync="name" style="font-size:calc(10px*var(--cfs,1));">Rockey Vibin</div><div class="ctitle" data-sync="title">Sr. HSE Manager</div></div></div></div>
            <div class="cdh"><div class="dhv"></div><div class="card cv-dh" data-emp="e298" style="width:160px;"><div class="card-inner" style="padding:5px 8px 5px 12px;text-align:left;"><div class="clabel">Quality Control</div><div class="cname" data-sync="name" style="font-size:calc(10px*var(--cfs,1));">Anil</div><div class="ctitle" data-sync="title">QA/QC Manager</div></div></div></div>
            <div class="cdh"><div class="dhv"></div><div class="card cv-dh" data-emp="e10" style="width:160px;"><div class="card-inner" style="padding:5px 8px 5px 12px;text-align:left;"><div class="clabel">Technical</div><div class="cname" data-sync="name" style="font-size:calc(10px*var(--cfs,1));">Anoop David</div><div class="ctitle" data-sync="title">Technical Manager</div></div></div></div>
          </div>
        </div>

      </div><!-- end 3-branch -->
    </div><!-- end Liam col -->

  </div><!-- end level-2 row -->

  <!-- ── INDIRECT NOTE ── -->
  <div style="display:flex; justify-content:center; margin-top:14px;">
    <div class="notebox" style="max-width:760px; text-align:center;">
      <strong>⚡ Indirect / Dual Reporting Lines &nbsp;—&nbsp;</strong>
      <strong>Ziya Akhtar (ED)</strong> reports directly to the <strong>Board of Directors</strong>, with an indirect functional line to <strong>Harish Wadkar (CEO)</strong>.&nbsp;&nbsp;
      <strong>Rajesh Nair (HR Director)</strong> reports directly to <strong>Ziya Akhtar (ED)</strong>, with an indirect functional line to <strong>Harish Wadkar (CEO)</strong>.
    </div>
  </div>

</div><!-- end .col tree -->
</div><!-- end .content -->

<!-- LEGEND -->
<div class="legend-wrap">
  <div class="legend-row">
    <div class="li"><div class="ld" style="background:linear-gradient(135deg,#0d1f42,#1a3a6e);"></div>Board of Directors</div>
    <div class="li"><div class="ld" style="background:linear-gradient(135deg,#124a70,#1e6ea0);"></div>Executive Director</div>
    <div class="li"><div class="ld" style="background:linear-gradient(135deg,#0e3f27,#1a6040);"></div>CEO</div>
    <div class="li"><div class="ld" style="background:linear-gradient(135deg,#0a3060,#1050a0);"></div>MBM Gulf</div>
    <div class="li"><div class="ld" style="background:#fff; border:1px solid #e8a860;"></div>Departments (ED &amp; CEO)</div>
    <div class="li"><div class="ld" style="background:linear-gradient(135deg,#3a1060,#6030a0);"></div>Operations Director</div>
    <div class="li"><div class="ld" style="background:#faf5ff; border:1px solid #c8a0e8;"></div>Project Directors</div>
    <div class="li"><div class="ld" style="background:#f0fafa; border:1px solid #80c8c8;"></div>Project Managers</div>
    <div class="li"><div class="ld" style="background:#f0f6ff; border:1px solid #80a8d8;"></div>Dept. Heads (Ops)</div>
    <div class="li"><div class="ld" style="background:#fff5f8; border:1px solid #f0a0c0;"></div>HR Director</div>
    <div class="li"><div class="ld" style="background:#fdf8ff; border:1px dashed #b080d0;"></div>PA / Secretary</div>
    <div class="li"><div class="ld-dash"></div>Indirect / dotted reporting</div>
  </div>
  <div class="legend-footer">For internal use only &nbsp;·&nbsp; Confidential &nbsp;·&nbsp; Click any card to open &amp; edit the employee</div>
</div>

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

  // Build one HTML string for an added card so it matches its section.
  const addedCardHtml = (c: CorporateAddedCard, sec: typeof SECTIONS[number]) => {
    const inner =
      `<div class="card-inner" style="padding:5px 8px 5px 11px;text-align:left;">` +
      (c.label ? `<div class="clabel">${escapeHtml(c.label)}</div>` : '') +
      (c.line1 ? `<div class="cname">${escapeHtml(c.line1)}</div>` : '') +
      (c.line2 ? `<div class="ctitle">${escapeHtml(c.line2)}</div>` : '') +
      `</div>`;
    const widthStyle = c.width || sec.width ? `width:${c.width || sec.width}px;` : 'flex:1;';
    const card = `<div class="card ${c.variant} corp-added" data-card="${c.key}" data-added="1" style="${widthStyle}">${inner}</div>`;
    if (sec.wrap === 'plain') {
      return `<div class="corp-added" style="display:flex; align-items:center; gap:0; margin-top:3px;"><div style="width:12px; height:2px; background:#e07030; flex-shrink:0;"></div>${card}</div>`;
    }
    return `<div class="${sec.wrap} corp-added"><div class="${sec.stub}"></div>${card}</div>`;
  };

  // Single reconcile pass: live name/title sync, then per-card overrides, then
  // (re)create added cards, then selection highlight. Idempotent — added nodes
  // are tagged .corp-added and cleared at the top so re-runs don't duplicate.
  useLayoutEffect(() => {
    const root = wrapperRef.current;
    if (!root) return;

    // 0. Clear previously injected added cards + connector layer.
    root.querySelectorAll('.corp-added, .corp-edges').forEach(el => el.remove());

    // 0b. Ensure every person card has a (blank) photo avatar on its left.
    // Idempotent — guarded by .has-photo so re-runs don't duplicate or re-wrap.
    root.querySelectorAll<HTMLElement>('.card[data-emp]').forEach(card => {
      const inner = card.querySelector<HTMLElement>('.card-inner');
      if (!inner || inner.classList.contains('has-photo')) return;
      const body = document.createElement('div');
      body.className = 'cbody';
      while (inner.firstChild) body.appendChild(inner.firstChild);
      const photo = document.createElement('div');
      photo.className = 'cphoto';
      inner.append(photo, body);
      inner.classList.add('has-photo');
    });

    // 1. Live sync of names/titles from employees.
    const byId = new Map(employees.map(e => [e.id, e]));
    root.querySelectorAll<HTMLElement>('[data-emp]').forEach(card => {
      const e = byId.get(card.getAttribute('data-emp') || '');
      if (!e) return;
      // Fill the avatar with the employee's headshot when set; otherwise it
      // stays the blank placeholder. Reset first so a cleared URL reverts.
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
      const wrapEl = (card.closest('.cd,.cpd,.cpm,.cdh,.cbrow') as HTMLElement) || card;
      // reset
      card.style.background = '';
      wrapEl.style.display = '';
      card.querySelectorAll<HTMLElement>('.clabel,.cname,.ctitle,.csub,.cpill,.cext').forEach(t => { t.style.color = ''; });
      if (!key) return;
      card.style.transform = '';
      card.style.zIndex = '';
      const ov = cards[key];
      if (!ov) return;
      if (ov.hidden) { wrapEl.style.display = 'none'; return; }
      if (ov.bg) card.style.background = ov.bg;
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
        if (c.bg) el.style.background = c.bg;
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
      const visible = (el: HTMLElement) => {
        const w = (el.closest('.cd,.cpd,.cpm,.cdh,.cbrow') as HTMLElement) || el;
        return w.style.display !== 'none';
      };
      const box = (key: string) => {
        const el = cardEl(key);
        if (!el || !visible(el)) return null;
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
          paths.push(`<path data-edge="${id}" d="M ${sx} ${sy} L ${tx} ${ty}" stroke="#b080d0" stroke-width="1.6" stroke-dasharray="4 3" fill="none" />`);
        } else {
          const sx = a.x + a.w / 2, sy = a.y + a.h;
          const tx = b.x + b.w / 2, ty = b.y;
          const midY = sy + (ty - sy) / 2;
          paths.push(`<path data-edge="${id}" d="M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}" stroke="#64748b" stroke-width="1.6" fill="none" />`);
        }
      }
      const w = page.scrollWidth, h = page.scrollHeight;
      page.insertAdjacentHTML('afterbegin',
        `<svg class="corp-edges" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${paths.join('')}</svg>`);
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
    return html2canvas(page, { backgroundColor: '#f4f6fa', scale: 2, useCORS: true, logging: false });
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

// Panel to edit the selected card's colors and text lines.
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
      <label className="block text-slate-500 mb-1">Title line</label>
      <input value={ov.line1 ?? ''} placeholder="(unchanged)" onChange={e => onPatch({ line1: e.target.value })} className="w-full border border-slate-200 rounded-md px-2 py-1 mb-2" />
      <label className="block text-slate-500 mb-1">Subtitle line</label>
      <input value={ov.line2 ?? ''} placeholder="(unchanged)" onChange={e => onPatch({ line2: e.target.value })} className="w-full border border-slate-200 rounded-md px-2 py-1 mb-2" />

      <div className="flex items-center gap-3 mb-3">
        <div>
          <label className="block text-slate-500 mb-1">Background</label>
          <div className="flex items-center gap-1">
            <input type="color" value={ov.bg ?? '#ffffff'} onChange={e => onPatch({ bg: e.target.value })} className="w-8 h-7 rounded border border-slate-200 cursor-pointer" />
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
      <label className="block text-slate-500 mb-1">Title line</label>
      <input value={line1} onChange={e => setLine1(e.target.value)} className="w-full border border-slate-200 rounded-md px-2 py-1 mb-2" />
      <label className="block text-slate-500 mb-1">Subtitle line</label>
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
