import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, Layers, X, AlertCircle,
  Check, Loader2, HelpCircle, ExternalLink, Zap, Info, RefreshCw, AlertTriangle
} from 'lucide-react';
import { WhatsAppFlow, WhatsAppFlowFieldMapping, CustomProperty } from '../types';
import { whatsappFlowService } from '../services/whatsappFlowService';
import { crmService } from '../services/crmService';
import { supabase } from '../services/supabaseClient';
import { whatsappPhoneService } from '../services/whatsappPhoneService';

interface Props {
  organizationId: string;
}

// ── Field-row state (local, before saving to field_mappings JSONB) ──
interface FieldRow {
  localId: string;
  fieldKey: string;    // key that WhatsApp Flow sends (e.g. "nombre_cliente")
  label: string;       // friendly label shown in the configurator
  target: string;      // "__name__" | "__email__" | "__company__" | "<uuid>" | ""
}

// ── Form state for the create/edit modal ──
interface FlowForm {
  meta_flow_id: string;
  name: string;
  description: string;
  flow_type: 'static' | 'dynamic';
  status: 'active' | 'inactive';
  body_text: string;
  cta_text: string;
  first_screen: string;
  fieldRows: FieldRow[];
}

const EMPTY_FORM: FlowForm = {
  meta_flow_id: '',
  name: '',
  description: '',
  flow_type: 'static',
  status: 'active',
  body_text: 'Por favor, completa el formulario.',
  cta_text: 'Abrir formulario',
  first_screen: '',
  fieldRows: [],
};

const STANDARD_FIELD_OPTIONS = [
  { value: '__name__',    label: 'Nombre del contacto' },
  { value: '__email__',   label: 'Email del contacto' },
  { value: '__company__', label: 'Empresa del contacto' },
];

function formToFlow(form: FlowForm): Omit<WhatsAppFlow, 'id' | 'organization_id' | 'created_at' | 'updated_at'> {
  const field_mappings: Record<string, WhatsAppFlowFieldMapping> = {};
  for (const row of form.fieldRows) {
    if (!row.fieldKey.trim()) continue;
    field_mappings[row.fieldKey.trim()] = {
      label: row.label.trim() || undefined,
      crm_property_id: row.target || null,
    };
  }
  return {
    meta_flow_id: form.meta_flow_id,
    name: form.name,
    description: form.description || undefined,
    flow_type: form.flow_type,
    status: form.status,
    body_text: form.body_text,
    cta_text: form.cta_text,
    first_screen: form.first_screen || undefined,
    field_mappings,
  };
}

function flowToForm(flow: WhatsAppFlow): FlowForm {
  const fieldRows: FieldRow[] = Object.entries(flow.field_mappings).map(([key, mapping]) => ({
    localId: crypto.randomUUID(),
    fieldKey: key,
    label: mapping.label ?? '',
    target: mapping.crm_property_id ?? '',
  }));
  return {
    meta_flow_id: flow.meta_flow_id,
    name: flow.name,
    description: flow.description ?? '',
    flow_type: flow.flow_type,
    status: flow.status === 'deprecated' ? 'inactive' : flow.status,
    body_text: flow.body_text,
    cta_text: flow.cta_text,
    first_screen: flow.first_screen ?? '',
    fieldRows,
  };
}

