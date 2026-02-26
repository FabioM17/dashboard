
import React, { useState, useEffect } from 'react';
import { Key, Shield, Plus, Trash2, Save, Users, Share2, Facebook, Instagram, MessageCircle, FileJson, Zap, Loader2, CheckCircle, Copy, ExternalLink, Bot, Sparkles, Workflow, Activity, XCircle, Mail, User as UserIcon, Lock, AlertTriangle, RefreshCw, CheckCircle2, UserCog, CheckSquare, PhoneCall, Eye, EyeOff, ToggleLeft, ToggleRight, BookOpen, Code, ChevronDown, ChevronUp, Database, Palette, Sun, Moon, Type, Monitor } from 'lucide-react';
import { WebhookConfig, ChannelConfig, User, UserRole, Snippet, Template } from '../types';
import { useAppearance, AccentColor, ThemeMode, FontSize, ChatBg, UserAppearance } from '../contexts/AppearanceContext';
import { MOCK_CHANNELS } from '../constants';
import { chatService } from '../services/chatService';
import { authService } from '../services/authService';
import { teamService } from '../services/teamService';
import { validationService } from '../services/validationService';
import { snippetService } from '../services/snippetService';
import { templateService } from '../services/templateService'; // Import template service
import { facebookAuthService } from '../services/facebookAuthService';
import { organizationService } from '../services/organizationService';
import { gmailService } from '../services/gmailService';
import { supabase } from '../services/supabaseClient';
import { WhatsAppEmbeddedSignup } from './WhatsAppEmbeddedSignup';
import { fetchAndSavePhoneNumber } from '../services/whatsappIntegrationService';
import { apiKeyService, ApiKey, ApiEndpointConfig, API_SCOPES, API_ENDPOINTS } from '../services/apiKeyService';
import ApiDocumentation from './ApiDocumentation';
import DataDeletionScreen from './DataDeletionScreen';

