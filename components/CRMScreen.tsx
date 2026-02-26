
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Plus, Search, MoreHorizontal, X, Database, Trash2, Edit2, Clock, MessageCircle, Send, Mail, CheckSquare, Square, Users, UserPlus, Filter, List, RefreshCw } from 'lucide-react';
import { MOCK_PIPELINES } from '../constants';
import { CRMContact, CustomProperty, Template, Campaign, CRMList, CRMFilter, User, Conversation, LeadAssignment } from '../types';
import { campaignService } from '../services/campaignService';
import { templateService } from '../services/templateService';
import { listService } from '../services/listService';
import { teamService } from '../services/teamService';
import LoadingOverlay from './LoadingOverlay';
import ResultOverlay from './ResultOverlay';
import EmailEditor from './EmailEditor';
import { supabase } from '../services/supabaseClient';

interface CRMScreenProps {
    contacts: CRMContact[];
    onSaveContact: (contact: CRMContact) => void;
    properties: CustomProperty[];
    onAddProperty: (prop: CustomProperty) => void;
    onDeleteContact?: (id: string) => void;
    onDeleteProperty?: (id: string) => void;
    onChatSelect?: (contact: CRMContact) => void;
    organizationId: string;
    currentUser?: User;
    conversations?: Conversation[];
    teamMembers?: User[];
}

