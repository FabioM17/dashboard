import React, { useState, useEffect } from 'react';
import {
  Plus, Code2, Copy, Check, AlertTriangle, CheckCircle,
  X, Globe, FileText, Palette, Eye, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, ArrowUp, ArrowDown,
  User, Mail, Phone, Building2, Trash2, Settings2, Tag
} from 'lucide-react';
import { CustomProperty } from '../types';
import { formService, CRMForm, CRMFormField, FormStyle, getFormSubmitUrl } from '../services/formService';

type Step = 'list' | 'fields' | 'style' | 'code';

const BASE_FIELD_DEFS = [
  { key: 'name',    label: 'Nombre completo', type: 'text'  as CRMFormField['type'], placeholder: 'Tu nombre completo',   IconComp: User },
  { key: 'email',   label: 'Email',           type: 'email' as CRMFormField['type'], placeholder: 'tu@email.com',         IconComp: Mail },
  { key: 'phone',   label: 'Teléfono',        type: 'tel'   as CRMFormField['type'], placeholder: '+34 600 000 000',      IconComp: Phone },
  { key: 'company', label: 'Empresa',         type: 'text'  as CRMFormField['type'], placeholder: 'Nombre de tu empresa', IconComp: Building2 },
];

const FONT_OPTIONS = [
  'Inter, sans-serif', 'Roboto, sans-serif', 'Open Sans, sans-serif',
  'Lato, sans-serif', 'Poppins, sans-serif', 'Georgia, serif', 'system-ui, sans-serif',
];

function propTypeToFieldType(t: CustomProperty['type']): CRMFormField['type'] {
  const map: Record<CustomProperty['type'], CRMFormField['type']> = {
    text: 'text', number: 'number', date: 'date',
    time: 'time', select: 'select', phone: 'tel', percentage: 'number',
  };
  return map[t] ?? 'text';
}

const DEFAULT_STYLE: FormStyle = {
  bgColor: '#f3f4f6',
  cardBgColor: '#ffffff',
  primaryColor: '#2563eb',
  textColor: '#111827',
  labelColor: '#374151',
  borderColor: '#d1d5db',
  borderRadius: '8',
  fontFamily: 'Inter, sans-serif',
  submitLabel: 'Enviar',
  successMessage: '¡Gracias! Tu mensaje ha sido recibido.',
  errorMessage: 'Ha ocurrido un error. Inténtalo de nuevo.',
  showTitle: true,
  titleText: 'Contáctanos',
  subtitleText: '',
};

interface CRMFormBuilderProps {
  organizationId: string;
  customProperties: CustomProperty[];
  currentUserId: string;
}

