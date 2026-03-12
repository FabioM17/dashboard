import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, User, BarChart3, SlidersHorizontal, ChevronDown,
  Copy, Check, RefreshCw, Loader2, AlertCircle, RotateCcw,
  TrendingUp, AlertTriangle, PieChart, Layers, Search, Save,
} from 'lucide-react';
import { CRMContact, Conversation } from '../types';
import { aiService } from '../services/aiService';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'contact' | 'bulk' | 'prompts';

type InsightType = 'summary' | 'suggestions' | 'next_action';

type AnalysisType = 'full' | 'opportunities' | 'risks' | 'segmentation';

interface Props {
  organizationId: string;
  contacts: CRMContact[];
  conversations: Conversation[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const INSIGHT_OPTIONS: { value: InsightType; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'summary',
    label: 'Resumen del perfil',
    description: 'Genera un resumen ejecutivo del contacto con la info más relevante.',
    icon: <User size={16} />,
  },
  {
    value: 'suggestions',
    label: 'Acciones recomendadas',
    description: 'Sugiere 3-5 acciones concretas para avanzar la relación comercial.',
    icon: <TrendingUp size={16} />,
  },
  {
    value: 'next_action',
    label: 'Próximo mensaje',
    description: 'Redacta el siguiente follow-up ideal para enviar al contacto.',
    icon: <ChevronDown size={16} />,
  },
];

const ANALYSIS_OPTIONS: { value: AnalysisType; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'full',
    label: 'Análisis completo',
    description: 'Pipeline, segmentos, oportunidades, riesgos y recomendaciones estratégicas.',
    icon: <Layers size={16} />,
  },
  {
    value: 'opportunities',
    label: 'Oportunidades',
    description: 'Identifica y prioriza leads con mayor potencial de conversión.',
    icon: <TrendingUp size={16} />,
  },
  {
    value: 'risks',
    label: 'Riesgos',
    description: 'Detecta clientes en riesgo de abandono y deals estancados.',
    icon: <AlertTriangle size={16} />,
  },
  {
    value: 'segmentation',
    label: 'Segmentación',
    description: 'Clasifica contactos por comportamiento, valor potencial y ciclo de vida.',
    icon: <PieChart size={16} />,
  },
];

const PROMPT_LABELS: Record<string, { label: string; description: string }> = {
  chat_reply: {
    label: 'Respuestas en Chat',
    description: 'Guía al asistente al generar sugerencias de respuesta para el agente en conversaciones activas.',
  },
  crm_summary: {
    label: 'Resumen de contacto',
    description: 'Instrucciones para generar el resumen ejecutivo del perfil de un contacto en el CRM.',
  },
  crm_suggestions: {
    label: 'Acciones recomendadas (CRM)',
    description: 'Contexto para que el asistente sugiera acciones concretas sobre un contacto específico.',
  },
  crm_next_action: {
    label: 'Próximo mensaje de seguimiento',
    description: 'Define cómo redactar el siguiente mensaje de follow-up para un contacto.',
  },
  crm_bulk_analysis: {
    label: 'Análisis masivo del CRM',
    description: 'Instrucciones maestras para el análisis a gran escala de todo el dataset del CRM.',
  },
};

const CHUNK_SIZE = 30;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estimateChunks(count: number): number {
  if (count <= CHUNK_SIZE) return 1;
  return Math.ceil(count / CHUNK_SIZE) + 1; // chunk passes + final synthesis
}