const CRMScreen: React.FC<CRMScreenProps> = ({ contacts, onSaveContact, properties: customProperties, onAddProperty, onDeleteContact, onDeleteProperty, onChatSelect, organizationId, currentUser, conversations = [], teamMembers: externalTeamMembers = [] }) => {
  const [activeTab, setActiveTab] = useState<'contacts' | 'pipeline' | 'properties' | 'campaigns' | 'lists' | 'assignments'>('contacts');
  const [lists, setLists] = useState<CRMList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [showListNameModal, setShowListNameModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showAddToListModal, setShowAddToListModal] = useState(false);
  const [contactToUpdateList, setContactToUpdateList] = useState<string | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showSelectedPreview, setShowSelectedPreview] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
    const [showListDetailModal, setShowListDetailModal] = useState(false);
    const [currentListDetail, setCurrentListDetail] = useState<CRMList | null>(null);
    const [currentListMatchingContacts, setCurrentListMatchingContacts] = useState<CRMContact[]>([]);
    const [importedRows, setImportedRows] = useState<any[]>([]);
    const [importHeaders, setImportHeaders] = useState<string[]>([]);
    const [importMapping, setImportMapping] = useState<Record<string, string>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Import validation: detect existing contacts by phone
    const [existingImportCount, setExistingImportCount] = useState<number>(0);
    const [existingImportPreview, setExistingImportPreview] = useState<CRMContact[]>([]);
    const [updateExistingOnImport, setUpdateExistingOnImport] = useState<boolean>(false);
    const [isCampaignSubmitting, setIsCampaignSubmitting] = useState<boolean>(false);
    const [resultNotice, setResultNotice] = useState<{ show: boolean; status: 'success' | 'error' | 'info' | 'warning'; title?: string; message?: string }>({ show: false, status: 'info' });
    const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
    const [actionLoadingMsg, setActionLoadingMsg] = useState<string>('');

    // === NEW: List creation from Lists tab ===
    const [showCreateListModal, setShowCreateListModal] = useState(false);
    const [createListName, setCreateListName] = useState('');
    const [createListFilters, setCreateListFilters] = useState<Array<{ field: string; comparison: string; value: string }>>([]);
    const [createListManualIds, setCreateListManualIds] = useState<Set<string>>(new Set());
    const [createListSearch, setCreateListSearch] = useState('');
    const [listSearchTerm, setListSearchTerm] = useState('');

    // === NEW: Manager assignment state ===
    const [teamMembers, setTeamMembers] = useState<User[]>(externalTeamMembers);
    const [leadAssignments, setLeadAssignments] = useState<LeadAssignment[]>([]);
    const [selectedAssignUser, setSelectedAssignUser] = useState<string>('');
    const [assignContactSearch, setAssignContactSearch] = useState('');
    const [assignConvoSearch, setAssignConvoSearch] = useState('');
    const [selectedAssignContacts, setSelectedAssignContacts] = useState<Set<string>>(new Set());
    const [selectedAssignConvos, setSelectedAssignConvos] = useState<Set<string>>(new Set());
    const [assignMode, setAssignMode] = useState<'contacts' | 'conversations'>('contacts');
    const [assignAllConversations, setAssignAllConversations] = useState(false);

    const isManagerOrAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager';
    const communityMembers = useMemo(() => teamMembers.filter(m => m.role === 'community'), [teamMembers]);

    const normalizePhone = (val?: string | number) => {
        if (!val && val !== 0) return '';
        return String(val).replace(/\D/g, '');
    };

    const findContactByPhone = (phone?: string) => {
        if (!phone) return undefined;
        const p = normalizePhone(phone);
        return contacts.find(c => normalizePhone(c.phone) === p);
    };
    // --- EXPORT TO EXCEL ---
    const handleExportExcel = () => {
        // Build headers
        const baseHeaders = ['name', 'email', 'phone', 'company', 'pipelineStageId'];
        const propertyHeaders = customProperties.map(p => p.id);
        const headers = [...baseHeaders, ...propertyHeaders];
        // Build data
        const data = contacts.map(c => {
            const row: any = {
                name: c.name,
                email: c.email,
                phone: c.phone,
                company: c.company,
                pipelineStageId: c.pipelineStageId
            };
            customProperties.forEach(p => {
                row[p.id] = c.properties?.[p.id] || '';
            });
            return row;
        });
        // Create worksheet and workbook
        const ws = XLSX.utils.json_to_sheet(data, { header: headers });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
        // Download
        XLSX.writeFile(wb, 'crm_contacts.xlsx');
    };

    // --- IMPORT FROM EXCEL ---
    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsActionLoading(true);
        setActionLoadingMsg('Procesando archivo...');
        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
            if (data.length === 0) return;
            const headers = Object.keys(data[0]);
            setImportedRows(data);
            setImportHeaders(headers);
            // Auto-mapping
            const mapping: Record<string, string> = {};
            // Map base fields
            const baseFields = [
                { key: 'name', label: 'Name' },
                { key: 'email', label: 'Email' },
                { key: 'phone', label: 'Phone' },
                { key: 'company', label: 'Company' },
                { key: 'pipelineStageId', label: 'Stage' }
            ];
            baseFields.forEach(f => {
                const found = headers.find(h => h.toLowerCase().replace(/\s/g, '') === f.key.toLowerCase());
                if (found) mapping[f.key] = found;
            });
            // Map custom properties
            customProperties.forEach(p => {
                const found = headers.find(h => h.toLowerCase().replace(/\s/g, '') === p.id.toLowerCase());
                if (found) mapping[p.id] = found;
            });
            setImportMapping(mapping);
            // Detect existing contacts by phone (use phone as index)
            if (mapping['phone']) {
                const seen = new Map<string, CRMContact>();
                data.forEach((row: any) => {
                    const phoneVal = row[mapping['phone']];
                    const existing = findContactByPhone(phoneVal);
                    if (existing) seen.set(existing.id, existing);
                });
                setExistingImportCount(seen.size);
                setExistingImportPreview(Array.from(seen.values()).slice(0, 10));
                setUpdateExistingOnImport(false);
            } else {
                setExistingImportCount(0);
                setExistingImportPreview([]);
                setUpdateExistingOnImport(false);
            }
            // Limpiar input file para permitir recarga del mismo archivo
            if (fileInputRef.current) fileInputRef.current.value = '';
            // Mostrar modal solo si hay headers
                        setTimeout(() => {
                            setIsActionLoading(false);
                            setActionLoadingMsg('');
                            setShowImportModal(true);
                        }, 0);
        };
                reader.onerror = () => {
                    setIsActionLoading(false);
                    setActionLoadingMsg('');
                    setResultNotice({ show: true, status: 'error', title: 'Error al leer archivo', message: 'No se pudo procesar el Excel.' });
                };
        reader.readAsBinaryString(file);
    };

        const handleImportSubmit = () => {
                setIsActionLoading(true);
                setActionLoadingMsg('Importando contactos...');
        // Map each row to CRMContact — respect updateExistingOnImport (use phone as index)
                try {
                    importedRows.forEach(row => {
            const phoneVal = importMapping['phone'] ? row[importMapping['phone']] : undefined;
            const existing = findContactByPhone(phoneVal);

            if (existing && !updateExistingOnImport) {
                // Skip creating/updating this contact
                return;
            }

                        const contactId = existing ? existing.id : crypto.randomUUID();

            const baseProperties: Record<string, any> = existing ? { ...(existing.properties || {}) } : {};

            const contact: CRMContact = {
                id: contactId,
                name: row[importMapping['name']] || (existing ? existing.name : ''),
                email: row[importMapping['email']] || (existing ? existing.email : ''),
                phone: row[importMapping['phone']] || (existing ? existing.phone : ''),
                company: row[importMapping['company']] || (existing ? existing.company : ''),
                pipelineStageId: row[importMapping['pipelineStageId']] || (existing ? existing.pipelineStageId : 'lead'),
                properties: baseProperties
            };

            customProperties.forEach(p => {
                if (importMapping[p.id]) {
                    contact.properties[p.id] = row[importMapping[p.id]];
                }
            });

            onSaveContact(contact);
                    });
                } catch (err) {
                    console.error('Import error:', err);
                    setResultNotice({ show: true, status: 'error', title: 'Error de importación', message: 'Ocurrió un error al importar los contactos.' });
                }

        setShowImportModal(false);
        setImportedRows([]);
        setImportHeaders([]);
        setImportMapping({});
        setExistingImportCount(0);
        setExistingImportPreview([]);
        setUpdateExistingOnImport(false);
                setIsActionLoading(false);
                setActionLoadingMsg('');
                setResultNotice({ show: true, status: 'success', title: 'Importación completada', message: 'Los contactos se han importado correctamente.' });
    };
  const [selectedContact, setSelectedContact] = useState<CRMContact | null>(null);
  const [contactForm, setContactForm] = useState({
      id: '',
      name: '', email: '', phone: '', company: '', pipelineStageId: 'lead', properties: {} as Record<string, any>
  });
  // Filtros avanzados
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<Array<{ field: string; comparison: string; value: string }>>([]);
  const [showFilters, setShowFilters] = useState(false);
    // Menú de acciones anclado
    const [actionsMenu, setActionsMenu] = useState<{ contactId: string; top: number; left: number } | null>(null);  
  // Campañas
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignForm, setCampaignForm] = useState<Partial<Campaign>>({ type: 'whatsapp', recipientIds: [] });
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaignError, setCampaignError] = useState<string>('');
  const [isGmailConfigured, setIsGmailConfigured] = useState<boolean>(true);
  const [isWhatsAppConfigured, setIsWhatsAppConfigured] = useState<boolean>(true);

  useEffect(() => {
    async function checkChannelConfigs() {
      try {
        const { data: gmailData } = await supabase
          .from('integration_settings')
          .select('credentials')
          .eq('organization_id', organizationId)
          .eq('service_name', 'gmail')
          .single();
        setIsGmailConfigured(!!gmailData?.credentials?.access_token);
      } catch {
        setIsGmailConfigured(false);
      }
      try {
        const { data: waData } = await supabase
          .from('integration_settings')
          .select('credentials')
          .eq('organization_id', organizationId)
          .eq('service_name', 'whatsapp')
          .single();
        setIsWhatsAppConfigured(!!waData?.credentials?.phone_id && !!waData?.credentials?.access_token);
      } catch {
        setIsWhatsAppConfigured(false);
      }
    }
    checkChannelConfigs();
  }, [organizationId]);

  const filterContactsByCriteria = (contactList: CRMContact[], searchTermStr: string, filterList: CRMFilter[]) => {
    return contactList.filter(contact => {
      // 1. Filtro de búsqueda rápida
      if (searchTermStr) {
          const s = searchTermStr.toLowerCase();
          const matchesSearch = 
              contact.name.toLowerCase().includes(s) ||
              (contact.email && contact.email.toLowerCase().includes(s)) ||
              (contact.company && contact.company.toLowerCase().includes(s)) ||
              (contact.phone && contact.phone.includes(s));
          
          if (!matchesSearch) return false;
      }
  
      // 2. Aplica todos los filtros avanzados (AND)
      return filterList.every(f => {
          if (!f.field || f.value === '') return true;
          
          let val: any = (contact as any)[f.field];
          if (val === undefined) {
              val = contact.properties?.[f.field];
          }
  
          if (val === undefined || val === null) return false;
  
          const strVal = val.toString().toLowerCase();
          const filterVal = f.value.toString().toLowerCase();
  
          switch (f.comparison) {
              case 'equals': return strVal === filterVal;
              case 'contains': return strVal.includes(filterVal);
              case 'startsWith': return strVal.startsWith(filterVal);
              case 'endsWith': return strVal.endsWith(filterVal);
              case 'gt': return !isNaN(Number(val)) ? Number(val) > Number(f.value) : val > f.value;
              case 'lt': return !isNaN(Number(val)) ? Number(val) < Number(f.value) : val < f.value;
              default: return true;
          }
      });
    });
  };

  const insertVariable = (variable: string) => {
    if (campaignForm.type === 'email') {
      setCampaignForm({
        ...campaignForm,
        emailBody: (campaignForm.emailBody || '') + `{{${variable}}}`
      });
    }
  };

  // Filtrado de contactos
  const filteredContacts = filterContactsByCriteria(contacts, searchTerm, filters as CRMFilter[]);
  
  // Cargar campaigns, templates y lists al montar
  useEffect(() => {
    const loadData = async () => {
      if (!organizationId) {
        console.error('organizationId is required');
        return;
      }
      
      try {
        const [campaignsData, listsData] = await Promise.all([
          campaignService.getCampaigns(organizationId),
          listService.getLists(organizationId)
        ]);
        setCampaigns(campaignsData || []);
        setLists(listsData || []);

        // Load team members and assignments for manager view
        if (isManagerOrAdmin) {
          try {
            const [members, assignments] = await Promise.all([
              teamService.getTeamMembers(organizationId),
              teamService.getLeadAssignments(organizationId)
            ]);
            setTeamMembers(members);
            setLeadAssignments(assignments);
          } catch (err) {
            console.error('Error loading team data:', err);
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
        setCampaigns([]);
        setLists([]);
      }
      
      await loadTemplates();
    };
    
    loadData();
  }, [organizationId]);

  const handleSaveCurrentFiltersAsList = async () => {
    if (!newListName.trim()) return;
    
    // Filtrar los contactos manualmente seleccionados para evitar duplicados
    // Solo incluir en manualContactIds los que NO coinciden con los filtros
    const matchingByFilters = filterContactsByCriteria(contacts, '', filters as CRMFilter[]).map(c => c.id);
    const nonDuplicateManualIds = Array.from(selectedContacts).filter((id): id is string => !matchingByFilters.includes(id as string));
    
    const newList: CRMList = {
        id: crypto.randomUUID(),
        name: newListName,
        filters: [...filters] as CRMFilter[],
        manualContactIds: nonDuplicateManualIds,
        createdAt: new Date()
    };
    await listService.saveList(newList, organizationId);
    const updatedLists = await listService.getLists(organizationId);
    setLists(updatedLists || []);
    setShowListNameModal(false);
    setNewListName('');
    setResultNotice({ show: true, status: 'success', title: 'Lista guardada', message: 'La lista se creó exitosamente.' });
  };

  // === NEW: Create list directly from Lists tab ===
  const handleCreateListFromTab = async () => {
    if (!createListName.trim()) return;
    setIsActionLoading(true);
    setActionLoadingMsg('Creando lista...');
    
    try {
      const matchingByFilters = createListFilters.length > 0 
        ? filterContactsByCriteria(contacts, '', createListFilters as CRMFilter[]).map(c => c.id)
        : [];
      const manualIds = Array.from(createListManualIds).filter(id => !matchingByFilters.includes(id));

      const newList: CRMList = {
        id: crypto.randomUUID(),
        name: createListName,
        filters: [...createListFilters] as CRMFilter[],
        manualContactIds: manualIds,
        createdAt: new Date()
      };
      await listService.saveList(newList, organizationId);
      const updatedLists = await listService.getLists(organizationId);
      setLists(updatedLists || []);
      setShowCreateListModal(false);
      setCreateListName('');
      setCreateListFilters([]);
      setCreateListManualIds(new Set());
      setCreateListSearch('');
      setResultNotice({ show: true, status: 'success', title: 'Lista creada', message: `La lista "${newList.name}" se creó exitosamente.` });
    } catch (err) {
      console.error('Error creating list:', err);
      setResultNotice({ show: true, status: 'error', title: 'Error', message: 'No se pudo crear la lista.' });
    } finally {
      setIsActionLoading(false);
      setActionLoadingMsg('');
    }
  };

  // Get contact count for a list (including both filter matches and manual)
  const getListContactCount = useCallback((list: CRMList): number => {
    const inactive = new Set(list.inactiveContactIds || []);
    const matchingContacts = filterContactsByCriteria(contacts, '', list.filters as CRMFilter[]);
    const activeMatching = matchingContacts.filter(c => !inactive.has(c.id));
    const manualCount = (list.manualContactIds || []).filter(
      id => !inactive.has(id) && !matchingContacts.find(c => c.id === id) && contacts.find(c => c.id === id)
    ).length;
    return activeMatching.length + manualCount;
  }, [contacts]);

  // === NEW: Assignment handlers for Manager ===
  const handleAssignContacts = async () => {
    if (!selectedAssignUser || selectedAssignContacts.size === 0 || !currentUser) return;
    setIsActionLoading(true);
    setActionLoadingMsg('Asignando contactos...');
    try {
      await teamService.assignMultipleLeadsToUser(
        selectedAssignUser,
        Array.from(selectedAssignContacts),
        currentUser.id,
        organizationId
      );
      const updatedAssignments = await teamService.getLeadAssignments(organizationId);
      setLeadAssignments(updatedAssignments);
      setSelectedAssignContacts(new Set());
      setResultNotice({ show: true, status: 'success', title: 'Contactos asignados', message: `Se asignaron ${selectedAssignContacts.size} contactos correctamente.` });
    } catch (err) {
      console.error('Error assigning contacts:', err);
      setResultNotice({ show: true, status: 'error', title: 'Error', message: 'No se pudieron asignar los contactos.' });
    } finally {
      setIsActionLoading(false);
      setActionLoadingMsg('');
    }
  };

  const handleUnassignContact = async (userId: string, contactId: string) => {
    setIsActionLoading(true);
    setActionLoadingMsg('Eliminando asignación...');
    try {
      await teamService.unassignLeadFromUser(userId, contactId, organizationId);
      const updatedAssignments = await teamService.getLeadAssignments(organizationId);
      setLeadAssignments(updatedAssignments);
      setResultNotice({ show: true, status: 'success', title: 'Asignación eliminada', message: 'El contacto fue desasignado correctamente.' });
    } catch (err) {
      console.error('Error unassigning contact:', err);
      setResultNotice({ show: true, status: 'error', title: 'Error', message: 'No se pudo eliminar la asignación.' });
    } finally {
      setIsActionLoading(false);
      setActionLoadingMsg('');
    }
  };

  const handleAssignConversations = async () => {
    if (!selectedAssignUser) return;
    setIsActionLoading(true);
    setActionLoadingMsg('Asignando conversaciones...');
    try {
      if (assignAllConversations) {
        // Assign all conversations
        const allConvoIds = conversations.map(c => c.id);
        await teamService.assignMultipleConversations(allConvoIds, selectedAssignUser);
      } else if (selectedAssignConvos.size > 0) {
        await teamService.assignMultipleConversations(Array.from(selectedAssignConvos), selectedAssignUser);
      }
      setSelectedAssignConvos(new Set());
      setAssignAllConversations(false);
      setResultNotice({ show: true, status: 'success', title: 'Conversaciones asignadas', message: 'Las conversaciones fueron asignadas correctamente.' });
    } catch (err) {
      console.error('Error assigning conversations:', err);
      setResultNotice({ show: true, status: 'error', title: 'Error', message: 'No se pudieron asignar las conversaciones.' });
    } finally {
      setIsActionLoading(false);
      setActionLoadingMsg('');
    }
  };

  const applyListFilters = (list: CRMList) => {
    setFilters(list.filters.map(f => ({ field: f.field, comparison: f.comparison, value: f.value.toString() })));
    setSelectedListId(list.id);
    
    // Al aplicar una lista, combinamos los contactos filtrados con los manuales
    // Excluimos los contactos inactivos
    const inactive = new Set(list.inactiveContactIds || []);
    const matchingContacts = filterContactsByCriteria(contacts, '', list.filters as CRMFilter[]);
    const activeMatching = matchingContacts.filter(c => !inactive.has(c.id)).map(c => c.id);
    const manualIds = (list.manualContactIds || []).filter(id => !inactive.has(id));
    const allIds = new Set([...Array.from(selectedContacts), ...activeMatching, ...manualIds]);
    setSelectedContacts(allIds);
    
    setActiveTab('contacts');
  };

  const handleDeleteList = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if(confirm("Are you sure you want to delete this list?")) {
        await listService.deleteList(id, organizationId);
        const updatedLists = await listService.getLists(organizationId);
        setLists(updatedLists || []);
        if (selectedListId === id) setSelectedListId(null);
    }
  };

    const openListDetail = (list: CRMList) => {
        setCurrentListDetail({ ...list });
        const matching = filterContactsByCriteria(contacts, '', list.filters as CRMFilter[]);
        setCurrentListMatchingContacts(matching);
        setShowListDetailModal(true);
    };

    const toggleManualForContact = (contactId: string) => {
        if (!currentListDetail) return;
        
        // Toggle inactive status del contacto
        const inactive = new Set(currentListDetail.inactiveContactIds || []);
        if (inactive.has(contactId)) {
            inactive.delete(contactId);
        } else {
            inactive.add(contactId);
        }
        currentListDetail.inactiveContactIds = Array.from(inactive);
        setCurrentListDetail({ ...currentListDetail });
    };

    const handleSaveListEdits = async () => {
        if (!currentListDetail) return;
        setIsActionLoading(true);
        setActionLoadingMsg('Guardando lista...');
        await listService.saveList(currentListDetail, organizationId);
        const updatedLists = await listService.getLists(organizationId);
        setLists(updatedLists || []);
        setShowListDetailModal(false);
        setCurrentListDetail(null);
        setIsActionLoading(false);
        setActionLoadingMsg('');
        setResultNotice({ show: true, status: 'success', title: 'Lista actualizada', message: 'Los cambios se guardaron correctamente.' });
    };

    const handleDeleteListFromModal = async () => {
        if (!currentListDetail) return;
        if (confirm('Eliminar lista "' + currentListDetail.name + '" ?')) {
            setIsActionLoading(true);
            setActionLoadingMsg('Eliminando lista...');
            await listService.deleteList(currentListDetail.id, organizationId);
            const updatedLists = await listService.getLists(organizationId);
            setLists(updatedLists || []);
            setShowListDetailModal(false);
            setCurrentListDetail(null);
            setIsActionLoading(false);
            setActionLoadingMsg('');
            setResultNotice({ show: true, status: 'success', title: 'Lista eliminada', message: 'La lista fue eliminada correctamente.' });
        }
    };

    const handleAddContactToList = async (listId: string) => {
    if (!contactToUpdateList) return;
    const list = lists.find(l => l.id === listId);
    if (list) {
        const contact = contacts.find(c => c.id === contactToUpdateList);
        if (!contact) return;

        // Verificar si el contacto ya coincide con los filtros de la lista
        const matchesFilters = filterContactsByCriteria([contact], '', list.filters as CRMFilter[]).length > 0;
        if (matchesFilters) {
            alert(`Este contacto ya está en la lista por los filtros aplicados.`);
            setShowAddToListModal(false);
            setContactToUpdateList(null);
            return;
        }

        // Verificar si ya está en la lista manualmente
        const manualContactIds = list.manualContactIds || [];
        if (manualContactIds.includes(contactToUpdateList)) {
            alert(`Este contacto ya está en la lista.`);
            setShowAddToListModal(false);
            setContactToUpdateList(null);
            return;
        }

        // Agregar si no está duplicado
        list.manualContactIds = [...manualContactIds, contactToUpdateList];
                setIsActionLoading(true);
                setActionLoadingMsg('Actualizando lista...');
        await listService.saveList(list, organizationId);
        const updatedLists = await listService.getLists(organizationId);
        setLists(updatedLists || []);
                setIsActionLoading(false);
                setActionLoadingMsg('');
                setResultNotice({ show: true, status: 'success', title: 'Contacto añadido', message: `Se añadió el contacto a ${list.name}.` });
    }
    setShowAddToListModal(false);
    setContactToUpdateList(null);
  };

  const loadTemplates = async () => {
    try {
      const tpls = await templateService.getTemplates(organizationId);
      setTemplates(tpls.filter(t => t.status === 'approved'));
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  };

  const openActionsMenu = (e: React.MouseEvent<HTMLButtonElement>, contactId: string) => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
        const top = rect.bottom + window.scrollY + 8;
        const left = rect.right + window.scrollX - 160; // ancho aproximado del menú
        setActionsMenu({ contactId, top, left });
    };
    const closeActionsMenu = () => setActionsMenu(null);
  const [contactFormError, setContactFormError] = useState<string>('');
  
  const [showPropModal, setShowPropModal] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState<CustomProperty['type']>('text');
  const [newPropOptions, setNewPropOptions] = useState<string>('');

  const handleOpenAddContact = () => {
      setContactForm({ id: Date.now().toString(), name: '', email: '', phone: '', company: '', pipelineStageId: 'lead', properties: {} });
      setShowContactModal(true);
  };

  const handleEditContactFromModal = () => {
      if (!selectedContact) return;
      setContactForm({
          id: selectedContact.id,
          name: selectedContact.name,
          email: selectedContact.email,
          phone: selectedContact.phone,
          company: selectedContact.company,
          pipelineStageId: selectedContact.pipelineStageId,
          properties: selectedContact.properties
      });
      setSelectedContact(null);
      setShowContactModal(true);
  };

    const handleSaveContact = () => {
            if (!contactForm.name) {
                setContactFormError('El nombre es obligatorio.');
                return;
            }
            if (!contactForm.phone) {
                setContactFormError('El teléfono es obligatorio.');
                return;
            }
            if (!contactForm.pipelineStageId) {
                setContactFormError('El Stage es obligatorio.');
                return;
            }
            setContactFormError('');
            const newContact: CRMContact = {
                    id: contactForm.id,
                    name: contactForm.name,
                    email: contactForm.email,
                    phone: contactForm.phone,
                    company: contactForm.company,
                    pipelineStageId: contactForm.pipelineStageId,
                    properties: contactForm.properties
            };
            onSaveContact(newContact);
            setShowContactModal(false);
    };

  const handleCreateProperty = () => {
      if(!newPropName.trim()) return;
      const id = newPropName.toLowerCase().replace(/\s+/g, '_');
      const options = newPropType === 'select' && newPropOptions.trim() 
          ? newPropOptions.split(',').map(o => o.trim()).filter(o => o)
          : undefined;
      const newProp: CustomProperty = { id, name: newPropName, type: newPropType, options };
      onAddProperty(newProp);
      setShowPropModal(false);
      setNewPropName('');
      setNewPropOptions('');
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(confirm("Are you sure?")) onDeleteContact?.(id);
  };

  const getTimeAgo = (date?: Date) => {
      if (!date) return 'Just now';
      const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
      let interval = seconds / 31536000;
      if (interval > 1) return Math.floor(interval) + "y ago";
      interval = seconds / 2592000;
      if (interval > 1) return Math.floor(interval) + "mo ago";
      interval = seconds / 86400;
      if (interval > 1) return Math.floor(interval) + "d ago";
      interval = seconds / 3600;
      if (interval > 1) return Math.floor(interval) + "h ago";
      return Math.floor(seconds / 60) + "m ago";
  };

  // Funciones para campañas
  const handleOpenCampaignModal = () => {
    setCampaignForm({ type: 'whatsapp', recipientIds: Array.from(selectedContacts) });
    setCampaignError('');
    setShowCampaignModal(true);
  };

  const toggleContactSelection = (contactId: string) => {
    const newSelection = new Set(selectedContacts);
    if (newSelection.has(contactId)) {
      newSelection.delete(contactId);
    } else {
      newSelection.add(contactId);
    }
    setSelectedContacts(newSelection);
  };

  const selectAllContacts = () => {
    if (selectedContacts.size === filteredContacts.length && filteredContacts.length > 0) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const handleSendCampaign = async () => {
        if (isCampaignSubmitting) {
            return; // Prevent double submission
        }
    if (!campaignForm.name) {
      setCampaignError('El nombre de la campaña es obligatorio.');
      return;
    }
    if (selectedContacts.size === 0) {
      setCampaignError('Debes seleccionar al menos un contacto.');
      return;
    }
    if (campaignForm.type === 'whatsapp' && !isWhatsAppConfigured) {
      setCampaignError('WhatsApp no está configurado. Ve a Configuración → Channels → WhatsApp para conectar tu cuenta.');
      return;
    }
    if (campaignForm.type === 'email' && !isGmailConfigured) {
      setCampaignError('Gmail no está configurado. Ve a Configuración → Channels → Gmail para conectar tu cuenta.');
      return;
    }
    if (campaignForm.type === 'whatsapp' && !campaignForm.templateId) {
      setCampaignError('Debes seleccionar un template para WhatsApp.');
      return;
    }
    if (campaignForm.type === 'email' && (!campaignForm.emailSubject || !campaignForm.emailBody)) {
      setCampaignError('El asunto y el cuerpo del email son obligatorios.');
      return;
    }

    const selectedTemplate = campaignForm.templateId ? templates.find(t => t.id === campaignForm.templateId) : null;

    // Obtener zona horaria del usuario
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // scheduledAt ya es un Date correcto (JS lo almacena internamente en UTC)
    // No hace falta conversión adicional — .toISOString() en el service dará UTC correcto
    const scheduledAtUTC: Date | undefined = campaignForm.scheduledAt
      ? new Date(campaignForm.scheduledAt)
      : undefined;

    const newCampaign: Campaign = {
      id: crypto.randomUUID(),
      name: campaignForm.name!,
      type: campaignForm.type!,
      status: campaignForm.scheduledAt ? 'scheduled' : 'sending',
      recipientCount: selectedContacts.size,
      recipientIds: Array.from(selectedContacts),
      templateId: campaignForm.templateId,
      templateName: selectedTemplate?.name,
      templateLanguage: selectedTemplate?.language,
      emailSubject: campaignForm.emailSubject,
      emailBody: campaignForm.emailBody || selectedTemplate?.body,
      scheduledAt: scheduledAtUTC,
      createdAt: new Date()
    };

    try {
            setIsCampaignSubmitting(true);
      await campaignService.createCampaign(newCampaign, organizationId);
      
      // Si está programada, solo guardar. Si no, enviar inmediatamente.
      const recipients = contacts.filter(c => selectedContacts.has(c.id));
      if (campaignForm.type === 'whatsapp') {
        await campaignService.sendWhatsAppCampaign(newCampaign, recipients, organizationId);
      } else {
        await campaignService.sendEmailCampaign(newCampaign, recipients, campaignForm.emailSubject!, campaignForm.emailBody!, organizationId);
      }

      const updatedCampaigns = await campaignService.getCampaigns(organizationId);
      setCampaigns(updatedCampaigns || []);
      setShowCampaignModal(false);
      setSelectedContacts(new Set());
      
      if (campaignForm.scheduledAt) {
        setResultNotice({ 
          show: true, 
          status: 'success', 
          title: 'Campaña programada', 
          message: `Campaña programada para ${new Date(campaignForm.scheduledAt).toLocaleString('es-ES')} (tu zona horaria: ${userTimezone})`
        });
      } else {
        setResultNotice({ show: true, status: 'success', title: 'Campaña enviada', message: 'La campaña se procesó correctamente.' });
      }
    } catch (err: any) {
      console.error('Error sending campaign:', err);
      const isGmailError = err?.message?.toLowerCase().includes('gmail');
      if (isGmailError) {
        setCampaignError('Gmail no está configurado. Conecta tu cuenta de Google en Configuración > Channels > Gmail.');
        setResultNotice({ show: true, status: 'error', title: 'Gmail no configurado', message: 'No se pudo enviar la campaña por email. Configura Gmail en Configuración > Channels.' });
      } else {
        setCampaignError('Error al enviar la campaña.');
        setResultNotice({ show: true, status: 'error', title: 'Error al enviar', message: 'Ocurrió un error procesando la campaña.' });
      }
    } finally {
            setIsCampaignSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
                <LoadingOverlay show={isCampaignSubmitting || isActionLoading} message={isCampaignSubmitting ? 'Enviando campaña...' : (actionLoadingMsg || 'Procesando...')} />
                <ResultOverlay
                    show={resultNotice.show}
                    status={resultNotice.status}
                    title={resultNotice.title}
                    message={resultNotice.message}
                    onClose={() => setResultNotice({ ...resultNotice, show: false })}
                    autoCloseMs={3000}
                />
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800">CRM</h2>
            <div className="flex gap-2 items-center">
              <button onClick={handleExportExcel} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-blue-700">Export Excel</button>
              <button onClick={() => fileInputRef.current?.click()} className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-emerald-700">Import Excel</button>
              <input type="file" accept=".xlsx,.xls" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImportExcel} />
              <div className="flex bg-slate-100 p-1 rounded-lg ml-2">
                  <button onClick={() => setActiveTab('contacts')} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'contacts' ? 'bg-white shadow' : 'text-slate-500'}`}>Contacts</button>
                  <button onClick={() => setActiveTab('pipeline')} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'pipeline' ? 'bg-white shadow' : 'text-slate-500'}`}>Pipeline</button>
                  <button onClick={() => setActiveTab('properties')} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'properties' ? 'bg-white shadow' : 'text-slate-500'}`}>Properties</button>
                  <button onClick={() => setActiveTab('lists')} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'lists' ? 'bg-white shadow' : 'text-slate-500'}`}>Lists</button>
                  <button onClick={() => setActiveTab('campaigns')} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'campaigns' ? 'bg-white shadow' : 'text-slate-500'}`}>Campaigns</button>
                  {isManagerOrAdmin && (
                    <button onClick={() => setActiveTab('assignments')} className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'assignments' ? 'bg-white shadow' : 'text-slate-500'}`}>
                      <span className="flex items-center gap-1"><UserPlus size={14} /> Asignaciones</span>
                    </button>
                  )}
              </div>
            </div>
        </div>
            {/* Import Mapping Modal */}
            {showImportModal && importHeaders.length > 0 && (
                <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                        <h3 className="text-lg font-bold mb-4">Map Excel Columns</h3>
                        {existingImportCount > 0 && (
                            <div className="mb-3 p-3 border rounded bg-yellow-50 text-sm text-slate-700">
                                <div>Hay <strong>{existingImportCount}</strong> contactos que ya existen y se van a actualizar si marcas la casilla.</div>
                                {existingImportPreview.length > 0 && (
                                    <div className="text-xs text-slate-600 mt-2">Ejemplos: {existingImportPreview.map(c => c.name).join(', ')}</div>
                                )}
                                <div className="mt-2 flex items-center gap-2">
                                    <input id="updateExistingImport" type="checkbox" checked={updateExistingOnImport} onChange={e => setUpdateExistingOnImport(e.target.checked)} />
                                    <label htmlFor="updateExistingImport" className="text-sm text-slate-700">Actualizar datos existentes</label>
                                </div>
                            </div>
                        )}
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Base Fields</label>
                                {['name','email','phone','company','pipelineStageId'].map(field => (
                                    <div key={field} className="mb-2 flex items-center gap-2">
                                        <span className="w-40 text-xs text-slate-700 font-medium">{field}</span>
                                        <select
                                            className="border p-2 rounded text-sm flex-1"
                                            value={importMapping[field] || ''}
                                            onChange={e => setImportMapping(m => ({ ...m, [field]: e.target.value }))}
                                        >
                                            <option value="">-- Not Mapped --</option>
                                            {importHeaders.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Custom Properties</label>
                                {customProperties.map(p => (
                                    <div key={p.id} className="mb-2 flex items-center gap-2">
                                        <span className="w-40 text-xs text-slate-700 font-medium">{p.name}</span>
                                        <select
                                            className="border p-2 rounded text-sm flex-1"
                                            value={importMapping[p.id] || ''}
                                            onChange={e => setImportMapping(m => ({ ...m, [p.id]: e.target.value }))}
                                        >
                                            <option value="">-- Not Mapped --</option>
                                            {importHeaders.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={handleImportSubmit} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-medium hover:bg-emerald-700">Import</button>
                            <button onClick={() => setShowImportModal(false)} className="flex-1 bg-slate-200 text-slate-700 py-2 rounded-lg font-medium">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

      <div className="flex-1 overflow-auto bg-slate-50 p-6">
        {/* Contacts View */}
                {activeTab === 'contacts' && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible"> 
                                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                    <div className="flex gap-2 items-center">
                                        <div className="relative">
                                            <input 
                                              type="text" 
                                              placeholder="Buscar por nombre, email..." 
                                              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500" 
                                              value={searchTerm}
                                              onChange={e => setSearchTerm(e.target.value)} 
                                            />
                                            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                                        </div>
                                        <button onClick={() => setShowFilters(f => !f)} className="bg-white text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-slate-100 flex items-center gap-2 border border-slate-200 shadow-sm"><Database size={14}/> Filtros avanzados</button>
                                        
                                        {lists.length > 0 && (
                                            <div className="relative group">
                                                <button className="bg-white text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-slate-100 flex items-center gap-2 border border-slate-200 shadow-sm">
                                                    <Database size={14} className="text-emerald-500"/> Aplicar Lista
                                                </button>
                                                <div className="hidden group-hover:block absolute top-full left-0 z-50 bg-white shadow-xl border border-slate-100 rounded-lg min-w-[200px] mt-1 p-1">
                                                    {lists.map(l => (
                                                        <button key={l.id} onClick={() => applyListFilters(l)} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs rounded-md">
                                                            {l.name} ({l.filters.length + (l.manualContactIds?.length || 0)} cont.)
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {selectedContacts.size > 0 && (
                                            <button onClick={() => setSelectedContacts(new Set())} className="text-slate-400 hover:text-red-500 text-xs font-medium px-2">Limpiar selección</button>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                      {selectedContacts.size > 0 && (
                                        <button onClick={handleOpenCampaignModal} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2">
                                          <Send size={16} /> Enviar campaña ({selectedContacts.size})
                                        </button>
                                      )}
                                      <button onClick={handleOpenAddContact} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"><Plus size={16} /> Añadir contacto</button>
                                    </div>
                                </div>
                                {showFilters && (
                                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                                        <div className="flex flex-wrap gap-3 items-center">
                                            {filters.map((filter, idx) => (
                                                <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-sm border border-slate-200">
                                                    <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-600">Filtro #{idx+1}</span>
                                                    <select className="border rounded px-2 py-1 text-xs" value={filter.field} onChange={e => setFilters(fs => fs.map((f, i) => i === idx ? { ...f, field: e.target.value } : f))}>
                                                        <option value="">Campo</option>
                                                        <option value="name">Nombre</option>
                                                        <option value="email">Email</option>
                                                        <option value="phone">Teléfono</option>
                                                        <option value="company">Empresa</option>
                                                        <option value="pipelineStageId">Stage</option>
                                                        {customProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                    </select>
                                                    <select className="border rounded px-2 py-1 text-xs" value={filter.comparison} onChange={e => setFilters(fs => fs.map((f, i) => i === idx ? { ...f, comparison: e.target.value } : f))}>
                                                        <option value="equals">Igual</option>
                                                        <option value="contains">Contiene</option>
                                                        <option value="startsWith">Empieza</option>
                                                        <option value="endsWith">Termina</option>
                                                        <option value="gt">Mayor</option>
                                                        <option value="lt">Menor</option>
                                                    </select>
                                                    <input className="border rounded px-2 py-1 text-xs" value={filter.value} onChange={e => setFilters(fs => fs.map((f, i) => i === idx ? { ...f, value: e.target.value } : f))} placeholder="Valor" />
                                                    <button onClick={() => setFilters(fs => fs.filter((_, i) => i !== idx))} className="text-red-500 px-2 text-xs font-bold">✕</button>
                                                </div>
                                            ))}
                                            <button onClick={() => setFilters(fs => [...fs, { field: '', comparison: 'equals', value: '' }])} className="bg-white text-emerald-700 px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-200 hover:bg-emerald-50">+ Agregar filtro</button>
                                            {filters.length > 0 && (
                                                <>
                                                    <button onClick={() => setFilters([])} className="text-slate-600 text-xs hover:underline">Limpiar filtros</button>
                                                    <button onClick={() => setShowListNameModal(true)} className="bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-xs font-semibold border border-blue-200 hover:bg-blue-100">Guardar como lista</button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                            <tr>
                              <th className="px-6 py-4 w-12">
                                <button onClick={selectAllContacts} className="text-slate-400 hover:text-slate-700">
                                  {selectedContacts.size > 0 && selectedContacts.size === filteredContacts.length ? <CheckSquare size={18} /> : <Square size={18} />}
                                </button>
                              </th>
                              <th className="px-6 py-4">Name</th>
                              <th className="px-6 py-4">Email</th>
                              <th className="px-6 py-4">Company</th>
                              <th className="px-6 py-4">Stage</th>
                              <th className="px-6 py-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                                                        {filteredContacts
                                                            .map(contact => (
                                <tr key={contact.id} className="hover:bg-slate-50/50 cursor-pointer group" onClick={() => setSelectedContact(contact)}>
                                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                      <button onClick={() => toggleContactSelection(contact.id)} className="text-slate-400 hover:text-emerald-600">
                                        {selectedContacts.has(contact.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                                      </button>
                                    </td>
                                    <td className="px-6 py-4 font-medium flex items-center gap-3">
                                        <img src={contact.avatar || `https://ui-avatars.com/api/?name=${contact.name}`} className="w-8 h-8 rounded-full bg-slate-200" />
                                        {contact.name}
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">{contact.email || '-'}</td>
                                    <td className="px-6 py-4 text-slate-600">{contact.company || '-'}</td>
                                    <td className="px-6 py-4"><span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{MOCK_PIPELINES.find(p => p.id === contact.pipelineStageId)?.name}</span></td>
                                    <td className="px-6 py-4 relative">
                                        <div className="flex items-center gap-2">
                                            {onChatSelect && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onChatSelect(contact); }}
                                                    className="p-1.5 rounded-full hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors"
                                                    title="Enviar mensaje"
                                                >
                                                    <MessageCircle size={18} />
                                                </button>
                                            )}
                                            <div>
                                                <button onClick={(e) => openActionsMenu(e, contact.id)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="Más acciones">
                                                    <MoreHorizontal size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* Pipeline View */}
        {activeTab === 'pipeline' && (
            <div className="flex gap-6 h-full overflow-x-auto pb-4">
                {MOCK_PIPELINES.map(stage => (
                    <div key={stage.id} className="min-w-[280px] w-80 flex flex-col h-full">
                        <div className={`h-1 w-full ${stage.color} rounded-full mb-3`}></div>
                        <div className="flex justify-between items-center mb-4 px-1">
                            <h3 className="font-bold text-slate-700">{stage.name}</h3>
                            <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full font-bold">{contacts.filter(c => c.pipelineStageId === stage.id).length}</span>
                        </div>
                        <div className="bg-slate-100/50 rounded-xl p-3 flex-1 overflow-y-auto space-y-3">
                            {contacts.filter(c => c.pipelineStageId === stage.id).map(contact => (
                                <div key={contact.id} onClick={() => setSelectedContact(contact)} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow relative group">
                                    <div className="flex items-start justify-between mb-3">
                                         <div className="flex items-center gap-3">
                                              <img src={contact.avatar || `https://ui-avatars.com/api/?name=${contact.name}`} className="w-8 h-8 rounded-full border border-slate-100" />
                                              <div>
                                                  <h4 className="font-bold text-slate-800 text-sm">{contact.name}</h4>
                                                  <p className="text-xs text-slate-500">{contact.company || 'No Company'}</p>
                                              </div>
                                         </div>
                                    </div>
                                    
                                    <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                                         <div className="flex items-center gap-1 text-xs text-slate-400">
                                             <Clock size={12} />
                                             <span>{getTimeAgo(contact.createdAt)}</span>
                                         </div>
                                         <div className="flex items-center gap-2">
                                             {onChatSelect && (
                                                <button onClick={(e) => { e.stopPropagation(); onChatSelect(contact); }} className="text-slate-400 hover:text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <MessageCircle size={16} />
                                                </button>
                                             )}
                                             <button onClick={(e) => { e.stopPropagation(); setSelectedContact(contact); }} className="text-xs text-emerald-600 hover:underline opacity-0 group-hover:opacity-100 transition-opacity">View</button>
                                         </div>
                                    </div>
                                </div>
                            ))}
                            <button 
                                onClick={() => { setContactForm(prev => ({ ...prev, pipelineStageId: stage.id })); setShowContactModal(true); }}
                                className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-400 hover:border-emerald-500 hover:text-emerald-500 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                            >
                                <Plus size={16} /> Add Deal
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {/* Properties View */}
        {activeTab === 'properties' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div><h3 className="text-lg font-bold text-slate-800">Custom Properties</h3></div>
                    <button onClick={() => setShowPropModal(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"><Plus size={16} /> Create Property</button>
                </div>
                <div className="space-y-2">
                    {customProperties.map(prop => (
                        <div key={prop.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-lg hover:bg-slate-50 group">
                            <div className="flex items-center gap-4">
                                <div className="bg-slate-100 p-2 rounded-lg text-slate-500"><Database size={20} /></div>
                                <div>
                                    <h4 className="font-medium text-slate-800">{prop.name}</h4>
                                    <p className="text-xs text-slate-500 font-mono">ID: {prop.id}</p>
                                    {prop.type === 'select' && prop.options && (
                                        <p className="text-xs text-slate-400 mt-1">Options: {prop.options.join(', ')}</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs rounded-full uppercase font-bold">{prop.type}</span>
                                <button onClick={() => onDeleteProperty?.(prop.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Lists View - IMPROVED */}
        {activeTab === 'lists' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Listas Dinámicas</h3>
                        <p className="text-sm text-slate-500">Agrupaciones de contactos basadas en filtros o selección manual.</p>
                    </div>
                    <button 
                      onClick={() => { setShowCreateListModal(true); setCreateListName(''); setCreateListFilters([]); setCreateListManualIds(new Set()); setCreateListSearch(''); }}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"
                    >
                        <Plus size={16} /> Crear lista
                    </button>
                </div>
                
                {/* Search lists */}
                {lists.length > 3 && (
                  <div className="mb-4 relative">
                    <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Buscar listas..." 
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500" 
                      value={listSearchTerm}
                      onChange={e => setListSearchTerm(e.target.value)} 
                    />
                  </div>
                )}
                
                {!lists || lists.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                        <div className="bg-white w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center shadow-sm">
                            <Database size={32} className="text-slate-400" />
                        </div>
                        <h4 className="text-slate-700 font-medium mb-2">No has creado listas aún</h4>
                        <p className="text-slate-500 text-sm mb-4">Crea tu primera lista con filtros dinámicos o seleccionando contactos manualmente.</p>
                        <div className="flex justify-center gap-3">
                          <button 
                            onClick={() => { setShowCreateListModal(true); setCreateListName(''); setCreateListFilters([]); setCreateListManualIds(new Set()); }}
                            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"
                          >
                            <Plus size={16} /> Crear lista nueva
                          </button>
                          <button onClick={() => setActiveTab('contacts')} className="text-emerald-600 font-bold hover:underline text-sm px-4 py-2">
                            Ir a Contacts y usar filtros
                          </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {lists
                          .filter(l => !listSearchTerm || l.name.toLowerCase().includes(listSearchTerm.toLowerCase()))
                          .map(list => {
                            const contactCount = getListContactCount(list);
                            return (
                            <div key={list.id} className="p-4 border border-slate-200 rounded-xl hover:border-emerald-500 hover:shadow-md transition-all group cursor-pointer" onClick={() => openListDetail(list)}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
                                            <Database size={20} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800">{list.name}</h4>
                                            <div className="flex items-center gap-2 mt-0.5">
                                              <span className="text-[10px] text-slate-400 uppercase font-bold">{list.filters.length} filtros</span>
                                              {(list.manualContactIds?.length || 0) > 0 && (
                                                <span className="text-[10px] text-blue-500 uppercase font-bold">+ {list.manualContactIds?.length} manuales</span>
                                              )}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={(e) => handleDeleteList(list.id, e)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-1">
                                        <Trash2 size={16}/>
                                    </button>
                                </div>
                                {list.filters.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-3">
                                      {list.filters.map((f, i) => (
                                          <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                                              {f.field} {f.comparison} {f.value.toString()}
                                          </span>
                                      ))}
                                  </div>
                                )}
                                <div className="mt-4 flex items-center justify-between text-xs">
                                    <span className="text-slate-400">Creada el {list.createdAt.toLocaleDateString()}</span>
                                    <div className="flex items-center gap-3">
                                      <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{contactCount} contactos</span>
                                      <span className="text-emerald-600 font-bold flex items-center gap-1">Ver detalle <MoreHorizontal size={12}/></span>
                                    </div>
                                </div>
                            </div>
                        );})}
                    </div>
                )}
                
                {/* List Detail Modal - ENHANCED */}
                {showListDetailModal && currentListDetail && (
                    <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold">Detalle de Lista</h3>
                                <button onClick={() => { setShowListDetailModal(false); setCurrentListDetail(null); }} className="text-slate-500 hover:text-slate-700">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1 font-bold uppercase">Nombre</label>
                                    <input className="w-full border p-2 rounded-lg focus:border-emerald-500 outline-none" value={currentListDetail.name} onChange={e => setCurrentListDetail({ ...currentListDetail, name: e.target.value })} />
                                </div>
                                
                                {/* Editable filters */}
                                <div>
                                    <label className="block text-xs text-slate-500 mb-2 font-bold uppercase">Filtros dinámicos</label>
                                    <div className="space-y-2 mb-2">
                                      {currentListDetail.filters.map((f, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                          <select className="border rounded px-2 py-1 text-xs flex-1" value={f.field} onChange={e => {
                                            const updated = [...currentListDetail.filters];
                                            updated[i] = { ...updated[i], field: e.target.value };
                                            setCurrentListDetail({ ...currentListDetail, filters: updated });
                                          }}>
                                            <option value="">Campo</option>
                                            <option value="name">Nombre</option>
                                            <option value="email">Email</option>
                                            <option value="phone">Teléfono</option>
                                            <option value="company">Empresa</option>
                                            <option value="pipelineStageId">Stage</option>
                                            {customProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                          </select>
                                          <select className="border rounded px-2 py-1 text-xs" value={f.comparison} onChange={e => {
                                            const updated = [...currentListDetail.filters];
                                            updated[i] = { ...updated[i], comparison: e.target.value as any };
                                            setCurrentListDetail({ ...currentListDetail, filters: updated });
                                          }}>
                                            <option value="equals">Igual</option>
                                            <option value="contains">Contiene</option>
                                            <option value="startsWith">Empieza</option>
                                            <option value="endsWith">Termina</option>
                                            <option value="gt">Mayor</option>
                                            <option value="lt">Menor</option>
                                          </select>
                                          <input className="border rounded px-2 py-1 text-xs flex-1" value={f.value.toString()} onChange={e => {
                                            const updated = [...currentListDetail.filters];
                                            updated[i] = { ...updated[i], value: e.target.value };
                                            setCurrentListDetail({ ...currentListDetail, filters: updated });
                                          }} placeholder="Valor" />
                                          <button onClick={() => {
                                            const updated = currentListDetail.filters.filter((_, idx) => idx !== i);
                                            setCurrentListDetail({ ...currentListDetail, filters: updated });
                                            // Recalculate matching contacts
                                            setCurrentListMatchingContacts(filterContactsByCriteria(contacts, '', updated as CRMFilter[]));
                                          }} className="text-red-500 px-1 text-xs font-bold hover:bg-red-50 rounded">✕</button>
                                        </div>
                                      ))}
                                    </div>
                                    <button onClick={() => {
                                      const updated = [...currentListDetail.filters, { field: '', comparison: 'equals' as any, value: '' }];
                                      setCurrentListDetail({ ...currentListDetail, filters: updated });
                                    }} className="text-emerald-600 text-xs font-bold hover:underline flex items-center gap-1">
                                      <Plus size={12} /> Agregar filtro
                                    </button>
                                    {currentListDetail.filters.length > 0 && (
                                      <button onClick={() => {
                                        setCurrentListMatchingContacts(filterContactsByCriteria(contacts, '', currentListDetail.filters as CRMFilter[]));
                                      }} className="ml-3 text-blue-600 text-xs font-bold hover:underline flex items-center gap-1">
                                        <RefreshCw size={12} /> Actualizar vista previa
                                      </button>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs text-slate-500 mb-2 font-bold uppercase">
                                      Contactos en la lista ({(() => {
                                        const inactive = new Set(currentListDetail?.inactiveContactIds || []);
                                        const activeMatching = currentListMatchingContacts.filter(c => !inactive.has(c.id));
                                        const activeManual = (currentListDetail?.manualContactIds || []).filter(id => !inactive.has(id) && !currentListMatchingContacts.find(c => c.id === id) && contacts.find(c => c.id === id));
                                        return activeMatching.length + activeManual.length;
                                      })()})
                                    </label>
                                    <div className="border rounded-lg max-h-64 overflow-y-auto p-2 bg-slate-50">
                                        {currentListMatchingContacts.length === 0 && !(currentListDetail.manualContactIds && currentListDetail.manualContactIds.length > 0) && (
                                            <div className="text-xs text-slate-400 p-2 text-center">No hay contactos en la lista. Agrega filtros o contactos manualmente.</div>
                                        )}
                                        {currentListMatchingContacts.map(c => {
                                            const isInactive = (currentListDetail?.inactiveContactIds || []).includes(c.id);
                                            return (
                                            <div key={c.id} className={`flex items-center justify-between p-2 rounded group ${isInactive ? 'bg-slate-100 opacity-50' : 'hover:bg-slate-50'}`}>
                                                <div className="flex items-center gap-2">
                                                    <img src={c.avatar || `https://ui-avatars.com/api/?name=${c.name}`} className="w-8 h-8 rounded-full" />
                                                    <div>
                                                        <div className={`text-sm font-medium ${isInactive ? 'line-through text-slate-500' : ''}`}>{c.name}</div>
                                                        <div className="text-[11px] text-slate-400">{c.phone || c.email}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">filtro</span>
                                                    <input type="checkbox" checked={!isInactive} onChange={() => toggleManualForContact(c.id)} className="cursor-pointer" title={isInactive ? 'Clic para activar' : 'Clic para desactivar'} />
                                                </div>
                                            </div>
                                        );})}
                                        {(currentListDetail.manualContactIds || []).filter(id => !currentListMatchingContacts.find(c => c.id === id)).map(mid => {
                                            const c = contacts.find(x => x.id === mid);
                                            if (!c) return null;
                                            const isInactive = (currentListDetail?.inactiveContactIds || []).includes(c.id);
                                            return (
                                                <div key={c.id} className={`flex items-center justify-between p-2 rounded group ${isInactive ? 'bg-slate-100 opacity-50' : 'hover:bg-slate-50'}`}>
                                                    <div className="flex items-center gap-2">
                                                        <img src={c.avatar || `https://ui-avatars.com/api/?name=${c.name}`} className="w-8 h-8 rounded-full" />
                                                        <div>
                                                            <div className={`text-sm font-medium ${isInactive ? 'line-through text-slate-500' : ''}`}>{c.name}</div>
                                                            <div className="text-[11px] text-slate-400">{c.phone || c.email}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded">manual</span>
                                                        <input type="checkbox" checked={!isInactive} onChange={() => toggleManualForContact(c.id)} className="cursor-pointer" title={isInactive ? 'Clic para activar' : 'Clic para desactivar'} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    
                                    {/* Quick add contact to list */}
                                    <div className="mt-3 border-t pt-3">
                                      <label className="text-[11px] text-slate-500 font-bold uppercase mb-1 block">Agregar contacto manualmente</label>
                                      <div className="relative">
                                        <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
                                        <input 
                                          type="text" 
                                          placeholder="Buscar contacto por nombre o teléfono..." 
                                          className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-xs outline-none focus:border-emerald-500" 
                                          value={createListSearch}
                                          onChange={e => setCreateListSearch(e.target.value)}
                                        />
                                      </div>
                                      {createListSearch && (
                                        <div className="mt-1 max-h-32 overflow-y-auto border rounded-lg bg-white">
                                          {contacts
                                            .filter(c => {
                                              const s = createListSearch.toLowerCase();
                                              return (c.name.toLowerCase().includes(s) || c.phone.includes(s)) &&
                                                !(currentListDetail.manualContactIds || []).includes(c.id) &&
                                                !currentListMatchingContacts.find(m => m.id === c.id);
                                            })
                                            .slice(0, 8)
                                            .map(c => (
                                              <button 
                                                key={c.id} 
                                                onClick={() => {
                                                  currentListDetail.manualContactIds = [...(currentListDetail.manualContactIds || []), c.id];
                                                  setCurrentListDetail({ ...currentListDetail });
                                                  setCreateListSearch('');
                                                }}
                                                className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-xs flex items-center gap-2 border-b border-slate-50 last:border-0"
                                              >
                                                <img src={c.avatar || `https://ui-avatars.com/api/?name=${c.name}`} className="w-6 h-6 rounded-full" />
                                                <span className="font-medium">{c.name}</span>
                                                <span className="text-slate-400 ml-auto">{c.phone}</span>
                                              </button>
                                            ))
                                          }
                                          {contacts.filter(c => {
                                            const s = createListSearch.toLowerCase();
                                            return (c.name.toLowerCase().includes(s) || c.phone.includes(s));
                                          }).length === 0 && (
                                            <div className="p-2 text-center text-xs text-slate-400">No se encontraron contactos</div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 mt-4">
                                <button onClick={handleSaveListEdits} className="flex-1 bg-emerald-600 text-white py-2 rounded font-bold hover:bg-emerald-700">Guardar cambios</button>
                                <button 
                                    onClick={() => {
                                        const inactive = new Set(currentListDetail?.inactiveContactIds || []);
                                        const activeMatching = currentListMatchingContacts.filter(c => !inactive.has(c.id)).map(c => c.id);
                                        const activeManual = (currentListDetail?.manualContactIds || []).filter(id => !inactive.has(id) && !currentListMatchingContacts.find(c => c.id === id));
                                        const totalContacts = activeMatching.length + activeManual.length;
                                        if (totalContacts > 0) {
                                            setSelectedContacts(new Set([...activeMatching, ...activeManual]));
                                            setShowListDetailModal(false);
                                            setCurrentListDetail(null);
                                            setActiveTab('campaigns');
                                        } else {
                                            setResultNotice({ show: true, status: 'warning', title: 'Sin contactos', message: 'La lista no tiene contactos activos para crear una campaña.' });
                                        }
                                    }}
                                    className="flex-1 bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700">Usar en campaña</button>
                                <button onClick={handleDeleteListFromModal} className="flex-1 bg-red-50 text-red-600 py-2 rounded font-bold hover:bg-red-100">Eliminar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Create List Modal */}
                {showCreateListModal && (
                    <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-slate-800">Crear nueva lista</h3>
                                <button onClick={() => setShowCreateListModal(false)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
                            </div>
                            
                            <div className="space-y-5">
                                {/* List name */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Nombre de la lista</label>
                                    <input 
                                      type="text" 
                                      className="w-full border p-2.5 rounded-lg text-sm outline-none focus:border-emerald-500" 
                                      placeholder="Ej: Clientes VIP, Leads nuevos, etc." 
                                      value={createListName}
                                      onChange={e => setCreateListName(e.target.value)}
                                      autoFocus
                                    />
                                </div>

                                {/* Dynamic filters */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Filtros dinámicos (opcionales)</label>
                                    <p className="text-[11px] text-slate-400 mb-2">Los contactos que coincidan con estos filtros se agregarán automáticamente.</p>
                                    <div className="space-y-2 mb-2">
                                      {createListFilters.map((filter, idx) => (
                                        <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                          <select className="border rounded px-2 py-1 text-xs flex-1" value={filter.field} onChange={e => setCreateListFilters(fs => fs.map((f, i) => i === idx ? { ...f, field: e.target.value } : f))}>
                                            <option value="">Campo</option>
                                            <option value="name">Nombre</option>
                                            <option value="email">Email</option>
                                            <option value="phone">Teléfono</option>
                                            <option value="company">Empresa</option>
                                            <option value="pipelineStageId">Stage</option>
                                            {customProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                          </select>
                                          <select className="border rounded px-2 py-1 text-xs" value={filter.comparison} onChange={e => setCreateListFilters(fs => fs.map((f, i) => i === idx ? { ...f, comparison: e.target.value } : f))}>
                                            <option value="equals">Igual</option>
                                            <option value="contains">Contiene</option>
                                            <option value="startsWith">Empieza</option>
                                            <option value="endsWith">Termina</option>
                                            <option value="gt">Mayor</option>
                                            <option value="lt">Menor</option>
                                          </select>
                                          <input className="border rounded px-2 py-1 text-xs flex-1" value={filter.value} onChange={e => setCreateListFilters(fs => fs.map((f, i) => i === idx ? { ...f, value: e.target.value } : f))} placeholder="Valor" />
                                          <button onClick={() => setCreateListFilters(fs => fs.filter((_, i) => i !== idx))} className="text-red-500 px-1 text-xs font-bold">✕</button>
                                        </div>
                                      ))}
                                    </div>
                                    <button onClick={() => setCreateListFilters(fs => [...fs, { field: '', comparison: 'equals', value: '' }])} className="text-emerald-600 text-xs font-bold hover:underline flex items-center gap-1">
                                      <Plus size={12} /> Agregar filtro
                                    </button>
                                    {createListFilters.length > 0 && (
                                      <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 px-3 py-2 rounded">
                                        Vista previa: {filterContactsByCriteria(contacts, '', createListFilters as CRMFilter[]).length} contactos coinciden con los filtros
                                      </div>
                                    )}
                                </div>

                                {/* Manual contact selection */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Agregar contactos manualmente (opcional)</label>
                                    <div className="relative mb-2">
                                      <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
                                      <input 
                                        type="text" 
                                        placeholder="Buscar contacto por nombre o teléfono..." 
                                        className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-xs outline-none focus:border-emerald-500" 
                                        value={createListSearch}
                                        onChange={e => setCreateListSearch(e.target.value)}
                                      />
                                    </div>
                                    
                                    {createListSearch && (
                                      <div className="max-h-40 overflow-y-auto border rounded-lg bg-white mb-2">
                                        {contacts
                                          .filter(c => {
                                            const s = createListSearch.toLowerCase();
                                            return (c.name.toLowerCase().includes(s) || c.phone.includes(s)) && !createListManualIds.has(c.id);
                                          })
                                          .slice(0, 10)
                                          .map(c => (
                                            <button 
                                              key={c.id} 
                                              onClick={() => {
                                                setCreateListManualIds(prev => new Set([...prev, c.id]));
                                                setCreateListSearch('');
                                              }}
                                              className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-xs flex items-center gap-2 border-b border-slate-50"
                                            >
                                              <img src={c.avatar || `https://ui-avatars.com/api/?name=${c.name}`} className="w-6 h-6 rounded-full" />
                                              <span className="font-medium">{c.name}</span>
                                              <span className="text-slate-400 ml-auto">{c.phone}</span>
                                              <Plus size={14} className="text-emerald-500" />
                                            </button>
                                          ))
                                        }
                                      </div>
                                    )}

                                    {/* Selected manual contacts */}
                                    {createListManualIds.size > 0 && (
                                      <div className="border rounded-lg bg-slate-50 divide-y divide-slate-100 max-h-32 overflow-y-auto">
                                        {Array.from(createListManualIds).map(id => {
                                          const c = contacts.find(x => x.id === id);
                                          if (!c) return null;
                                          return (
                                            <div key={id} className="flex items-center justify-between px-3 py-2">
                                              <div className="flex items-center gap-2">
                                                <img src={c.avatar || `https://ui-avatars.com/api/?name=${c.name}`} className="w-6 h-6 rounded-full" />
                                                <span className="text-xs font-medium">{c.name}</span>
                                              </div>
                                              <button onClick={() => setCreateListManualIds(prev => { const next = new Set(prev); next.delete(id); return next; })} className="text-red-400 hover:text-red-600">
                                                <X size={14} />
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                </div>

                                {/* Summary */}
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
                                    <div className="flex items-center gap-2 text-emerald-800 font-bold mb-1">
                                      <List size={16} /> Resumen de la lista
                                    </div>
                                    <div className="text-emerald-700 text-xs space-y-1">
                                      <p>{createListFilters.filter(f => f.field).length} filtros dinámicos configurados</p>
                                      <p>{createListManualIds.size} contactos agregados manualmente</p>
                                      <p className="font-bold">~{filterContactsByCriteria(contacts, '', createListFilters as CRMFilter[]).length + createListManualIds.size} contactos totales estimados</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-6">
                              <button 
                                onClick={handleCreateListFromTab} 
                                disabled={!createListName.trim()}
                                className={`flex-1 py-2.5 rounded-lg font-bold ${createListName.trim() ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                              >
                                Crear lista
                              </button>
                              <button onClick={() => setShowCreateListModal(false)} className="flex-1 bg-slate-200 text-slate-700 py-2.5 rounded-lg font-bold">Cancelar</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* Assignments View (Manager/Admin Only) */}
        {activeTab === 'assignments' && isManagerOrAdmin && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><UserPlus size={20} className="text-emerald-600" /> Asignación de Actividades</h3>
                  <p className="text-sm text-slate-500 mt-1">Asigna contactos y conversaciones a los miembros del equipo Community.</p>
                </div>
                <button 
                  onClick={async () => {
                    setIsActionLoading(true);
                    setActionLoadingMsg('Actualizando...');
                    try {
                      const [members, assignments] = await Promise.all([
                        teamService.getTeamMembers(organizationId),
                        teamService.getLeadAssignments(organizationId)
                      ]);
                      setTeamMembers(members);
                      setLeadAssignments(assignments);
                    } catch (err) { console.error(err); }
                    setIsActionLoading(false);
                    setActionLoadingMsg('');
                  }}
                  className="text-slate-500 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Actualizar datos"
                >
                  <RefreshCw size={18} />
                </button>
              </div>

              {communityMembers.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                  <Users size={32} className="text-slate-400 mx-auto mb-3" />
                  <h4 className="text-slate-700 font-medium mb-2">No hay miembros Community</h4>
                  <p className="text-slate-500 text-sm">Invita miembros con rol Community desde Settings para poder asignarles actividades.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Select community member */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Seleccionar miembro Community</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {communityMembers.map(member => (
                        <button 
                          key={member.id}
                          onClick={() => setSelectedAssignUser(member.id)}
                          className={`p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${
                            selectedAssignUser === member.id 
                              ? 'border-emerald-500 bg-emerald-50 shadow-md' 
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <img src={member.avatar} className="w-10 h-10 rounded-full" alt={member.name}/>
                          <div className="text-left min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{member.name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{member.email}</p>
                            <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-bold">
                              {leadAssignments.filter(a => a.userId === member.id).length} contactos asignados
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedAssignUser && (
                    <>
                      {/* Toggle: Contacts vs Conversations */}
                      <div className="flex bg-slate-100 p-1 rounded-lg w-fit">
                        <button 
                          onClick={() => setAssignMode('contacts')} 
                          className={`px-4 py-2 rounded-md text-sm font-medium ${assignMode === 'contacts' ? 'bg-white shadow' : 'text-slate-500'}`}
                        >
                          Contactos/Leads
                        </button>
                        <button 
                          onClick={() => setAssignMode('conversations')} 
                          className={`px-4 py-2 rounded-md text-sm font-medium ${assignMode === 'conversations' ? 'bg-white shadow' : 'text-slate-500'}`}
                        >
                          Conversaciones
                        </button>
                      </div>

                      {/* CONTACTS ASSIGNMENT */}
                      {assignMode === 'contacts' && (
                        <div className="space-y-4">
                          {/* Currently assigned contacts */}
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">
                              Contactos asignados a {communityMembers.find(m => m.id === selectedAssignUser)?.name}
                            </label>
                            <div className="border rounded-lg max-h-48 overflow-y-auto bg-slate-50">
                              {leadAssignments.filter(a => a.userId === selectedAssignUser).length === 0 ? (
                                <div className="p-4 text-center text-xs text-slate-400">No tiene contactos asignados aún.</div>
                              ) : (
                                <div className="divide-y divide-slate-100">
                                  {leadAssignments.filter(a => a.userId === selectedAssignUser).map(assignment => {
                                    const contact = contacts.find(c => c.id === assignment.contactId);
                                    if (!contact) return null;
                                    return (
                                      <div key={assignment.id} className="flex items-center justify-between p-3 group hover:bg-white">
                                        <div className="flex items-center gap-2">
                                          <img src={contact.avatar || `https://ui-avatars.com/api/?name=${contact.name}`} className="w-8 h-8 rounded-full" />
                                          <div>
                                            <p className="text-sm font-medium text-slate-800">{contact.name}</p>
                                            <p className="text-[11px] text-slate-400">{contact.phone || contact.email}</p>
                                          </div>
                                        </div>
                                        <button 
                                          onClick={() => handleUnassignContact(selectedAssignUser, assignment.contactId)}
                                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-1"
                                          title="Desasignar"
                                        >
                                          <X size={16} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Add contacts  */}
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Asignar nuevos contactos</label>
                            <div className="relative mb-2">
                              <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
                              <input 
                                type="text" 
                                placeholder="Buscar contacto..." 
                                className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-xs outline-none focus:border-emerald-500" 
                                value={assignContactSearch}
                                onChange={e => setAssignContactSearch(e.target.value)}
                              />
                            </div>
                            
                            <div className="border rounded-lg max-h-48 overflow-y-auto bg-white">
                              {contacts
                                .filter(c => {
                                  if (assignContactSearch) {
                                    const s = assignContactSearch.toLowerCase();
                                    if (!c.name.toLowerCase().includes(s) && !c.phone.includes(s) && !c.email.toLowerCase().includes(s)) return false;
                                  }
                                  // Skip already assigned
                                  return !leadAssignments.some(a => a.userId === selectedAssignUser && a.contactId === c.id);
                                })
                                .slice(0, 20)
                                .map(c => (
                                  <div key={c.id} className="flex items-center justify-between p-2 hover:bg-emerald-50 border-b border-slate-50 last:border-0">
                                    <div className="flex items-center gap-2">
                                      <button 
                                        onClick={() => {
                                          const next = new Set(selectedAssignContacts);
                                          if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                                          setSelectedAssignContacts(next);
                                        }}
                                        className="text-slate-400 hover:text-emerald-600"
                                      >
                                        {selectedAssignContacts.has(c.id) ? <CheckSquare size={16} className="text-emerald-600" /> : <Square size={16} />}
                                      </button>
                                      <img src={c.avatar || `https://ui-avatars.com/api/?name=${c.name}`} className="w-7 h-7 rounded-full" />
                                      <div>
                                        <span className="text-xs font-medium">{c.name}</span>
                                        <span className="text-[10px] text-slate-400 ml-2">{c.phone}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              }
                            </div>

                            {selectedAssignContacts.size > 0 && (
                              <button 
                                onClick={handleAssignContacts}
                                className="mt-3 w-full bg-emerald-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 flex items-center justify-center gap-2"
                              >
                                <UserPlus size={16} /> Asignar {selectedAssignContacts.size} contacto(s)
                              </button>
                            )}
                          </div>

                          {/* Quick assign from list */}
                          {lists.length > 0 && (
                            <div>
                              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Asignar desde una lista</label>
                              <select 
                                className="w-full border p-2 rounded-lg text-sm outline-none focus:border-emerald-500"
                                defaultValue=""
                                onChange={async (e) => {
                                  const listId = e.target.value;
                                  if (!listId || !currentUser) return;
                                  const list = lists.find(l => l.id === listId);
                                  if (!list) return;
                                  const inactive = new Set(list.inactiveContactIds || []);
                                  const matchingContacts = filterContactsByCriteria(contacts, '', list.filters as CRMFilter[]);
                                  const activeMatching = matchingContacts.filter(c => !inactive.has(c.id)).map(c => c.id);
                                  const manualIds = (list.manualContactIds || []).filter(id => !inactive.has(id));
                                  const allIds = [...new Set([...activeMatching, ...manualIds])];
                                  
                                  setIsActionLoading(true);
                                  setActionLoadingMsg('Asignando contactos de la lista...');
                                  try {
                                    await teamService.assignMultipleLeadsToUser(selectedAssignUser, allIds, currentUser.id, organizationId);
                                    const updatedAssignments = await teamService.getLeadAssignments(organizationId);
                                    setLeadAssignments(updatedAssignments);
                                    setResultNotice({ show: true, status: 'success', title: 'Lista asignada', message: `Se asignaron los contactos de "${list.name}" correctamente.` });
                                  } catch (err) {
                                    setResultNotice({ show: true, status: 'error', title: 'Error', message: 'Error al asignar contactos de la lista.' });
                                  }
                                  setIsActionLoading(false);
                                  setActionLoadingMsg('');
                                  e.target.value = '';
                                }}
                              >
                                <option value="" disabled>-- Seleccionar lista para asignar todos sus contactos --</option>
                                {lists.map(l => (
                                  <option key={l.id} value={l.id}>{l.name} ({getListContactCount(l)} contactos)</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}

                      {/* CONVERSATIONS ASSIGNMENT */}
                      {assignMode === 'conversations' && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3 mb-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={assignAllConversations} 
                                onChange={e => { setAssignAllConversations(e.target.checked); if (e.target.checked) setSelectedAssignConvos(new Set()); }}
                                className="rounded"
                              />
                              <span className="text-sm font-medium text-slate-700">Permitir acceso a todas las conversaciones</span>
                            </label>
                          </div>

                          {!assignAllConversations && (
                            <>
                              <div className="relative mb-2">
                                <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
                                <input 
                                  type="text" 
                                  placeholder="Buscar conversación..." 
                                  className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-xs outline-none focus:border-emerald-500" 
                                  value={assignConvoSearch}
                                  onChange={e => setAssignConvoSearch(e.target.value)}
                                />
                              </div>
                              
                              <div className="border rounded-lg max-h-64 overflow-y-auto bg-white">
                                {conversations
                                  .filter(c => {
                                    if (assignConvoSearch) {
                                      return c.contactName.toLowerCase().includes(assignConvoSearch.toLowerCase());
                                    }
                                    return true;
                                  })
                                  .map(convo => (
                                    <div key={convo.id} className="flex items-center justify-between p-3 border-b border-slate-50 last:border-0 hover:bg-emerald-50">
                                      <div className="flex items-center gap-3">
                                        <button 
                                          onClick={() => {
                                            const next = new Set(selectedAssignConvos);
                                            if (next.has(convo.id)) next.delete(convo.id); else next.add(convo.id);
                                            setSelectedAssignConvos(next);
                                          }}
                                        >
                                          {selectedAssignConvos.has(convo.id) ? <CheckSquare size={16} className="text-emerald-600" /> : <Square size={16} className="text-slate-400" />}
                                        </button>
                                        <img src={convo.contactAvatar} className="w-8 h-8 rounded-full" />
                                        <div>
                                          <p className="text-sm font-medium text-slate-800">{convo.contactName}</p>
                                          <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{convo.lastMessage}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                          convo.platform === 'whatsapp' ? 'bg-green-50 text-green-700' : 
                                          convo.platform === 'instagram' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                                        }`}>{convo.platform}</span>
                                        {convo.assignedTo && (
                                          <span className="text-[10px] text-slate-400">
                                            Asignado a: {teamMembers.find(m => m.id === convo.assignedTo)?.name || 'otro'}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))
                                }
                                {conversations.length === 0 && (
                                  <div className="p-4 text-center text-xs text-slate-400">No hay conversaciones disponibles.</div>
                                )}
                              </div>
                            </>
                          )}

                          <button 
                            onClick={handleAssignConversations}
                            disabled={!assignAllConversations && selectedAssignConvos.size === 0}
                            className={`w-full py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 ${
                              (!assignAllConversations && selectedAssignConvos.size === 0) 
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                          >
                            <MessageCircle size={16} />
                            {assignAllConversations 
                              ? 'Asignar todas las conversaciones' 
                              : `Asignar ${selectedAssignConvos.size} conversación(es)`
                            }
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Campaigns View */}
        {activeTab === 'campaigns' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Campañas Masivas</h3>
                        <p className="text-sm text-slate-500">Envía mensajes masivos por Email o WhatsApp</p>
                    </div>
                    <button onClick={handleOpenCampaignModal} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2">
                        <Plus size={16} /> Nueva campaña
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Total Enviados</p>
                        <h3 className="text-xl font-bold text-slate-800">{(campaigns || []).reduce((acc, c) => acc + (c.stats?.sent || 0), 0)}</h3>
                    </div>
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Entregados</p>
                        <h3 className="text-xl font-bold text-emerald-700">{(campaigns || []).reduce((acc, c) => acc + (c.stats?.delivered || 0), 0)}</h3>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Activas</p>
                        <h3 className="text-xl font-bold text-blue-700">{(campaigns || []).filter(c => c.status === 'sending').length}</h3>
                    </div>
                    <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                        <p className="text-[10px] font-bold text-red-600 uppercase mb-1">Fallidos</p>
                        <h3 className="text-xl font-bold text-red-700">{campaigns.reduce((acc, c) => acc + (c.stats?.failed || 0), 0)}</h3>
                    </div>
                </div>
                
                {campaigns.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="bg-slate-100 w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center">
                            <Send size={32} className="text-slate-400" />
                        </div>
                        <h4 className="text-slate-700 font-medium mb-2">No hay campañas aún</h4>
                        <p className="text-slate-500 text-sm mb-4">Crea tu primera campaña masiva seleccionando contactos en la vista de Contacts</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {campaigns.map(campaign => (
                            <div key={campaign.id} onClick={() => setSelectedCampaign(campaign)} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 group cursor-pointer">
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-lg ${campaign.type === 'whatsapp' ? 'bg-green-50' : 'bg-blue-50'}`}>
                                        {campaign.type === 'whatsapp' ? <MessageCircle size={24} className="text-green-600" /> : <Mail size={24} className="text-blue-600" />}
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-slate-800">{campaign.name}</h4>
                                        <p className="text-xs text-slate-500">
                                            {campaign.type === 'whatsapp' ? `Template: ${campaign.templateName}` : `Email: ${campaign.emailSubject}`}
                                        </p>
                                        <div className="flex flex-col gap-1 mt-2">
                                            <div className="flex gap-4">
                                                <div className="text-xs text-slate-500">
                                                    <span className="font-bold text-slate-700">{campaign.recipientCount}</span> destinatarios
                                                </div>
                                                {campaign.stats && (
                                                    <div className="flex gap-3 border-l pl-3 ml-1">
                                                        <div className="text-xs text-emerald-600">
                                                            <span className="font-bold">{campaign.stats.sent}</span> enviados
                                                        </div>
                                                        <div className="text-xs text-blue-600">
                                                            <span className="font-bold">{campaign.stats.delivered || 0}</span> entregados
                                                        </div>
                                                        {campaign.stats.failed > 0 && (
                                                            <div className="text-xs text-red-600">
                                                                <span className="font-bold">{campaign.stats.failed}</span> fallidos
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <span className="text-xs text-slate-400 ml-auto">{campaign.createdAt.toLocaleDateString()}</span>
                                            </div>
                                            {campaign.status === 'sending' && (
                                                <div className="mt-1 w-full max-w-xs h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-emerald-500 transition-all duration-500" 
                                                        style={{ width: `${Math.round(((campaign.stats?.sent || 0) / campaign.recipientCount) * 100)}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`px-3 py-1 text-xs rounded-full font-bold flex items-center gap-1.5 ${
                                        campaign.status === 'sent' ? 'bg-green-50 text-green-700' :
                                        campaign.status === 'sending' ? 'bg-yellow-50 text-yellow-700 animate-pulse' :
                                        campaign.status === 'failed' ? 'bg-red-50 text-red-700' :
                                        'bg-slate-100 text-slate-600'
                                    }`}>
                                        {campaign.status === 'sending' && <Clock size={12} />}
                                        {campaign.status === 'sent' ? 'Enviada' :
                                         campaign.status === 'sending' ? 'Enviando...' :
                                         campaign.status === 'failed' ? 'Fallida' :
                                         'Borrador'}
                                    </span>
                                    <button onClick={async () => {
                                        await campaignService.deleteCampaign(campaign.id, organizationId);
                                        const updatedCampaigns = await campaignService.getCampaigns(organizationId);
                                        setCampaigns(updatedCampaigns || []);
                                    }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600">
                                        <Trash2 size={16}/>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* Campaign Detail Modal */}
        {selectedCampaign && (
            <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl p-6 flex flex-col max-h-[92vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <div className={`p-3 rounded-lg ${selectedCampaign.type === 'whatsapp' ? 'bg-green-50' : 'bg-blue-50'}`}>
                                {selectedCampaign.type === 'whatsapp' ? <MessageCircle size={24} className="text-green-600" /> : <Mail size={24} className="text-blue-600" />}
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">{selectedCampaign.name}</h3>
                                <p className="text-xs text-slate-500">{selectedCampaign.createdAt.toLocaleDateString()} a las {selectedCampaign.createdAt.toLocaleTimeString()}</p>
                            </div>
                        </div>
                        <button onClick={() => setSelectedCampaign(null)}><X size={24} className="text-slate-400 hover:text-slate-700"/></button>
                    </div>

                    <div className="space-y-4">
                        {/* Tipo y Estado */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-4 rounded-lg">
                                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo</p>
                                <p className="text-sm font-medium text-slate-800">{selectedCampaign.type === 'whatsapp' ? 'WhatsApp' : 'Email'}</p>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-lg">
                                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Estado</p>
                                <p className={`text-sm font-bold ${
                                    selectedCampaign.status === 'sent' ? 'text-green-700' :
                                    selectedCampaign.status === 'sending' ? 'text-yellow-700' :
                                    selectedCampaign.status === 'failed' ? 'text-red-700' :
                                    'text-slate-700'
                                }`}>
                                    {selectedCampaign.status === 'sent' ? 'Enviada' :
                                     selectedCampaign.status === 'sending' ? 'Enviando...' :
                                     selectedCampaign.status === 'failed' ? 'Fallida' :
                                     'Borrador'}
                                </p>
                            </div>
                        </div>

                        {/* Información de Template (WhatsApp) */}
                        {selectedCampaign.type === 'whatsapp' && (
                            <div className="border-t pt-4">
                                <h4 className="font-bold text-slate-800 mb-2">Información de Template</h4>
                                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                                    <p className="text-sm"><span className="font-bold">Nombre:</span> {selectedCampaign.templateName}</p>
                                    <p className="text-sm"><span className="font-bold">Idioma:</span> {selectedCampaign.templateLanguage}</p>
                                </div>
                            </div>
                        )}

                        {/* Información de Email */}
                        {selectedCampaign.type === 'email' && (
                            <div className="border-t pt-4">
                                <h4 className="font-bold text-slate-800 mb-2">Información del Email</h4>
                                <div className="space-y-2">
                                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                        <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Asunto</p>
                                        <p className="text-sm text-slate-800">{selectedCampaign.emailSubject}</p>
                                    </div>
                                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                        <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Cuerpo (vista previa)</p>
                                        <div
                                            className="mt-2 p-4 bg-white rounded-lg text-slate-900 text-sm border border-blue-100"
                                            dangerouslySetInnerHTML={{ __html: selectedCampaign.emailBody || '' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Estadísticas */}
                        <div className="border-t pt-4">
                            <h4 className="font-bold text-slate-800 mb-2">Estadísticas</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <div className="bg-slate-50 p-3 rounded-lg">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Total</p>
                                    <p className="text-lg font-bold text-slate-800">{selectedCampaign.recipientCount}</p>
                                </div>
                                {selectedCampaign.stats && (
                                    <>
                                        <div className="bg-emerald-50 p-3 rounded-lg">
                                            <p className="text-[10px] font-bold text-emerald-600 uppercase">Enviados</p>
                                            <p className="text-lg font-bold text-emerald-700">{selectedCampaign.stats.sent}</p>
                                        </div>
                                        <div className="bg-blue-50 p-3 rounded-lg">
                                            <p className="text-[10px] font-bold text-blue-600 uppercase">Entregados</p>
                                            <p className="text-lg font-bold text-blue-700">{selectedCampaign.stats.delivered || 0}</p>
                                        </div>
                                        <div className="bg-red-50 p-3 rounded-lg">
                                            <p className="text-[10px] font-bold text-red-600 uppercase">Fallidos</p>
                                            <p className="text-lg font-bold text-red-700">{selectedCampaign.stats.failed || 0}</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Destinatarios */}
                        <div className="border-t pt-4">
                            <h4 className="font-bold text-slate-800 mb-2">Destinatarios ({selectedCampaign.recipientIds.length})</h4>
                            <div className="border rounded-lg max-h-48 overflow-y-auto bg-slate-50">
                                {selectedCampaign.recipientIds.length === 0 ? (
                                    <div className="p-4 text-center text-sm text-slate-400">No hay destinatarios</div>
                                ) : (
                                    <div className="divide-y divide-slate-200">
                                        {selectedCampaign.recipientIds.map(contactId => {
                                            const contact = contacts.find(c => c.id === contactId);
                                            if (!contact) return null;
                                            return (
                                                <div key={contactId} className="p-3 flex items-center gap-3 hover:bg-slate-100">
                                                    <img src={contact.avatar || `https://ui-avatars.com/api/?name=${contact.name}`} className="w-8 h-8 rounded-full" />
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-slate-800">{contact.name}</p>
                                                        <p className="text-xs text-slate-500">{contact.phone || contact.email}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-4 border-t">
                        <button onClick={() => setSelectedCampaign(null)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg font-bold hover:bg-slate-200">Cerrar</button>
                    </div>
                </div>
            </div>
        )}

        {/* Modals for Contact and Property creation */}
        {showContactModal && (
            <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col max-h-[90vh]">
                     <h3 className="text-lg font-bold text-slate-800 mb-4">{contactForm.id ? 'Edit Contact' : 'Add New Contact'}</h3>
                                         <div className="space-y-3 overflow-y-auto flex-1">
                                                {contactFormError && (
                                                    <div className="bg-red-50 text-red-700 px-3 py-2 rounded mb-2 text-xs font-semibold border border-red-200">{contactFormError}</div>
                                                )}
                        <input type="text" className="w-full border p-2 rounded text-sm" placeholder="Full Name" value={contactForm.name} onChange={e=>setContactForm({...contactForm, name: e.target.value})} />
                        <input type="email" className="w-full border p-2 rounded text-sm" placeholder="Email" value={contactForm.email} onChange={e=>setContactForm({...contactForm, email: e.target.value})} />
                        <input type="text" className="w-full border p-2 rounded text-sm" placeholder="Phone" value={contactForm.phone} onChange={e=>setContactForm({...contactForm, phone: e.target.value})} />
                        <input type="text" className="w-full border p-2 rounded text-sm" placeholder="Company" value={contactForm.company} onChange={e=>setContactForm({...contactForm, company: e.target.value})} />
                        <label className="block text-xs font-bold text-slate-500 mt-4 uppercase">Stage</label>
                        <select className="w-full border p-2 rounded text-sm" value={contactForm.pipelineStageId} onChange={e=>setContactForm({...contactForm, pipelineStageId: e.target.value})}>
                            {MOCK_PIPELINES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {customProperties.length > 0 && (
                            <div className="mt-4 pt-2 border-t">
                                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Custom Properties</label>
                                {customProperties.map(p => (
                                    <div key={p.id} className="mb-2">
                                        <label className="text-xs text-slate-600">{p.name}</label>
                                        {(p.type === 'text') && (
                                            <input 
                                                type="text"
                                                placeholder={p.name} 
                                                className="w-full border p-2 rounded text-sm bg-slate-50" 
                                                value={contactForm.properties[p.id] || ''}
                                                onChange={e => setContactForm({...contactForm, properties: {...contactForm.properties, [p.id]: e.target.value}})} 
                                            />
                                        )}
                                        {p.type === 'number' && (
                                            <input 
                                                type="number"
                                                placeholder={p.name} 
                                                className="w-full border p-2 rounded text-sm bg-slate-50" 
                                                value={contactForm.properties[p.id] || ''}
                                                onChange={e => setContactForm({...contactForm, properties: {...contactForm.properties, [p.id]: e.target.value}})} 
                                            />
                                        )}
                                        {p.type === 'date' && (
                                            <input 
                                                type="date"
                                                className="w-full border p-2 rounded text-sm bg-slate-50" 
                                                value={contactForm.properties[p.id] || ''}
                                                onChange={e => setContactForm({...contactForm, properties: {...contactForm.properties, [p.id]: e.target.value}})} 
                                            />
                                        )}
                                        {p.type === 'time' && (
                                            <input 
                                                type="time"
                                                className="w-full border p-2 rounded text-sm bg-slate-50" 
                                                value={contactForm.properties[p.id] || ''}
                                                onChange={e => setContactForm({...contactForm, properties: {...contactForm.properties, [p.id]: e.target.value}})} 
                                            />
                                        )}
                                        {p.type === 'phone' && (
                                            <input 
                                                type="tel"
                                                placeholder="+1234567890"
                                                className="w-full border p-2 rounded text-sm bg-slate-50" 
                                                value={contactForm.properties[p.id] || ''}
                                                onChange={e => setContactForm({...contactForm, properties: {...contactForm.properties, [p.id]: e.target.value}})} 
                                            />
                                        )}
                                        {p.type === 'percentage' && (
                                            <div className="relative">
                                                <input 
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    placeholder="0"
                                                    className="w-full border p-2 pr-8 rounded text-sm bg-slate-50" 
                                                    value={contactForm.properties[p.id] || ''}
                                                    onChange={e => setContactForm({...contactForm, properties: {...contactForm.properties, [p.id]: e.target.value}})} 
                                                />
                                                <span className="absolute right-3 top-2 text-slate-500 text-sm">%</span>
                                            </div>
                                        )}
                                        {p.type === 'select' && (
                                            <select 
                                                className="w-full border p-2 rounded text-sm bg-slate-50" 
                                                value={contactForm.properties[p.id] || ''}
                                                onChange={e => setContactForm({...contactForm, properties: {...contactForm.properties, [p.id]: e.target.value}})}
                                            >
                                                <option value="">Select {p.name}</option>
                                                {(p.options || []).map((option, idx) => (
                                                    <option key={idx} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                     </div>
                     <div className="flex gap-2 mt-4"><button onClick={handleSaveContact} className="flex-1 bg-emerald-600 text-white py-2 rounded">Save</button><button onClick={()=>setShowContactModal(false)} className="flex-1 bg-slate-200 text-slate-700 py-2 rounded">Cancel</button></div>
                </div>
            </div>
        )}

        {/* Menú de acciones anclado (fixed) */}
        {actionsMenu && (
            <>
              <div className="fixed inset-0 z-[999]" onClick={closeActionsMenu}></div>
              <div className="fixed z-[1000] bg-white shadow-xl border border-slate-100 rounded-lg min-w-[160px]" style={{ top: actionsMenu.top, left: actionsMenu.left }}>
                  <button onClick={() => { const c = contacts.find(c => c.id === actionsMenu.contactId); if (c) { setSelectedContact(c); } closeActionsMenu(); }} className="w-full flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-50 text-sm">
                      <Edit2 size={14}/> Ver/Editar
                  </button>
                  <button onClick={() => { setContactToUpdateList(actionsMenu.contactId); setShowAddToListModal(true); closeActionsMenu(); }} className="w-full flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-50 text-sm border-t border-slate-50">
                      <Plus size={14}/> Agregar a lista...
                  </button>
                  <button onClick={(e) => { const c = contacts.find(c => c.id === actionsMenu.contactId); if (c) handleDelete(c.id, e as any); closeActionsMenu(); }} className="w-full flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 text-sm border-t border-slate-50">
                      <Trash2 size={14}/> Eliminar
                  </button>
              </div>
            </>
        )}

        {showPropModal && (
            <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                 <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                     <h3 className="text-lg font-bold text-slate-800 mb-4">Add Custom Property</h3>
                     <input type="text" className="w-full border p-2 rounded mb-3" placeholder="Property Name" value={newPropName} onChange={e => setNewPropName(e.target.value)} />
                     <select className="w-full border p-2 rounded mb-3" value={newPropType} onChange={e => setNewPropType(e.target.value as any)}>
                         <option value="text">Text</option>
                         <option value="number">Number</option>
                         <option value="date">Date</option>
                         <option value="time">Time</option>
                         <option value="phone">Phone</option>
                         <option value="percentage">Percentage</option>
                         <option value="select">Select (Dropdown)</option>
                     </select>
                     {newPropType === 'select' && (
                         <div className="mb-3">
                             <label className="block text-xs text-slate-600 mb-1">Options (comma-separated)</label>
                             <input 
                                 type="text" 
                                 className="w-full border p-2 rounded text-sm" 
                                 placeholder="Option 1, Option 2, Option 3" 
                                 value={newPropOptions} 
                                 onChange={e => setNewPropOptions(e.target.value)} 
                             />
                             <p className="text-xs text-slate-400 mt-1">Example: Lead, Qualified, Customer</p>
                         </div>
                     )}
                     <button onClick={handleCreateProperty} className="w-full bg-emerald-600 text-white py-2 rounded">Save</button>
                     <button onClick={()=>setShowPropModal(false)} className="w-full bg-slate-200 text-slate-700 py-2 rounded mt-2">Cancel</button>
                 </div>
            </div>
        )}

        {showListNameModal && (
            <div className="absolute inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                 <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                     <h3 className="text-lg font-bold text-slate-800 mb-4">Guardar como Lista</h3>
                     <p className="text-xs text-slate-500 mb-4">Se guardarán los filtros actuales ({filters.length}) para usarlos después.</p>
                     <input 
                        type="text" 
                        className="w-full border p-2 rounded mb-4" 
                        placeholder="Nombre de la lista (ej: Clientes VIP)" 
                        value={newListName} 
                        onChange={e => setNewListName(e.target.value)} 
                        autoFocus
                     />
                     <div className="flex gap-2">
                        <button onClick={handleSaveCurrentFiltersAsList} className="flex-1 bg-emerald-600 text-white py-2 rounded font-bold">Guardar</button>
                        <button onClick={()=>setShowListNameModal(false)} className="flex-1 bg-slate-200 text-slate-700 py-2 rounded font-bold">Cancelar</button>
                     </div>
                 </div>
            </div>
        )}

        {showAddToListModal && (
            <div className="absolute inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                 <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                     <h3 className="text-lg font-bold text-slate-800 mb-4">Agregar a una Lista</h3>
                     <p className="text-xs text-slate-500 mb-4">Selecciona la lista a la que quieres añadir este contacto de forma permanente.</p>
                     
                     {lists.length === 0 ? (
                         <div className="bg-slate-50 p-4 rounded text-center mb-4">
                             <p className="text-sm text-slate-500">No hay listas creadas. Crea una primero guardando filtros en la pestaña de Contacts.</p>
                         </div>
                     ) : (
                         <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
                             {lists.map(l => (
                                 <button key={l.id} onClick={() => handleAddContactToList(l.id)} className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-emerald-500 hover:bg-emerald-50 text-sm font-medium flex items-center gap-2">
                                     <Database size={14} className="text-slate-400" />
                                     {l.name}
                                 </button>
                             ))}
                         </div>
                     )}
                     
                     <button onClick={()=>setShowAddToListModal(false)} className="w-full bg-slate-200 text-slate-700 py-2 rounded font-bold">Cerrar</button>
                 </div>
            </div>
        )}

        {/* View Details Modal */}
        {selectedContact && (
            <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                    <div className="bg-slate-800 p-6 text-white relative">
                        <div className="flex justify-between items-start">
                             <div className="flex gap-4 items-center">
                                 <img src={selectedContact.avatar || `https://ui-avatars.com/api/?name=${selectedContact.name}`} className="w-16 h-16 rounded-full border-2 border-white"/>
                                 <div>
                                     <h3 className="text-xl font-bold">{selectedContact.name}</h3>
                                     <p className="text-slate-300">{selectedContact.company}</p>
                                 </div>
                             </div>
                             <button onClick={()=>setSelectedContact(null)}><X size={24} className="text-slate-400 hover:text-white"/></button>
                        </div>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="flex gap-2 mb-4">
                            {onChatSelect && (
                                <button 
                                    onClick={() => { onChatSelect(selectedContact); setSelectedContact(null); }}
                                    className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center justify-center gap-2"
                                >
                                    <MessageCircle size={18} /> Go to Chat
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-2 rounded"><span className="text-xs font-bold text-slate-400">EMAIL</span><p className="text-sm">{selectedContact.email}</p></div>
                            <div className="bg-slate-50 p-2 rounded"><span className="text-xs font-bold text-slate-400">PHONE</span><p className="text-sm">{selectedContact.phone}</p></div>
                        </div>
                        {customProperties.length > 0 && (
                            <div className="border-t pt-2">
                                <h4 className="font-bold mb-2 text-sm">Custom Properties</h4>
                                {customProperties.map(p => (
                                    <div key={p.id} className="flex justify-between border-b border-slate-100 py-1">
                                        <span className="text-sm text-slate-500">{p.name}</span>
                                        <span className="text-sm font-medium">{selectedContact.properties[p.id] || '-'}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="pt-4 mt-2 border-t flex justify-end">
                            <button onClick={handleEditContactFromModal} className="flex items-center gap-2 text-slate-600 hover:text-emerald-600 font-medium">
                                <Edit2 size={16}/> Edit Contact
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Campaign Modal */}
        {showCampaignModal && (
            <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl p-6 flex flex-col max-h-[92vh]">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Nueva Campaña Masiva</h3>
                    
                    <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                        {campaignError && (
                            <div className="bg-red-50 text-red-700 px-3 py-2 rounded mb-4 text-xs font-semibold border border-red-200">
                                {campaignError}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Nombre de la campaña</label>
                            <input 
                                type="text" 
                                className="w-full border p-2 rounded text-sm" 
                                placeholder="Ej: Promoción de verano"
                                value={campaignForm.name || ''} 
                                onChange={e => setCampaignForm({...campaignForm, name: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Gestión de Audiencia</label>
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-emerald-100 text-emerald-700 p-2 rounded-lg">
                                            <CheckSquare size={20} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800">{selectedContacts.size} Destinatarios</h4>
                                            <button 
                                                onClick={() => setShowSelectedPreview(!showSelectedPreview)}
                                                className="text-[10px] text-emerald-600 uppercase font-bold hover:underline"
                                            >
                                                {showSelectedPreview ? 'Ocultar lista' : 'Ver quienes están seleccionados'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <button onClick={() => setSelectedContacts(new Set())} className="text-[10px] text-red-500 hover:underline uppercase font-bold">Limpiar todo</button>
                                        <button onClick={() => { setShowCampaignModal(false); setActiveTab('contacts'); }} className="text-[10px] text-blue-600 hover:underline uppercase font-bold">Añadir más...</button>
                                    </div>
                                </div>

                                {showSelectedPreview && (
                                    <div className="mb-4 bg-white border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
                                        {contacts.filter(c => selectedContacts.has(c.id)).map(contact => (
                                            <div key={contact.id} className="p-2 flex items-center justify-between group">
                                                <div className="flex items-center gap-2">
                                                    <img src={contact.avatar || `https://ui-avatars.com/api/?name=${contact.name}`} className="w-6 h-6 rounded-full" />
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-medium text-slate-700">{contact.name}</span>
                                                        <span className="text-[9px] text-slate-400">{contact.phone || contact.email}</span>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        const next = new Set(selectedContacts);
                                                        next.delete(contact.id);
                                                        setSelectedContacts(next);
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                        {selectedContacts.size === 0 && (
                                            <div className="p-4 text-center text-xs text-slate-400 italic">No hay contactos seleccionados</div>
                                        )}
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase">Agregar contactos de una lista:</label>
                                        <div className="flex gap-2">
                                            <select 
                                                className="flex-1 border p-2 rounded-lg text-sm bg-white outline-none focus:border-emerald-500 shadow-sm"
                                                defaultValue=""
                                                onChange={(e) => {
                                                    const listId = e.target.value;
                                                    if (listId) {
                                                        const list = lists.find(l => l.id === listId);
                                                        if (list) {
                                                            const inactive = new Set(list.inactiveContactIds || []);
                                                            const matchingContacts = filterContactsByCriteria(contacts, '', list.filters as CRMFilter[]);
                                                            const activeMatching = matchingContacts.filter(c => !inactive.has(c.id)).map(c => c.id);
                                                            const manualIds = (list.manualContactIds || []).filter(id => !inactive.has(id));
                                                            // Combinar con la selección actual, solo contactos activos
                                                            setSelectedContacts(new Set([...Array.from(selectedContacts), ...activeMatching, ...manualIds]));
                                                        }
                                                        e.target.value = ""; // Reset dropdown
                                                    }
                                                }}
                                            >
                                                <option value="" disabled>-- Seleccionar una lista para añadir --</option>
                                                {lists.map(l => (
                                                    <option key={l.id} value={l.id}>{l.name} (+{l.filters.length + (l.manualContactIds?.length || 0)} posibles)</option>
                                                ))}
                                            </select>
                                        </div>
                                        <p className="text-[10px] text-slate-400">Las listas añaden nuevos destinatarios a los que ya tenías seleccionados.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Tipo de campaña</label>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setCampaignForm({...campaignForm, type: 'whatsapp'})}
                                    className={`flex-1 p-4 border-2 rounded-lg flex items-center justify-center gap-2 ${
                                        campaignForm.type === 'whatsapp' ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    <MessageCircle size={24} className={campaignForm.type === 'whatsapp' ? 'text-green-600' : 'text-slate-400'} />
                                    <span className="font-medium">WhatsApp</span>
                                </button>
                                <button 
                                    onClick={() => setCampaignForm({...campaignForm, type: 'email'})}
                                    className={`flex-1 p-4 border-2 rounded-lg flex flex-col items-center justify-center gap-2 transition-all ${campaignForm.type === 'email' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}
                                >
                                    <Mail size={24} className={campaignForm.type === 'email' ? 'text-blue-600' : 'text-slate-400'} />
                                    <span className="font-medium">Email</span>
                                </button>
                            </div>

                            {/* Warning: channel not configured */}
                            {campaignForm.type === 'whatsapp' && !isWhatsAppConfigured && (
                                <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-start gap-3">
                                    <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <div>
                                        <p className="font-semibold text-sm">WhatsApp no configurado</p>
                                        <p className="text-xs mt-0.5">No podrás enviar esta campaña hasta que conectes tu cuenta de WhatsApp en <strong>Configuración → Channels → WhatsApp</strong>.</p>
                                    </div>
                                </div>
                            )}
                            {campaignForm.type === 'email' && !isGmailConfigured && (
                                <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-start gap-3">
                                    <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <div>
                                        <p className="font-semibold text-sm">Gmail no configurado</p>
                                        <p className="text-xs mt-0.5">No podrás enviar esta campaña hasta que conectes tu cuenta de Gmail en <strong>Configuración → Channels → Gmail</strong>.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {campaignForm.type === 'whatsapp' ? (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Template de WhatsApp</label>
                                <select 
                                    className="w-full border p-2 rounded text-sm"
                                    value={campaignForm.templateId || ''}
                                    onChange={e => setCampaignForm({...campaignForm, templateId: e.target.value})}
                                >
                                    <option value="">Selecciona un template aprobado</option>
                                    {templates.map(t => (
                                        <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-400 mt-1">
                                    Solo se muestran templates aprobados por Meta. Ve a Settings para sincronizar templates.
                                </p>
                            </div>
                        ) : (
                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <EmailEditor
                                    subject={campaignForm.emailSubject || ''}
                                    body={campaignForm.emailBody || ''}
                                    onSubjectChange={(v) => setCampaignForm({...campaignForm, emailSubject: v})}
                                    onBodyChange={(v) => setCampaignForm({...campaignForm, emailBody: v})}
                                    customProperties={customProperties}
                                />
                            </div>
                        )}

                        <div className="border-t pt-4">
                            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Programar envío</label>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 relative">
                                    <Clock size={16} className="absolute left-3 top-2.5 text-slate-400" />
                                    <input 
                                        type="datetime-local" 
                                        className="w-full border pl-10 p-2 rounded text-sm bg-slate-50 focus:bg-white"
                                        value={campaignForm.scheduledAt ? (() => {
                                            const d = new Date(campaignForm.scheduledAt);
                                            const year = d.getFullYear();
                                            const month = String(d.getMonth() + 1).padStart(2, '0');
                                            const day = String(d.getDate()).padStart(2, '0');
                                            const hours = String(d.getHours()).padStart(2, '0');
                                            const minutes = String(d.getMinutes()).padStart(2, '0');
                                            return `${year}-${month}-${day}T${hours}:${minutes}`;
                                        })() : ''}
                                        onChange={e => {
                                            if (e.target.value) {
                                                // datetime-local devuelve "YYYY-MM-DDTHH:MM" sin zona horaria
                                                // new Date() lo interpreta como hora local del navegador — correcto
                                                setCampaignForm({...campaignForm, scheduledAt: new Date(e.target.value)});
                                            } else {
                                                // Si el usuario borra el campo, quitar la programación
                                                const { scheduledAt, ...rest } = campaignForm;
                                                setCampaignForm(rest);
                                            }
                                        }}
                                        min={(() => {
                                            const now = new Date();
                                            const year = now.getFullYear();
                                            const month = String(now.getMonth() + 1).padStart(2, '0');
                                            const day = String(now.getDate()).padStart(2, '0');
                                            const hours = String(now.getHours()).padStart(2, '0');
                                            const minutes = String(now.getMinutes()).padStart(2, '0');
                                            return `${year}-${month}-${day}T${hours}:${minutes}`;
                                        })()}
                                    />
                                </div>
                                <div className="text-[10px] text-slate-400 max-w-[150px]">
                                    <p>Tu zona horaria:</p>
                                    <p className="font-semibold text-slate-600">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
                                    <p className="mt-1">O deja vacío para enviar ahora.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 mt-6 pt-4 border-t">
                        <button 
                            onClick={handleSendCampaign} 
                            disabled={selectedContacts.size === 0 || isCampaignSubmitting || (campaignForm.type === 'email' && !isGmailConfigured) || (campaignForm.type === 'whatsapp' && !isWhatsAppConfigured)}
                            className={`flex-1 py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg transition-all ${
                                selectedContacts.size === 0 || isCampaignSubmitting || (campaignForm.type === 'email' && !isGmailConfigured) || (campaignForm.type === 'whatsapp' && !isWhatsAppConfigured)
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                                : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]'
                            }`}
                        >
                            <Send size={18} />
                            {campaignForm.scheduledAt ? 'Programar campaña' : 'Lanzar campaña ahora'}
                        </button>
                        <button 
                            onClick={() => !isCampaignSubmitting && setShowCampaignModal(false)} 
                            disabled={isCampaignSubmitting}
                            className={`flex-1 py-3 rounded-lg font-bold transition-colors ${
                              isCampaignSubmitting ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
export default CRMScreen;
