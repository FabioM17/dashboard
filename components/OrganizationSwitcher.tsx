import React, { useState, useRef, useEffect } from 'react';
import { OrganizationMembership } from '../types';
import { Building2, ChevronDown, Check, Plus, ArrowLeftRight } from 'lucide-react';

interface OrganizationSwitcherProps {
  organizations: OrganizationMembership[];
  activeOrganizationId: string;
  onSwitch: (organizationId: string) => void;
  onCreateNew?: () => void;
  compact?: boolean; // For sidebar (icon only with dropdown)
}

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  manager: 'Gerente',
  community: 'Agente',
};

const OrganizationSwitcher: React.FC<OrganizationSwitcherProps> = ({
  organizations,
  activeOrganizationId,
  onSwitch,
  onCreateNew,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [compactDropdownStyle, setCompactDropdownStyle] = useState<React.CSSProperties>({});

  const activeOrg = organizations.find((o) => o.organizationId === activeOrganizationId);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || !compact || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownWidth = 280;
      const viewportPadding = 8;

      // Desktop: anchor beside sidebar button without generating horizontal scroll.
      let left = rect.right + 8;
      let top = rect.top;

      // Keep dropdown inside viewport horizontally/vertically.
      if (left + dropdownWidth > window.innerWidth - viewportPadding) {
        left = Math.max(viewportPadding, window.innerWidth - dropdownWidth - viewportPadding);
      }
      if (top + 360 > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, window.innerHeight - 360 - viewportPadding);
      }

      setCompactDropdownStyle({ left, top, width: dropdownWidth });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, compact]);

  if (organizations.length === 0) return null;

  const orgInitial = activeOrg?.organizationName?.charAt(0)?.toUpperCase() || 'O';

  return (
    <div className="relative z-[1200]" ref={dropdownRef}>
      {/* Trigger */}
      {compact ? (
        <button
          ref={triggerRef}
          onClick={() => setIsOpen(!isOpen)}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xl mb-1 transition-all relative group bg-emerald-500 hover:bg-emerald-400"
          title={`${activeOrg?.organizationName || 'Organización'} — Clic para cambiar`}
        >
          {orgInitial}
          {organizations.length > 1 && (
            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center">
              <ArrowLeftRight size={8} className="text-slate-300" />
            </span>
          )}
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 transition-all rounded-xl px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white w-full"
          title={activeOrg?.organizationName || 'Seleccionar organización'}
        >
          <Building2 size={16} />
          <span className="text-sm font-medium truncate max-w-[120px]">
            {activeOrg?.organizationName || 'Organización'}
          </span>
          <ChevronDown size={14} className={`ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div
          className={`z-[2200] bg-white rounded-xl shadow-2xl border border-slate-200 py-2 min-w-[240px] ${
            compact
              ? 'fixed left-2 right-2 bottom-16 sm:right-auto sm:bottom-auto'
              : 'absolute left-0 top-full mt-1'
          }`}
          style={compact && window.innerWidth >= 640 ? compactDropdownStyle : undefined}
        >
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Entornos de trabajo
            </p>
          </div>

          <div className="max-h-[280px] overflow-y-auto">
            {organizations.map((org) => {
              const isActive = org.organizationId === activeOrganizationId;
              return (
                <button
                  key={org.organizationId}
                  onClick={() => {
                    if (!isActive) onSwitch(org.organizationId);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      isActive
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {org.organizationName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{org.organizationName}</p>
                    <p className="text-xs text-slate-400">{roleLabels[org.role] || org.role}</p>
                  </div>
                  {isActive && <Check size={16} className="text-emerald-500 flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          {onCreateNew && (
            <>
              <div className="border-t border-slate-100 mt-1" />
              <button
                onClick={() => {
                  onCreateNew();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-500">
                  <Plus size={16} />
                </div>
                <span className="text-sm font-medium">Crear nueva organización</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default OrganizationSwitcher;