function estimateTokens(count: number): string {
  const tokensPerContact = 30; // ~120 chars / 4 per token
  const overhead = 300; // prompt overhead
  const total = count * tokensPerContact + overhead;
  if (total < 1000) return `~${total}`;
  return `~${(total / 1000).toFixed(1)}k`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AIAssistantScreen({ organizationId, contacts, conversations }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('contact');

  // ── Contact tab state
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<CRMContact | null>(null);
  const [insightType, setInsightType] = useState<InsightType>('summary');
  const [insightResult, setInsightResult] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState('');
  const [insightCopied, setInsightCopied] = useState(false);

  // ── Bulk tab state
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [analysisType, setAnalysisType] = useState<AnalysisType>('full');
  const [bulkResult, setBulkResult] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkCopied, setBulkCopied] = useState(false);
  const [bulkMeta, setBulkMeta] = useState<{ chunksUsed: number; contactsAnalyzed: number } | null>(null);

  // ── Prompts tab state
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [promptsSaving, setPromptsSaving] = useState(false);
  const [promptsSaved, setPromptsSaved] = useState(false);
  const [promptsError, setPromptsError] = useState('');

  // Derive unique pipeline stages from contacts
  const pipelineStages = Array.from(
    new Set(contacts.map((c) => c.pipelineStageId).filter(Boolean))
  );

  // Contacts filtered by stage for bulk analysis
  const filteredContacts =
    stageFilter === 'all' ? contacts : contacts.filter((c) => c.pipelineStageId === stageFilter);

  // Contact search results
  const searchResults =
    contactSearch.length >= 2
      ? contacts
          .filter(
            (c) =>
              c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
              c.phone?.toLowerCase().includes(contactSearch.toLowerCase()) ||
              c.company?.toLowerCase().includes(contactSearch.toLowerCase())
          )
          .slice(0, 8)
      : [];

  // ── Load prompts on mount
  useEffect(() => {
    if (activeTab !== 'prompts') return;
    setPromptsLoading(true);
    aiService
      .getSystemPrompts(organizationId)
      .then((p) => setPrompts(p))
      .catch(() => setPromptsError('No se pudieron cargar los prompts.'))
      .finally(() => setPromptsLoading(false));
  }, [activeTab, organizationId]);

  // ── Generate contact insight
  const handleGenerateInsight = useCallback(async () => {
    if (!selectedContact) return;
    setInsightLoading(true);
    setInsightResult('');
    setInsightError('');
    try {
      // Find matching conversation by phone to provide recent message context
      const matchingConversation = conversations.find(
        (conv) => conv.id === selectedContact.phone || conv.contactName === selectedContact.name
      );
      const recentMessages = matchingConversation?.lastMessage
        ? [{ text: matchingConversation.lastMessage, isIncoming: true }]
        : [];

      const result = await aiService.generateCRMInsight(
        {
          name: selectedContact.name,
          email: selectedContact.email,
          phone: selectedContact.phone,
          company: selectedContact.company,
          pipelineStageId: selectedContact.pipelineStageId,
          properties: selectedContact.properties,
        },
        recentMessages,
        organizationId,
        insightType
      );
      setInsightResult(result);
    } catch (e: any) {
      setInsightError(e?.message || 'Error al generar el análisis.');
    } finally {
      setInsightLoading(false);
    }
  }, [selectedContact, insightType, organizationId, conversations]);

  // ── Copy contact insight
  const handleCopyInsight = () => {
    if (!insightResult) return;
    navigator.clipboard.writeText(insightResult);
    setInsightCopied(true);
    setTimeout(() => setInsightCopied(false), 2000);
  };

  // ── Generate bulk CRM analysis
  const handleGenerateBulk = useCallback(async () => {
    if (filteredContacts.length === 0) return;
    setBulkLoading(true);
    setBulkResult('');
    setBulkError('');
    setBulkMeta(null);
    try {
      const { result, chunksUsed, contactsAnalyzed } = await aiService.analyzeCRM(
        filteredContacts.map((c) => ({
          name: c.name,
          email: c.email,
          phone: c.phone,
          company: c.company,
          pipelineStageId: c.pipelineStageId,
          properties: c.properties,
        })),
        organizationId,
        analysisType
      );
      setBulkResult(result);
      setBulkMeta({ chunksUsed, contactsAnalyzed });
    } catch (e: any) {
      setBulkError(e?.message || 'Error al generar el análisis masivo.');
    } finally {
      setBulkLoading(false);
    }
  }, [filteredContacts, analysisType, organizationId]);

  // ── Copy bulk result
  const handleCopyBulk = () => {
    if (!bulkResult) return;
    navigator.clipboard.writeText(bulkResult);
    setBulkCopied(true);
    setTimeout(() => setBulkCopied(false), 2000);
  };

  // ── Save prompts
  const handleSavePrompts = async () => {
    setPromptsSaving(true);
    setPromptsError('');
    try {
      await aiService.saveSystemPrompts(organizationId, prompts);
      setPromptsSaved(true);
      setTimeout(() => setPromptsSaved(false), 2500);
    } catch (e: any) {
      setPromptsError(e?.message || 'Error al guardar los prompts.');
    } finally {
      setPromptsSaving(false);
    }
  };

  // ── Reset a single prompt to default
  const handleResetPrompt = (key: string) => {
    const defaults = aiService.DEFAULT_PROMPTS;
    setPrompts((prev) => ({ ...prev, [key]: defaults[key] || '' }));
  };

  // ─────────────────────────────────────────────────────────────────── RENDER

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Asistente IA</h1>
            <p className="text-xs text-slate-500">Análisis inteligente de contactos y CRM con tu proveedor de IA configurado</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 bg-slate-100 rounded-xl p-1 max-w-lg">
          {([
            { id: 'contact' as Tab, label: 'Contacto', icon: <User size={14} /> },
            { id: 'bulk' as Tab, label: 'Análisis CRM', icon: <BarChart3 size={14} /> },
            { id: 'prompts' as Tab, label: 'Prompts', icon: <SlidersHorizontal size={14} /> },
          ] as const).map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 flex-1 justify-center py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === id
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ══════════════════════════════ TAB: CONTACT ══════════════════════════ */}
        {activeTab === 'contact' && (
          <div className="max-w-3xl mx-auto space-y-6">

            {/* Contact search */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Search size={15} className="text-violet-500" />
                Buscar contacto
              </h2>

              <div className="relative">
                <input
                  type="text"
                  value={contactSearch}
                  onChange={(e) => { setContactSearch(e.target.value); setSelectedContact(null); setInsightResult(''); }}
                  placeholder="Nombre, teléfono o empresa..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 pr-10"
                />
                {contactSearch && (
                  <button
                    onClick={() => { setContactSearch(''); setSelectedContact(null); setInsightResult(''); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Search results dropdown */}
              {searchResults.length > 0 && !selectedContact && (
                <div className="mt-2 border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {searchResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedContact(c); setContactSearch(c.name); setInsightResult(''); }}
                      className="w-full text-left px-4 py-3 hover:bg-violet-50 flex items-center gap-3 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-semibold text-sm flex-shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                        <div className="text-xs text-slate-400 truncate">
                          {[c.company, c.phone].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      {c.pipelineStageId && (
                        <span className="ml-auto flex-shrink-0 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                          {c.pipelineStageId}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {contactSearch.length >= 2 && searchResults.length === 0 && !selectedContact && (
                <p className="mt-2 text-sm text-slate-400 text-center py-3">No se encontraron contactos.</p>
              )}
            </div>

            {/* Selected contact card */}
            {selectedContact && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                    {selectedContact.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-slate-800">{selectedContact.name}</h3>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-2">
                      {selectedContact.company && <span>{selectedContact.company}</span>}
                      {selectedContact.phone && <span>📞 {selectedContact.phone}</span>}
                      {selectedContact.email && <span>✉ {selectedContact.email}</span>}
                    </div>
                    {selectedContact.pipelineStageId && (
                      <span className="mt-2 inline-block text-xs bg-violet-100 text-violet-700 px-2.5 py-0.5 rounded-full font-medium">
                        {selectedContact.pipelineStageId}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Insight type selector */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Tipo de análisis</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {INSIGHT_OPTIONS.map(({ value, label, description, icon }) => (
                  <button
                    key={value}
                    onClick={() => { setInsightType(value); setInsightResult(''); }}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      insightType === value
                        ? 'border-violet-500 bg-violet-50'
                        : 'border-slate-200 hover:border-violet-200'
                    }`}
                  >
                    <div className={`flex items-center gap-2 font-medium text-sm mb-1 ${insightType === value ? 'text-violet-700' : 'text-slate-700'}`}>
                      <span className={insightType === value ? 'text-violet-500' : 'text-slate-400'}>{icon}</span>
                      {label}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Generate button & result */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-700">Resultado</h2>
                {insightResult && (
                  <button
                    onClick={handleCopyInsight}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-600 transition-colors"
                  >
                    {insightCopied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                    {insightCopied ? 'Copiado' : 'Copiar'}
                  </button>
                )}
              </div>

              {insightError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 mb-4 text-sm">
                  <AlertCircle size={15} />
                  {insightError}
                </div>
              )}

              {insightResult ? (
                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {insightResult}
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl p-8 text-center text-slate-400 text-sm">
                  {selectedContact
                    ? 'Presiona "Generar" para obtener el análisis.'
                    : 'Selecciona un contacto para comenzar.'}
                </div>
              )}

              <button
                onClick={handleGenerateInsight}
                disabled={!selectedContact || insightLoading}
                className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-violet-600 text-white font-medium text-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {insightLoading ? (
                  <><Loader2 size={16} className="animate-spin" /> Generando...</>
                ) : (
                  <><Sparkles size={16} /> Generar análisis</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════ TAB: BULK ════════════════════════════ */}
        {activeTab === 'bulk' && (
          <div className="max-w-3xl mx-auto space-y-6">

            {/* Scope & filters */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <BarChart3 size={15} className="text-violet-500" />
                Alcance del análisis
              </h2>

              {/* Stage filter */}
              <div className="mb-4">
                <label className="text-xs font-medium text-slate-600 mb-1 block">Filtrar por etapa del pipeline</label>
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                >
                  <option value="all">Todos los contactos ({contacts.length})</option>
                  {pipelineStages.map((s) => (
                    <option key={s} value={s}>
                      {s} ({contacts.filter((c) => c.pipelineStageId === s).length})
                    </option>
                  ))}
                </select>
              </div>

              {/* Stats bar */}
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1.5 bg-violet-50 text-violet-700 px-3 py-1.5 rounded-lg font-medium">
                  <User size={12} />
                  {filteredContacts.length} contactos
                </div>
                <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg font-medium">
                  <RefreshCw size={12} />
                  {estimateChunks(filteredContacts.length)} solicitudes al API
                </div>
                <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg font-medium">
                  <Layers size={12} />
                  {estimateTokens(filteredContacts.length)} tokens est.
                </div>
                {filteredContacts.length > CHUNK_SIZE && (
                  <div className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-medium">
                    <AlertCircle size={12} />
                    Procesamiento en {Math.ceil(filteredContacts.length / CHUNK_SIZE)} bloques + síntesis
                  </div>
                )}
              </div>
            </div>

            {/* Analysis type */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Tipo de análisis</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ANALYSIS_OPTIONS.map(({ value, label, description, icon }) => (
                  <button
                    key={value}
                    onClick={() => { setAnalysisType(value); setBulkResult(''); }}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      analysisType === value
                        ? 'border-violet-500 bg-violet-50'
                        : 'border-slate-200 hover:border-violet-200'
                    }`}
                  >
                    <div className={`flex items-center gap-2 font-medium text-sm mb-1 ${analysisType === value ? 'text-violet-700' : 'text-slate-700'}`}>
                      <span className={analysisType === value ? 'text-violet-500' : 'text-slate-400'}>{icon}</span>
                      {label}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Result */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-700">Resultado</h2>
                {bulkResult && (
                  <div className="flex items-center gap-3">
                    {bulkMeta && (
                      <span className="text-xs text-slate-400">
                        {bulkMeta.contactsAnalyzed} contactos · {bulkMeta.chunksUsed} llamadas al API
                      </span>
                    )}
                    <button
                      onClick={handleCopyBulk}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-600 transition-colors"
                    >
                      {bulkCopied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                      {bulkCopied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                )}
              </div>

              {bulkError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 mb-4 text-sm">
                  <AlertCircle size={15} />
                  {bulkError}
                </div>
              )}

              {bulkLoading && (
                <div className="bg-violet-50 rounded-xl p-6 text-center mb-4">
                  <Loader2 size={28} className="animate-spin text-violet-500 mx-auto mb-2" />
                  <p className="text-sm text-violet-700 font-medium">Analizando {filteredContacts.length} contactos...</p>
                  {filteredContacts.length > CHUNK_SIZE && (
                    <p className="text-xs text-violet-500 mt-1">
                      Procesando en bloques — esto puede tomar 30–60 segundos
                    </p>
                  )}
                </div>
              )}

              {bulkResult && !bulkLoading ? (
                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {bulkResult}
                </div>
              ) : !bulkLoading ? (
                <div className="bg-slate-50 rounded-xl p-8 text-center text-slate-400 text-sm">
                  {filteredContacts.length === 0
                    ? 'No hay contactos disponibles para analizar.'
                    : 'Presiona "Analizar CRM" para comenzar.'}
                </div>
              ) : null}

              <button
                onClick={handleGenerateBulk}
                disabled={filteredContacts.length === 0 || bulkLoading}
                className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-violet-600 text-white font-medium text-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {bulkLoading ? (
                  <><Loader2 size={16} className="animate-spin" /> Analizando...</>
                ) : (
                  <><Sparkles size={16} /> Analizar CRM ({filteredContacts.length} contactos)</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════ TAB: PROMPTS ══════════════════════════ */}
        {activeTab === 'prompts' && (
          <div className="max-w-3xl mx-auto space-y-6">

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 flex gap-3">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Prompts del sistema</span> — definen cómo se comporta el asistente en cada contexto.
                Los cambios aquí afectan a todos los usuarios de tu organización.
                Resetea a los valores predeterminados si algo no funciona como esperas.
              </div>
            </div>

            {promptsLoading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">Cargando prompts...</span>
              </div>
            ) : (
              <>
                {Object.keys(PROMPT_LABELS).map((key) => (
                  <div key={key} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">{PROMPT_LABELS[key].label}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{PROMPT_LABELS[key].description}</p>
                      </div>
                      <button
                        onClick={() => handleResetPrompt(key)}
                        className="flex-shrink-0 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1 px-2 rounded-lg hover:bg-slate-100"
                      >
                        <RotateCcw size={12} />
                        Resetear
                      </button>
                    </div>
                    <textarea
                      value={prompts[key] || ''}
                      onChange={(e) => setPrompts((prev) => ({ ...prev, [key]: e.target.value }))}
                      rows={4}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y"
                      placeholder={aiService.DEFAULT_PROMPTS[key] || ''}
                    />
                  </div>
                ))}

                {promptsError && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
                    <AlertCircle size={15} />
                    {promptsError}
                  </div>
                )}

                <button
                  onClick={handleSavePrompts}
                  disabled={promptsSaving}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-violet-600 text-white font-medium text-sm hover:bg-violet-700 disabled:opacity-50 transition-all"
                >
                  {promptsSaving ? (
                    <><Loader2 size={16} className="animate-spin" /> Guardando...</>
                  ) : promptsSaved ? (
                    <><Check size={16} /> Cambios guardados</>
                  ) : (
                    <><Save size={16} /> Guardar cambios</>
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
