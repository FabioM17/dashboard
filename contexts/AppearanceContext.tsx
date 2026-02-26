
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccentColor = 'emerald' | 'blue' | 'violet' | 'orange' | 'rose';
export type ThemeMode   = 'light' | 'dark';
export type FontSize    = 'compact' | 'normal' | 'large';
export type ChatBg      = 'default' | 'plain' | 'dots' | 'lines';
export type SidebarSize = 'icon' | 'normal';

export interface UserAppearance {
  accentColor:  AccentColor;
  theme:        ThemeMode;
  fontSize:     FontSize;
  chatBg:       ChatBg;
  sidebarSize:  SidebarSize;
  borderRadius: 'none' | 'sm' | 'md' | 'xl';
}

const defaults: UserAppearance = {
  accentColor:  'emerald',
  theme:        'light',
  fontSize:     'normal',
  chatBg:       'default',
  sidebarSize:  'normal',
  borderRadius: 'xl',
};

// ─── Color palettes ───────────────────────────────────────────────────────────

const palettes: Record<AccentColor, Record<string, string>> = {
  emerald: {
    '50': '#ecfdf5', '100': '#d1fae5', '200': '#a7f3d0', '300': '#6ee7b7',
    '400': '#34d399', '500': '#10b981', '600': '#059669', '700': '#047857',
    '800': '#065f46', '900': '#064e3b',
  },
  blue: {
    '50': '#eff6ff', '100': '#dbeafe', '200': '#bfdbfe', '300': '#93c5fd',
    '400': '#60a5fa', '500': '#3b82f6', '600': '#2563eb', '700': '#1d4ed8',
    '800': '#1e40af', '900': '#1e3a8a',
  },
  violet: {
    '50': '#f5f3ff', '100': '#ede9fe', '200': '#ddd6fe', '300': '#c4b5fd',
    '400': '#a78bfa', '500': '#8b5cf6', '600': '#7c3aed', '700': '#6d28d9',
    '800': '#5b21b6', '900': '#4c1d95',
  },
  orange: {
    '50': '#fff7ed', '100': '#ffedd5', '200': '#fed7aa', '300': '#fdba74',
    '400': '#fb923c', '500': '#f97316', '600': '#ea580c', '700': '#c2410c',
    '800': '#9a3412', '900': '#7c2d12',
  },
  rose: {
    '50': '#fff1f2', '100': '#ffe4e6', '200': '#fecdd3', '300': '#fda4af',
    '400': '#fb7185', '500': '#f43f5e', '600': '#e11d48', '700': '#be123c',
    '800': '#9f1239', '900': '#881337',
  },
};

// ─── CSS Injection ─────────────────────────────────────────────────────────── 

const STYLE_ID = 'docrea-appearance-style';

function buildAccentCSS(color: AccentColor): string {
  const p = palettes[color];
  const shades = ['50','100','200','300','400','500','600','700','800','900'];
  const lines: string[] = [];

  shades.forEach(s => {
    lines.push(`.bg-emerald-${s}{background-color:${p[s]}!important}`);
    lines.push(`.text-emerald-${s}{color:${p[s]}!important}`);
    lines.push(`.border-emerald-${s}{border-color:${p[s]}!important}`);
    lines.push(`.ring-emerald-${s}{--tw-ring-color:${p[s]}!important}`);
    lines.push(`.from-emerald-${s}{--tw-gradient-from:${p[s]}!important}`);
    lines.push(`.to-emerald-${s}{--tw-gradient-to:${p[s]}!important}`);
    lines.push(`.shadow-emerald-${s}{--tw-shadow-color:${p[s]}!important}`);
    lines.push(`.hover\\:bg-emerald-${s}:hover{background-color:${p[s]}!important}`);
    lines.push(`.hover\\:text-emerald-${s}:hover{color:${p[s]}!important}`);
    lines.push(`.focus\\:ring-emerald-${s}:focus{--tw-ring-color:${p[s]}!important}`);
    lines.push(`.focus\\:border-emerald-${s}:focus{border-color:${p[s]}!important}`);
    lines.push(`.disabled\\:bg-emerald-${s}:disabled{background-color:${p[s]}!important}`);
  });

  return lines.join('\n');
}