// ── Status badge ──
function StatusBadge({ status }: { status: WhatsAppFlow['status'] }) {
  const map = {
    active:     'bg-emerald-100 text-emerald-700',
    inactive:   'bg-slate-100 text-slate-500',
    deprecated: 'bg-red-100 text-red-600',
  };
  const labels = { active: 'Activo', inactive: 'Inactivo', deprecated: 'Obsoleto' };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

// ── Main Component ──
const WhatsAppFlowsScreen: React.FC<Props> = ({ organizationId }) => {
  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [customProperties, setCustomProperties] = useState<CustomProperty[]>([]);
  const [isWhatsAppConfigured, setIsWhatsAppConfigured] = useState<boolean | null>(null); // null = checking

  const [showModal, setShowModal] = useState(false);
  const [editingFlow, setEditingFlow] = useState<WhatsAppFlow | null>(null);
  const [form, setForm] = useState<FlowForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function handleSync() {
    if (!isWhatsAppConfigured) {
      setSyncResult('⚠️ WhatsApp no está configurado. Ve a Configuración → Channels → WhatsApp.');
      setTimeout(() => setSyncResult(null), 6000);
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await whatsappFlowService.syncWithMeta(organizationId);
      setFlows(result.flows);
      setSyncResult(`✅ ${result.message}`);
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.toLowerCase().includes('missing whatsapp') || msg.toLowerCase().includes('waba') || msg.toLowerCase().includes('token')) {
        setSyncResult('⚠️ Sin credenciales de WhatsApp. Ve a Configuración → Channels → WhatsApp y verifica el WABA ID y el Token.');
      } else {
        setSyncResult(`❌ ${msg || 'Error al sincronizar.'}`);
      }
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 7000);
    }
  }

  const loadFlows = useCallback(async () => {
    setLoading(true);
    const [flowList, props] = await Promise.all([
      whatsappFlowService.list(organizationId),
      crmService.getProperties(organizationId),
    ]);
    setFlows(flowList);
    setCustomProperties(props);
    setLoading(false);
  }, [organizationId]);

  const checkWhatsAppConfig = useCallback(async () => {
    try {
      // Check integration_settings (legacy) or whatsapp_phone_numbers (multi-phone)
      const { data: waData } = await supabase
        .from('integration_settings')
        .select('credentials')
        .eq('organization_id', organizationId)
        .eq('service_name', 'whatsapp')
        .maybeSingle();

      const hasLegacyConfig = !!waData?.credentials?.access_token &&
        (!!waData?.credentials?.phone_id || !!waData?.credentials?.waba_id);

      if (hasLegacyConfig) {
        setIsWhatsAppConfigured(true);
        return;
      }

      // Fallback: check per-phone records
      const phones = await whatsappPhoneService.getPhoneNumbers(organizationId);
      setIsWhatsAppConfigured(phones.length > 0);
    } catch {
      setIsWhatsAppConfigured(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadFlows();
    checkWhatsAppConfig();
  }, [loadFlows, checkWhatsAppConfig]);

  function openCreate() {
    setEditingFlow(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  }

  function openEdit(flow: WhatsAppFlow) {
    setEditingFlow(flow);
    setForm(flowToForm(flow));
    setError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingFlow(null);
    setError(null);
  }

  function addFieldRow() {
    setForm(f => ({
      ...f,
      fieldRows: [...f.fieldRows, { localId: crypto.randomUUID(), fieldKey: '', label: '', target: '' }],
    }));
  }

  function updateFieldRow(localId: string, patch: Partial<FieldRow>) {
    setForm(f => ({
      ...f,
      fieldRows: f.fieldRows.map(r => r.localId === localId ? { ...r, ...patch } : r),
    }));
  }

  function removeFieldRow(localId: string) {
    setForm(f => ({ ...f, fieldRows: f.fieldRows.filter(r => r.localId !== localId) }));
  }

  async function handleSave() {
    setError(null);
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!form.meta_flow_id.trim()) { setError('El Meta Flow ID es obligatorio.'); return; }
    if (!form.body_text.trim()) { setError('El texto del mensaje es obligatorio.'); return; }
    if (!form.cta_text.trim()) { setError('El texto del botón es obligatorio.'); return; }

    setSaving(true);
    try {
      const payload = formToFlow(form);
      if (editingFlow) {
        const updated = await whatsappFlowService.update(editingFlow.id, payload, organizationId);
        setFlows(prev => prev.map(f => f.id === updated.id ? updated : f));
      } else {
        const created = await whatsappFlowService.create(
          { ...payload, organization_id: organizationId },
          organizationId
        );
        setFlows(prev => [created, ...prev]);
      }
      closeModal();
    } catch (e: any) {
      setError(e?.message ?? 'Error al guardar el flow.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await whatsappFlowService.delete(id, organizationId);
      setFlows(prev => prev.filter(f => f.id !== id));
    } catch (e: any) {
      console.error('[WhatsAppFlowsScreen] delete error:', e);
    } finally {
      setDeleteConfirmId(null);
    }
  }

  // Property selector options
  const propertyOptions = [
    { group: 'Campos estándar', options: STANDARD_FIELD_OPTIONS },
    {
      group: 'Propiedades personalizadas',
      options: customProperties.map(p => ({ value: p.id, label: p.name })),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Layers size={22} className="text-emerald-600" />
            WhatsApp Flows
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configura formularios interactivos de Meta para enviar a tus contactos y capturar datos en el CRM.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {syncResult && (
            <span className="text-sm text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">{syncResult}</span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing || loading || isWhatsAppConfigured === false}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title={isWhatsAppConfigured === false ? 'Configura WhatsApp primero en Configuración → Channels' : 'Importar flows desde Meta Business Manager'}
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando…' : 'Sincronizar desde Meta'}
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <Plus size={16} />
            Nuevo Flow
          </button>
        </div>
      </div>

      {/* ── Help banner ── */}
      <div className="mx-6 mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 flex-shrink-0">
        <Info size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 space-y-1">
          <p className="font-medium">¿Cómo funciona?</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
            <li>Crea tu Flow en <a href="https://business.facebook.com/wa/manage/flows/" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">Meta Business Manager <ExternalLink size={11}/></a>.</li>
            <li>Pulsa <strong>"Sincronizar desde Meta"</strong> — los flows se importan automáticamente con su ID y nombre.</li>
            <li>Edita el flow importado para configurar el texto del mensaje, el botón y el <strong>mapeo de campos → propiedades CRM</strong>.</li>
            <li>Envíalo desde una conversación o desde un Flujo de automatización.</li>
            <li>Cuando el contacto lo rellena, los datos se guardan automáticamente en su ficha.</li>
          </ol>
        </div>
      </div>

      {/* ── WhatsApp not configured warning ── */}
      {isWhatsAppConfigured === false && (
        <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 flex-shrink-0">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">WhatsApp no configurado</p>
            <p className="text-xs text-amber-700 mt-0.5">
              La sincronización automática y el envío de flows requieren una cuenta de WhatsApp conectada.
              Ve a <strong>Configuración → Channels → WhatsApp</strong> para conectarla.
            </p>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={28} className="animate-spin text-emerald-500" />
          </div>
        ) : flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-4">
              <Layers size={40} className="text-emerald-400" />
            </div>
            <p className="font-medium text-slate-600">Todavía no tienes flows configurados</p>
            <p className="text-sm mt-1">Crea uno para empezar a enviar formularios interactivos.</p>
            <button
              onClick={openCreate}
              className="mt-4 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={15} /> Nuevo Flow
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {flows.map(flow => {
              const fieldCount = Object.keys(flow.field_mappings).length;
              return (
                <div key={flow.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{flow.name}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">ID: {flow.meta_flow_id}</p>
                    </div>
                    <StatusBadge status={flow.status} />
                  </div>

                  {flow.description && (
                    <p className="text-sm text-slate-500 line-clamp-2">{flow.description}</p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${flow.flow_type === 'dynamic' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                      {flow.flow_type === 'dynamic' ? 'Dinámico' : 'Estático'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap size={12} className="text-amber-500" />
                      {fieldCount} {fieldCount === 1 ? 'campo' : 'campos'}
                    </span>
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                    <p className="text-xs text-slate-400 truncate max-w-[60%]" title={flow.body_text}>
                      "{flow.body_text}"
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEdit(flow)}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={15} />
                      </button>
                      {deleteConfirmId === flow.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(flow.id)}
                            className="text-xs bg-red-600 text-white px-2 py-1 rounded-lg hover:bg-red-700 transition-colors"
                          >
                            Eliminar
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="text-xs text-slate-500 hover:text-slate-700 px-1"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(flow.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-slate-800">
                {editingFlow ? 'Editar Flow' : 'Nuevo WhatsApp Flow'}
              </h2>
              <button onClick={closeModal} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* ── Section 1: Basic info ── */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                  <span className="w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  Información básica
                </h3>
                <div className="space-y-4">

                  {/* Name + Meta Flow ID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Nombre interno <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Ej: Formulario de registro"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
                        Meta Flow ID <span className="text-red-500">*</span>
                        <a href="https://business.facebook.com/wa/manage/flows/" target="_blank" rel="noopener noreferrer" title="Abrir Meta Business Manager">
                          <ExternalLink size={11} className="text-blue-500" />
                        </a>
                      </label>
                      <input
                        type="text"
                        value={form.meta_flow_id}
                        onChange={e => setForm(f => ({ ...f, meta_flow_id: e.target.value }))}
                        placeholder="Ej: 1234567890123456"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Descripción <span className="text-slate-400">(opcional)</span></label>
                    <input
                      type="text"
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Ej: Captura datos de nuevos leads desde WhatsApp"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Body text */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Texto del mensaje <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={form.body_text}
                      onChange={e => setForm(f => ({ ...f, body_text: e.target.value }))}
                      placeholder="Texto que verá el contacto encima del botón"
                      rows={2}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    />
                  </div>

                  {/* CTA + first screen */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Texto del botón (CTA) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.cta_text}
                        onChange={e => setForm(f => ({ ...f, cta_text: e.target.value }))}
                        placeholder="Ej: Abrir formulario"
                        maxLength={20}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <p className="text-xs text-slate-400 mt-0.5">{form.cta_text.length}/20 caracteres</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
                        Primera pantalla
                        <span className="text-slate-400">(opcional)</span>
                        <span title="ID de la primera pantalla del flow. Déjalo vacío para usar la pantalla por defecto del flow.">
                          <HelpCircle size={12} className="text-slate-400 cursor-help" />
                        </span>
                      </label>
                      <input
                        type="text"
                        value={form.first_screen}
                        onChange={e => setForm(f => ({ ...f, first_screen: e.target.value }))}
                        placeholder="Ej: WELCOME_SCREEN"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Type + Status */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
                        Tipo de flow
                        <span title="Estático: todo el contenido está pre-definido en Meta, no requiere endpoint. Dinámico: el servidor procesa cada pantalla con lógica personalizada.">
                          <HelpCircle size={12} className="text-slate-400 cursor-help" />
                        </span>
                      </label>
                      <select
                        value={form.flow_type}
                        onChange={e => setForm(f => ({ ...f, flow_type: e.target.value as 'static' | 'dynamic' }))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="static">Estático (recomendado)</option>
                        <option value="dynamic">Dinámico (requiere endpoint)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
                      <select
                        value={form.status}
                        onChange={e => setForm(f => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                    </div>
                  </div>

                </div>
              </div>

              {/* ── Section 2: Field mappings ── */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                  <span className="w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  Mapeo de campos
                </h3>
                <p className="text-xs text-slate-500 mb-4 ml-7">
                  Indica cómo se llaman los campos en tu Flow de Meta y en qué propiedad del CRM se guardarán.
                  Los campos sin asignar se guardan igualmente en el historial del contacto.
                </p>

                {form.fieldRows.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {/* Header row */}
                    <div className="grid grid-cols-[1fr_1fr_1.4fr_auto] gap-2 px-1">
                      <span className="text-xs font-medium text-slate-500">Clave del campo</span>
                      <span className="text-xs font-medium text-slate-500">Etiqueta</span>
                      <span className="text-xs font-medium text-slate-500">Guardar en propiedad</span>
                      <span />
                    </div>
                    {form.fieldRows.map(row => (
                      <div key={row.localId} className="grid grid-cols-[1fr_1fr_1.4fr_auto] gap-2 items-center">
                        <input
                          type="text"
                          value={row.fieldKey}
                          onChange={e => updateFieldRow(row.localId, { fieldKey: e.target.value })}
                          placeholder="ej: nombre_cliente"
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full"
                        />
                        <input
                          type="text"
                          value={row.label}
                          onChange={e => updateFieldRow(row.localId, { label: e.target.value })}
                          placeholder="ej: Nombre"
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full"
                        />
                        <select
                          value={row.target}
                          onChange={e => updateFieldRow(row.localId, { target: e.target.value })}
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white w-full"
                        >
                          <option value="">— Sin asignar —</option>
                          <optgroup label="Campos estándar">
                            {STANDARD_FIELD_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </optgroup>
                          {customProperties.length > 0 && (
                            <optgroup label="Propiedades personalizadas">
                              {customProperties.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <button
                          onClick={() => removeFieldRow(row.localId)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          title="Eliminar fila"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={addFieldRow}
                  className="flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-800 font-medium border border-dashed border-emerald-300 hover:border-emerald-500 rounded-lg px-3 py-2 transition-colors w-full justify-center"
                >
                  <Plus size={14} />
                  Agregar campo
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 flex-shrink-0">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 shadow-sm"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {editingFlow ? 'Guardar cambios' : 'Crear Flow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppFlowsScreen;
