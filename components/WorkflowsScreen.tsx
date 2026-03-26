import React, { useState, useEffect } from 'react';
import { Workflow, CRMList, Template, WorkflowStep, WorkflowStepChannel, CustomProperty, VariableMapping, WhatsAppPhoneNumber } from '../types';
import { workflowService } from '../services/workflowService';
import { listService } from '../services/listService';
import { templateService } from '../services/templateService';
import { supabase } from '../services/supabaseClient';
import { whatsappPhoneService } from '../services/whatsappPhoneService';
import EmailEditor from './EmailEditor';

interface Props {
  organizationId: string;
  userId: string;
  customProperties?: CustomProperty[];
}

export default function WorkflowsScreen({ organizationId, userId, customProperties = [] }: Props) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [lists, setLists] = useState<CRMList[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [error, setError] = useState<string>('');
  const [isGmailConfigured, setIsGmailConfigured] = useState<boolean>(true);
  const [isWhatsAppConfigured, setIsWhatsAppConfigured] = useState<boolean>(true);

  useEffect(() => {
    loadData();
    checkGmailConfig();
    checkWhatsAppConfig();
  }, [organizationId]);

  async function checkGmailConfig() {
    try {
      const { data } = await supabase
        .from('integration_settings')
        .select('credentials')
        .eq('organization_id', organizationId)
        .eq('service_name', 'gmail')
        .single();
      setIsGmailConfigured(!!data?.credentials?.access_token);
    } catch {
      setIsGmailConfigured(false);
    }
  }

  async function checkWhatsAppConfig() {
    try {
      const { data } = await supabase
        .from('integration_settings')
        .select('credentials')
        .eq('organization_id', organizationId)
        .eq('service_name', 'whatsapp')
        .single();
      setIsWhatsAppConfigured(!!data?.credentials?.phone_id && !!data?.credentials?.access_token);
    } catch {
      setIsWhatsAppConfigured(false);
    }
  }

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [workflowsData, listsData, templatesData] = await Promise.all([
        workflowService.getWorkflows(organizationId),
        listService.getLists(organizationId),
        templateService.getTemplates(organizationId)
      ]);
      setWorkflows(workflowsData);
      setLists(listsData);
      setTemplates(templatesData.filter(t => t.status === 'approved'));
    } catch (err: any) {
      console.error('Error loading workflows data:', err);
      setError('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive(workflow: Workflow) {
    try {
      await workflowService.updateWorkflow(workflow.id, organizationId, {
        isActive: !workflow.isActive
      });
      await loadData();
    } catch (err: any) {
      console.error('Error toggling workflow:', err);
      setError('Error al activar/desactivar el flujo');
    }
  }

  async function handleDeleteWorkflow(workflow: Workflow) {
    if (!confirm(`¿Eliminar el flujo "${workflow.name}"? Esto eliminará todos los enrollments activos.`)) {
      return;
    }
    try {
      await workflowService.deleteWorkflow(workflow.id, organizationId);
      await loadData();
    } catch (err: any) {
      console.error('Error deleting workflow:', err);
      setError('Error al eliminar el flujo');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando flujos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Flujos de Mensajes</h1>
            <p className="text-sm text-gray-600 mt-1">
              Automatiza secuencias de mensajes de WhatsApp basadas en tus listas dinámicas
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Crear Flujo
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Gmail not configured warning */}
      {!isGmailConfigured && (
        <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-semibold text-sm">Gmail no configurado</p>
            <p className="text-xs mt-0.5">Los flujos con pasos de email no podrán enviar correos. Conecta tu cuenta de Gmail en <strong>Configuración → Channels → Gmail</strong>.</p>
          </div>
        </div>
      )}

      {/* WhatsApp not configured warning */}
      {!isWhatsAppConfigured && (
        <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-semibold text-sm">WhatsApp no configurado</p>
            <p className="text-xs mt-0.5">Los flujos con pasos de WhatsApp no podrán enviar mensajes. Conecta tu cuenta de WhatsApp en <strong>Configuración → Channels → WhatsApp</strong>.</p>
          </div>
        </div>
      )}

      {/* Workflows List */}
      <div className="flex-1 overflow-auto p-6">
        {workflows.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay flujos creados</h3>
            <p className="text-gray-600 mb-4">Crea tu primer flujo automático de mensajes</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Crear Primer Flujo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {workflows.map(workflow => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                onToggleActive={() => handleToggleActive(workflow)}
                onDelete={() => handleDeleteWorkflow(workflow)}
                onViewDetails={() => setSelectedWorkflow(workflow)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateWorkflowModal
          organizationId={organizationId}
          userId={userId}
          lists={lists}
          templates={templates}
          customProperties={customProperties}
          isGmailConfigured={isGmailConfigured}
          isWhatsAppConfigured={isWhatsAppConfigured}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadData();
          }}
        />
      )}

      {/* Details Modal */}
      {selectedWorkflow && (
        <WorkflowDetailsModal
          workflowId={selectedWorkflow.id}
          organizationId={organizationId}
          onClose={() => setSelectedWorkflow(null)}
        />
      )}
    </div>
  );
}