function parseOrigins(raw: string): string[] {
  return raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

function inputInlineStyle(s: FormStyle): string {
  const br = `${s.borderRadius}px`;
  return `width:100%;padding:8px 12px;border:1px solid ${s.borderColor};border-radius:${br};font-family:${s.fontFamily};font-size:14px;color:${s.textColor};background:#fff;box-sizing:border-box;outline:none`;
}

function generateEmbedCode(form: CRMForm): string {
  const submitUrl = getFormSubmitUrl(form.id);
  const fields = (form.fields as CRMFormField[]) ?? [];
  const s: FormStyle = { ...DEFAULT_STYLE, ...(form.style as FormStyle) };
  const br = `${s.borderRadius}px`;
  const uid = form.id.slice(0, 8);
  const iStyle = inputInlineStyle(s);

  const fieldsHtml = fields.map(f => {
    const id = `dcf_${uid}_${f.key}`;
    const labelHtml = `<label for="${id}" style="display:block;margin-bottom:4px;font-size:13px;font-weight:500;color:${s.labelColor}">${f.label}${f.required ? ' <span style="color:#ef4444">*</span>' : ''}</label>`;
    let inp = '';
    if (f.type === 'textarea') {
      inp = `<textarea id="${id}" name="${f.key}" ${f.required ? 'required' : ''} placeholder="${f.placeholder}" rows="3" style="${iStyle}"></textarea>`;
    } else if (f.type === 'select' && f.options?.length) {
      const opts = f.options.map(o => `<option value="${o}">${o}</option>`).join('');
      inp = `<select id="${id}" name="${f.key}" ${f.required ? 'required' : ''} style="${iStyle}"><option value="">Seleccionar…</option>${opts}</select>`;
    } else {
      inp = `<input type="${f.type}" id="${id}" name="${f.key}" ${f.required ? 'required' : ''} placeholder="${f.placeholder}" style="${iStyle}">`;
    }
    return `    <div style="margin-bottom:16px">\n      ${labelHtml}\n      ${inp}\n    </div>`;
  }).join('\n');

  const titleHtml = s.showTitle
    ? `    <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:${s.textColor}">${s.titleText || form.name}</h2>\n${s.subtitleText ? `    <p style="margin:0 0 20px;font-size:14px;color:${s.labelColor}">${s.subtitleText}</p>` : '    <div style="margin-bottom:20px"></div>'}`
    : '';

  return `<!-- Formulario CRM: ${form.name} -->
<div style="background:${s.bgColor};padding:32px 16px;font-family:${s.fontFamily}">
  <div id="dcf-wrap-${uid}" style="background:${s.cardBgColor};border-radius:${br};padding:28px;max-width:480px;margin:0 auto;box-shadow:0 1px 3px rgba(0,0,0,.1)">
${titleHtml}
    <form id="dcf-form-${uid}" novalidate>
${fieldsHtml}
      <button type="submit" id="dcf-btn-${uid}" style="width:100%;padding:11px;background:${s.primaryColor};color:#fff;border:none;border-radius:${br};font-family:${s.fontFamily};font-size:15px;font-weight:600;cursor:pointer;transition:opacity .15s">${s.submitLabel}</button>
      <div id="dcf-err-${uid}" style="margin-top:12px;font-size:13px;text-align:center;color:#dc2626;display:none"></div>
    </form>
    <div id="dcf-ok-${uid}" style="display:none;text-align:center;padding:24px 0">
      <div style="font-size:40px;margin-bottom:12px">✓</div>
      <p style="margin:0;font-size:16px;font-weight:600;color:${s.primaryColor}">${s.successMessage}</p>
    </div>
  </div>
</div>
<script>
(function() {
  var URL  = '${submitUrl}';
  var form = document.getElementById('dcf-form-${uid}');
  var btn  = document.getElementById('dcf-btn-${uid}');
  var err  = document.getElementById('dcf-err-${uid}');
  var ok   = document.getElementById('dcf-ok-${uid}');
  if (!form) return;
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    btn.disabled = true; btn.style.opacity = '0.65';
    err.style.display = 'none';
    var data = {};
    new FormData(form).forEach(function(v, k) { data[k] = v; });
    fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, body: j }; }); })
      .then(function(res) {
        if (res.ok && res.body.success) {
          form.style.display = 'none';
          ok.style.display = 'block';
        } else {
          err.textContent = (res.body && res.body.error) || '${s.errorMessage}';
          err.style.display = 'block';
          btn.disabled = false; btn.style.opacity = '1';
        }
      })
      .catch(function() {
        err.textContent = '${s.errorMessage}';
        err.style.display = 'block';
        btn.disabled = false; btn.style.opacity = '1';
      });
  });
})();
</script>`;
}

// ─── Live preview ─────────────────────────────────────────────────────────────

function FormPreview({ fields, style, formName }: { fields: CRMFormField[]; style: FormStyle; formName: string }) {
  const s = { ...DEFAULT_STYLE, ...style };
  const br = `${s.borderRadius}px`;
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: `1px solid ${s.borderColor}`,
    borderRadius: br, fontFamily: s.fontFamily, fontSize: '13px',
    color: s.textColor, boxSizing: 'border-box', background: '#fff',
  };
  return (
    <div style={{ background: s.bgColor, padding: '16px', fontFamily: s.fontFamily, borderRadius: '6px' }}>
      <div style={{ background: s.cardBgColor, borderRadius: br, padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,.1)' }}>
        {s.showTitle && (
          <>
            {(s.titleText || formName) && (
              <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 700, color: s.textColor }}>
                {s.titleText || formName}
              </h3>
            )}
            {s.subtitleText
              ? <p style={{ margin: '0 0 18px', fontSize: '13px', color: s.labelColor }}>{s.subtitleText}</p>
              : <div style={{ marginBottom: '18px' }} />}
          </>
        )}
        {fields.length === 0 && (
          <p style={{ color: '#9ca3af', fontSize: '13px', textAlign: 'center', margin: '16px 0' }}>
            Activa campos para ver la vista previa
          </p>
        )}
        {fields.map(f => (
          <div key={f.key} style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500, color: s.labelColor }}>
              {f.label}{f.required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
            </label>
            {f.type === 'textarea' ? (
              <textarea readOnly placeholder={f.placeholder} rows={3} style={{ ...inputStyle, resize: 'none' }} />
            ) : f.type === 'select' && f.options?.length ? (
              <select disabled style={inputStyle}>
                <option>Seleccionar…</option>
                {f.options.map(o => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input type={f.type} readOnly placeholder={f.placeholder} style={inputStyle} />
            )}
          </div>
        ))}
        <button style={{ width: '100%', padding: '10px', background: s.primaryColor, color: '#fff', border: 'none', borderRadius: br, fontFamily: s.fontFamily, fontSize: '14px', fontWeight: 600, cursor: 'default' }}>
          {s.submitLabel}
        </button>
      </div>
    </div>
  );
}