const SettingsScreen: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'general' | 'team' | 'channels' | 'ai' | 'automation' | 'retell' | 'templates' | 'snippets' | 'api' | 'data'>('profile');
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const { appearance, updateAppearance } = useAppearance();
    const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Profile State
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Team Management State
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'community' as UserRole, phone: '' });
  const [isInviting, setIsInviting] = useState(false);
  
  // Snippets State
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [isLoadingSnippets, setIsLoadingSnippets] = useState(false);
  const [showSnippetModal, setShowSnippetModal] = useState(false);
  const [snippetForm, setSnippetForm] = useState({ shortcut: '', content: '' });

  // Templates State
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSyncingTemplates, setIsSyncingTemplates] = useState(false);

  // Mock State for Channels
  const [channels, setChannels] = useState<ChannelConfig[]>(MOCK_CHANNELS);

  // Collapsed/Expanded state for channel cards (collapsed by default)
  const [expandedChannels, setExpandedChannels] = useState<Record<string, boolean>>({});
  const toggleChannelExpand = (id: string) => setExpandedChannels(prev => ({ ...prev, [id]: !prev[id] }));

  // WhatsApp Config State
  const [waPhoneId, setWaPhoneId] = useState('');
  const [waWabaId, setWaWabaId] = useState('');
  const [waToken, setWaToken] = useState('');
  const [isSavingWa, setIsSavingWa] = useState(false);
  const [waSaveStatus, setWaSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [whatsappConfig, setWhatsappConfig] = useState<any>(null);
  const [isLoadingWhatsApp, setIsLoadingWhatsApp] = useState(false);
  const [isWhatsAppConfigured, setIsWhatsAppConfigured] = useState(false);

  // Gemini Config State
  const [geminiKey, setGeminiKey] = useState('');
  const [systemInstruction, setSystemInstruction] = useState('');
  const [isSavingAI, setIsSavingAI] = useState(false);
  const [aiSaveStatus, setAiSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // N8N Config State
  const [n8nUrl, setN8nUrl] = useState('');
  const [isN8nActive, setIsN8nActive] = useState(false);
  const [isSavingN8n, setIsSavingN8n] = useState(false);
  const [n8nSaveStatus, setN8nSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isTestingN8n, setIsTestingN8n] = useState(false);

  // Retell Config State (ADDED)
  const [retellWebhookUrl, setRetellWebhookUrl] = useState('');
  const [isSavingRetell, setIsSavingRetell] = useState(false);
  const [retellSaveStatus, setRetellSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isTestingRetell, setIsTestingRetell] = useState(false);

  // WhatsApp Signup State
  const [showWhatsAppSignup, setShowWhatsAppSignup] = useState(false);

  // Organization Details State
  const [orgDetails, setOrgDetails] = useState<any>(null);
  const [isLoadingOrgDetails, setIsLoadingOrgDetails] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [isSavingOrgDetails, setIsSavingOrgDetails] = useState(false);
  const [orgDetailsSaveStatus, setOrgDetailsSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Gmail Config State
  const [gmailConfig, setGmailConfig] = useState<{ gmail_address: string; connected_at: string } | null>(null);
  const [isLoadingGmail, setIsLoadingGmail] = useState(false);
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [gmailError, setGmailError] = useState('');

  // API Keys State
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [endpointConfigs, setEndpointConfigs] = useState<ApiEndpointConfig[]>([]);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [newKeyForm, setNewKeyForm] = useState({ name: '', scopes: [] as string[], expiresAt: '' });
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [showApiDocs, setShowApiDocs] = useState(false);
  const [apiKeyVisibility, setApiKeyVisibility] = useState<Record<string, boolean>>({});


  useEffect(() => {
    const init = async () => {
        const user = await authService.getCurrentUser();
        setCurrentUser(user);
        
        if (user) {
            // Load Organization Details
            if (activeTab === 'general') {
                setIsLoadingOrgDetails(true);
                const details = await organizationService.getOrganizationDetails(user.organizationId);
                if (details) {
                    setOrgDetails(details);
                    setCompanyName(details.name || '');
                    setSupportEmail(details.support_email || '');
                }
                setIsLoadingOrgDetails(false);
            }
            // Load WhatsApp Config
            if (activeTab === 'channels') {
                setIsLoadingWhatsApp(true);
                const config = await chatService.getWhatsAppConfig(user.organizationId);
                console.log('🔍 [Settings] WhatsApp Config loaded:', config);
                
                if (config) {
                    setWhatsappConfig(config);
                    setWaPhoneId(config.phone_id || config.phone_number_id || '');
                    setWaWabaId(config.waba_id || '');
                    setWaToken(config.access_token || '');
                    setIsWhatsAppConfigured(true);
                    
                    console.log('📊 [Settings] Config Details:');
                    console.log('  - phone_number:', config.phone_number || 'NOT SET');
                    console.log('  - phone_number_id:', config.phone_number_id || 'NOT SET');
                    console.log('  - access_token:', config.access_token ? 'EXISTS' : 'NOT SET');
                    
                    // RETRY: Si no tiene phone_number pero tiene access_token y phone_id, intentar obtenerlo
                    if (!config.phone_number && config.access_token && config.phone_number_id) {
                        console.log('📞 [Settings] Phone number missing, attempting to fetch...');
                        console.log('📞 [Settings] Using phone_number_id:', config.phone_number_id);
                        try {
                            const result = await fetchAndSavePhoneNumber(
                                user.organizationId,
                                config.phone_number_id,
                                config.access_token
                            );
                            
                            console.log('📊 [Settings] Fetch result:', result);
                            
                            if (result.success && result.phoneNumber) {
                                console.log('✅ [Settings] Phone number fetched successfully:', result.phoneNumber);
                                // Recargar la configuración para mostrar el número
                                const updatedConfig = await chatService.getWhatsAppConfig(user.organizationId);
                                console.log('🔄 [Settings] Updated config:', updatedConfig);
                                if (updatedConfig) {
                                    setWhatsappConfig(updatedConfig);
                                }
                            } else {
                                console.warn('⚠️ [Settings] Could not fetch phone number:', result.error);
                            }
                        } catch (error) {
                            console.warn('⚠️ [Settings] Error fetching phone number:', error);
                        }
                    } else {
                        console.log('ℹ️ [Settings] Phone number already set or missing credentials');
                    }
                } else {
                    setIsWhatsAppConfigured(false);
                }
                setIsLoadingWhatsApp(false);
            }
            // Load Gmail Config
            if (activeTab === 'channels') {
                setIsLoadingGmail(true);
                try {
                    const gConfig = await gmailService.getGmailConfig(user.organizationId);
                    if (gConfig) {
                        setGmailConfig({ gmail_address: gConfig.gmail_address, connected_at: gConfig.connected_at });
                    } else {
                        setGmailConfig(null);
                    }
                } catch (err) {
                    console.warn('[Settings] Error loading Gmail config:', err);
                }
                setIsLoadingGmail(false);
            }
            // Load AI Config
            if (activeTab === 'ai') {
                const config = await chatService.getGeminiConfig(user.organizationId);
                if (config) {
                    setGeminiKey(config.api_key || '');
                    setSystemInstruction(config.system_instruction || '');
                }
            }
            // Load N8N Config
            if (activeTab === 'automation') {
                const config = await chatService.getN8nConfig(user.organizationId);
                if (config) {
                    setN8nUrl(config.webhook_url || '');
                    setIsN8nActive(config.is_active || false);
                }
            }
            // Load Retell Config (ADDED)
            if (activeTab === 'retell') {
                const config = await chatService.getRetellConfig(user.organizationId);
                if (config) {
                    setRetellWebhookUrl(config.webhook_url || '');
                }
            }
            // Load Team Members
            if (activeTab === 'team') {
                setIsLoadingTeam(true);
                const members = await teamService.getTeamMembers(user.organizationId);
                setTeamMembers(members);
                setIsLoadingTeam(false);
            }
            // Load Snippets
            if (activeTab === 'snippets') {
                setIsLoadingSnippets(true);
                const data = await snippetService.getSnippets(user.organizationId);
                setSnippets(data);
                setIsLoadingSnippets(false);
            }
            // Load Templates
            if (activeTab === 'templates') {
                setIsLoadingTemplates(true);
                const data = await templateService.getTemplates(user.organizationId);
                setTemplates(data);
                setIsLoadingTemplates(false);
            }
            // Load API Keys & Endpoint Configs
            if (activeTab === 'api') {
                setIsLoadingApiKeys(true);
                try {
                    const [keys, configs] = await Promise.all([
                        apiKeyService.getApiKeys(user.organizationId),
                        apiKeyService.getEndpointConfigs(user.organizationId),
                    ]);
                    setApiKeys(keys);
                    // If no endpoint configs exist, seed defaults
                    if (configs.length === 0) {
                        await apiKeyService.seedEndpointDefaults(user.organizationId);
                        const seeded = await apiKeyService.getEndpointConfigs(user.organizationId);
                        setEndpointConfigs(seeded);
                    } else {
                        setEndpointConfigs(configs);
                    }
                } catch (err) {
                    console.error('Error loading API keys:', err);
                }
                setIsLoadingApiKeys(false);
            }
        }
    };
    init();
  }, [activeTab]);

  // Gmail OAuth callback is now handled via popup postMessage
  // (no URL-param-based callback needed anymore)

  const handleUpdatePassword = async () => {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
          alert("Passwords do not match");
          return;
      }
      setIsUpdatingPassword(true);
      try {
          const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
          if (error) throw error;
          alert("Password updated successfully!");
          setPasswordForm({ newPassword: '', confirmPassword: '' });
      } catch (error: any) {
          alert("Error: " + error.message);
      } finally {
          setIsUpdatingPassword(false);
      }
  };

  

  const handleToggleChannel = (id: string) => {
      setChannels(channels.map(c => c.id === id ? { ...c, isConnected: !c.isConnected } : c));
  };

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
      if (!currentUser) return;
      if (currentUser.role !== 'admin') { alert("Access Denied"); return; }
      if (userId === currentUser.id && newRole !== 'admin') { if (!confirm("Warning: You are downgrading your own account.")) return; }
      const previousTeam = [...teamMembers];
      setTeamMembers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      try { await teamService.updateMemberRole(userId, newRole); } catch (error: any) { setTeamMembers(previousTeam); alert(`Error: ${error.message}`); }
  };

  const handleRemoveMember = async (userId: string) => {
      if (!currentUser) return;
      if (currentUser.role !== 'admin') { alert("Access Denied"); return; }
      if (userId === currentUser.id) { alert("Cannot remove yourself."); return; }
      if(!confirm("Remove this user?")) return;
      const previousTeam = [...teamMembers];
        setTeamMembers(teamMembers.filter(m => m.id !== userId));
        setTeamMembers(prev => prev.filter(m => m.id !== userId));
      try { await teamService.removeMember(userId); } catch (error: any) { setTeamMembers(previousTeam); alert(`Error: ${error.message}`); }
  };

  const handleInviteMember = async () => {
      if (!currentUser?.organizationId || !inviteForm.email || !inviteForm.name) {
          alert("Please fill in all required fields (Email and Name)");
          return;
      }
      
      // ✅ SEGURIDAD: Solo admins pueden invitar usuarios
      if (currentUser.role !== 'admin') { 
          alert("Access Denied: Only admins can invite users"); 
          return; 
      }
      
      // ✅ SEGURIDAD: Validar que no estamos invitando a alguien ya en la organización
      const userExists = teamMembers.some(m => m.email.toLowerCase() === inviteForm.email.toLowerCase());
      if (userExists) {
          alert("This user is already a member of your organization");
          return;
      }
      
      // Validar email
      if (!validationService.validateEmail(inviteForm.email)) {
          alert("Invalid email format");
          return;
      }
      
      // Validar teléfono si se proporciona
      if (inviteForm.phone && inviteForm.phone.trim() && !validationService.validatePhoneNumber(inviteForm.phone)) {
          alert("Formato de número inválido. Usa formato internacional (E.164), ej: +54911...");
          return;
      }
      
      setIsInviting(true);
      try {
          await teamService.inviteMember(
              inviteForm.email, 
              inviteForm.name, 
              inviteForm.role, 
              currentUser.organizationId,
              inviteForm.phone || undefined
          );
          // Agregar usuario temporalmente como "Esperando Verificación"
          const newMember: User = {
              id: 'pending-' + Date.now(), // ID temporal
              organizationId: currentUser.organizationId,
              name: inviteForm.name,
              email: inviteForm.email,
              role: inviteForm.role,
              phone: inviteForm.phone || undefined,
              avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(inviteForm.name)}&background=random`,
              verified: false,  // ✅ Marcar como no verificado
              lastSignInAt: null // ✅ Nunca ha iniciado sesión
          };
          setTeamMembers([...teamMembers, newMember]);
          setShowInviteModal(false);
          setInviteForm({ email: '', name: '', role: 'community', phone: '' });
          alert(`Invitation sent successfully to ${inviteForm.email}`);
      } catch (error: any) { 
          alert(`Error inviting user: ${error.message}`); 
      } finally { 
          setIsInviting(false); 
      }
  };

  const handleCreateSnippet = async () => {
      if (!currentUser?.organizationId || !snippetForm.shortcut || !snippetForm.content) return;
    try { await snippetService.createSnippet(snippetForm.shortcut, snippetForm.content, currentUser.organizationId);
          const updated = await snippetService.getSnippets(currentUser.organizationId);
          setSnippets(updated); setShowSnippetModal(false); setSnippetForm({ shortcut: '', content: '' }); } catch (e: any) { alert("Error: " + e.message); }
  };

  const handleDeleteSnippet = async (id: string) => {
      if (!currentUser?.organizationId) return; if (!confirm("Delete?")) return;
      try { await snippetService.deleteSnippet(id, currentUser.organizationId); setSnippets(snippets.filter(s => s.id !== id)); } catch (e: any) { alert("Error: " + e.message); }
  };

  const handleSeedSnippets = async () => {
      if (!currentUser?.organizationId) return; setIsLoadingSnippets(true);
      try { await snippetService.seedDefaults(currentUser.organizationId); const updated = await snippetService.getSnippets(currentUser.organizationId); setSnippets(updated); } catch (e: any) { alert("Error: " + e.message); } finally { setIsLoadingSnippets(false); }
  };

  const handleDeleteTemplate = async (id: string) => {
      if (!currentUser?.organizationId) return; if (!confirm("Delete from local database? This does not delete it from Meta.")) return;
      try { await templateService.deleteTemplate(id, currentUser.organizationId); setTemplates(templates.filter(t => t.id !== id)); } catch(e: any) { alert("Error: " + e.message); }
  };

  const handleSyncTemplates = async () => {
      if (!currentUser?.organizationId) return; 
      setIsSyncingTemplates(true);
      try { 
          await templateService.syncWithMeta(currentUser.organizationId); 
          const updated = await templateService.getTemplates(currentUser.organizationId); 
          setTemplates(updated); 
          alert(`✅ Success! Templates synced from Meta. found: ${updated.length}`); 
      } catch (e: any) { 
          // Extract specific Meta error if available in the message
          console.error(e);
          alert("Error syncing templates:\n" + e.message + "\n\nTip: Ensure your WABA ID (Business Account ID) is correct in Channels > WhatsApp."); 
      } finally { 
          setIsSyncingTemplates(false); 
      }
  };

  const handleSaveOrgDetails = async () => {
      if (!currentUser?.organizationId) return;
      setIsSavingOrgDetails(true);
      setOrgDetailsSaveStatus('idle');
      try {
          await organizationService.updateOrganizationDetails(currentUser.organizationId, {
              name: companyName,
              support_email: supportEmail
          });
          setOrgDetailsSaveStatus('success');
          alert('¡Detalles guardados correctamente!');
      } catch (e: any) {
          setOrgDetailsSaveStatus('error');
          alert('Error al guardar los detalles: ' + e.message);
      } finally {
          setIsSavingOrgDetails(false);
      }
  };

  const handleSaveWhatsApp = async () => {
      if (!currentUser?.organizationId) return; 
      setIsSavingWa(true); 
      setWaSaveStatus('idle');
      try { 
          await chatService.saveWhatsAppConfig(currentUser.organizationId, waPhoneId, waWabaId, waToken, ''); 
          setWaSaveStatus('success');
          // Reload WhatsApp config to update the UI with merged data
          const config = await chatService.getWhatsAppConfig(currentUser.organizationId);
          if (config) {
              setWhatsappConfig(config);
              setWaPhoneId(config.phone_id || config.phone_number_id || '');
              setWaWabaId(config.waba_id || '');
              setWaToken(config.access_token || '');
              setIsWhatsAppConfigured(true);
          }
          setChannels(channels.map(c => c.platform === 'whatsapp' ? { ...c, isConnected: true } : c)); 
      } catch (e) { 
          setWaSaveStatus('error'); 
      } finally { 
          setIsSavingWa(false); 
      }
  };

  const handleSaveAI = async () => {
      if (!currentUser?.organizationId) return; setIsSavingAI(true); setAiSaveStatus('idle');
      try { await chatService.saveGeminiConfig(currentUser.organizationId, geminiKey, systemInstruction); setAiSaveStatus('success'); } catch (e) { setAiSaveStatus('error'); } finally { setIsSavingAI(false); }
  };

  const handleSaveN8n = async () => {
      if (!currentUser?.organizationId) return; setIsSavingN8n(true); setN8nSaveStatus('idle');
      try { await chatService.saveN8nConfig(currentUser.organizationId, n8nUrl, isN8nActive); setN8nSaveStatus('success'); } catch (e) { setN8nSaveStatus('error'); } finally { setIsSavingN8n(false); }
  };

  const handleTestN8n = async () => {
      if (!n8nUrl) return; setIsTestingN8n(true);
      try { const response = await fetch(n8nUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: "Test", sender_id: "test", sender_name: "Admin", conversation_id: "test", timestamp: new Date().toISOString() }) });
          if (response.ok) alert("✅ Success!"); else throw new Error(`Status: ${response.status}`); } catch (e: any) { alert(`❌ Failed: ${e.message}`); } finally { setIsTestingN8n(false); }
  };

  const handleSaveRetell = async () => {
      if (!currentUser?.organizationId) return; setIsSavingRetell(true); setRetellSaveStatus('idle');
      try { await chatService.saveRetellConfig(currentUser.organizationId, retellWebhookUrl); setRetellSaveStatus('success'); } catch (e) { setRetellSaveStatus('error'); } finally { setIsSavingRetell(false); }
  };

  // UPDATED: Use backend proxy to test connection to avoid CORS issues
  const handleTestRetell = async () => {
      if (!retellWebhookUrl) return; 
      setIsTestingRetell(true);
      try { 
          // We use the edge function as a proxy to test the webhook url
          await chatService.testRetellConnection(retellWebhookUrl);
          alert("✅ Success! Webhook reached via server."); 
      } catch (e: any) { 
          console.error(e);
          alert(`❌ Connection Failed.\n\nError: ${e.message}\n\nCheck if the n8n URL is correct and the workflow is active.`); 
      } finally { 
          setIsTestingRetell(false); 
      }
  };

  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); alert("Copied!"); };

  // API Key Handlers
  const handleCreateApiKey = async () => {
      if (!currentUser?.organizationId || !newKeyForm.name || newKeyForm.scopes.length === 0) {
          alert('Please provide a name and select at least one scope');
          return;
      }
      setIsCreatingKey(true);
      try {
          const result = await apiKeyService.createApiKey(
              currentUser.organizationId,
              newKeyForm.name,
              newKeyForm.scopes,
              currentUser.id,
              newKeyForm.expiresAt || undefined
          );
          setApiKeys([result.key, ...apiKeys]);
          setNewlyCreatedKey(result.plaintextKey);
          setNewKeyForm({ name: '', scopes: [], expiresAt: '' });
      } catch (error: any) {
          alert('Error creating API key: ' + error.message);
      } finally {
          setIsCreatingKey(false);
      }
  };

  const handleRevokeApiKey = async (keyId: string) => {
      if (!currentUser?.organizationId) return;
      if (!confirm('Revoke this API key? External integrations using it will stop working.')) return;
      try {
          await apiKeyService.revokeApiKey(keyId, currentUser.organizationId);
          setApiKeys(apiKeys.map(k => k.id === keyId ? { ...k, is_active: false } : k));
      } catch (error: any) { alert('Error: ' + error.message); }
  };

  const handleActivateApiKey = async (keyId: string) => {
      if (!currentUser?.organizationId) return;
      try {
          await apiKeyService.activateApiKey(keyId, currentUser.organizationId);
          setApiKeys(apiKeys.map(k => k.id === keyId ? { ...k, is_active: true } : k));
      } catch (error: any) { alert('Error: ' + error.message); }
  };

  const handleDeleteApiKey = async (keyId: string) => {
      if (!currentUser?.organizationId) return;
      if (!confirm('Permanently delete this API key? This action cannot be undone.')) return;
      try {
          await apiKeyService.deleteApiKey(keyId, currentUser.organizationId);
          setApiKeys(apiKeys.filter(k => k.id !== keyId));
      } catch (error: any) { alert('Error: ' + error.message); }
  };

  const handleToggleEndpoint = async (configId: string, isEnabled: boolean) => {
      if (!currentUser?.organizationId) return;
      try {
          await apiKeyService.toggleEndpoint(configId, currentUser.organizationId, isEnabled);
          setEndpointConfigs(endpointConfigs.map(c => c.id === configId ? { ...c, is_enabled: isEnabled } : c));
      } catch (error: any) { alert('Error: ' + error.message); }
  };

  // Facebook Auth handlers
  const handleConnectFacebook = () => {
    if (!currentUser?.organizationId) {
      alert('Organization ID not found');
      return;
    }
    // Show the inline signup component instead of opening popup
    setShowWhatsAppSignup(true);
    // Auto-expand WhatsApp card so user can see the signup flow
    setExpandedChannels(prev => ({ ...prev, whatsapp: true }));
  };

  const handleWhatsAppSignupSuccess = (data: any) => {
    // Reload WhatsApp config to show the next step without F5
    // Wait a moment to ensure database is updated BY BACKEND
    if (currentUser?.organizationId) {
      (async () => {
        console.log('🔄 [Settings] WhatsApp signup successful, reloading config...');
        setIsLoadingWhatsApp(true);
        // Auto-expand WhatsApp card to show configuration details
        setExpandedChannels(prev => ({ ...prev, whatsapp: true }));
        
        // Esperar 5 segundos - El backend guarda el access_token después de devolver la respuesta
        console.log('⏳ [Settings] Waiting 5s for backend to save access_token to database...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('🔄 [Settings] Now fetching config from database...');
        const config = await chatService.getWhatsAppConfig(currentUser.organizationId);
        console.log('📊 [Settings] Reloaded config:', config);
        
        if (config) {
          setWhatsappConfig(config);
          setWaPhoneId(config.phone_id || config.phone_number_id || '');
          setWaWabaId(config.waba_id || '');
          setWaToken(config.access_token || '');
          setIsWhatsAppConfigured(true);
          
          // AHORA sí intentar obtener el número (el access_token ya debería estar guardado por el backend)
          if (!config.phone_number && config.access_token && config.phone_number_id) {
            console.log('📞 [Settings] Access token found! Fetching phone number from WhatsApp API...');
            console.log('📞 [Settings] Phone Number ID:', config.phone_number_id);
            console.log('📞 [Settings] Access Token:', config.access_token ? 'EXISTS (length: ' + config.access_token.length + ')' : 'MISSING');
            
            try {
              const result = await fetchAndSavePhoneNumber(
                currentUser.organizationId,
                config.phone_number_id,
                config.access_token
              );
              
              if (result.success && result.phoneNumber) {
                console.log('✅ [Settings] Phone number obtained:', result.phoneNumber);
                // Recargar una vez más para mostrar el número en UI
                const finalConfig = await chatService.getWhatsAppConfig(currentUser.organizationId);
                if (finalConfig) {
                  setWhatsappConfig(finalConfig);
                  console.log('✅ [Settings] Final config updated with phone number');
                }
              } else {
                console.error('❌ [Settings] Failed to fetch phone number:', result.error);
              }
            } catch (error) {
              console.error('❌ [Settings] Exception fetching phone number:', error);
            }
          } else if (config.phone_number) {
            console.log('✅ [Settings] Phone number already available:', config.phone_number);
          } else {
            console.error('❌ [Settings] Missing credentials for phone number fetch!');
            console.error('   - access_token:', config.access_token ? 'EXISTS' : '❌ MISSING (backend not saved yet?)');
            console.error('   - phone_number_id:', config.phone_number_id || '❌ MISSING');
          }
        } else {
          console.error('❌ [Settings] No config found after reload!');
        }
        
        setIsLoadingWhatsApp(false);
        console.log('✅ [Settings] WhatsApp signup process complete');
      })();
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!currentUser?.organizationId) return;
    if (!confirm('Are you sure you want to disconnect WhatsApp Business Account?')) return;
    
    try {
      const { error } = await supabase
        .from('integration_settings')
        .delete()
        .eq('organization_id', currentUser.organizationId)
        .eq('service_name', 'whatsapp');
      
      if (error) throw error;
      
      setWhatsappConfig(null);
      setIsWhatsAppConfigured(false);
      setWaPhoneId('');
      setWaWabaId('');
      setWaToken('');
      alert('WhatsApp Business Account disconnected successfully');
    } catch (error: any) {
      alert('Error disconnecting WhatsApp: ' + error.message);
    }
  };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 sm:py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Configuración</h1>
            <p className="text-slate-500 text-sm">Gestiona tu espacio de trabajo, integraciones y herramientas.</p>
          </div>
          {/* Mobile sidebar toggle */}
          <button
            className="sm:hidden p-2 rounded-lg bg-slate-100 text-slate-600"
            onClick={() => setSidebarOpen(s => !s)}
          >
            <ChevronDown size={18} className={`transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {currentUser && (
            <div className="flex items-center gap-2 mt-2">
                <span className={`text-[10px] px-2 py-0.5 rounded border uppercase font-bold
                    ${currentUser.role === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'manager' ? 'Gerente' : 'Agente'}
                </span>
                <p className="text-xs text-slate-400 font-mono hidden sm:block">Org: {currentUser.organizationId?.slice(0,8)}...</p>
            </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — hidden on mobile unless open */}
        <div className={`${
            sidebarOpen ? 'flex' : 'hidden'
          } sm:flex w-full sm:w-56 md:w-64 bg-white border-r border-slate-200 p-3 sm:p-4 space-y-1 overflow-y-auto flex-col absolute sm:relative z-10 top-0 bottom-0 left-0`}>

          {/* Close btn mobile */}
          <button className="sm:hidden flex justify-end mb-2" onClick={() => setSidebarOpen(false)}>
            <XCircle size={20} className="text-slate-400" />
          </button>

          <button 
            onClick={() => { setActiveTab('profile'); setSidebarOpen(false); }}
            className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors text-sm ${activeTab === 'profile' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <div className="flex items-center gap-2"><UserCog size={15}/> Mi Perfil</div>
          </button>

          <button 
            onClick={() => { setActiveTab('appearance'); setSidebarOpen(false); }}
            className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors text-sm ${activeTab === 'appearance' ? 'bg-violet-50 text-violet-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <div className="flex items-center gap-2"><Palette size={15}/> Apariencia</div>
          </button>

          {/* Admin and Manager tabs */}
          {currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') && (
            <>
              <div className="my-2 border-b border-slate-100"></div>
              <button 
                onClick={() => { setActiveTab('general'); setSidebarOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors text-sm ${activeTab === 'general' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                General
              </button>
              <button 
                onClick={() => { setActiveTab('team'); setSidebarOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors text-sm ${activeTab === 'team' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Equipo
              </button>
            </>
          )}

          {/* Only Admin */}
          {currentUser?.role === 'admin' && (
            <>
              <button 
                onClick={() => { setActiveTab('channels'); setSidebarOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors text-sm ${activeTab === 'channels' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Canales
              </button>
              <button 
                onClick={() => { setActiveTab('ai'); setSidebarOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors text-sm ${activeTab === 'ai' ? 'bg-purple-50 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-2"><Sparkles size={15}/> Agente IA</div>
              </button>
              <button 
                onClick={() => { setActiveTab('automation'); setSidebarOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors text-sm ${activeTab === 'automation' ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-2"><Workflow size={15}/> Automatización (n8n)</div>
              </button>
              <button 
                onClick={() => { setActiveTab('retell'); setSidebarOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors text-sm ${activeTab === 'retell' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-2"><PhoneCall size={15}/> Bot de Voz (Retell)</div>
              </button>
              <div className="my-2 border-b border-slate-100"></div>
              <button 
                onClick={() => { setActiveTab('api'); setSidebarOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors text-sm ${activeTab === 'api' ? 'bg-cyan-50 text-cyan-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-2"><Key size={15}/> API</div>
              </button>
            </>
          )}

          {/* Templates & Snippets - Admin and Manager */}
          {currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') && (
            <>
              <button 
                onClick={() => { setActiveTab('templates'); setSidebarOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors text-sm ${activeTab === 'templates' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Plantillas Meta
              </button>
              <button 
                onClick={() => { setActiveTab('snippets'); setSidebarOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors text-sm ${activeTab === 'snippets' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Snippets
              </button>
            </>
          )}

          {/* Data Management - ALL roles */}
          <div className="my-2 border-b border-slate-100"></div>
          <button 
            onClick={() => { setActiveTab('data'); setSidebarOpen(false); }}
            className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors text-sm ${activeTab === 'data' ? 'bg-red-50 text-red-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <div className="flex items-center gap-2"><Database size={15}/> Gestión de Datos</div>
          </button>
          
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          
          {activeTab === 'profile' && currentUser && (
              <div className="max-w-2xl space-y-6">
                   <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
                       <h3 className="text-lg font-semibold mb-6 flex items-center gap-2"><UserIcon size={20} className="text-emerald-600"/> Mi Perfil</h3>
                       <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 mb-8">
                           <img src={currentUser.avatar} className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-slate-100" />
                           <div>
                               <h4 className="text-xl font-bold text-slate-800">{currentUser.name}</h4>
                               <p className="text-slate-500">{currentUser.email}</p>
                               <span className="inline-block mt-2 px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold uppercase rounded">{currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'manager' ? 'Gerente' : 'Agente'}</span>
                           </div>
                       </div>
                       <div className="border-t pt-6">
                           <h4 className="font-bold text-slate-700 mb-4">Cambiar Contraseña</h4>
                           <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleUpdatePassword(); }}>
                               <div>
                                   <label className="block text-sm font-medium text-slate-600 mb-1">Nueva contraseña</label>
                                   <input name="newPassword" type="password" className="w-full border p-2 rounded text-sm outline-none focus:ring-2 focus:ring-emerald-500" value={passwordForm.newPassword} onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})} />
                               </div>
                               <div>
                                   <label className="block text-sm font-medium text-slate-600 mb-1">Confirmar nueva contraseña</label>
                                   <input name="confirmPassword" type="password" className="w-full border p-2 rounded text-sm outline-none focus:ring-2 focus:ring-emerald-500" value={passwordForm.confirmPassword} onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})} />
                               </div>
                               <button type="submit" disabled={isUpdatingPassword || !passwordForm.newPassword} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-50">
                                   {isUpdatingPassword ? 'Actualizando...' : 'Actualizar contraseña'}
                               </button>
                           </form>
                       </div>
                   </div>
              </div>
          )}

          {/* ===== APPEARANCE TAB ===== */}
          {activeTab === 'appearance' && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Palette size={20} className="text-violet-600"/> Apariencia</h3>
                <p className="text-sm text-slate-500 mt-1">Personaliza la interfaz según tus preferencias. Estos ajustes son solo para tu cuenta.</p>
              </div>

              {/* Theme */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-semibold text-slate-700 mb-4 flex items-center gap-2"><Monitor size={16}/> Tema</h4>
                <div className="grid grid-cols-2 gap-3">
                  {([['light', 'Claro', Sun], ['dark', 'Oscuro', Moon]] as [ThemeMode, string, React.FC<any>][]).map(([val, label, Icon]) => (
                    <button
                      key={val}
                      onClick={() => updateAppearance({ theme: val })}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                        appearance.theme === val
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <Icon size={18}/>
                      <span className="font-medium text-sm">{label}</span>
                      {appearance.theme === val && <CheckCircle size={14} className="ml-auto text-violet-600"/>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent Color */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-semibold text-slate-700 mb-4 flex items-center gap-2"><Palette size={16}/> Color de Acento</h4>
                <div className="flex flex-wrap gap-3">
                  {([
                    ['emerald', 'Verde',  '#059669'],
                    ['blue',    'Azul',   '#2563eb'],
                    ['violet',  'Violeta','#7c3aed'],
                    ['orange',  'Naranja','#ea580c'],
                    ['rose',    'Rosa',   '#e11d48'],
                  ] as [AccentColor, string, string][]).map(([val, label, hex]) => (
                    <button
                      key={val}
                      onClick={() => updateAppearance({ accentColor: val })}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all text-sm font-medium ${
                        appearance.accentColor === val
                          ? 'border-slate-800 shadow-md scale-105'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: hex }}></span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-semibold text-slate-700 mb-4 flex items-center gap-2"><Type size={16}/> Tamaño de Fuente</h4>
                <div className="grid grid-cols-3 gap-3">
                  {([['compact', 'Compacto', 'text-xs'], ['normal', 'Normal', 'text-sm'], ['large', 'Grande', 'text-base']] as [FontSize, string, string][]).map(([val, label, cls]) => (
                    <button
                      key={val}
                      onClick={() => updateAppearance({ fontSize: val })}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        appearance.fontSize === val
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <span className={`${cls} font-medium block text-center`}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Background */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-semibold text-slate-700 mb-4">Fondo del Chat</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {([
                    ['default', 'Por defecto'],
                    ['plain',   'Liso'],
                    ['dots',    'Puntos'],
                    ['lines',   'Líneas'],
                  ] as [ChatBg, string][]).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => updateAppearance({ chatBg: val })}
                      className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        appearance.chatBg === val
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Border Radius */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-semibold text-slate-700 mb-4">Bordes</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {([
                    ['none', 'Cuadrado'],
                    ['sm',   'Sutil'],
                    ['md',   'Medio'],
                    ['xl',   'Redondeado'],
                  ] as [UserAppearance['borderRadius'], string][]).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => updateAppearance({ borderRadius: val })}
                      className={`p-3 border-2 text-sm font-medium transition-all ${
                        appearance.borderRadius === val
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      } ${ val === 'none' ? 'rounded-none' : val === 'sm' ? 'rounded' : val === 'md' ? 'rounded-lg' : 'rounded-xl'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset button */}
              <div className="flex justify-end">
                <button
                  onClick={() => updateAppearance({ accentColor: 'emerald', theme: 'light', fontSize: 'normal', chatBg: 'default', borderRadius: 'xl', sidebarSize: 'normal' })}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition-colors"
                >
                  Restablecer valores por defecto
                </button>
              </div>
            </div>
          )}
          
          {activeTab === 'general' && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-semibold mb-4">Detalles del Espacio de Trabajo</h3>
                {isLoadingOrgDetails ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="animate-spin text-emerald-600" size={32} />
                    </div>
                ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Empresa</label>
                        <input 
                            type="text" 
                            value={companyName} 
                            onChange={(e) => setCompanyName(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" 
                            disabled={!isAdmin || isSavingOrgDetails} 
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Correo de Soporte</label>
                        <input 
                            type="email" 
                            value={supportEmail} 
                            onChange={(e) => setSupportEmail(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" 
                            disabled={!isAdmin || isSavingOrgDetails} 
                        />
                      </div>
                      {isAdmin ? (
                        <div className="flex gap-2 items-center pt-4">
                            <button 
                                onClick={handleSaveOrgDetails} 
                                disabled={isSavingOrgDetails}
                                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSavingOrgDetails ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                                Guardar cambios
                            </button>
                            {orgDetailsSaveStatus === 'success' && (
                                <span className="flex items-center gap-1 text-sm text-emerald-600">
                                    <CheckCircle size={16} /> Guardado correctamente
                                </span>
                            )}
                            {orgDetailsSaveStatus === 'error' && (
                                <span className="flex items-center gap-1 text-sm text-red-600">
                                    <XCircle size={16} /> Error al guardar
                                </span>
                            )}
                        </div>
                      ) : (
                          <p className="text-xs text-orange-600 flex items-center gap-1"><Lock size={12}/> Solo lectura (se requiere acceso de Admin para editar)</p>
                      )}
                    </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'team' && (
             <div className="w-full space-y-6">
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                     <div>
                        <h3 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-slate-900"><Users size={24} className="text-emerald-600"/> Team Members</h3>
                        <p className="text-sm text-slate-500 mt-1">Manage access and roles for your team. {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}</p>
                     </div>
                     {isAdmin && (
                        <button 
                            onClick={() => setShowInviteModal(true)} 
                            className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:from-emerald-700 hover:to-emerald-800 flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg"
                        >
                            <Plus size={18} /> Invite Member
                        </button>
                     )}
                 </div>
                 {!isAdmin && (
                     <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg text-sm flex items-start gap-3">
                         <Shield size={18} className="mt-0.5 flex-shrink-0"/><span>You are viewing the team list as <strong>{currentUser?.role}</strong>. Only Admins can modify roles.</span>
                     </div>
                 )}
                 <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                     {isLoadingTeam ? (
                         <div className="p-16 flex justify-center"><Loader2 size={32} className="animate-spin text-emerald-600"/></div>
                     ) : teamMembers.length === 0 ? (
                        <div className="p-16 text-center">
                            <div className="bg-slate-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                                <Users size={32} className="text-slate-400"/>
                            </div>
                            <p className="text-slate-600 font-semibold text-lg">No team members yet</p>
                            <p className="text-slate-400 text-sm mt-2">Invite your first team member to get started</p>
                        </div>
                     ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gradient-to-r from-slate-50 via-slate-50 to-slate-100 border-b-2 border-slate-200">
                                    <tr>
                                        <th className="px-4 sm:px-6 py-5 font-bold text-slate-700 text-xs sm:text-sm uppercase tracking-wide">Member</th>
                                        <th className="hidden md:table-cell px-6 py-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Email</th>
                                        <th className="hidden lg:table-cell px-6 py-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Phone</th>
                                        <th className="px-4 sm:px-6 py-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Status</th>
                                        <th className="px-4 sm:px-6 py-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Role</th>
                                        <th className="px-4 sm:px-6 py-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {teamMembers.map((member, idx) => {
                                        const isCurrentUser = member.id === currentUser?.id;
                                        const canEdit = isAdmin && !isCurrentUser; 
                                        return (
                                        <tr key={member.id} className="hover:bg-emerald-50 transition-colors group">
                                            {/* Member Info */}
                                            <td className="px-4 sm:px-6 py-5">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="relative flex-shrink-0">
                                                        <img src={member.avatar} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full shadow-sm object-cover" alt={member.name} />
                                                        {member.verified && (
                                                            <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 shadow-lg border-2 border-white">
                                                                <CheckCircle2 size={14} className="text-white"/>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-slate-800 truncate text-sm sm:text-base">{member.name}</p>
                                                        <p className="md:hidden text-xs text-slate-500 truncate">{member.email}</p>
                                                        {isCurrentUser && (
                                                            <span className="inline-block text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full mt-1">
                                                                You
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Email - Hidden on mobile */}
                                            <td className="hidden md:table-cell px-6 py-5">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Mail size={14} className="text-slate-400 flex-shrink-0"/>
                                                    <a href={`mailto:${member.email}`} className="text-slate-600 hover:text-emerald-600 transition-colors truncate text-xs sm:text-sm">
                                                        {member.email}
                                                    </a>
                                                </div>
                                            </td>

                                            {/* Phone - Hidden on lg screens */}
                                            <td className="hidden lg:table-cell px-6 py-5">
                                                {member.phone ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-200 whitespace-nowrap">
                                                            <PhoneCall size={13} className="text-emerald-600"/>
                                                            <span className="text-emerald-700 text-xs font-mono font-medium">{member.phone}</span>
                                                        </div>
                                                        {(isAdmin || isCurrentUser) && (
                                                            <button 
                                                                onClick={async () => {
                                                                    const newPhone = prompt('Update phone number (E.164 format, e.g., +54911...):', member.phone);
                                                                    if (newPhone === null) return;
                                                                    if (newPhone.trim() && !validationService.validatePhoneNumber(newPhone.trim())) {
                                                                        alert('Invalid phone number format. Use international format like +54911...');
                                                                        return;
                                                                    }
                                                                    try {
                                                                        const prev = [...teamMembers];
                                                                        setTeamMembers(prev.map(m => m.id === member.id ? { ...m, phone: newPhone.trim() || undefined } : m));
                                                                        await teamService.updateMemberPhone(member.id, newPhone.trim() || undefined);
                                                                        if (currentUser?.organizationId) {
                                                                            const reloaded = await teamService.getTeamMembers(currentUser.organizationId);
                                                                            setTeamMembers(reloaded);
                                                                        }
                                                                        alert(newPhone.trim() ? 'Phone updated successfully' : 'Phone removed');
                                                                    } catch (err: any) {
                                                                        alert('Error: ' + (err?.message || err));
                                                                        if (currentUser?.organizationId) {
                                                                            const reloaded = await teamService.getTeamMembers(currentUser.organizationId);
                                                                            setTeamMembers(reloaded);
                                                                        }
                                                                    }
                                                                }}
                                                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-all p-2 hover:bg-slate-100 rounded flex-shrink-0"
                                                                title="Edit phone"
                                                            >
                                                                <RefreshCw size={14}/>
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        {(isAdmin || isCurrentUser) ? (
                                                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <input 
                                                                    type="tel" 
                                                                    id={`phone-${member.id}`} 
                                                                    placeholder="+54911..." 
                                                                    className="px-3 py-1.5 text-xs border border-slate-200 rounded w-32 font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" 
                                                                />
                                                                <button 
                                                                    onClick={async () => {
                                                                        const el = document.getElementById(`phone-${member.id}`) as HTMLInputElement | null;
                                                                        const newPhone = el ? el.value.trim() : '';
                                                                        if (!newPhone) { 
                                                                            alert('Please enter a phone number'); 
                                                                            return; 
                                                                        }
                                                                        if (!validationService.validatePhoneNumber(newPhone)) { 
                                                                            alert('Invalid phone number format. Use international format like +54911...'); 
                                                                            return; 
                                                                        }
                                                                        try {
                                                                            const prev = [...teamMembers];
                                                                            setTeamMembers(prev.map(m => m.id === member.id ? { ...m, phone: newPhone } : m));
                                                                            await teamService.updateMemberPhone(member.id, newPhone);
                                                                            if (currentUser?.organizationId) {
                                                                                const reloaded = await teamService.getTeamMembers(currentUser.organizationId);
                                                                                setTeamMembers(reloaded);
                                                                            }
                                                                            alert('Phone added successfully');
                                                                        } catch (err: any) {
                                                                            alert('Error: ' + (err?.message || err));
                                                                            if (currentUser?.organizationId) {
                                                                                const reloaded = await teamService.getTeamMembers(currentUser.organizationId);
                                                                                setTeamMembers(reloaded);
                                                                            }
                                                                        }
                                                                    }} 
                                                                    className="px-2.5 py-1.5 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 transition-colors flex items-center gap-1 whitespace-nowrap font-medium"
                                                                >
                                                                    <Plus size={12}/> Add
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 text-xs italic">-</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Status */}
                                            <td className="px-4 sm:px-6 py-5">
                                                {member.verified ? (
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-md"></div>
                                                            <span className="inline-block px-3 py-1.5 rounded-full text-xs font-bold bg-green-100 text-green-700 whitespace-nowrap">
                                                                Verified
                                                            </span>
                                                        </div>
                                                        {member.lastSignInAt && (
                                                            <span className="text-[10px] text-slate-400 ml-5">
                                                                Último acceso: {new Date(member.lastSignInAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse shadow-md"></div>
                                                            <span className="inline-block px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 whitespace-nowrap">
                                                                Invitado
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-slate-400 ml-5">
                                                            Aún no ha iniciado sesión
                                                        </span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Role */}
                                            <td className="px-4 sm:px-6 py-5">
                                                <select 
                                                    value={member.role}
                                                    onChange={(e) => handleUpdateRole(member.id, e.target.value as UserRole)}
                                                    className={`px-3 py-2 rounded-lg text-xs font-bold border outline-none transition-all cursor-pointer
                                                        ${member.role === 'admin' ? 'bg-purple-100 text-purple-700 border-purple-200' : 
                                                        member.role === 'manager' ? 'bg-blue-100 text-blue-700 border-blue-200' : 
                                                        'bg-slate-100 text-slate-700 border-slate-200'}
                                                        ${(!isAdmin && !isCurrentUser) ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}
                                                    `}
                                                    disabled={!isAdmin && !isCurrentUser} 
                                                >
                                                    <option value="admin">👑 Admin</option>
                                                    <option value="manager">📊 Manager</option>
                                                    <option value="community">👤 Community</option>
                                                </select>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-4 sm:px-6 py-5">
                                                {canEdit ? (
                                                    <button 
                                                        onClick={() => handleRemoveMember(member.id)} 
                                                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded transition-all"
                                                        title="Remove User"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                ) : <div className="w-6"></div>}
                                            </td>
                                        </tr>
                                    )})}
                                </tbody>
                            </table>
                        </div>
                     )}
                 </div>
             </div>
          )}

          {/* Channels Tab - UPDATED WITH FIELD INSTRUCTIONS */}
          {activeTab === 'channels' && (
              <div className="max-w-3xl space-y-6">
                 <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2"><Share2 size={20} className="text-emerald-600"/> Canales</h3>
                    <p className="text-sm text-slate-500">Conecta tus cuentas sociales para recibir mensajes.</p>
                 </div>

                 {/* WhatsApp Business Account Card - Unified State Management */}
                 <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 flex items-center justify-between">
                       <div className="flex items-center gap-4">
                           <div className={`p-3 rounded-full ${isWhatsAppConfigured ? 'bg-green-600' : 'bg-gray-400'} text-white`}>
                               <MessageCircle size={24} />
                           </div>
                           <div>
                               <h4 className="font-bold text-slate-800">
                                   {isWhatsAppConfigured 
                                       ? 'Configuración WhatsApp' 
                                       : 'Cuenta WhatsApp Business'}
                               </h4>
                               <p className="text-sm text-slate-500">
                                   {isLoadingWhatsApp
                                       ? 'Cargando estado...'
                                       : isWhatsAppConfigured
                                           ? `✅ Configurado - WABA: ${whatsappConfig?.waba_id || 'Activo'}`
                                           : 'No conectado'}
                               </p>
                           </div>
                       </div>
                       
                       <div className="flex items-center gap-2">
                           {isWhatsAppConfigured && <CheckCircle size={20} className="text-green-600" />}
                           
                           {isWhatsAppConfigured ? (
                               <button 
                                   onClick={handleDisconnectWhatsApp}
                                   className="px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                               >
                                   Disconnect
                               </button>
                           ) : (
                               <button 
                                   onClick={handleConnectFacebook}
                                   disabled={isLoadingWhatsApp}
                                   className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                               >
                                   {isLoadingWhatsApp ? <Loader2 size={14} className="animate-spin" /> : null}
                                   Setup WhatsApp
                               </button>
                           )}
                           <button
                               onClick={() => toggleChannelExpand('whatsapp')}
                               className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                               title={expandedChannels['whatsapp'] ? 'Contraer' : 'Expandir'}
                           >
                               {expandedChannels['whatsapp'] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                           </button>
                       </div>
                    </div>

                    {/* WhatsApp Embedded Signup Component - Step 1: Connect via Facebook */}
                    {expandedChannels['whatsapp'] && showWhatsAppSignup && !isWhatsAppConfigured && currentUser?.organizationId && (
                       <WhatsAppEmbeddedSignup 
                           organizationId={currentUser.organizationId}
                           onSuccess={(data) => {
                               handleWhatsAppSignupSuccess(data);
                               // Auto-close after animation completes
                               setTimeout(() => setShowWhatsAppSignup(false), 3500);
                           }}
                           onClose={() => setShowWhatsAppSignup(false)}
                       />
                    )}

                    {/* WhatsApp Configuration Details - Step 2: Show when fully configured */}
                    {expandedChannels['whatsapp'] && isWhatsAppConfigured && whatsappConfig && (
                       <div className="bg-green-50 p-6 border-t border-slate-200 space-y-6">
                           {/* Current Configuration - Read Only */}
                           <div>
                               <h5 className="font-semibold text-sm text-slate-800 mb-3">Configuración Actual</h5>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   <div className="md:col-span-2">
                                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1">📞 Número de Teléfono</label>
                                       <input 
                                           type="text" 
                                           readOnly 
                                           value={whatsappConfig.phone_number || 'Fetching from API...'}
                                           className={`w-full px-3 py-2 border-2 rounded text-sm font-mono font-bold ${
                                               whatsappConfig.phone_number 
                                                   ? 'border-green-300 bg-green-50 text-green-700' 
                                                   : 'border-yellow-300 bg-yellow-50 text-yellow-700'
                                           }`}
                                       />
                                       {!whatsappConfig.phone_number && (
                                           <p className="text-xs text-yellow-600 mt-1">⏳ Obteniendo número desde WhatsApp API...</p>
                                       )}
                                   </div>
                                   <div>
                                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1">ID del Número</label>
                                       <input 
                                           type="text" 
                                           readOnly 
                                           value={whatsappConfig.phone_id || whatsappConfig.phone_number_id || ''}
                                           className="w-full px-3 py-2 border border-slate-200 rounded bg-white text-slate-600 text-sm font-mono"
                                       />
                                   </div>
                                   <div>
                                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1">WABA ID</label>
                                       <input 
                                           type="text" 
                                           readOnly 
                                           value={whatsappConfig.waba_id || 'No disponible'}
                                           className="w-full px-3 py-2 border border-slate-200 rounded bg-white text-slate-600 text-sm font-mono"
                                       />
                                   </div>
                                   <div>
                                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Business ID</label>
                                       <input 
                                           type="text" 
                                           readOnly 
                                           value={whatsappConfig.business_id || 'N/A'}
                                           className="w-full px-3 py-2 border border-slate-200 rounded bg-white text-slate-600 text-sm font-mono"
                                       />
                                   </div>
                                   <div>
                                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Fuente</label>
                                       <input 
                                           type="text" 
                                           readOnly 
                                           value={whatsappConfig.source || 'N/A'}
                                           className="w-full px-3 py-2 border border-slate-200 rounded bg-white text-slate-600 text-sm font-mono"
                                       />
                                   </div>
                               </div>
                           </div>
                       </div>
                    )}
                 </div>

                 {/* Gmail / Google Email Integration */}
                 <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 flex items-center justify-between">
                       <div className="flex items-center gap-4">
                           <div className={`p-3 rounded-full ${gmailConfig ? 'bg-red-500' : 'bg-gray-400'} text-white`}>
                               <Mail size={24} />
                           </div>
                           <div>
                               <h4 className="font-bold text-slate-800">Gmail (Correo de envío)</h4>
                               <p className="text-sm text-slate-500">
                                   {isLoadingGmail
                                       ? 'Cargando...'
                                       : gmailConfig
                                           ? `✅ Conectado — ${gmailConfig.gmail_address}`
                                           : 'No conectado'}
                               </p>
                           </div>
                       </div>

                       <div className="flex items-center gap-2">
                           {gmailConfig && <CheckCircle size={20} className="text-green-600" />}

                           {gmailConfig ? (
                               <button 
                                   onClick={async () => {
                                       if (!currentUser) return;
                                       if (!confirm('¿Desconectar la cuenta de Gmail? Los flujos y campañas no podrán enviar correos.')) return;
                                       try {
                                           await gmailService.disconnectGmail(currentUser.organizationId);
                                           setGmailConfig(null);
                                       } catch (err) {
                                           console.error('Error disconnecting Gmail:', err);
                                       }
                                   }}
                                   className="px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                               >
                                   Desconectar
                               </button>
                           ) : (
                               <button 
                                   onClick={async () => {
                                       if (!currentUser) return;
                                       setIsConnectingGmail(true);
                                       setGmailError('');
                                       try {
                                           const result = await gmailService.connectGmail(currentUser.organizationId);
                                           if (result.success) {
                                               setGmailConfig({ gmail_address: result.email || '', connected_at: new Date().toISOString() });
                                               setGmailStatus('success');
                                               setTimeout(() => setGmailStatus('idle'), 3000);
                                           } else {
                                               setGmailError(result.error || 'Error al conectar Gmail');
                                               setGmailStatus('error');
                                           }
                                       } catch (err: any) {
                                           setGmailError(err.message || 'Error al iniciar conexión');
                                           setGmailStatus('error');
                                       } finally {
                                           setIsConnectingGmail(false);
                                       }
                                   }}
                                   disabled={isConnectingGmail || isLoadingGmail}
                                   className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                               >
                                   {isConnectingGmail ? <Loader2 size={14} className="animate-spin" /> : null}
                                   Conectar Gmail
                               </button>
                           )}
                           <button
                               onClick={() => toggleChannelExpand('gmail')}
                               className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                               title={expandedChannels['gmail'] ? 'Collapse' : 'Expand'}
                           >
                               {expandedChannels['gmail'] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                           </button>
                       </div>
                    </div>

                    {/* Gmail status messages */}
                    {expandedChannels['gmail'] && gmailStatus === 'success' && (
                       <div className="px-6 pb-4">
                           <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg border border-green-200">
                               <CheckCircle size={16} /> Gmail conectado correctamente
                           </div>
                       </div>
                    )}
                    {expandedChannels['gmail'] && gmailError && (
                       <div className="px-6 pb-4">
                           <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-200">
                               <AlertTriangle size={16} /> {gmailError}
                           </div>
                       </div>
                    )}

                    {/* Gmail configuration details */}
                    {expandedChannels['gmail'] && gmailConfig && (
                       <div className="bg-red-50 p-6 border-t border-slate-200 space-y-4">
                           <h5 className="font-semibold text-sm text-slate-800 mb-2">Configuración de correo</h5>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div>
                                   <label className="block text-xs font-bold text-slate-600 uppercase mb-1">📧 Correo conectado</label>
                                   <input 
                                       type="text" 
                                       readOnly 
                                       value={gmailConfig.gmail_address}
                                       className="w-full px-3 py-2 border-2 border-green-300 bg-green-50 text-green-700 rounded text-sm font-mono font-bold"
                                   />
                               </div>
                               <div>
                                   <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Conectado desde</label>
                                   <input 
                                       type="text" 
                                       readOnly 
                                       value={new Date(gmailConfig.connected_at).toLocaleString()}
                                       className="w-full px-3 py-2 border border-slate-200 rounded bg-white text-slate-600 text-sm"
                                   />
                               </div>
                           </div>
                           <p className="text-xs text-slate-500">
                               Este correo se usará para enviar mensajes en campañas y flujos de trabajo. 
                               Los tokens se renuevan automáticamente.
                           </p>
                       </div>
                    )}
                 </div>

                 {/* Canales existentes - WhatsApp excluido */}
                 <div className="grid gap-4">
                     {channels.filter(channel => channel.platform !== 'whatsapp').map(channel => (
                         <div key={channel.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                             <div className="p-4 sm:p-6 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-full 
                                        ${channel.platform === 'facebook' ? 'bg-blue-600 text-white' : 
                                        channel.platform === 'instagram' ? 'bg-gradient-to-tr from-yellow-400 to-purple-600 text-white' : 
                                        'bg-green-500 text-white'}`}>
                                        {channel.platform === 'facebook' && <Facebook size={24} />}
                                        {channel.platform === 'instagram' && <Instagram size={24} />}
                                        {channel.platform === 'whatsapp' && <MessageCircle size={24} />}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 capitalize">{channel.platform} Inbox</h4>
                                        <p className="text-sm text-slate-500">
                                            {channel.platform === 'facebook' || channel.platform === 'instagram'
                                                ? 'Próximamente'
                                                : (channel.isConnected ? 'Conectado y activo' : 'No conectado')}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                {!(channel.platform === 'facebook' || channel.platform === 'instagram') ? (
                                  <button 
                                      onClick={() => handleToggleChannel(channel.id)}
                                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                                          ${channel.isConnected 
                                              ? 'border border-slate-200 text-slate-600 hover:bg-slate-50' 
                                              : 'bg-emerald-600 text-white hover:bg-emerald-700'}
                                      `}
                                  >
                                      {channel.isConnected ? 'Desconectar' : 'Configurar'}
                                  </button>
                                ) : (
                                  <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">Próximamente</span>
                                )}
                                <button
                                    onClick={() => toggleChannelExpand(channel.id)}
                                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                                    title={expandedChannels[channel.id] ? 'Contraer' : 'Expandir'}
                                >
                                    {expandedChannels[channel.id] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </button>
                                </div>
                             </div>
                             {expandedChannels[channel.id] && (
                                 <div className="px-6 pb-5 border-t border-slate-100 bg-slate-50">
                                     <p className="text-sm text-slate-500 pt-4">
                                         {channel.platform === 'facebook' || channel.platform === 'instagram'
                                             ? 'Esta integración estará disponible próximamente.'
                                             : channel.isConnected
                                                 ? `${channel.platform} conectado y activo.`
                                                 : `Configura ${channel.platform} para empezar a recibir mensajes.`}
                                     </p>
                                 </div>
                             )}
                         </div>
                     ))}
                 </div>
              </div>
          )}

          {activeTab === 'ai' && (
              <div className="max-w-3xl space-y-6">
                 <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2"><Sparkles size={20} className="text-purple-600"/> Agente IA (Gemini)</h3>
                    <p className="text-sm text-slate-500">Configura la personalidad y credenciales de tu asistente IA.</p>
                 </div>
                 <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                     <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Clave API de Google Gemini</label>
                         <div className="flex gap-2">
                             <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIzaSy..." className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500 outline-none font-mono text-sm" />
                             <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="px-3 py-2 bg-slate-100 text-slate-600 rounded-md text-sm hover:bg-slate-200 flex items-center gap-2">Obtener clave <ExternalLink size={14}/></a>
                         </div>
                         <p className="text-xs text-slate-500 mt-1">Tu clave se almacena cifrada en los ajustes de tu organización.</p>
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Personalidad del Agente (Instrucción del Sistema)</label>
                         <textarea value={systemInstruction} onChange={(e) => setSystemInstruction(e.target.value)} rows={6} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500 outline-none text-sm" placeholder="Eres un agente de soporte al cliente amable y profesional..." />
                     </div>
                     <div className="pt-4 border-t border-slate-100 flex justify-end items-center gap-3">
                         {aiSaveStatus === 'success' && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={12}/> Guardado correctamente</span>}
                         {aiSaveStatus === 'error' && <span className="text-xs text-red-600">Error al guardar la configuración</span>}
                         <button onClick={handleSaveAI} disabled={isSavingAI || !geminiKey} className="bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">{isSavingAI ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Guardar Configuración IA</button>
                     </div>
                 </div>
              </div>
          )}

          {activeTab === 'automation' && (
              <div className="max-w-3xl space-y-6">
                 <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2"><Workflow size={20} className="text-orange-600"/> Automatización (n8n)</h3>
                    <p className="text-sm text-slate-500">Conecta tu flujo de WhatsApp a flujos de trabajo n8n para lógica avanzada.</p>
                 </div>
                 <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                     <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                         <div><span className="font-bold text-slate-700 block">Enable n8n Integration</span><span className="text-xs text-slate-500">Route all incoming messages to the webhook below.</span></div>
                         <div className={`w-14 h-8 rounded-full p-1 cursor-pointer transition-colors duration-300 flex items-center ${isN8nActive ? 'bg-orange-500' : 'bg-slate-200'}`} onClick={() => setIsN8nActive(!isN8nActive)}>
                            <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 transform ${isN8nActive ? 'translate-x-6' : 'translate-x-0'}`}></div>
                         </div>
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">URL del Webhook n8n (POST)</label>
                         <div className="flex gap-2">
                             <input type="url" value={n8nUrl} onChange={(e) => setN8nUrl(e.target.value)} placeholder="https://your-n8n-instance.com/webhook/..." className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-orange-500 outline-none font-mono text-sm" />
                             <button onClick={handleTestN8n} disabled={!n8nUrl || isTestingN8n} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-sm font-medium hover:bg-slate-200 flex items-center gap-2 border border-slate-200">{isTestingN8n ? <Loader2 size={16} className="animate-spin"/> : <Activity size={16} />} Probar Conexión</button>
                         </div>
                     </div>
                     <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 text-sm text-orange-800">
                         <strong>How it works:</strong>
                         <ul className="list-disc ml-4 mt-1 space-y-1 text-xs">
                             <li>Every incoming WhatsApp message triggers this webhook.</li>
                             <li>The payload contains: <code>text</code>, <code>sender_id</code>, <code>conversation_id</code>, and <code>contact_name</code>.</li>
                         </ul>
                     </div>
                     <div className="pt-4 border-t border-slate-100 flex justify-end items-center gap-3">
                         {n8nSaveStatus === 'success' && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={12}/> Guardado correctamente</span>}
                         {n8nSaveStatus === 'error' && <span className="text-xs text-red-600">Error al guardar la configuración</span>}
                         <button onClick={handleSaveN8n} disabled={isSavingN8n || !n8nUrl} className="bg-orange-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2">{isSavingN8n ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Guardar Automatización</button>
                     </div>
                 </div>
              </div>
          )}

          {activeTab === 'retell' && (
              <div className="max-w-3xl space-y-6">
                 <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2"><PhoneCall size={20} className="text-indigo-600"/> Bot de Voz (Retell AI vía n8n)</h3>
                        <p className="text-sm text-slate-500">Próximamente: automatización de llamadas salientes.</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">Próximamente</span>
                 </div>
                 <div className="bg-white rounded-xl border border-dashed border-slate-200 shadow-sm p-6 space-y-4">
                     <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700">
                         Retell ya estará disponible aquí pronto. Mantente atento.
                     </div>
                     <div className="flex items-center gap-2 text-xs text-slate-500">
                         <Lock size={14}/> Configuración temporalmente deshabilitada.
                     </div>
                 </div>
              </div>
          )}

          {activeTab === 'templates' && (
              <div className="max-w-4xl space-y-6">
                  <div className="flex justify-between items-center">
                      <div>
                          <h3 className="text-lg font-semibold flex items-center gap-2"><FileJson size={20} className="text-emerald-600"/> Plantillas Meta</h3>
                          <p className="text-sm text-slate-500">Sincroniza plantillas creadas en Meta Business Manager.</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleSyncTemplates} disabled={isSyncingTemplates} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50">
                            {isSyncingTemplates ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>} Sincronizar desde Meta
                        </button>
                      </div>
                  </div>
                  {isLoadingTemplates ? (
                       <div className="flex justify-center p-10"><Loader2 className="animate-spin text-emerald-600"/></div>
                  ) : templates.length === 0 ? (
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center">
                           <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400"><FileJson size={32}/></div>
                           <h3 className="font-bold text-slate-700">Sin Plantillas</h3>
                           <p className="text-slate-500 text-sm mb-6">Crea las plantillas en Meta Business Manager y luego haz clic en Sincronizar.</p>
                       </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {templates.map(t => (
                            <div key={t.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
                                <div className={`absolute top-0 right-0 w-20 h-20 bg-emerald-50 rounded-full translate-x-10 -translate-y-10 transition-transform group-hover:scale-110`}></div>
                                <div className="flex justify-between items-start mb-2 relative z-10">
                                    <h4 className="font-bold text-slate-800">{t.name}</h4>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${t.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.status}</span>
                                        <button onClick={() => handleDeleteTemplate(t.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-600 mb-3 line-clamp-2 relative z-10 whitespace-pre-wrap">{t.body}</p>
                                <div className="flex gap-2 text-[10px] text-slate-400 font-mono relative z-10"><span>{t.language}</span><span>•</span><span>{t.category}</span></div>
                            </div>
                        ))}
                    </div>
                  )}
              </div>
          )}

          {/* ==================== API TAB ==================== */}
          {activeTab === 'api' && (
              <div className="max-w-5xl space-y-6">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                          <h3 className="text-xl font-bold flex items-center gap-2 text-slate-900"><Key size={22} className="text-cyan-600"/> External API</h3>
                          <p className="text-sm text-slate-500 mt-1">Manage API keys and endpoints for external platform integrations.</p>
                      </div>
                      <div className="flex gap-2">
                          <button
                              onClick={() => setShowApiDocs(!showApiDocs)}
                              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                                  showApiDocs ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                          >
                              <BookOpen size={16} /> {showApiDocs ? 'Hide Docs' : 'API Docs'}
                          </button>
                          <button
                              onClick={() => { setShowCreateKeyModal(true); setNewlyCreatedKey(null); }}
                              className="bg-cyan-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-cyan-700 flex items-center gap-2 shadow-md"
                          >
                              <Plus size={16} /> Create API Key
                          </button>
                      </div>
                  </div>

                  {/* API Documentation (expandable) */}
                  {showApiDocs && (
                      <ApiDocumentation apiBaseUrl={apiKeyService.getApiBaseUrl()} />
                  )}

                  {isLoadingApiKeys ? (
                      <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-cyan-600" /></div>
                  ) : (
                      <>
                          {/* API Keys Section */}
                          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                                  <h4 className="font-bold text-slate-800 flex items-center gap-2"><Key size={16} className="text-cyan-600" /> API Keys</h4>
                                  <p className="text-xs text-slate-500 mt-1">Keys are shown with a prefix only. The full key is only visible once at creation.</p>
                              </div>
                              {apiKeys.length === 0 ? (
                                  <div className="p-12 text-center">
                                      <div className="bg-slate-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                                          <Key size={28} className="text-slate-400" />
                                      </div>
                                      <p className="text-slate-600 font-semibold">No API Keys</p>
                                      <p className="text-slate-400 text-sm mt-1">Create your first API key to start integrating with external platforms.</p>
                                  </div>
                              ) : (
                                  <div className="divide-y divide-slate-100">
                                      {apiKeys.map(key => (
                                          <div key={key.id} className="px-6 py-4 hover:bg-slate-50 transition-colors">
                                              <div className="flex items-center justify-between">
                                                  <div className="flex-1 min-w-0">
                                                      <div className="flex items-center gap-3">
                                                          <h5 className="font-semibold text-slate-800">{key.name}</h5>
                                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                              key.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                          }`}>
                                                              {key.is_active ? 'Active' : 'Revoked'}
                                                          </span>
                                                      </div>
                                                      <div className="flex items-center gap-2 mt-1">
                                                          <code className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{key.key_prefix}••••••••</code>
                                                          <span className="text-[10px] text-slate-400">Created {new Date(key.created_at).toLocaleDateString()}</span>
                                                          {key.last_used_at && (
                                                              <span className="text-[10px] text-slate-400">• Last used {new Date(key.last_used_at).toLocaleDateString()}</span>
                                                          )}
                                                          {key.expires_at && (
                                                              <span className={`text-[10px] ${new Date(key.expires_at) < new Date() ? 'text-red-500' : 'text-slate-400'}`}>
                                                                  • Expires {new Date(key.expires_at).toLocaleDateString()}
                                                              </span>
                                                          )}
                                                      </div>
                                                      <div className="flex flex-wrap gap-1 mt-2">
                                                          {key.scopes.map(scope => (
                                                              <span key={scope} className="px-1.5 py-0.5 bg-cyan-50 text-cyan-700 text-[10px] rounded font-mono">{scope}</span>
                                                          ))}
                                                      </div>
                                                  </div>
                                                  <div className="flex items-center gap-2 ml-4">
                                                      {key.is_active ? (
                                                          <button onClick={() => handleRevokeApiKey(key.id)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium transition-colors">Revoke</button>
                                                      ) : (
                                                          <button onClick={() => handleActivateApiKey(key.id)} className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-medium transition-colors">Activate</button>
                                                      )}
                                                      <button onClick={() => handleDeleteApiKey(key.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                                                  </div>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>

                          {/* Endpoint Configuration */}
                          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                                  <h4 className="font-bold text-slate-800 flex items-center gap-2"><Shield size={16} className="text-cyan-600" /> Endpoint Configuration</h4>
                                  <p className="text-xs text-slate-500 mt-1">Enable or disable individual API endpoints for your organization.</p>
                              </div>
                              <div className="divide-y divide-slate-100">
                                  {endpointConfigs.map(config => {
                                      const endpointInfo = API_ENDPOINTS.find(e => e.name === config.endpoint_name && e.method === config.method);
                                      const methodColors: Record<string, string> = {
                                          GET: 'bg-blue-100 text-blue-700',
                                          POST: 'bg-green-100 text-green-700',
                                          PUT: 'bg-yellow-100 text-yellow-800',
                                          DELETE: 'bg-red-100 text-red-700',
                                      };
                                      return (
                                          <div key={config.id} className={`px-6 py-3 flex items-center justify-between transition-colors ${config.is_enabled ? 'hover:bg-slate-50' : 'bg-slate-50 opacity-60'}`}>
                                              <div className="flex items-center gap-3">
                                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${methodColors[config.method] || 'bg-slate-100 text-slate-600'}`}>
                                                      {config.method}
                                                  </span>
                                                  <div>
                                                      <code className="text-sm font-mono text-slate-700">/{config.endpoint_name}</code>
                                                      {endpointInfo && <p className="text-[10px] text-slate-400">{endpointInfo.description}</p>}
                                                  </div>
                                              </div>
                                              <div className="flex items-center gap-4">
                                                  <span className="text-[10px] text-slate-400">{config.rate_limit_per_minute} req/min</span>
                                                  <button
                                                      onClick={() => handleToggleEndpoint(config.id, !config.is_enabled)}
                                                      className="transition-colors"
                                                  >
                                                      {config.is_enabled ? (
                                                          <ToggleRight size={28} className="text-cyan-600" />
                                                      ) : (
                                                          <ToggleLeft size={28} className="text-slate-300" />
                                                      )}
                                                  </button>
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>

                          {/* API Base URL */}
                          <div className="bg-slate-800 text-white p-5 rounded-xl">
                              <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">API Base URL</p>
                              <div className="flex items-center gap-3">
                                  <code className="text-emerald-400 text-sm font-mono flex-1 break-all">{apiKeyService.getApiBaseUrl()}</code>
                                  <button onClick={() => copyToClipboard(apiKeyService.getApiBaseUrl())} className="text-slate-400 hover:text-white p-1"><Copy size={16} /></button>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-2">Include your API key in the <code className="text-cyan-400">X-API-Key</code> header for all requests.</p>
                          </div>
                      </>
                  )}
              </div>
          )}

          {activeTab === 'snippets' && (
              <div className="max-w-4xl space-y-6">
                  <div className="flex justify-between items-center">
                      <div><h3 className="text-lg font-semibold flex items-center gap-2"><Zap size={20} className="text-emerald-600"/> Snippets</h3><p className="text-sm text-slate-500">Crea atajos (ej: /hola) para respuestas rápidas.</p></div>
                      <button onClick={() => setShowSnippetModal(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"><Plus size={16} /> Nuevo Snippet</button>
                  </div>
                  {isLoadingSnippets ? (<div className="flex justify-center p-10"><Loader2 className="animate-spin text-emerald-600"/></div>) : snippets.length === 0 ? (
                       <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center">
                           <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400"><Zap size={32}/></div>
                           <h3 className="font-bold text-slate-700">Sin Snippets Aún</h3>
                           <button onClick={handleSeedSnippets} className="text-emerald-600 text-sm font-medium hover:underline flex items-center justify-center gap-2 mt-2"><RefreshCw size={14}/> Cargar Ejemplos</button>
                       </div>
                  ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                      <table className="w-full text-left">
                         <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="px-6 py-4">Shortcut</th><th className="px-6 py-4">Content</th><th className="px-6 py-4 w-20"></th></tr></thead>
                         <tbody className="divide-y divide-slate-100">
                             {snippets.map(s => (
                                 <tr key={s.id} className="hover:bg-slate-50">
                                     <td className="px-6 py-4 font-mono text-emerald-600 font-bold">{s.shortcut}</td>
                                     <td className="px-6 py-4 text-slate-600 text-sm">{s.content}</td>
                                     <td className="px-6 py-4 text-right"><button onClick={() => handleDeleteSnippet(s.id)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={16}/></button></td>
                                 </tr>
                             ))}
                         </tbody>
                      </table>
                    </div>
                  )}
              </div>
          )}

          {activeTab === 'data' && currentUser && (
            <div className="max-w-3xl space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Database size={20} className="text-red-600"/> Gestión de Datos</h3>
                <p className="text-sm text-slate-500">Eliminación y privacidad de datos. Las acciones son permanentes e irreversibles.</p>
              </div>
              <DataDeletionScreen
                currentUser={currentUser}
                onBack={() => setActiveTab('profile')}
                hideHeader={true}
                onOrganizationDeleted={async () => {
                  await authService.signOut();
                  window.location.href = '/';
                }}
              />
            </div>
          )}

          

        </div>
      </div>

      {/* SNIPPET MODAL - remains */}
       {showSnippetModal && (
          <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Crear Snippet</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-slate-600 uppercase">Atajo</label>
                          <input type="text" className="w-full border p-2 rounded text-sm mt-1 font-mono text-emerald-600" placeholder="/example" value={snippetForm.shortcut} onChange={e => setSnippetForm({...snippetForm, shortcut: e.target.value})} />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-600 uppercase">Contenido del Mensaje</label>
                          <textarea rows={4} className="w-full border p-2 rounded text-sm mt-1" placeholder="Escribe el mensaje..." value={snippetForm.content} onChange={e => setSnippetForm({...snippetForm, content: e.target.value})} />
                      </div>
                  </div>
                  <div className="flex gap-2 mt-6">
                      <button onClick={handleCreateSnippet} disabled={!snippetForm.shortcut || !snippetForm.content} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50">Guardar Snippet</button>
                      <button onClick={() => setShowSnippetModal(false)} className="flex-1 bg-slate-200 text-slate-700 py-2 rounded-lg font-medium hover:bg-slate-300">Cancelar</button>
                  </div>
              </div>
          </div>
       )}

      {/* CREATE API KEY MODAL */}
       {showCreateKeyModal && (
          <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                  {newlyCreatedKey ? (
                      // Show the created key (only once)
                      <div>
                          <div className="flex items-center gap-3 mb-4">
                              <div className="p-2 bg-green-100 rounded-lg"><CheckCircle size={24} className="text-green-600" /></div>
                              <div>
                                  <h3 className="text-lg font-bold text-slate-800">¡Clave API Creada!</h3>
                                  <p className="text-xs text-slate-500">Copia y guarda tu clave ahora. No se mostrará de nuevo.</p>
                              </div>
                          </div>
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                              <p className="text-xs text-amber-800 flex items-center gap-1">
                                  <AlertTriangle size={14} />
                                  <strong>Importante:</strong> Esta es la única vez que se mostrará la clave completa. Guárdala de forma segura.
                              </p>
                          </div>
                          <div className="bg-slate-900 rounded-lg p-4 flex items-center justify-between gap-2">
                              <code className="text-emerald-400 text-sm font-mono break-all flex-1">{newlyCreatedKey}</code>
                              <button onClick={() => copyToClipboard(newlyCreatedKey)} className="text-slate-400 hover:text-white p-2 flex-shrink-0"><Copy size={18} /></button>
                          </div>
                          <button
                              onClick={() => { setShowCreateKeyModal(false); setNewlyCreatedKey(null); }}
                              className="w-full mt-4 bg-slate-800 text-white py-2.5 rounded-lg font-medium hover:bg-slate-900 transition-colors"
                          >
                              Hecho
                          </button>
                      </div>
                  ) : (
                      // Create key form
                      <div>
                          <div className="flex items-center gap-3 mb-4">
                              <div className="p-2 bg-cyan-100 rounded-lg"><Key size={24} className="text-cyan-600" /></div>
                              <div>
                                  <h3 className="text-lg font-bold text-slate-800">Crear Clave API</h3>
                                  <p className="text-xs text-slate-500">Genera una nueva clave para integraciones externas</p>
                              </div>
                          </div>
                          <div className="space-y-4">
                              <div>
                                  <label className="text-xs font-bold text-slate-600 uppercase">Nombre de la Clave <span className="text-red-500">*</span></label>
                                  <input
                                      type="text"
                                      className="w-full border border-slate-300 p-2 rounded-lg text-sm mt-1 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                                      placeholder="Ej: Clave Producción, Integración n8n"
                                      value={newKeyForm.name}
                                      onChange={e => setNewKeyForm({ ...newKeyForm, name: e.target.value })}
                                  />
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-600 uppercase">Permisos <span className="text-red-500">*</span></label>
                                  <p className="text-[10px] text-slate-400 mb-2">Selecciona los permisos que tendrá esta clave:</p>
                                  <div className="space-y-2 max-h-48 overflow-y-auto">
                                      {API_SCOPES.map(scope => (
                                          <label key={scope.value} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                                              <input
                                                  type="checkbox"
                                                  checked={newKeyForm.scopes.includes(scope.value)}
                                                  onChange={(e) => {
                                                      if (e.target.checked) {
                                                          setNewKeyForm({ ...newKeyForm, scopes: [...newKeyForm.scopes, scope.value] });
                                                      } else {
                                                          setNewKeyForm({ ...newKeyForm, scopes: newKeyForm.scopes.filter(s => s !== scope.value) });
                                                      }
                                                  }}
                                                  className="mt-1 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                              />
                                              <div>
                                                  <p className="text-sm font-medium text-slate-700">{scope.label}</p>
                                                  <p className="text-[10px] text-slate-400">{scope.description}</p>
                                              </div>
                                          </label>
                                      ))}
                                  </div>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-600 uppercase">Fecha de Expiración (Opcional)</label>
                                  <input
                                      type="date"
                                      className="w-full border border-slate-300 p-2 rounded-lg text-sm mt-1 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                                      value={newKeyForm.expiresAt}
                                      onChange={e => setNewKeyForm({ ...newKeyForm, expiresAt: e.target.value })}
                                      min={new Date().toISOString().split('T')[0]}
                                  />
                                  <p className="text-[10px] text-slate-400 mt-1">Deja vacío para una clave que nunca expire</p>
                              </div>
                          </div>
                          <div className="flex gap-2 mt-6">
                              <button
                                  onClick={handleCreateApiKey}
                                  disabled={isCreatingKey || !newKeyForm.name || newKeyForm.scopes.length === 0}
                                  className="flex-1 bg-cyan-600 text-white py-2.5 rounded-lg font-medium hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                              >
                                  {isCreatingKey ? (<><Loader2 size={16} className="animate-spin" /> Generando...</>) : (<><Key size={16} /> Generar Clave</>)}
                              </button>
                              <button
                                  onClick={() => { setShowCreateKeyModal(false); setNewKeyForm({ name: '', scopes: [], expiresAt: '' }); }}
                                  disabled={isCreatingKey}
                                  className="flex-1 bg-slate-200 text-slate-700 py-2.5 rounded-lg font-medium hover:bg-slate-300 disabled:opacity-50 transition-colors"
                              >
                                  Cancelar
                              </button>
                          </div>
                      </div>
                  )}
              </div>
          </div>
       )}

      {/* INVITE MEMBER MODAL */}
       {showInviteModal && (
          <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                  <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-emerald-100 rounded-lg">
                          <UserIcon size={24} className="text-emerald-600"/>
                      </div>
                      <div>
                          <h3 className="text-lg font-bold text-slate-800">Invitar Miembro</h3>
                          <p className="text-xs text-slate-500">Enviar una invitación para unirse a tu organización</p>
                      </div>
                  </div>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1">
                              <Mail size={12}/> Email <span className="text-red-500">*</span>
                          </label>
                          <input 
                              type="email" 
                              className="w-full border border-slate-300 p-2 rounded-lg text-sm mt-1 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" 
                              placeholder="user@example.com" 
                              value={inviteForm.email} 
                              onChange={e => setInviteForm({...inviteForm, email: e.target.value})} 
                          />
                      </div>
                      
                      <div>
                          <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1">
                              <UserIcon size={12}/> Nombre Completo <span className="text-red-500">*</span>
                          </label>
                          <input 
                              type="text" 
                              className="w-full border border-slate-300 p-2 rounded-lg text-sm mt-1 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" 
                              placeholder="Juan Pérez" 
                              value={inviteForm.name} 
                              onChange={e => setInviteForm({...inviteForm, name: e.target.value})} 
                          />
                      </div>
                      
                      <div>
                          <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1">
                              <PhoneCall size={12}/> Número de Teléfono (Opcional)
                          </label>
                          <input 
                              type="tel" 
                              className="w-full border border-slate-300 p-2 rounded-lg text-sm mt-1 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono" 
                              placeholder="+54911..." 
                              value={inviteForm.phone} 
                              onChange={e => setInviteForm({...inviteForm, phone: e.target.value})} 
                          />
                          <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                              <AlertTriangle size={10}/>
                              Usa formato internacional (E.164), ej: +54911234567
                          </p>
                      </div>
                      
                      <div>
                          <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1">
                              <UserCog size={12}/> Rol <span className="text-red-500">*</span>
                          </label>
                          <select 
                              value={inviteForm.role} 
                              onChange={e => setInviteForm({...inviteForm, role: e.target.value as UserRole})} 
                              className="w-full border border-slate-300 p-2 rounded-lg text-sm mt-1 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                          >
                              <option value="admin">Admin - Acceso completo a todas las funciones</option>
                              <option value="manager">Gerente - Gestiona el equipo y ve reportes</option>
                              <option value="community">Agente - Acceso básico</option>
                          </select>
                      </div>
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                      <p className="text-xs text-blue-800">
                          <strong>Nota:</strong> Se enviará un correo de invitación al usuario con instrucciones para establecer su contraseña y unirse a tu organización.
                      </p>
                  </div>
                  
                  <div className="flex gap-2 mt-6">
                      <button 
                          onClick={handleInviteMember} 
                          disabled={isInviting || !inviteForm.email || !inviteForm.name} 
                          className="flex-1 bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                      >
                          {isInviting ? (
                              <>
                                  <Loader2 size={16} className="animate-spin"/>
                                  Enviando...
                              </>
                          ) : (
                              <>
                                  <Mail size={16}/>
                                  Enviar Invitación
                              </>
                          )}
                      </button>
                      <button 
                          onClick={() => {
                              setShowInviteModal(false);
                              setInviteForm({ email: '', name: '', role: 'community', phone: '' });
                          }} 
                          disabled={isInviting}
                          className="flex-1 bg-slate-200 text-slate-700 py-2.5 rounded-lg font-medium hover:bg-slate-300 disabled:opacity-50 transition-colors"
                      >
                          Cancelar
                      </button>
                  </div>
              </div>
          </div>
       )}
    </div>
  );
};

export default SettingsScreen;