// Workflow Card Component
function WorkflowCard({
  workflow,
  onToggleActive,
  onDelete,
  onViewDetails
}: {
  workflow: Workflow;
  onToggleActive: () => void;
  onDelete: () => void;
  onViewDetails: () => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{workflow.name}</h3>
            <p className="text-sm text-gray-600">
              Lista: {workflow.list?.name || 'Sin especificar'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${
                workflow.isActive
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {workflow.isActive ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>

        {/* Stats */}
        {workflow.stats && (
          <div className="grid grid-cols-3 gap-3 mb-4 pb-4 border-b border-gray-200">
            <div>
              <p className="text-xs text-gray-600">Activos</p>
              <p className="text-2xl font-semibold text-blue-600">
                {workflow.stats.activeEnrollments}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Completados</p>
              <p className="text-2xl font-semibold text-green-600">
                {workflow.stats.completedEnrollments}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Fallidos</p>
              <p className="text-2xl font-semibold text-red-600">
                {workflow.stats.failedEnrollments}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onViewDetails}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
          >
            Ver Detalles
          </button>
          <button
            onClick={onToggleActive}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
              workflow.isActive
                ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-700'
                : 'bg-green-100 hover:bg-green-200 text-green-700'
            }`}
          >
            {workflow.isActive ? 'Pausar' : 'Activar'}
          </button>
          <button
            onClick={onDelete}
            className="bg-red-100 hover:bg-red-200 text-red-700 p-2 rounded-lg transition-colors"
            title="Eliminar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Create Workflow Modal
function CreateWorkflowModal({
  organizationId,
  userId,
  lists,
  templates,
  customProperties,
  isGmailConfigured,
  isWhatsAppConfigured,
  onClose,
  onSuccess
}: {
  organizationId: string;
  userId: string;
  lists: CRMList[];
  templates: Template[];
  customProperties: CustomProperty[];
  isGmailConfigured: boolean;
  isWhatsAppConfigured: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [steps, setSteps] = useState<Array<{
    channel: WorkflowStepChannel;
    templateId: string;
    templateName: string;
    emailSubject: string;
    emailBody: string;
    variableMappings: VariableMapping[];
    delayDays: number;
    sendTime: string;
    stepOrder: number;
    n8nWebhookUrl: string;
    n8nAuthHeader: string;
    n8nCustomBody: string;
    n8nContactFields: string[];
  }>>([]);
  const [isActive, setIsActive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [showListContactsPreview, setShowListContactsPreview] = useState(false);
  const [listContacts, setListContacts] = useState<any[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState<WhatsAppPhoneNumber[]>([]);
  const [selectedPhoneId, setSelectedPhoneId] = useState<string>('');
  // n8n test state: keyed by step index
  const [n8nTestState, setN8nTestState] = useState<Record<number, {
    loading: boolean;
    result?: { success: boolean; httpStatus: number | null; httpStatusText: string | null; elapsedMs: number; responsePreview?: string; error?: string; payloadSent?: any };
    showPayload: boolean;
  }>>();

  function getN8nTest(index: number) {
    return n8nTestState?.[index] ?? { loading: false, result: undefined, showPayload: false };
  }

  async function handleTestN8nWebhook(index: number) {
    const step = steps[index];
    if (!step.n8nWebhookUrl.trim()) return;
    setN8nTestState(prev => ({ ...prev, [index]: { loading: true, result: undefined, showPayload: false } }));
    try {
      const result = await workflowService.testN8nWebhook(
        step.n8nWebhookUrl,
        step.n8nAuthHeader || undefined,
        step.n8nCustomBody || undefined,
        step.n8nContactFields.length > 0 ? step.n8nContactFields : undefined
      );
      setN8nTestState(prev => ({ ...prev, [index]: { loading: false, result, showPayload: false } }));
    } catch (err: any) {
      setN8nTestState(prev => ({ ...prev, [index]: { loading: false, result: { success: false, httpStatus: null, httpStatusText: null, elapsedMs: 0, error: err.message || String(err), payloadSent: null }, showPayload: false } }));
    }
  }

  // Load available WhatsApp phone numbers
  useEffect(() => {
    if (isWhatsAppConfigured) {
      whatsappPhoneService.getPhoneNumbers(organizationId).then(phones => {
        setPhoneNumbers(phones);
        const def = phones.find(p => p.isDefault);
        if (def) setSelectedPhoneId(def.id);
      }).catch(err => console.error('Error loading phone numbers:', err));
    }
  }, [organizationId, isWhatsAppConfigured]);

  async function loadListContacts(listId: string) {
    if (!listId) return;
    setLoadingContacts(true);
    try {
      console.log('Loading contacts for list:', listId);
      const contacts = await listService.getListContacts(listId, organizationId);
      console.log('Loaded contacts:', contacts);
      setListContacts(contacts);
    } catch (err) {
      console.error('Error loading list contacts:', err);
      setListContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }

  useEffect(() => {
    if (selectedListId && showListContactsPreview) {
      loadListContacts(selectedListId);
    }
  }, [selectedListId, showListContactsPreview, organizationId]);

  function addStep() {
    setSteps([
      ...steps,
      {
        channel: 'whatsapp',
        templateId: '',
        templateName: '',
        emailSubject: '',
        emailBody: '',
        variableMappings: [],
        delayDays: 0,
        sendTime: '',
        stepOrder: steps.length + 1,
        n8nWebhookUrl: '',
        n8nAuthHeader: '',
        n8nCustomBody: '',
        n8nContactFields: []
      }
    ]);
  }

  function updateStep(index: number, field: string, value: any) {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    
    // Auto-fill template name and detect variables when template is selected
    if (field === 'templateId') {
      const template = templates.find(t => t.id === value);
      if (template) {
        newSteps[index].templateName = template.name;
        // Auto-detect variables and create default mappings
        const vars = workflowService.extractTemplateVariables(template.body);
        newSteps[index].variableMappings = vars.map(v => ({
          variable: v,
          source: 'property' as const,
          value: ['name', 'email', 'phone', 'company'].includes(v) ? v : ''
        }));
      } else {
        newSteps[index].variableMappings = [];
      }
    }

    // Reset mappings when switching channel
    if (field === 'channel') {
      newSteps[index].variableMappings = [];
    }
    
    setSteps(newSteps);
  }

  function updateVariableMapping(stepIndex: number, varIndex: number, mappingUpdate: Partial<VariableMapping>) {
    const newSteps = [...steps];
    const mappings = [...newSteps[stepIndex].variableMappings];
    mappings[varIndex] = { ...mappings[varIndex], ...mappingUpdate };
    newSteps[stepIndex].variableMappings = mappings;
    setSteps(newSteps);
  }

  function removeStep(index: number) {
    const newSteps = steps.filter((_, i) => i !== index);
    // Reorder steps
    newSteps.forEach((step, i) => {
      step.stepOrder = i + 1;
    });
    setSteps(newSteps);
  }

  async function handleCreate() {
    // Validation
    if (!name.trim()) {
      setError('El nombre es requerido');
      return;
    }
    if (!selectedListId) {
      setError('Debes seleccionar una lista');
      return;
    }
    if (steps.length === 0) {
      setError('Debes agregar al menos un paso');
      return;
    }
    for (const step of steps) {
      if (step.channel === 'whatsapp' && !isWhatsAppConfigured) {
        setError(`El paso ${step.stepOrder} usa WhatsApp pero no está configurado. Ve a Configuración → Channels → WhatsApp.`);
        return;
      }
      if (step.channel === 'email' && !isGmailConfigured) {
        setError(`El paso ${step.stepOrder} usa Email pero Gmail no está configurado. Ve a Configuración → Channels → Gmail.`);
        return;
      }
      if (step.channel === 'whatsapp' && !step.templateId) {
        setError(`El paso ${step.stepOrder} (WhatsApp) no tiene plantilla seleccionada`);
        return;
      }
      if (step.channel === 'email' && (!step.emailSubject.trim() || !step.emailBody.trim())) {
        setError(`El paso ${step.stepOrder} (Email) requiere asunto y cuerpo`);
        return;
      }
      if (step.channel === 'n8n' && !step.n8nWebhookUrl.trim()) {
        setError(`El paso ${step.stepOrder} (n8n) requiere una URL de webhook`);
        return;
      }
      if (step.channel === 'n8n' && !step.n8nWebhookUrl.startsWith('http')) {
        setError(`El paso ${step.stepOrder} (n8n): la URL del webhook debe comenzar con http(s)://`);
        return;
      }
      if (step.channel === 'n8n' && step.n8nCustomBody.trim()) {
        try { JSON.parse(step.n8nCustomBody); } catch {
          setError(`El paso ${step.stepOrder} (n8n): el body personalizado no es JSON válido`);
          return;
        }
      }
    }

    setCreating(true);
    setError('');

    try {
      await workflowService.createWorkflow(
        organizationId,
        name,
        selectedListId,
        steps.map(s => ({
          ...s,
          sendTime: s.sendTime || null,
          n8nWebhookUrl: s.n8nWebhookUrl || undefined,
          n8nAuthHeader: s.n8nAuthHeader || undefined,
          n8nCustomBody: s.n8nCustomBody || undefined,
          n8nContactFields: s.n8nContactFields.length > 0 ? s.n8nContactFields : undefined
        })),
        isActive,
        userId,
        selectedPhoneId || undefined
      );
      onSuccess();
    } catch (err: any) {
      console.error('Error creating workflow:', err);
      setError(err.message || 'Error al crear el flujo');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Crear Nuevo Flujo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Name */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre del Flujo *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Seguimiento de Ventas"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* List Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Lista Dinámica *
            </label>
            <select
              value={selectedListId}
              onChange={(e) => setSelectedListId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Seleccionar lista...</option>
              {lists.map(list => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-600 mt-1">
              Los contactos de esta lista serán enrolados automáticamente en el flujo
            </p>

            {/* Preview Contacts Button */}
            {selectedListId && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowListContactsPreview(!showListContactsPreview)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium hover:underline"
                >
                  {showListContactsPreview ? '▼ Ocultar contactos' : '▶ Ver quiénes están en esta lista'}
                </button>

                {/* Contacts Preview */}
                {showListContactsPreview && (
                  <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
                    {loadingContacts ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="text-xs text-gray-600 mt-2">Cargando contactos...</p>
                      </div>
                    ) : listContacts.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-gray-600">Esta lista no tiene contactos</p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-gray-900">
                            {listContacts.length} {listContacts.length === 1 ? 'Contacto' : 'Contactos'}
                          </h4>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
                          {listContacts.map(contact => (
                            <div key={contact.id} className="p-3 flex items-center gap-3">
                              <img 
                                src={contact.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}`} 
                                className="w-8 h-8 rounded-full"
                                alt={contact.name}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                                <p className="text-xs text-gray-500 truncate">
                                  {contact.phone || contact.email || 'Sin información de contacto'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* WhatsApp Phone Number Selector */}
          {isWhatsAppConfigured && phoneNumbers.length >= 1 && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Número de WhatsApp para envío
              </label>
              <select
                value={selectedPhoneId}
                onChange={(e) => setSelectedPhoneId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                {phoneNumbers.map(phone => (
                  <option key={phone.id} value={phone.id}>
                    {phone.label ? `${phone.label} (${phone.displayPhoneNumber})` : phone.displayPhoneNumber}
                    {phone.isDefault ? ' — Default' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Todos los pasos de WhatsApp usarán este número.
              </p>
            </div>
          )}

          {/* Steps */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Pasos del Flujo *
              </label>
              <button
                onClick={addStep}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
              >
                + Agregar Paso
              </button>
            </div>

            {steps.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                <p className="text-gray-600 mb-2">No hay pasos definidos</p>
                <button
                  onClick={addStep}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Agregar primer paso
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div key={index} className="border border-gray-300 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">Paso {step.stepOrder}</h4>
                      <button
                        onClick={() => removeStep(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {/* Channel selector */}
                      <div className="col-span-3">
                        <label className="block text-xs text-gray-700 mb-1">Canal</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateStep(index, 'channel', 'whatsapp')}
                            className={`flex-1 px-3 py-2 rounded text-sm font-medium border transition-colors ${
                              step.channel === 'whatsapp'
                                ? 'bg-green-50 border-green-500 text-green-700'
                                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            📱 WhatsApp
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStep(index, 'channel', 'email')}
                            className={`flex-1 px-3 py-2 rounded text-sm font-medium border transition-colors ${
                              step.channel === 'email'
                                ? 'bg-blue-50 border-blue-500 text-blue-700'
                                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            ✉️ Email
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStep(index, 'channel', 'n8n')}
                            className={`flex-1 px-3 py-2 rounded text-sm font-medium border transition-colors ${
                              step.channel === 'n8n'
                                ? 'bg-purple-50 border-purple-500 text-purple-700'
                                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            🔗 n8n
                          </button>
                        </div>
                        {/* Gmail not configured warning for email steps */}
                        {step.channel === 'email' && !isGmailConfigured && (
                          <div className="col-span-3 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg flex items-center gap-2 mt-2">
                            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-xs">Gmail no está configurado. Este paso no podrá enviar correos hasta que conectes Gmail en <strong>Configuración → Channels</strong>.</p>
                          </div>
                        )}
                        {/* WhatsApp not configured warning for whatsapp steps */}
                        {step.channel === 'whatsapp' && !isWhatsAppConfigured && (
                          <div className="col-span-3 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg flex items-center gap-2 mt-2">
                            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-xs">WhatsApp no está configurado. Este paso no podrá enviar mensajes hasta que conectes WhatsApp en <strong>Configuración → Channels</strong>.</p>
                          </div>
                        )}
                      </div>

                      {/* WhatsApp: Template selector */}
                      {step.channel === 'whatsapp' && (
                        <div>
                          <label className="block text-xs text-gray-700 mb-1">Plantilla</label>
                          <select
                            value={step.templateId}
                            onChange={(e) => updateStep(index, 'templateId', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Seleccionar...</option>
                            {templates.map(template => (
                              <option key={template.id} value={template.id}>
                                {template.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* WhatsApp: Delay + Time (shown inline) */}
                      {step.channel === 'whatsapp' && (
                        <>
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Espera (días)</label>
                            <input
                              type="number"
                              min="0"
                              value={step.delayDays}
                              onChange={(e) => updateStep(index, 'delayDays', parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Hora de envío</label>
                            <input
                              type="time"
                              value={step.sendTime}
                              onChange={(e) => updateStep(index, 'sendTime', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="text-[10px] text-gray-400 mt-0.5">Vacío = lo antes posible</p>
                          </div>
                        </>
                      )}

                      {/* Email: Delay + Time (separate row before editor) */}
                      {step.channel === 'email' && (
                        <>
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Espera (días)</label>
                            <input
                              type="number"
                              min="0"
                              value={step.delayDays}
                              onChange={(e) => updateStep(index, 'delayDays', parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Hora de envío</label>
                            <input
                              type="time"
                              value={step.sendTime}
                              onChange={(e) => updateStep(index, 'sendTime', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="text-[10px] text-gray-400 mt-0.5">Vacío = lo antes posible</p>
                          </div>
                          <div></div>
                        </>
                      )}

                      {/* n8n: Delay + Time */}
                      {step.channel === 'n8n' && (
                        <>
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Espera (días)</label>
                            <input
                              type="number"
                              min="0"
                              value={step.delayDays}
                              onChange={(e) => updateStep(index, 'delayDays', parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">Hora de ejecución</label>
                            <input
                              type="time"
                              value={step.sendTime}
                              onChange={(e) => updateStep(index, 'sendTime', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500"
                            />
                            <p className="text-[10px] text-gray-400 mt-0.5">Vacío = lo antes posible</p>
                          </div>
                          <div></div>
                        </>
                      )}
                    </div>

                    {/* n8n: Webhook configuration (below the grid) */}
                    {step.channel === 'n8n' && (
                      <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200 space-y-3">
                        <p className="text-xs font-semibold text-purple-700 flex items-center gap-1">
                          🔗 Configuración del webhook n8n
                        </p>
                        {/* Webhook URL */}
                        <div>
                          <label className="block text-xs text-gray-700 mb-1">
                            URL del Webhook <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="url"
                            value={step.n8nWebhookUrl}
                            onChange={(e) => updateStep(index, 'n8nWebhookUrl', e.target.value)}
                            placeholder="https://tu-n8n.com/webhook/..."
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 bg-white"
                          />
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            Se hará un POST a esta URL con los datos del contacto.
                          </p>
                        </div>
                        {/* Auth Header (optional) */}
                        <div>
                          <label className="block text-xs text-gray-700 mb-1">
                            Header de autenticación <span className="text-gray-400">(opcional)</span>
                          </label>
                          <input
                            type="text"
                            value={step.n8nAuthHeader}
                            onChange={(e) => updateStep(index, 'n8nAuthHeader', e.target.value)}
                            placeholder="Authorization: Bearer tu-token"
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 bg-white font-mono"
                          />
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            Formato: <code>NombreHeader: valor</code> · Ej: <code>Authorization: Bearer TOKEN</code> o <code>x-api-key: clave</code>
                          </p>
                        </div>
                        {/* Contact fields selector */}
                        <div>
                          <label className="block text-xs text-gray-700 mb-1">
                            Campos del contacto a enviar
                          </label>
                          <div className="flex items-center gap-2 mb-2">
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={step.n8nContactFields.length === 0}
                                onChange={(e) => updateStep(index, 'n8nContactFields', e.target.checked ? [] : ['name', 'email', 'phone'])}
                                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                              />
                              <span className="font-medium text-purple-700">Todos los campos</span>
                            </label>
                          </div>
                          {step.n8nContactFields.length > 0 && (
                            <div className="p-2 bg-white border border-purple-100 rounded space-y-2">
                              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Campos estándar</p>
                              <div className="grid grid-cols-3 gap-1">
                                {(['id', 'name', 'email', 'phone', 'company', 'custom_properties'] as const).map(field => (
                                  <label key={field} className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={step.n8nContactFields.includes(field)}
                                      onChange={(e) => {
                                        const current = step.n8nContactFields;
                                        updateStep(index, 'n8nContactFields', e.target.checked
                                          ? [...current, field]
                                          : current.filter(f => f !== field)
                                        );
                                      }}
                                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                    />
                                    <span className="font-mono">{field}</span>
                                  </label>
                                ))}
                              </div>
                              {customProperties.length > 0 && (
                                <>
                                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide pt-1 border-t border-gray-100">Propiedades personalizadas</p>
                                  <div className="grid grid-cols-3 gap-1">
                                    {customProperties.map(p => (
                                      <label key={p.name} className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer select-none">
                                        <input
                                          type="checkbox"
                                          checked={step.n8nContactFields.includes(p.name)}
                                          onChange={(e) => {
                                            const current = step.n8nContactFields;
                                            updateStep(index, 'n8nContactFields', e.target.checked
                                              ? [...current, p.name]
                                              : current.filter(f => f !== p.name)
                                            );
                                          }}
                                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                        />
                                        <span className="font-mono truncate" title={p.name}>{p.name}</span>
                                      </label>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {step.n8nContactFields.length === 0 ? 'Se enviarán todos los campos del contacto.' : `Se enviarán solo: ${step.n8nContactFields.join(', ')}`}
                          </p>
                        </div>

                        {/* Custom JSON Body (optional) */}
                        <div>
                          <label className="block text-xs text-gray-700 mb-1">
                            Campos extra en el payload <span className="text-gray-400">(opcional)</span>
                          </label>
                          <textarea
                            value={step.n8nCustomBody}
                            onChange={(e) => updateStep(index, 'n8nCustomBody', e.target.value)}
                            placeholder={'{\n  "mi_campo": "valor_extra"\n}'}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 bg-white font-mono resize-none"
                          />
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            JSON adicional que se fusiona con el payload base. Si está vacío se envía solo el payload estándar.
                          </p>
                        </div>

                        {/* Payload preview (collapsible) */}
                        <details className="bg-white border border-purple-100 rounded">
                          <summary className="px-3 py-2 text-[10px] text-purple-600 font-medium cursor-pointer select-none list-none flex items-center justify-between">
                            <span>📦 Ver payload que se enviará</span>
                            <span className="text-purple-300">▸</span>
                          </summary>
                          <pre className="px-3 pb-3 text-[10px] text-gray-600 overflow-auto max-h-48 leading-relaxed">{(() => {
                            const allContact: Record<string, any> = { id: '<id>', name: '<nombre>', email: '<email>', phone: '<teléfono>', company: '<empresa>', custom_properties: {} };
                            const contactPreview = step.n8nContactFields.length > 0
                              ? Object.fromEntries(step.n8nContactFields.map(f => [f, allContact[f] ?? `<${f}>`]))
                              : allContact;
                            return JSON.stringify({
                              contact: contactPreview,
                              workflow: { id: '<workflow_id>', name: '<nombre_flujo>', enrollment_id: '<enrollment_id>', step_order: step.stepOrder },
                              ...(step.n8nCustomBody ? (() => { try { return JSON.parse(step.n8nCustomBody); } catch { return { _error: 'JSON inválido' }; } })() : {})
                            }, null, 2);
                          })()}</pre>
                        </details>

                        {/* Test webhook button + result */}
                        <div className="pt-1 border-t border-purple-200">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!step.n8nWebhookUrl.trim() || getN8nTest(index).loading}
                              onClick={() => handleTestN8nWebhook(index)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
                            >
                              {getN8nTest(index).loading ? (
                                <>
                                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                  </svg>
                                  Probando...
                                </>
                              ) : (
                                <>🧪 Probar webhook</>
                              )}
                            </button>
                            {!step.n8nWebhookUrl.trim() && (
                              <p className="text-[10px] text-gray-400">Ingresa la URL primero</p>
                            )}
                          </div>

                          {/* Test result */}
                          {getN8nTest(index).result && (() => {
                            const r = getN8nTest(index).result!;
                            const test = getN8nTest(index);
                            return (
                              <div className={`mt-2 rounded-lg border p-3 text-xs ${r.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 font-medium">
                                    <span>{r.success ? '✅' : '❌'}</span>
                                    <span className={r.success ? 'text-green-700' : 'text-red-700'}>
                                      {r.success
                                        ? `Webhook alcanzado — HTTP ${r.httpStatus} ${r.httpStatusText || ''}`
                                        : r.httpStatus
                                          ? `Error HTTP ${r.httpStatus} ${r.httpStatusText || ''}`
                                          : (r.error || 'No se pudo conectar')}
                                    </span>
                                  </div>
                                  <span className="text-gray-400 text-[10px] whitespace-nowrap">{r.elapsedMs}ms</span>
                                </div>
                                {r.responsePreview && (
                                  <details className="mt-2">
                                    <summary className="text-[10px] text-gray-500 cursor-pointer">Respuesta del servidor</summary>
                                    <pre className="mt-1 text-[10px] text-gray-600 bg-white border rounded p-2 overflow-auto max-h-24">{r.responsePreview}</pre>
                                  </details>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setN8nTestState(prev => ({ ...prev, [index]: { ...test, showPayload: !test.showPayload } }))}
                                  className="mt-2 text-[10px] text-gray-400 hover:text-gray-600 underline"
                                >
                                  {test.showPayload ? 'Ocultar' : 'Ver'} payload enviado en la prueba
                                </button>
                                {test.showPayload && r.payloadSent && (
                                  <pre className="mt-1 text-[10px] text-gray-600 bg-white border rounded p-2 overflow-auto max-h-32">{JSON.stringify(r.payloadSent, null, 2)}</pre>
                                )}
                                <div className={`mt-2 p-2 rounded text-[10px] ${r.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  <strong>💡 Importante:</strong> Esta prueba solo confirma que el webhook de n8n <strong>recibió</strong> la petición y respondió con {r.success ? `HTTP ${r.httpStatus}` : 'un error'}. <strong>No verifica que el flujo de n8n se completó correctamente</strong> — n8n responde inmediatamente al recibir el webhook, antes de ejecutar los nodos. Para verificar la ejecución completa revisa los logs en tu panel de n8n.
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Email: EmailEditor (below the grid) */}
                    {step.channel === 'email' && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <EmailEditor
                          subject={step.emailSubject}
                          body={step.emailBody}
                          onSubjectChange={(v) => updateStep(index, 'emailSubject', v)}
                          onBodyChange={(v) => updateStep(index, 'emailBody', v)}
                          customProperties={customProperties}
                          compact
                        />
                      </div>
                    )}

                    {step.channel === 'whatsapp' && step.templateId && (
                      <div className="mt-3">
                        {(() => {
                          const template = templates.find(t => t.id === step.templateId);
                          if (!template) return null;
                          const vars = workflowService.extractTemplateVariables(template.body);
                          if (vars.length === 0) return <p className="text-xs text-gray-500">Sin variables en esta plantilla</p>;

                          // Build available properties list
                          const propertyOptions = [
                            { value: 'name', label: '👤 Nombre' },
                            { value: 'email', label: '📧 Email' },
                            { value: 'phone', label: '📱 Teléfono' },
                            { value: 'company', label: '🏢 Empresa' },
                            ...customProperties.map(p => ({ value: p.name, label: `🔖 ${p.name}` }))
                          ];

                          return (
                            <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
                              <p className="text-xs font-semibold text-blue-700 mb-2">
                                Mapeo de variables ({vars.length})
                              </p>
                              <div className="space-y-2">
                                {step.variableMappings.map((mapping, vIdx) => (
                                  <div key={mapping.variable} className="flex items-center gap-2">
                                    <span className="text-xs font-mono bg-white border border-blue-200 px-2 py-1 rounded min-w-[80px] text-center text-blue-800">
                                      {`{{${mapping.variable}}}`}
                                    </span>
                                    <span className="text-xs text-gray-400">→</span>
                                    <select
                                      value={mapping.source === 'manual' ? '__manual__' : mapping.value}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '__manual__') {
                                          updateVariableMapping(index, vIdx, { source: 'manual', value: '' });
                                        } else {
                                          updateVariableMapping(index, vIdx, { source: 'property', value: val });
                                        }
                                      }}
                                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500"
                                    >
                                      <option value="">— Seleccionar —</option>
                                      {propertyOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                      <option value="__manual__">✏️ Texto manual</option>
                                    </select>
                                    {mapping.source === 'manual' && (
                                      <input
                                        type="text"
                                        value={mapping.value}
                                        onChange={(e) => updateVariableMapping(index, vIdx, { value: e.target.value })}
                                        placeholder="Valor fijo..."
                                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500"
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>
                              <p className="text-[10px] text-blue-500 mt-2">
                                Cada variable se reemplazará con el dato del contacto o el texto fijo al enviar.
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700">
              Activar inmediatamente (los contactos actuales de la lista serán enrolados)
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={creating}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || steps.some(s => (s.channel === 'email' && !isGmailConfigured) || (s.channel === 'whatsapp' && !isWhatsAppConfigured))}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creando...' : 'Crear Flujo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Workflow Details Modal (placeholder - can be extended)
function WorkflowDetailsModal({
  workflowId,
  organizationId,
  onClose
}: {
  workflowId: string;
  organizationId: string;
  onClose: () => void;
}) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkflowDetails();
  }, [workflowId]);

  async function loadWorkflowDetails() {
    try {
      const data = await workflowService.getWorkflowDetails(workflowId);
      setWorkflow(data);
    } catch (err) {
      console.error('Error loading workflow details:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Detalles del Flujo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            </div>
          ) : workflow ? (
            <div className="space-y-6">
              {/* Workflow Info */}
              <div>
                <h3 className="text-xl font-semibold mb-2">{workflow.name}</h3>
                <div className="flex items-center gap-4 text-sm">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full font-medium ${
                    workflow.isActive 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {workflow.isActive ? '🟢 Activo' : '⚪ Inactivo'}
                  </span>
                  <span className="text-gray-600">Lista: <strong>{workflow.list?.name}</strong></span>
                </div>
              </div>

              {/* Stats Summary */}
              <div className="grid grid-cols-4 gap-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4">
                <div className="text-center">
                  <p className="text-xs text-gray-600 mb-1">Total Enrollments</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {workflow.enrollments?.length || 0}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600 mb-1">En Progreso</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {workflow.enrollments?.filter(e => e.status === 'active').length || 0}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600 mb-1">Completados</p>
                  <p className="text-2xl font-bold text-green-600">
                    {workflow.enrollments?.filter(e => e.status === 'completed').length || 0}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600 mb-1">Fallidos</p>
                  <p className="text-2xl font-bold text-red-600">
                    {workflow.enrollments?.filter(e => e.status === 'failed').length || 0}
                  </p>
                </div>
              </div>

              {/* Steps */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Pasos del Flujo ({workflow.steps?.length || 0})
                </h4>
                <div className="space-y-3">
                  {workflow.steps?.map((step, index) => {
                    const contactsInStep = workflow.enrollments?.filter(e => e.currentStep === step.stepOrder && e.status === 'active').length || 0;
                    const completedThisStep = workflow.enrollments?.filter(e => e.currentStep > step.stepOrder || (e.currentStep === step.stepOrder && e.status === 'completed')).length || 0;
                    
                    return (
                      <div key={step.id} className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                              step.channel === 'email' ? 'bg-blue-100 text-blue-700' : step.channel === 'n8n' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {step.stepOrder}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-gray-900">
                                  {step.channel === 'email' ? (step.emailSubject || 'Email') : step.channel === 'n8n' ? (step.n8nWebhookUrl ? new URL(step.n8nWebhookUrl).pathname.slice(0, 40) : 'n8n Webhook') : step.templateName}
                                </p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  step.channel === 'email'
                                    ? 'bg-blue-100 text-blue-700'
                                    : step.channel === 'n8n'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-green-100 text-green-700'
                                }`}>
                                  {step.channel === 'email' ? '✉️ Email' : step.channel === 'n8n' ? '🔗 n8n' : '📱 WhatsApp'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500">
                                {step.delayDays === 0 && !step.sendTime
                                  ? 'Envío inmediato'
                                  : `${step.delayDays} día${step.delayDays !== 1 ? 's' : ''}${step.sendTime ? ` a las ${step.sendTime}` : ''}`
                                }
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600">{contactsInStep} en este paso</p>
                            <p className="text-xs text-green-600">{completedThisStep} completaron</p>
                          </div>
                        </div>
                        {step.channel === 'email' && step.emailBody && (
                          <div className="mt-3 bg-blue-50 rounded border border-blue-100">
                            <details open className="group">
                              <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none list-none">
                                <span className="text-xs text-blue-600 font-medium">Contenido del email:</span>
                                <span className="text-[10px] text-blue-400 group-open:hidden">▶ Expandir</span>
                                <span className="text-[10px] text-blue-400 hidden group-open:inline">▼ Contraer</span>
                              </summary>
                              <div className="px-3 pb-3 space-y-2">
                                <p className="text-xs text-gray-500">Asunto: <span className="font-medium text-gray-700">{step.emailSubject}</span></p>
                                <div
                                  className="text-sm text-gray-700 bg-white rounded p-3 border border-blue-100"
                                  dangerouslySetInnerHTML={{ __html: step.emailBody }}
                                />
                              </div>
                            </details>
                          </div>
                        )}
                        {step.channel !== 'email' && step.channel !== 'n8n' && step.template && (
                          <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-100">
                            <p className="text-xs text-gray-500 mb-1 font-medium">Contenido del template:</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {step.template.body}
                            </p>
                            {step.variableMappings && step.variableMappings.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-gray-200">
                                <p className="text-xs text-gray-500 mb-1 font-medium">Mapeo de variables:</p>
                                <div className="flex flex-wrap gap-1">
                                  {step.variableMappings.map((m, mi) => (
                                    <span key={mi} className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                                      {`{{${m.variable}}}`} → {m.source === 'manual' ? `"${m.value}"` : m.value}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {step.channel === 'n8n' && (
                          <div className="mt-3 p-3 bg-purple-50 rounded border border-purple-100 space-y-2">
                            <p className="text-xs font-semibold text-purple-700">Configuración del webhook n8n:</p>
                            <div>
                              <p className="text-xs text-gray-500 mb-0.5">URL:</p>
                              <p className="text-xs text-gray-800 font-mono break-all">{step.n8nWebhookUrl}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${step.n8nAuthHeader ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {step.n8nAuthHeader ? '🔐 Auth configurada' : '🔓 Sin autenticación'}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${step.n8nCustomBody ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                {step.n8nCustomBody ? '📋 Body personalizado' : '📋 Payload estándar'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Enrollments */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Contactos Enrolados ({workflow.enrollments?.length || 0})
                </h4>
                
                {!workflow.enrollments || workflow.enrollments.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-gray-600">Aún no hay contactos enrolados en este flujo</p>
                    <p className="text-sm text-gray-500 mt-1">Los contactos serán enrolados cuando se active el workflow</p>
                  </div>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Contacto
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Estado
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Paso Actual
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Próximo Envío
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Fecha Enrollment
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {workflow.enrollments.map((enrollment: any) => {
                            const statusConfig = {
                              active: { label: 'En progreso', class: 'bg-blue-100 text-blue-800', icon: '▶️' },
                              completed: { label: 'Completado', class: 'bg-green-100 text-green-800', icon: '✅' },
                              failed: { label: 'Fallido', class: 'bg-red-100 text-red-800', icon: '❌' },
                              paused: { label: 'Pausado', class: 'bg-gray-100 text-gray-800', icon: '⏸️' }
                            }[enrollment.status] || { label: enrollment.status, class: 'bg-gray-100 text-gray-800', icon: '⚪' };

                            return (
                              <tr key={enrollment.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <img 
                                      src={enrollment.contact?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(enrollment.contact?.name || 'Usuario')}`}
                                      className="w-8 h-8 rounded-full mr-3"
                                      alt={enrollment.contact?.name}
                                    />
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">
                                        {enrollment.contact?.name || 'Sin nombre'}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {enrollment.contact?.phone || enrollment.contact?.email || 'Sin contacto'}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.class}`}>
                                    <span>{statusConfig.icon}</span>
                                    {statusConfig.label}
                                  </span>
                                  {enrollment.retryCount > 0 && (
                                    <p className="text-xs text-orange-600 mt-1">
                                      🔄 Reintento {enrollment.retryCount}/3
                                    </p>
                                  )}
                                  {enrollment.lastError && (
                                    <p className="text-xs text-red-600 mt-1 truncate max-w-xs" title={enrollment.lastError}>
                                      Error: {enrollment.lastError}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-900">
                                      Paso {enrollment.currentStep}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      / {workflow.steps?.length || 0}
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                    <div 
                                      className={`h-1.5 rounded-full ${enrollment.status === 'completed' ? 'bg-green-500' : enrollment.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'}`}
                                      style={{ width: `${((enrollment.currentStep / (workflow.steps?.length || 1)) * 100)}%` }}
                                    ></div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {enrollment.status === 'active' && enrollment.nextSendAt ? (
                                    <div>
                                      <p className="text-sm text-gray-900">
                                        {new Date(enrollment.nextSendAt).toLocaleDateString('es', { 
                                          day: '2-digit', 
                                          month: 'short',
                                          year: 'numeric'
                                        })}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {new Date(enrollment.nextSendAt).toLocaleTimeString('es', { 
                                          hour: '2-digit', 
                                          minute: '2-digit'
                                        })}
                                      </p>
                                    </div>
                                  ) : enrollment.status === 'completed' && enrollment.completedAt ? (
                                    <div>
                                      <p className="text-sm text-green-600 font-medium">Finalizado</p>
                                      <p className="text-xs text-gray-500">
                                        {new Date(enrollment.completedAt).toLocaleDateString('es', { 
                                          day: '2-digit', 
                                          month: 'short'
                                        })}
                                      </p>
                                    </div>
                                  ) : (
                                    <span className="text-sm text-gray-400">-</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                  {new Date(enrollment.enrolledAt).toLocaleDateString('es', { 
                                    day: '2-digit', 
                                    month: 'short',
                                    year: 'numeric'
                                  })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-600">No se pudo cargar la información</p>
          )}
        </div>
      </div>
    </div>
  );
}