// ─── FieldCard (module-level to preserve identity across renders) ────────────

interface FieldCardProps {
  fieldKey: string;
  label: string;
  icon?: React.ElementType;
  opts?: string[];
  active: boolean;
  field: CRMFormField | undefined;
  fields: CRMFormField[];
  expandedFieldKey: string | null;
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
  onExpandToggle: () => void;
  onUpdateField: (patch: Partial<CRMFormField>) => void;
}

const FieldCard: React.FC<FieldCardProps> = ({
  fieldKey, label, icon: Icon, opts,
  active, field, fields, expandedFieldKey,
  onToggle, onMove, onExpandToggle, onUpdateField,
}) => {
  const open = expandedFieldKey === fieldKey && active;
  return (
    <div className={active ? 'bg-blue-50' : 'bg-white'}>
      <div className="flex items-center gap-3 px-5 py-3.5">
        <button
          onClick={onToggle}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${active ? 'bg-blue-600' : 'bg-gray-200'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${active ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {Icon && (
            <span className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-md ${active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
              <Icon className="w-3.5 h-3.5" />
            </span>
          )}
          <span className={`text-sm font-medium truncate ${active ? 'text-gray-900' : 'text-gray-500'}`}>
            {field ? field.label : label}
          </span>
          {field?.required && (
            <span className="shrink-0 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md font-semibold">Obligatorio</span>
          )}
        </div>
        {active && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => onMove(-1)} disabled={fields.indexOf(field!) === 0}
              className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-25 rounded hover:bg-white transition-colors">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onMove(1)} disabled={fields.indexOf(field!) === fields.length - 1}
              className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-25 rounded hover:bg-white transition-colors">
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button onClick={onExpandToggle}
              className="p-1.5 text-gray-500 hover:text-gray-700 rounded hover:bg-white transition-colors">
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
      {open && field && (
        <div className="mx-5 mb-4 bg-white rounded-lg border border-blue-100 shadow-sm overflow-hidden">
          <div className="px-4 pt-3 pb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Etiqueta visible</label>
              <input value={field.label} onChange={e => onUpdateField({ label: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Placeholder</label>
              <input value={field.placeholder ?? ''} onChange={e => onUpdateField({ placeholder: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            {(opts ?? []).length > 0 && (
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Opciones del desplegable</label>
                <input
                  value={(field.options ?? []).join(', ')}
                  onChange={e => onUpdateField({ options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  placeholder="Opción 1, Opción 2, Opción 3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            )}
            <div className="col-span-2 flex items-center gap-2 pt-1">
              <input type="checkbox" id={`req_${fieldKey}`} checked={field.required}
                onChange={e => onUpdateField({ required: e.target.checked })}
                className="w-4 h-4 accent-blue-600 cursor-pointer" />
              <label htmlFor={`req_${fieldKey}`} className="text-sm font-medium text-gray-700 select-none cursor-pointer">
                Campo obligatorio
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const CRMFormBuilder: React.FC<CRMFormBuilderProps> = ({ organizationId, customProperties, currentUserId }) => {
  const [step, setStep] = useState<Step>('list');
  const [forms, setForms] = useState<CRMForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<Partial<CRMForm> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [originsInput, setOriginsInput] = useState('');
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => { loadForms(); }, [organizationId]);

  async function loadForms() {
    setLoading(true); setError(null);
    try { setForms(await formService.getForms(organizationId)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error cargando formularios'); }
    finally { setLoading(false); }
  }

  const currentFields = () => (editingForm?.fields as CRMFormField[]) ?? [];
  const currentStyle  = () => ({ ...DEFAULT_STYLE, ...(editingForm?.style as FormStyle) });
  const isFieldActive = (key: string) => currentFields().some(f => f.key === key);
  const getField      = (key: string) => currentFields().find(f => f.key === key);

  function openNew() {
    setEditingForm({ name: '', description: '', fields: [], style: { ...DEFAULT_STYLE }, allowed_origins: [], is_active: true });
    setOriginsInput(''); setIsNew(true); setExpandedField(null); setStep('fields');
  }
  function openEdit(form: CRMForm) {
    setEditingForm({ ...form });
    setOriginsInput((form.allowed_origins ?? []).join(', '));
    setIsNew(false); setExpandedField(null); setStep('fields');
  }
  function openCode(form: CRMForm) {
    setEditingForm({ ...form });
    setGeneratedCode(generateEmbedCode(form));
    setStep('code');
  }
  function goBack() { setStep('list'); setEditingForm(null); }

  function toggleBaseField(def: typeof BASE_FIELD_DEFS[number], activate: boolean) {
    setEditingForm(prev => {
      const fields = [...currentFields()];
      if (activate) {
        fields.push({ key: def.key, label: def.label, type: def.type, required: def.key === 'email', placeholder: def.placeholder, isBase: true });
      } else {
        const idx = fields.findIndex(f => f.key === def.key);
        if (idx !== -1) fields.splice(idx, 1);
      }
      return { ...prev, fields };
    });
    if (activate) setExpandedField(def.key);
  }

  function toggleCustomField(prop: CustomProperty, activate: boolean) {
    setEditingForm(prev => {
      const fields = [...currentFields()];
      if (activate) {
        fields.push({ key: prop.id, label: prop.name, type: propTypeToFieldType(prop.type), required: false, placeholder: '', isBase: false, options: prop.options });
      } else {
        const idx = fields.findIndex(f => f.key === prop.id);
        if (idx !== -1) fields.splice(idx, 1);
      }
      return { ...prev, fields };
    });
    if (activate) setExpandedField(prop.id);
  }

  function updateField(key: string, patch: Partial<CRMFormField>) {
    setEditingForm(prev => {
      const fields = ((prev?.fields as CRMFormField[]) ?? []).map(f => f.key === key ? { ...f, ...patch } : f);
      return { ...prev, fields };
    });
  }

  function moveField(key: string, dir: -1 | 1) {
    setEditingForm(prev => {
      const fields = [...((prev?.fields as CRMFormField[]) ?? [])];
      const i = fields.findIndex(f => f.key === key);
      const j = i + dir;
      if (j < 0 || j >= fields.length) return prev;
      [fields[i], fields[j]] = [fields[j], fields[i]];
      return { ...prev, fields };
    });
  }

  function updateStyle(patch: Partial<FormStyle>) {
    setEditingForm(prev => ({ ...prev, style: { ...currentStyle(), ...patch } }));
  }

  async function handleSave() {
    if (!editingForm?.name?.trim()) return;
    setSaving(true); setError(null);
    try {
      const origins = parseOrigins(originsInput);
      const fields  = currentFields();
      const style   = currentStyle();
      let saved: CRMForm;
      if (isNew) {
        saved = await formService.createForm({ organization_id: organizationId, created_by: currentUserId, name: editingForm.name!, description: editingForm.description, fields, style, allowed_origins: origins });
        setForms(prev => [saved, ...prev]);
      } else {
        saved = await formService.updateForm(editingForm.id!, organizationId, { name: editingForm.name, description: editingForm.description, fields, style, allowed_origins: origins });
        setForms(prev => prev.map(f => f.id === saved.id ? saved : f));
      }
      setEditingForm(saved); setIsNew(false);
      setOriginsInput(origins.join(', '));
      setGeneratedCode(generateEmbedCode(saved));
      setStep('code');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error guardando formulario');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar este formulario? Esta acción no se puede deshacer.')) return;
    try { await formService.deleteForm(id, organizationId); setForms(prev => prev.filter(f => f.id !== id)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error eliminando formulario'); }
  }

  async function handleToggleActive(form: CRMForm) {
    try {
      const updated = await formService.toggleActive(form.id, organizationId, !form.is_active);
      setForms(prev => prev.map(f => f.id === updated.id ? updated : f));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error actualizando formulario'); }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(generatedCode);
    setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000);
  }

  // ═══════════════════════════════════════════════
  // LIST VIEW
  // ═══════════════════════════════════════════════
  if (step === 'list') {
    return (
      <div className="h-full flex flex-col bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Formularios embebibles</h2>
              <p className="text-sm text-gray-600 mt-1">Crea formularios para tu web. Los envíos se guardan automáticamente en el CRM.</p>
            </div>
            <button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Nuevo formulario
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Cargando formularios…</p>
              </div>
            </div>
          ) : forms.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="w-14 h-14 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">Aún no tienes formularios</h3>
              <p className="text-gray-500 text-sm mb-5">Crea tu primer formulario embebible para capturar contactos en el CRM.</p>
              <button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium transition-colors text-sm">
                Crear formulario
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {forms.map(form => {
                const origins = form.allowed_origins ?? [];
                return (
                  <div key={form.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 truncate">{form.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${form.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {form.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      {form.description && <p className="text-sm text-gray-500 truncate mt-0.5">{form.description}</p>}
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                        <span>{((form.fields as CRMFormField[]) ?? []).length} campos</span>
                        <span>·</span>
                        <span>{form.submission_count ?? 0} envíos</span>
                        <span>·</span>
                        {origins.length === 0
                          ? <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3 h-3" /> Todos los dominios</span>
                          : <span className="flex items-center gap-1 text-gray-500"><Globe className="w-3 h-3" /> {origins.length} dominio{origins.length !== 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleToggleActive(form)} title={form.is_active ? 'Desactivar' : 'Activar'} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                        {form.is_active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                      </button>
                      <button onClick={() => openCode(form)} title="Ver código" className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-gray-100 transition-colors">
                        <Code2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(form)} title="Editar" className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-gray-100 transition-colors">
                        <Settings2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(form.id)} title="Eliminar" className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // FIELDS STEP
  // ═══════════════════════════════════════════════
  if (step === 'fields') {
    const fields = currentFields();
    const hasFields = fields.length > 0;

    return (
      <div className="h-full flex flex-col bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
          <button onClick={goBack} className="p-1.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{isNew ? 'Nuevo formulario' : 'Editar formulario'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Paso 1 de 3 — Información y campos</p>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* Form info card */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" /> Información del formulario
              </h3>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nombre del formulario <span className="text-red-500">*</span>
                </label>
                <input
                  value={editingForm?.name ?? ''}
                  onChange={e => setEditingForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej: Formulario de contacto web"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Descripción interna <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  value={editingForm?.description ?? ''}
                  onChange={e => setEditingForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Para qué se usará este formulario…"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <span className="flex items-center gap-1.5"><Globe className="w-4 h-4 text-gray-400" /> Dominios autorizados <span className="text-gray-400 font-normal">(opcional)</span></span>
                </label>
                <input
                  value={originsInput}
                  onChange={e => setOriginsInput(e.target.value)}
                  placeholder="https://midominio.com, https://otra.com"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                />
                <p className="text-xs text-gray-400 mt-1.5">Separa con comas. Deja vacío para permitir cualquier dominio (no recomendado en producción).</p>
              </div>
            </div>
          </div>

          {/* Base fields */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" /> Campos base del CRM
              </h3>
              <span className="text-xs text-gray-400">{fields.filter(f => f.isBase).length} activo{fields.filter(f => f.isBase).length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {BASE_FIELD_DEFS.map(def => (
                <FieldCard
                  key={def.key}
                  fieldKey={def.key}
                  label={def.label}
                  icon={def.IconComp}
                  active={isFieldActive(def.key)}
                  field={getField(def.key)}
                  fields={fields}
                  expandedFieldKey={expandedField}
                  onToggle={() => toggleBaseField(def, !isFieldActive(def.key))}
                  onMove={(dir) => moveField(def.key, dir)}
                  onExpandToggle={() => setExpandedField(expandedField === def.key ? null : def.key)}
                  onUpdateField={(patch) => updateField(def.key, patch)}
                />
              ))}
            </div>
          </div>

          {/* Custom properties */}
          {customProperties.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-500" /> Propiedades personalizadas
                </h3>
                <span className="text-xs text-gray-400">{fields.filter(f => !f.isBase).length} activo{fields.filter(f => !f.isBase).length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {customProperties.map(prop => (
                  <FieldCard
                    key={prop.id}
                    fieldKey={prop.id}
                    label={prop.name}
                    opts={prop.options}
                    active={isFieldActive(prop.id)}
                    field={getField(prop.id)}
                    fields={fields}
                    expandedFieldKey={expandedField}
                    onToggle={() => toggleCustomField(prop, !isFieldActive(prop.id))}
                    onMove={(dir) => moveField(prop.id, dir)}
                    onExpandToggle={() => setExpandedField(expandedField === prop.id ? null : prop.id)}
                    onUpdateField={(patch) => updateField(prop.id, patch)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between">
          <button onClick={goBack} className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
          <button
            onClick={() => setStep('style')}
            disabled={!editingForm?.name?.trim() || !hasFields}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg font-medium transition-colors text-sm flex items-center gap-2"
          >
            {!editingForm?.name?.trim()
              ? 'Escribe un nombre para continuar'
              : !hasFields
              ? 'Activa al menos 1 campo'
              : <><span>Siguiente: Estilo</span> <Palette className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // STYLE STEP
  // ═══════════════════════════════════════════════
  if (step === 'style') {
    const fields = currentFields();
    const s      = currentStyle();

    const ColorRow = ({ label, styleKey }: { label: string; styleKey: keyof FormStyle }) => (
      <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
        <span className="text-sm text-gray-600">{label}</span>
        <div className="flex items-center gap-2">
          <input type="color" value={s[styleKey] as string}
            onChange={e => updateStyle({ [styleKey]: e.target.value })}
            className="w-7 h-7 rounded cursor-pointer border border-gray-300 p-0.5 bg-white" />
          <input type="text" value={s[styleKey] as string} maxLength={7}
            onChange={e => updateStyle({ [styleKey]: e.target.value })}
            className="w-20 px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
      </div>
    );

    return (
      <div className="h-full flex flex-col bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
          <button onClick={() => setStep('fields')} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Palette className="w-5 h-5 text-blue-600" /> Estilo del formulario
          </h2>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Settings ── */}
            <div className="space-y-4">
              {/* Colors */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Colores</h4>
                <ColorRow label="Color principal (botón)" styleKey="primaryColor" />
                <ColorRow label="Fondo del formulario"   styleKey="cardBgColor" />
                <ColorRow label="Fondo de página"        styleKey="bgColor" />
                <ColorRow label="Texto principal"        styleKey="textColor" />
                <ColorRow label="Etiquetas"              styleKey="labelColor" />
                <ColorRow label="Bordes de inputs"       styleKey="borderColor" />
              </div>

              {/* Layout */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Diseño</h4>
                <div className="mb-3">
                  <label className="block text-sm text-gray-600 mb-2">Radio de bordes — {s.borderRadius}px</label>
                  <input type="range" min="0" max="24" value={Number(s.borderRadius)}
                    onChange={e => updateStyle({ borderRadius: e.target.value })}
                    className="w-full accent-blue-600" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Tipografía</label>
                  <select value={s.fontFamily} onChange={e => updateStyle({ fontFamily: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                    {FONT_OPTIONS.map(f => <option key={f} value={f}>{f.split(',')[0]}</option>)}
                  </select>
                </div>
              </div>

              {/* Content */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contenido</h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={s.showTitle} onChange={e => updateStyle({ showTitle: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-gray-700">Mostrar título</span>
                </label>
                {s.showTitle && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
                      <input value={s.titleText} onChange={e => updateStyle({ titleText: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Subtítulo</label>
                      <input value={s.subtitleText} onChange={e => updateStyle({ subtitleText: e.target.value })}
                        placeholder="Opcional" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Texto del botón</label>
                  <input value={s.submitLabel} onChange={e => updateStyle({ submitLabel: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje de éxito</label>
                  <input value={s.successMessage} onChange={e => updateStyle({ successMessage: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje de error</label>
                  <input value={s.errorMessage} onChange={e => updateStyle({ errorMessage: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
              </div>
            </div>

            {/* ── Preview ── */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Vista previa en tiempo real
              </p>
              <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <FormPreview fields={fields} style={s} formName={editingForm?.name ?? ''} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between">
          <button onClick={() => setStep('fields')} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">← Volver a campos</button>
          <button onClick={handleSave} disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium transition-colors text-sm flex items-center gap-2">
            {saving ? 'Guardando…' : <><CheckCircle className="w-4 h-4" /> Guardar y obtener código</>}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // CODE STEP
  // ═══════════════════════════════════════════════
  if (step === 'code') {
    const origins = (editingForm?.allowed_origins as string[]) ?? [];
    const fields  = currentFields();
    const s       = currentStyle();

    return (
      <div className="h-full flex flex-col bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
          <button onClick={goBack} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <h2 className="flex-1 text-xl font-bold text-gray-900">Código para incrustar</h2>
          <button onClick={() => openEdit(editingForm as CRMForm)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
            <Settings2 className="w-4 h-4" /> Editar
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            {/* Left: info */}
            <div className="space-y-4">
              {/* Security */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4" /> Arquitectura segura
                </h3>
                <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside leading-relaxed">
                  <li>El código HTML no contiene ningún secreto ni token.</li>
                  <li>La organización se resuelve en el servidor a partir del ID del formulario.</li>
                  <li>Rate limiting: máx. 10 envíos/IP/minuto.</li>
                  <li>Los datos se sanitizan en el servidor antes de guardarse.</li>
                </ul>
                <p className="mt-2 text-xs text-blue-600 font-mono break-all">{getFormSubmitUrl(editingForm?.id ?? '')}</p>
              </div>

              {origins.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    <strong>Sin restricción de dominio.</strong> Cualquier sitio puede enviar datos. Configura dominios autorizados para producción.
                  </p>
                </div>
              )}

              {/* Fields mapping */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-4 py-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Campos → CRM</h3>
                <div className="space-y-1.5">
                  {fields.map(f => (
                    <div key={f.key} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-gray-500">{f.key}</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-gray-700">{f.isBase ? 'Base CRM' : 'Prop. personalizada'}</span>
                      {f.required && <span className="text-red-500 font-bold">*</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: preview */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Vista previa
              </p>
              <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <FormPreview fields={fields} style={s} formName={editingForm?.name ?? ''} />
              </div>
            </div>
          </div>

          {/* Code block */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-gray-400" /> Copia y pega en tu página web
              </span>
              <button onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${copiedCode ? 'bg-green-100 text-green-700' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                {copiedCode ? <><Check className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar código</>}
              </button>
            </div>
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto max-h-72 overflow-y-auto leading-relaxed whitespace-pre-wrap break-all">
              {generatedCode}
            </pre>
          </div>
        </div>

        <div className="bg-white border-t border-gray-200 px-6 py-4 flex justify-end">
          <button onClick={goBack} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">← Volver a la lista</button>
        </div>
      </div>
    );
  }

  return null;
};

export default CRMFormBuilder;