function buildDarkCSS(): string {
  return `
[data-theme="dark"]{background:#0f172a;color:#f1f5f9}
[data-theme="dark"] body{background:#0f172a}
[data-theme="dark"] .bg-white{background:#1e293b!important}
[data-theme="dark"] .bg-slate-50{background:#1e293b!important}
[data-theme="dark"] .bg-slate-100{background:#273249!important}
[data-theme="dark"] .bg-slate-200{background:#334155!important}
[data-theme="dark"] .bg-slate-800{background:#0f172a!important}
[data-theme="dark"] .bg-slate-900{background:#020617!important}
[data-theme="dark"] .bg-\\[\\#efeae2\\]{background:#1a2332!important}
[data-theme="dark"] .bg-\\[\\#f0f2f5\\]{background:#1a2332!important}
[data-theme="dark"] .text-slate-800{color:#f1f5f9!important}
[data-theme="dark"] .text-slate-700{color:#e2e8f0!important}
[data-theme="dark"] .text-slate-600{color:#cbd5e1!important}
[data-theme="dark"] .text-slate-500{color:#94a3b8!important}
[data-theme="dark"] .text-slate-400{color:#64748b!important}
[data-theme="dark"] .text-slate-300{color:#475569!important}
[data-theme="dark"] .border-slate-200{border-color:#334155!important}
[data-theme="dark"] .border-slate-100{border-color:#1e293b!important}
[data-theme="dark"] .border-b.border-slate-200{border-color:#334155!important}
[data-theme="dark"] input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),
[data-theme="dark"] textarea,
[data-theme="dark"] select{background:#273249!important;color:#f1f5f9!important;border-color:#475569!important}
[data-theme="dark"] .shadow-sm{--tw-shadow:0 1px 2px 0 rgba(0,0,0,0.5)!important}
[data-theme="dark"] .shadow{--tw-shadow:0 1px 3px 0 rgba(0,0,0,0.6),0 1px 2px -1px rgba(0,0,0,0.6)!important}
[data-theme="dark"] .shadow-xl{--tw-shadow:0 20px 25px -5px rgba(0,0,0,0.7)!important}
[data-theme="dark"] img{opacity:.9}
[data-theme="dark"] .bg-amber-50{background:#422006!important}
[data-theme="dark"] .bg-red-50{background:#3b0a0a!important}
[data-theme="dark"] .bg-green-50{background:#052e16!important}
[data-theme="dark"] .bg-blue-50{background:#0c1a2e!important}
[data-theme="dark"] .bg-purple-50{background:#1a0a2e!important}
[data-theme="dark"] .bg-orange-50{background:#2d1000!important}
[data-theme="dark"] .hover\\:bg-slate-50:hover{background:#273249!important}
[data-theme="dark"] .hover\\:bg-slate-100:hover{background:#334155!important}
[data-theme="dark"] .hover\\:bg-slate-200:hover{background:#3f5068!important}
`;
}

function buildFontCSS(size: FontSize): string {
  const sizes: Record<FontSize, string> = {
    compact: '12px',
    normal:  '14px',
    large:   '16px',
  };
  return `html{font-size:${sizes[size]}}`;
}

function buildChatBgCSS(bg: ChatBg): string {
  if (bg === 'plain') return '.chat-bg{background:#f0f2f5!important}';
  if (bg === 'dots')  return `.chat-bg{background:#f0f2f5 radial-gradient(#00000011 1px,transparent 1px)!important;background-size:20px 20px!important}`;
  if (bg === 'lines') return `.chat-bg{background:#f0f2f5 repeating-linear-gradient(0deg,#00000008 0,#00000008 1px,transparent 1px,transparent 20px)!important}`;
  return ''; // default: uses WhatsApp-like bg applied inline
}

function injectStyle(appearance: UserAppearance) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }

  const parts: string[] = [];

  // Accent color overrides (only if not emerald – emerald is already the default)
  if (appearance.accentColor !== 'emerald') {
    parts.push(buildAccentCSS(appearance.accentColor));
  }

  // Dark mode
  if (appearance.theme === 'dark') {
    parts.push(buildDarkCSS());
  }

  // Font size
  parts.push(buildFontCSS(appearance.fontSize));

  // Chat background
  parts.push(buildChatBgCSS(appearance.chatBg));

  // Border radius override
  const radii: Record<string, string> = { none: '0', sm: '4px', md: '8px', xl: '12px' };
  const r = radii[appearance.borderRadius] || '12px';
  parts.push(`[data-app-root] .rounded-xl{border-radius:${r}!important}[data-app-root] .rounded-2xl{border-radius:calc(${r} * 1.5)!important}[data-app-root] .rounded-lg{border-radius:calc(${r} * 0.7)!important}[data-app-root] .rounded{border-radius:calc(${r} * 0.5)!important}`);

  el.textContent = parts.join('\n');

  // Theme attribute for dark-mode CSS to activate
  document.documentElement.setAttribute('data-theme', appearance.theme);
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppearanceContextValue {
  appearance:    UserAppearance;
  updateAppearance: (patch: Partial<UserAppearance>) => void;
}

const AppearanceContext = createContext<AppearanceContextValue>({
  appearance: defaults,
  updateAppearance: () => {},
});

export const useAppearance = () => useContext(AppearanceContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface AppearanceProviderProps {
  userId: string | null | undefined;
  children: React.ReactNode;
}

export const AppearanceProvider: React.FC<AppearanceProviderProps> = ({ userId, children }) => {
  const storageKey = userId ? `docrea_appearance_${userId}` : null;

  const load = useCallback((): UserAppearance => {
    if (!storageKey) return defaults;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaults;
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  }, [storageKey]);

  const [appearance, setAppearance] = useState<UserAppearance>(load);

  // Re-load when userId changes (login/logout)
  useEffect(() => {
    const next = load();
    setAppearance(next);
    injectStyle(next);
  }, [storageKey, load]);

  // Apply every time appearance changes
  useEffect(() => {
    injectStyle(appearance);
  }, [appearance]);

  const updateAppearance = useCallback((patch: Partial<UserAppearance>) => {
    setAppearance(prev => {
      const next = { ...prev, ...patch };
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota */ }
      }
      return next;
    });
  }, [storageKey]);

  return (
    <AppearanceContext.Provider value={{ appearance, updateAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
};
