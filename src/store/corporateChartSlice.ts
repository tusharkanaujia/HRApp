import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { CorporateChartConfig, CorporateCardOverride, CorporateAddedCard, CorporateEdge } from '../types';

const initial: CorporateChartConfig = {};

// Apply a patch to an override map entry; a `null` value clears that field.
function applyPatch(target: CorporateCardOverride, patch: Record<string, unknown>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') delete (target as Record<string, unknown>)[k];
    else (target as Record<string, unknown>)[k] = v;
  }
}

const corporateChartSlice = createSlice({
  name: 'corporateChart',
  initialState: initial,
  reducers: {
    // Whole-doc replace — used by the Firestore subscription (does NOT write back).
    setCorporateChart(_state, action: PayloadAction<CorporateChartConfig>) {
      return action.payload ?? {};
    },
    // Whole-doc replace from a local undo/redo — DOES persist to Firestore.
    replaceCorporateChart(_state, action: PayloadAction<CorporateChartConfig>) {
      return { ...(action.payload ?? {}), updatedAt: new Date().toISOString() };
    },
    setCorporateFont(state, action: PayloadAction<{ family?: string | null; scale?: number | null; color?: string | null }>) {
      const font = { ...(state.font ?? {}) };
      applyPatch(font as Record<string, unknown>, action.payload as Record<string, unknown>);
      state.font = font;
      state.updatedAt = new Date().toISOString();
    },
    // Page width (px) for horizontal expansion. null restores the fit default.
    setCorporateWidth(state, action: PayloadAction<number | null>) {
      if (action.payload == null) delete state.width;
      else state.width = action.payload;
      state.updatedAt = new Date().toISOString();
    },
    // Connector line styling. null on a field clears it back to the default.
    setCorporateConnector(state, action: PayloadAction<{ color?: string | null; width?: number | null; style?: 'curved' | 'elbow' | 'straight' | null }>) {
      const conn = { ...(state.connector ?? {}) };
      applyPatch(conn as Record<string, unknown>, action.payload as Record<string, unknown>);
      if (Object.keys(conn).length) state.connector = conn; else delete state.connector;
      state.updatedAt = new Date().toISOString();
    },
    // Per base-card override (keyed by data-card id). null clears a field.
    setCardOverride(state, action: PayloadAction<{ key: string; patch: Partial<CorporateCardOverride> & Record<string, unknown> }>) {
      const { key, patch } = action.payload;
      const cards = { ...(state.cards ?? {}) };
      const entry = { ...(cards[key] ?? {}) };
      applyPatch(entry, patch);
      if (Object.keys(entry).length) cards[key] = entry; else delete cards[key];
      state.cards = cards;
      state.updatedAt = new Date().toISOString();
    },
    addCorporateCard(state, action: PayloadAction<CorporateAddedCard>) {
      state.added = [...(state.added ?? []), action.payload];
      state.updatedAt = new Date().toISOString();
    },
    updateAddedCard(state, action: PayloadAction<{ key: string; patch: Record<string, unknown> }>) {
      const { key, patch } = action.payload;
      state.added = (state.added ?? []).map(c => {
        if (c.key !== key) return c;
        const next = { ...c } as Record<string, unknown>;
        applyPatch(next, patch);
        return next as unknown as CorporateAddedCard;
      });
      state.updatedAt = new Date().toISOString();
    },
    // Removing an added card drops it; removing a base card hides it.
    deleteCorporateCard(state, action: PayloadAction<{ key: string; isAdded: boolean }>) {
      const { key, isAdded } = action.payload;
      if (isAdded) {
        state.added = (state.added ?? []).filter(c => c.key !== key);
      } else {
        const cards = { ...(state.cards ?? {}) };
        cards[key] = { ...(cards[key] ?? {}), hidden: true };
        state.cards = cards;
      }
      state.updatedAt = new Date().toISOString();
    },
    addCorporateEdge(state, action: PayloadAction<CorporateEdge>) {
      const edges = { added: [...(state.edges?.added ?? [])], removed: [...(state.edges?.removed ?? [])] };
      edges.added.push(action.payload);
      state.edges = edges;
      state.updatedAt = new Date().toISOString();
    },
    // Removing a base edge records its id; removing an added edge drops it.
    removeCorporateEdge(state, action: PayloadAction<{ id: string; isBase: boolean }>) {
      const { id, isBase } = action.payload;
      const edges = { added: [...(state.edges?.added ?? [])], removed: [...(state.edges?.removed ?? [])] };
      if (isBase) { if (!edges.removed.includes(id)) edges.removed.push(id); }
      else edges.added = edges.added.filter(e => `${e.from}->${e.to}` !== id);
      state.edges = edges;
      state.updatedAt = new Date().toISOString();
    },
    resetCorporateChart() {
      return {};
    },
  },
});

export const {
  setCorporateChart,
  replaceCorporateChart,
  setCorporateFont,
  setCorporateWidth,
  setCorporateConnector,
  setCardOverride,
  addCorporateCard,
  updateAddedCard,
  deleteCorporateCard,
  addCorporateEdge,
  removeCorporateEdge,
  resetCorporateChart,
} = corporateChartSlice.actions;
export default corporateChartSlice.reducer;
