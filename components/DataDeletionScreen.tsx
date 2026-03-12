import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Trash2, AlertTriangle, Shield, Users, Database, Eye, Loader2, CheckCircle2, XCircle, UserMinus, Building2, FileWarning, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { User } from '../types';
import { dataDeletionService, DeletionPreview, DeletionResult } from '../services/dataDeletionService';
import { teamService } from '../services/teamService';
import { authService } from '../services/authService';
import { navigateTo } from '../services/navigationService';

interface DataDeletionScreenProps {
  currentUser: User;
  onBack: () => void;
  onOrganizationDeleted: () => void;
  hideHeader?: boolean;
}

type DeletionLevel = 'anonymize' | 'delete_member' | 'delete_organization';

interface ConfirmationState {
  level: DeletionLevel;
  targetUserId?: string;
  targetUserName?: string;
  confirmText: string;
  isConfirmed: boolean;
}

const DataDeletionScreen: React.FC<DataDeletionScreenProps> = ({
  currentUser,
  onBack,
  onOrganizationDeleted,
  hideHeader = false,
}) => {
  const [isCreator, setIsCreator] = useState(false);
  const [isLoadingCreator, setIsLoadingCreator] = useState(true);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Deletion flow state
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionResult, setDeletionResult] = useState<DeletionResult | null>(null);

  // Check if user is the org creator
  useEffect(() => {
    const checkCreator = async () => {
      setIsLoadingCreator(true);
      try {
        const result = await dataDeletionService.isOrganizationCreator(
          currentUser.id,
          currentUser.organizationId
        );
        setIsCreator(result);
      } catch (err) {
        console.error('Error checking creator status:', err);
        setIsCreator(false);
      } finally {
        setIsLoadingCreator(false);
      }
    };
    checkCreator();
  }, [currentUser.id, currentUser.organizationId]);

  // Load team members for Level 2 deletion
  useEffect(() => {
    if (isCreator && currentUser.role === 'admin') {
      loadTeamMembers();
    }
  }, [isCreator, currentUser.role]);

  const loadTeamMembers = async () => {
    setIsLoadingTeam(true);
    try {
      const members = await teamService.getTeamMembers(currentUser.organizationId);
      // Filter out the current user (creator can't delete themselves via Level 2)
      setTeamMembers(members.filter(m => m.id !== currentUser.id));
    } catch (err) {
      console.error('Error loading team:', err);
    } finally {
      setIsLoadingTeam(false);
    }
  };

  // Load deletion preview
  const loadPreview = async () => {
    setIsLoadingPreview(true);
    try {
      const result = await dataDeletionService.previewDeletion(currentUser.organizationId);
      setPreview(result);
    } catch (err) {
      console.error('Error loading preview:', err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Start a deletion confirmation flow
  const startDeletion = (level: DeletionLevel, targetUserId?: string, targetUserName?: string) => {
    setDeletionResult(null);
    setConfirmation({
      level,
      targetUserId,
      targetUserName,
      confirmText: '',
      isConfirmed: false,
    });
  };

  // Get the required confirmation phrase for each level
  const getConfirmPhrase = (level: DeletionLevel): string => {
    switch (level) {
      case 'anonymize':
        return 'ANONIMIZAR MIS DATOS';
      case 'delete_member':
        return 'ELIMINAR MIEMBRO';
      case 'delete_organization':
        return 'ELIMINAR TODO';
    }
  };

  // Execute the deletion
  const executeDeletion = async () => {
    if (!confirmation) return;

    setIsDeleting(true);
    setDeletionResult(null);

    try {
      let result: DeletionResult;

      switch (confirmation.level) {
        case 'anonymize':
          result = await dataDeletionService.anonymizeUserData(currentUser.organizationId);
          break;
        case 'delete_member':
          if (!confirmation.targetUserId) throw new Error('No target user');
          result = await dataDeletionService.deleteTeamMember(
            currentUser.organizationId,
            confirmation.targetUserId
          );
          break;
        case 'delete_organization':
          result = await dataDeletionService.deleteOrganization(currentUser.organizationId);
          break;
      }

      setDeletionResult(result);

      if (result.success) {
        if (confirmation.level === 'delete_organization') {
          // Sign out after org deletion
          setTimeout(() => {
            onOrganizationDeleted();
          }, 3000);
        } else if (confirmation.level === 'delete_member') {
          // Refresh team list
          await loadTeamMembers();
        } else if (confirmation.level === 'anonymize') {
          // User anonymized their own data - sign out
          setTimeout(async () => {
            await authService.signOut();
            onOrganizationDeleted();
          }, 3000);
        }
      }
    } catch (err: any) {
      setDeletionResult({ success: false, error: err.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  const formatCount = (count: number | undefined): string => {
    return (count || 0).toLocaleString();
  };

  if (isLoadingCreator) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-50">
      {/* Header */}
      {!hideHeader && (
      <div className="sticky top-0 bg-white border-b border-slate-200 shadow-sm z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Volver"
          >
            <ArrowLeft size={24} className="text-slate-700" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Gestión de Datos</h1>
            <p className="text-sm text-slate-500">Eliminación y privacidad de datos</p>
          </div>
        </div>
      </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Info Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-4">
          <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-800">Importante</h3>
            <p className="text-sm text-amber-700 mt-1">
              La eliminación de datos es <strong>permanente e irreversible</strong>. Asegúrate de exportar 
              cualquier información importante antes de proceder. Las acciones de eliminación cumplen con 
              las normativas de GDPR, requisitos de Meta y políticas de Google.
            </p>
            <button
              onClick={() => navigateTo('/eliminacion-de-datos')}
              className="mt-2 text-sm text-amber-800 font-medium underline hover:text-amber-900 inline-flex items-center gap-1"
            >
              Ver guía completa de eliminación de datos <ExternalLink size={14} />
            </button>
          </div>
        </div>

        {/* Role Badge */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-emerald-600" />
            <div>
              <span className="text-sm font-medium text-slate-700">Tu rol: </span>
              <span className={`text-sm font-bold ${currentUser.role === 'admin' ? 'text-emerald-600' : 'text-blue-600'}`}>
                {currentUser.role === 'admin' ? 'Administrador' : currentUser.role === 'manager' ? 'Manager' : 'Community'}
              </span>
              {isCreator && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                  Creador de la organización
                </span>
              )}
            </div>
          </div>
          {!isCreator && currentUser.role === 'admin' && (
            <p className="mt-2 text-xs text-slate-500 ml-8">
              Como administrador invitado, puedes anonimizar tus propios datos pero no puedes eliminar miembros ni la organización.
            </p>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════ */}
        {/* LEVEL 1: Anonymize Personal Data */}
        {/* ═══════════════════════════════════════════════════ */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button
            onClick={() => toggleSection('anonymize')}
            className="w-full px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <UserMinus className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-slate-800">Nivel 1: Anonimizar Datos Personales</h3>
                <p className="text-sm text-slate-500">Elimina tu información personal pero mantiene los datos de la organización</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">Cualquier usuario</span>
              {expandedSection === 'anonymize' ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
            </div>
          </button>
          
          {expandedSection === 'anonymize' && (
            <div className="px-6 pb-6 border-t border-slate-100 pt-4">
              <div className="bg-slate-50 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">¿Qué se anonimiza?</h4>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    Tu nombre se reemplaza por "Usuario Eliminado"
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    Tu email se reemplaza por un identificador anónimo
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    Se elimina tu foto de perfil y número de teléfono
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    Se eliminan tus asignaciones de leads y jerarquía de equipo
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    Los mensajes y notas quedan sin autor identificable
                  </li>
                </ul>
              </div>
              <button
                onClick={() => startDeletion('anonymize')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <UserMinus size={16} />
                Anonimizar mis datos
              </button>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════ */}
        {/* LEVEL 2: Delete Team Member (Creator only) */}
        {/* ═══════════════════════════════════════════════════ */}
        {isCreator && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => toggleSection('members')}
              className="w-full px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-orange-600" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-slate-800">Nivel 2: Eliminar Miembros del Equipo</h3>
                  <p className="text-sm text-slate-500">Elimina la cuenta y todos los datos de un miembro invitado</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-700">Solo creador</span>
                {expandedSection === 'members' ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
              </div>
            </button>
            
            {expandedSection === 'members' && (
              <div className="px-6 pb-6 border-t border-slate-100 pt-4">
                <div className="bg-slate-50 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">¿Qué se elimina?</h4>
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li className="flex items-start gap-2">
                      <span className="text-orange-500 mt-0.5">•</span>
                      Perfil del usuario y cuenta de autenticación
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-500 mt-0.5">•</span>
                      Asignaciones de leads y conversaciones
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-500 mt-0.5">•</span>
                      Tareas asignadas al usuario
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-500 mt-0.5">•</span>
                      Notas creadas por el usuario
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-500 mt-0.5">•</span>
                      Jerarquía de equipo y notificaciones programadas
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-500 mt-0.5">•</span>
                      Archivos almacenados del usuario
                    </li>
                  </ul>
                </div>

                {isLoadingTeam ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 size={16} className="animate-spin" />
                    Cargando miembros...
                  </div>
                ) : teamMembers.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay otros miembros en la organización.</p>
                ) : (
                  <div className="space-y-2">
                    {teamMembers.map(member => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-300 overflow-hidden">
                            <img src={member.avatar} className="w-full h-full object-cover" alt="" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{member.name}</p>
                            <p className="text-xs text-slate-500">{member.email} · {member.role}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => startDeletion('delete_member', member.id, member.name)}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <Trash2 size={14} />
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* LEVEL 3: Delete Entire Organization (Creator only) */}
        {/* ═══════════════════════════════════════════════════ */}
        {isCreator && (
          <div className="bg-white rounded-xl border-2 border-red-200 overflow-hidden">
            <button
              onClick={() => {
                toggleSection('organization');
                if (expandedSection !== 'organization' && !preview) {
                  loadPreview();
                }
              }}
              className="w-full px-6 py-5 flex items-center justify-between hover:bg-red-50/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-red-600" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-red-800">Nivel 3: Eliminar Toda la Organización</h3>
                  <p className="text-sm text-red-600">Elimina TODOS los datos de la organización, pero conserva las cuentas de usuario</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">Irreversible</span>
                {expandedSection === 'organization' ? <ChevronUp size={20} className="text-red-400" /> : <ChevronDown size={20} className="text-red-400" />}
              </div>
            </button>
            
            {expandedSection === 'organization' && (
              <div className="px-6 pb-6 border-t border-red-100 pt-4">
                <div className="bg-red-50 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <FileWarning className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-red-800 mb-1">Zona de peligro</h4>
                      <p className="text-sm text-red-700">
                        Esta acción eliminará permanentemente <strong>todas</strong> las conversaciones, mensajes, 
                        contactos CRM, campañas, workflows, tareas, números de WhatsApp, configuraciones de integración, plantillas, 
                        snippets y claves API de esta organización. Las cuentas de usuario no serán eliminadas.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Preview Data */}
                {isLoadingPreview ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm mb-4">
                    <Loader2 size={16} className="animate-spin" />
                    Calculando datos a eliminar...
                  </div>
                ) : preview?.success ? (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <Eye size={16} />
                      Vista previa de eliminación
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { label: 'Miembros en la org', key: 'organization_memberships', icon: '👥' },
                        { label: 'Perfiles con org activa', key: 'profiles_with_active_org', icon: '🧭' },
                        { label: 'Conversaciones', key: 'conversations', icon: '💬' },
                        { label: 'Mensajes', key: 'messages', icon: '📨' },
                        { label: 'Contactos CRM', key: 'crm_contacts', icon: '📇' },
                        { label: 'Tareas', key: 'tasks', icon: '✅' },
                        { label: 'Campañas', key: 'campaigns', icon: '📣' },
                        { label: 'Workflows', key: 'workflows', icon: '⚡' },
                        { label: 'Plantillas', key: 'templates', icon: '📋' },
                        { label: 'Snippets', key: 'snippets', icon: '✂️' },
                        { label: 'Claves API', key: 'api_keys', icon: '🔑' },
                        { label: 'Listas', key: 'lists', icon: '📝' },
                        { label: 'Integraciones', key: 'integration_settings', icon: '🔗' },
                        { label: 'Números WhatsApp', key: 'whatsapp_phone_numbers', icon: '📱' },
                        { label: 'Notas', key: 'notes', icon: '📒' },
                        { label: 'Notificaciones', key: 'scheduled_notifications', icon: '🔔' },
                        { label: 'Enrollments', key: 'workflow_enrollments', icon: '📥' },
                        { label: 'Status mensajes', key: 'message_statuses', icon: '📊' },
                      ].map(item => (
                        <div key={item.key} className="bg-slate-50 rounded-lg p-2.5 flex items-center gap-2">
                          <span className="text-base">{item.icon}</span>
                          <div>
                            <p className="text-xs text-slate-500">{item.label}</p>
                            <p className="text-sm font-bold text-slate-800">{formatCount(preview.counts?.[item.key])}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Members detail */}
                    {preview.members && preview.members.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-slate-600 mb-2">Miembros afectados (cuentas conservadas):</p>
                        <div className="space-y-1">
                          {preview.members.map(m => (
                            <div key={m.id} className="flex items-center gap-2 text-xs text-slate-600">
                              <span className={`w-2 h-2 rounded-full ${m.is_creator ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                              {m.name || m.email} ({m.role}){m.is_creator && ' - Creador'}{m.has_other_organizations ? ' - Tiene otras organizaciones' : ''}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Phone numbers detail */}
                    {preview.phone_numbers && preview.phone_numbers.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-slate-600 mb-2">Números de WhatsApp que serán eliminados:</p>
                        <div className="space-y-1">
                          {preview.phone_numbers.map(p => (
                            <div key={p.id} className="flex items-center gap-2 text-xs text-slate-600">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span className="font-mono font-medium">{p.display_phone_number}</span>
                              {p.label && <span className="text-slate-400">· {p.label}</span>}
                              {p.is_default && <span className="text-emerald-600 font-medium">· Principal</span>}
                              {p.waba_id && <span className="text-slate-400">· WABA: {p.waba_id}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : preview && !preview.success ? (
                  <div className="mb-4 text-sm text-red-600">{preview.message || preview.error}</div>
                ) : null}

                <button
                  onClick={() => startDeletion('delete_organization')}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Trash2 size={16} />
                  Eliminar toda la organización
                </button>
              </div>
            )}
          </div>
        )}

        {/* Non-creator users - only see Level 1 */}
        {!isCreator && currentUser.role !== 'admin' && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
            <Shield className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-700 mb-1">Permisos limitados</h3>
            <p className="text-sm text-slate-500">
              Como usuario {currentUser.role}, puedes anonimizar tus datos personales. 
              Para eliminar tu cuenta completa o datos de la organización, contacta al administrador creador.
            </p>
          </div>
        )}

        {/* Link to public data deletion policy */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-slate-600" />
            <div>
              <h3 className="font-semibold text-slate-700 text-sm">Política de Eliminación de Datos</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Consulta nuestra guía pública sobre cómo se gestionan y eliminan los datos de usuario.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigateTo('/eliminacion-de-datos')}
            className="mt-3 text-sm text-emerald-600 font-medium hover:text-emerald-700 flex items-center gap-1"
          >
            Ver política de eliminación de datos <ExternalLink size={14} />
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* CONFIRMATION MODAL */}
      {/* ═══════════════════════════════════════════════════ */}
      {confirmation && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setConfirmation(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={`px-6 py-4 ${
              confirmation.level === 'delete_organization' ? 'bg-red-600' : 
              confirmation.level === 'delete_member' ? 'bg-orange-600' : 'bg-blue-600'
            }`}>
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-white" />
                <h2 className="text-lg font-bold text-white">
                  {confirmation.level === 'anonymize' && 'Confirmar Anonimización'}
                  {confirmation.level === 'delete_member' && 'Confirmar Eliminación de Miembro'}
                  {confirmation.level === 'delete_organization' && 'Confirmar Eliminación Total'}
                </h2>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5">
              {deletionResult ? (
                // Show result
                <div className="text-center py-4">
                  {deletionResult.success ? (
                    <>
                      <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-3" />
                      <h3 className="text-lg font-bold text-slate-800 mb-2">
                        {confirmation.level === 'delete_organization' ? 'Organización eliminada' :
                         confirmation.level === 'delete_member' ? 'Miembro eliminado' :
                         'Datos anonimizados'}
                      </h3>
                      <p className="text-sm text-slate-600">{deletionResult.message}</p>
                      {confirmation.level === 'delete_organization' && (
                        <p className="text-xs text-slate-400 mt-2">Redirigiendo al inicio de sesión...</p>
                      )}
                      {confirmation.level === 'anonymize' && (
                        <p className="text-xs text-slate-400 mt-2">Cerrando sesión...</p>
                      )}
                    </>
                  ) : (
                    <>
                      <XCircle className="w-16 h-16 text-red-500 mx-auto mb-3" />
                      <h3 className="text-lg font-bold text-slate-800 mb-2">Error</h3>
                      <p className="text-sm text-red-600">{deletionResult.error || deletionResult.message}</p>
                    </>
                  )}
                </div>
              ) : (
                // Show confirmation form  
                <>
                  <p className="text-sm text-slate-600 mb-4">
                    {confirmation.level === 'anonymize' && (
                      <>Estás a punto de anonimizar tu información personal. Tu perfil quedará como "Usuario Eliminado" y se desvinculará de todos los datos.</>
                    )}
                    {confirmation.level === 'delete_member' && (
                      <>Estás a punto de eliminar permanentemente la cuenta de <strong>{confirmation.targetUserName}</strong> y todos sus datos asociados.</>
                    )}
                    {confirmation.level === 'delete_organization' && (
                      <>Estás a punto de eliminar <strong>TODA la organización</strong>, incluyendo todos los datos, cuentas de equipo y tu propia cuenta. Esta acción es <strong>completamente irreversible</strong>.</>
                    )}
                  </p>

                  <div className="bg-slate-50 rounded-lg p-4 mb-4">
                    <p className="text-xs text-slate-500 mb-2">
                      Escribe <strong className="text-slate-800">{getConfirmPhrase(confirmation.level)}</strong> para confirmar:
                    </p>
                    <input
                      type="text"
                      value={confirmation.confirmText}
                      onChange={(e) => setConfirmation(prev => prev ? {
                        ...prev,
                        confirmText: e.target.value,
                        isConfirmed: e.target.value === getConfirmPhrase(confirmation.level),
                      } : null)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                      placeholder={getConfirmPhrase(confirmation.level)}
                      autoFocus
                    />
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              {!deletionResult && (
                <>
                  <button
                    onClick={() => setConfirmation(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
                    disabled={isDeleting}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={executeDeletion}
                    disabled={!confirmation.isConfirmed || isDeleting}
                    className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center gap-2 ${
                      confirmation.isConfirmed && !isDeleting
                        ? confirmation.level === 'delete_organization' 
                          ? 'bg-red-600 hover:bg-red-700'
                          : confirmation.level === 'delete_member'
                            ? 'bg-orange-600 hover:bg-orange-700'
                            : 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-slate-300 cursor-not-allowed'
                    }`}
                  >
                    {isDeleting ? (
                      <><Loader2 size={16} className="animate-spin" /> Procesando...</>
                    ) : (
                      <><Trash2 size={16} /> Confirmar eliminación</>
                    )}
                  </button>
                </>
              )}
              {deletionResult && !deletionResult.success && (
                <button
                  onClick={() => setConfirmation(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataDeletionScreen;
