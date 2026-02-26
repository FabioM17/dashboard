
import React, { useState, useEffect, useRef } from 'react';
import { Conversation, Message, User, Note, MessageType, Task, CRMContact, CustomProperty, Snippet, Template } from '../types';
import { 
    Send, MoreVertical, Sparkles, Check, CheckCheck, Smile, 
    StickyNote, MessageSquare, Plus, UserPlus, ArrowLeft, Database, Trash2, Archive, CheckSquare, X, UserCheck, Zap, FileJson, Image as ImageIcon, Paperclip, Loader2, AlertTriangle, Clock, Phone, Calendar, Play, PhoneOutgoing, PhoneMissed, PhoneOff, Mic
} from 'lucide-react';
import { aiService } from '../services/aiService';
import { snippetService } from '../services/snippetService';
import { templateService } from '../services/templateService';
import { chatService } from '../services/chatService';
import { supabase } from '../services/supabaseClient';
import { storageService } from '../services/storageService';
import { teamService } from '../services/teamService';
import { validationService } from '../services/validationService';
import { taskService } from '../services/taskService';
import LoadingOverlay from './LoadingOverlay';
import ResultOverlay from './ResultOverlay';
import { ImageViewer, AudioPlayer, VideoPlayer, DocumentViewer } from './MediaViewer';

interface ChatWindowProps {
  conversation: Conversation;
  messages: Message[];
  notes: Note[];
  currentUser: User;
  customProperties: CustomProperty[]; 
  contacts: CRMContact[]; // Full list of contacts to check existence
  onSendMessage: (text: string, type?: MessageType, extraData?: Partial<Message>) => void;
  onAddNote: (text: string) => void;
  onBack: () => void;
  onAddTask?: (task: Task) => void;
  onSaveContact?: (contact: CRMContact) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ 
  conversation, 
  messages, 
  notes,
  currentUser,
  customProperties,
  contacts,
  onSendMessage,
  onAddNote,
  onBack,
  onAddTask,
  onSaveContact
}) => {
    // ===== LOCAL STATE (replaces missing hooks) =====
    const [callState, setCallState] = useState<'idle' | 'dialing' | 'active'>('idle');
    const [callDuration, setCallDuration] = useState(0);
    const callTimerRef = useRef<number | null>(null);

    const [isWindowClosed, setIsWindowClosed] = useState(false);

    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
    const [mediaErrors] = useState<Record<string, string>>({});
    const [mediaLoading] = useState<Record<string, boolean>>({});

    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [inputText, setInputText] = useState('');
    const [filteredSnippets, setFilteredSnippets] = useState<Snippet[]>([]);
    const [showSnippetSuggestions, setShowSnippetSuggestions] = useState(false);

  // ===== LOCAL STATES =====
  const [activeTab, setActiveTab] = useState<'chat' | 'notes'>('chat');
  const [noteText, setNoteText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionLoadingMsg, setActionLoadingMsg] = useState('');
  const [resultNotice, setResultNotice] = useState<{ show: boolean; status: 'success' | 'error' | 'info' | 'warning'; title?: string; message?: string }>({ show: false, status: 'info' });
  const [isSendSubmitting, setIsSendSubmitting] = useState(false);

  // UI States
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [showPropertySidebar, setShowPropertySidebar] = useState(false);

  // Call / Retell States
  const [showCallModal, setShowCallModal] = useState(false);
  const [callScheduleDate, setCallScheduleDate] = useState('');

  // Snippets & Templates State (Templates aún local porque es de solo lectura)
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [templatesList, setTemplatesList] = useState<Template[]>([]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const notesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
    const assigneeRef = useRef<HTMLDivElement | null>(null);
  const prevMessagesLengthRef = useRef(messages.length);

  const isViewer = currentUser.role === 'viewer';

  // Early logging for debugging
  useEffect(() => {
    console.log('[ChatWindow] Component mounted');
    console.log('[ChatWindow] VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
    console.log('[ChatWindow] VITE_SUPABASE_ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Configured ✅' : 'Missing ❌');
    console.log('[ChatWindow] Total messages:', messages.length);
    console.log('[ChatWindow] Messages with media_path:', messages.filter(m => m.media_path).length);
  }, []);

  // Detectar mensaje nuevo y notificar
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      const newMessages = messages.slice(prevMessagesLengthRef.current);
      newMessages.forEach(msg => {
        if (msg.isIncoming) {
          console.log('🔔 New incoming message:', msg.text?.substring(0, 50));
          // Browser notification si el usuario lo permite
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(`Message from ${msg.authorName}`, {
              body: msg.text?.substring(0, 100) || 'Sent a message',
              icon: '/favicon.ico',
              tag: 'message-notification',
              requireInteraction: false
            });
          }
        }
      });
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length]);

  // Task & Contact States
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
    const [newTaskAssignee, setNewTaskAssignee] = useState(currentUser.id);
        const [newTaskDueDate, setNewTaskDueDate] = useState('');
        const [newTaskNotify, setNewTaskNotify] = useState(true);
            const [newTaskSendWhatsApp, setNewTaskSendWhatsApp] = useState(false);
            const [newTaskTemplateId, setNewTaskTemplateId] = useState<string | null>(null);
    const [teamMembers, setTeamMembers] = useState<User[]>([]);
    const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
    const [dueDateError, setDueDateError] = useState('');

    useEffect(() => {
        let mounted = true;
        if (currentUser?.organizationId) {
            teamService.getTeamMembers(currentUser.organizationId).then(members => {
                if (!mounted) return;
                setTeamMembers(members || []);
                // If current assignee not in list, keep as-is; otherwise default to current user
                if (!members.find(m => m.id === newTaskAssignee)) {
                    setNewTaskAssignee(currentUser.id);
                }
            }).catch(err => {
                console.error('Failed loading team members', err);
            });
        }
        return () => { mounted = false; };
    }, [currentUser]);
  
  // CRM Logic
  const existingContact = contacts.find(c => 
      c.phone === conversation.id || 
      c.name === conversation.contactName || 
      (c.phone && conversation.contactName.includes(c.phone)) 
  );

  const [contactForm, setContactForm] = useState({
      id: '',
      name: '',
      email: '',
      phone: '', 
      company: '',
      properties: {} as Record<string, any>
  });

  // Calculate 24h Window on messages change
  useEffect(() => {
      if (conversation.platform === 'whatsapp') {
          const lastIncomingMsg = [...messages].reverse().find(m => m.isIncoming);
          if (lastIncomingMsg) {
              const diff = new Date().getTime() - lastIncomingMsg.timestamp.getTime();
              const hours = diff / (1000 * 60 * 60);
              setIsWindowClosed(hours >= 24);
          } else {
              setIsWindowClosed(false);
          }
      } else {
          setIsWindowClosed(false); 
      }
  }, [messages, conversation]);

  // LOGIC: Watch for incoming "Call Ended" messages to stop the active call banner
  useEffect(() => {
      if (callState === 'idle') return;

      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.type === 'call_log') {
          // If a new log arrives saying completed, failed, or voicemail -> Stop UI
          if (['completed', 'failed', 'voicemail'].includes(lastMessage.callStatus || '')) {
              endCallUI();
          }
          // If a log arrives saying "ringing" and we are "dialing", move to active
          if (lastMessage.callStatus === 'ringing' && callState === 'dialing') {
              setCallState('active');
          }
      }
  }, [messages, callState]);

  // Timer Logic for Active Call
  useEffect(() => {
      if (callState === 'active') {
          callTimerRef.current = window.setInterval(() => {
              setCallDuration(prev => prev + 1);
          }, 1000);
      } else {
          if (callTimerRef.current) clearInterval(callTimerRef.current);
      }
      return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [callState]);

  const endCallUI = () => {
      setCallState('idle');
      setCallDuration(0);
      if (callTimerRef.current) clearInterval(callTimerRef.current);
  };

  const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Init form with conversation data or existing CRM data
  useEffect(() => {
      if (existingContact) {
          setContactForm({
              id: existingContact.id,
              name: existingContact.name,
              email: existingContact.email,
              phone: existingContact.phone,
              company: existingContact.company,
              properties: existingContact.properties
          });
      } else {
          // Initialize properties with empty values for custom properties
          const initialProperties: Record<string, any> = {};
          customProperties.forEach(prop => {
              initialProperties[prop.id] = '';
          });
          
          // Get phone from last incoming message's senderId
          const lastIncomingMsg = [...messages].reverse().find(m => m.isIncoming);
          const phoneNumber = lastIncomingMsg?.senderId || conversation.id;
          
          setContactForm({
              id: conversation.id, 
              name: conversation.contactName,
              email: '',
              phone: phoneNumber, // Pre-fill with senderId from incoming message
              company: '',
              properties: initialProperties
          });
      }
  }, [conversation, existingContact, customProperties, messages]);

  // Load Snippets and Templates on Mount
  useEffect(() => {
      if (currentUser?.organizationId) {
          snippetService.getSnippets(currentUser.organizationId).then(setSnippets);
          templateService.getTemplates(currentUser.organizationId).then(setTemplates);
            templateService.getTemplates(currentUser.organizationId).then(setTemplatesList).catch(err => console.error('Failed loading templates', err));
      }
  }, [currentUser]);

    // Validate due date when changed
    useEffect(() => {
        if (!newTaskDueDate) {
            setDueDateError('');
            return;
        }
        const picked = new Date(newTaskDueDate);
        if (isNaN(picked.getTime())) {
            setDueDateError('Fecha inválida');
            return;
        }
        if (picked.getTime() <= Date.now()) {
            setDueDateError('La fecha debe ser en el futuro');
        } else {
            setDueDateError('');
        }
    }, [newTaskDueDate]);

    // Close assignee dropdown when clicking outside or pressing Escape
    useEffect(() => {
        function handleDocClick(e: MouseEvent) {
            if (!showAssigneeDropdown) return;
            if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) {
                setShowAssigneeDropdown(false);
            }
        }

        function handleKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setShowAssigneeDropdown(false);
        }

        document.addEventListener('mousedown', handleDocClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleDocClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [showAssigneeDropdown]);

  // Handle Input Change for Snippet Detection
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setInputText(text);

      const words = text.split(' ');
      const lastWord = words[words.length - 1];

      if (lastWord.startsWith('/') && lastWord.length > 1) {
          const search = lastWord.toLowerCase();
          const matches = snippets.filter(s => s.shortcut.toLowerCase().startsWith(search));
          setFilteredSnippets(matches);
          setShowSnippetSuggestions(matches.length > 0);
      } else {
          setShowSnippetSuggestions(false);
      }
  };

  const insertSnippet = (snippet: Snippet) => {
      const words = inputText.split(' ');
      words.pop(); // Remove the partial shortcut
      const newText = words.join(' ') + (words.length > 0 ? ' ' : '') + snippet.content;
      setInputText(newText);
      setShowSnippetSuggestions(false);
  };

  const handleSendTemplate = (template: Template) => {
      if (isSendSubmitting) return;
      setIsSendSubmitting(true);
      onSendMessage(template.body, 'template', { 
          text: template.body,
          templateName: template.name,
          templateLanguage: template.language 
      }); 
      setShowTemplateModal(false);
      setResultNotice({ show: true, status: 'success', title: 'Template enviado', message: 'El mensaje de template fue enviado.' });
      setTimeout(() => setIsSendSubmitting(false), 500);
  };

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  // Subscribe to message status updates from WhatsApp
  useEffect(() => {
    if (!conversation.id) return;
    
    let unsubscribe: (() => void) | null = null;
    
    try {
      // Subscribe to changes on the conversation to listen for message status updates
      const statusHandler = (update: any) => {
        console.log('[ChatWindow] Message status update received:', update);
        // The parent component (App.tsx or ConversationList) handles refetching messages
        // This hook is here to enable real-time status updates without full refetch
      };
      
      // Optional: Set up individual message status subscriptions for selected messages
      const messageIds = messages
        .filter(m => !m.isIncoming && m.whatsappMessageId) // Only for outgoing messages with WAMID
        .slice(-5) // Subscribe to last 5 messages for efficiency
        .map(m => m.id);
      
      messageIds.forEach(msgId => {
        // Note: This requires the subscribeToMessageStatus function in chatService
        // For now, status updates come through the conversation's message_statuses table changes
      });
      
      return () => {
        if (unsubscribe) unsubscribe();
      };
    } catch (err) {
      console.error('[ChatWindow] Failed to subscribe to message statuses:', err);
    }
  }, [conversation.id, messages]);

  // Generate public URLs directly from media_path (no Edge Function needed for public buckets)
  useEffect(() => {
    const messagesWithMedia = messages.filter(msg => msg.media_path);
    console.log('[ChatWindow] Messages with media_path:', messagesWithMedia.map(m => ({ id: m.id, media_path: m.media_path, attachmentUrl: m.attachmentUrl })));

    const pathsToProcess = messages
      .filter(msg => msg.media_path && !msg.attachmentUrl && !signedUrls[msg.media_path!])
      .map(msg => msg.media_path!);

    console.log('[ChatWindow] Paths to process:', pathsToProcess);

    if (pathsToProcess.length > 0) {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
      
      if (!SUPABASE_URL) {
        console.error('[ChatWindow] VITE_SUPABASE_URL not configured!');
        return;
      }

      console.log('[ChatWindow] Generating public URLs for bucket whatsapp-media');
      
      const publicUrls: Record<string, string> = {};
      pathsToProcess.forEach(p => {
        // Strip "whatsapp-media/" prefix if present to avoid duplication
        const cleanPath = p.startsWith('whatsapp-media/') ? p.substring('whatsapp-media/'.length) : p;
        publicUrls[p] = `${SUPABASE_URL}/storage/v1/object/public/whatsapp-media/${encodeURI(cleanPath)}`;
        console.log(`[ChatWindow] Generated public URL for "${p}": ${publicUrls[p]}`);
      });
      
      setSignedUrls(prev => ({ ...prev, ...publicUrls }));
    } else {
      console.log('[ChatWindow] No paths to process (all have attachmentUrl or already cached)');
    }
  }, [messages]);

  useEffect(() => {
    if (activeTab === 'notes') notesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [notes, activeTab]);

    const handleSend = () => {
        if (!inputText.trim() || isSendSubmitting) return;
        setIsSendSubmitting(true);
        onSendMessage(inputText, 'text');
        setInputText('');
        setShowSnippetSuggestions(false);
        setTimeout(() => setIsSendSubmitting(false), 400);
    };

  const handleSaveNote = () => {
    if (!noteText.trim()) return;
    onAddNote(noteText);
    setNoteText('');
  };

    const handleSmartReply = async () => {
        try {
            setIsGenerating(true);
            setIsActionLoading(true);
            setActionLoadingMsg('Generando sugerencia...');
            const suggestion = await aiService.generateSmartReply(
                messages, 
                conversation.contactName,
                currentUser.organizationId
            );
            setInputText(suggestion);
            setResultNotice({ show: true, status: 'success', title: 'Sugerencia generada', message: 'Revisa y envía cuando estés listo.' });
        } catch (e) {
            console.error('Smart reply error', e);
            setResultNotice({ show: true, status: 'error', title: 'Error al generar', message: 'No se pudo generar la sugerencia.' });
        } finally {
            setIsGenerating(false);
            setIsActionLoading(false);
            setActionLoadingMsg('');
        }
    };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsUploading(true);
      setIsActionLoading(true);
      setActionLoadingMsg('Subiendo archivo...');
      setShowAttachMenu(false);
      try {
          const orgFolder = currentUser?.organizationId || 'general';
          let mediaType: 'image' | 'audio' | 'document' = 'document';
          if (file.type.startsWith('image/')) {
              mediaType = 'image';
          } else if (file.type.startsWith('audio/')) {
              mediaType = 'audio';
          }
          const upload = await storageService.uploadFile(file, 'attachments', orgFolder, mediaType);
          
          // Detect message type based on file MIME type or extension
          let type: MessageType = 'file';
          let displayText = 'Archivo adjunto';
          
          if (file.type.startsWith('image/')) {
              type = 'image';
              displayText = 'Imagen adjunta';
          } else if (file.type.startsWith('audio/')) {
              type = 'audio';
              displayText = 'Audio adjunto';
          } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
              type = 'document';
              displayText = 'PDF Document';
          } else if (
              file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // .xlsx
              file.type === 'application/vnd.ms-excel' || // .xls
              file.name.endsWith('.xlsx') ||
              file.name.endsWith('.xls')
          ) {
              type = 'document';
              displayText = 'Excel File';
          } else if (
              file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || // .docx
              file.type === 'application/msword' || // .doc
              file.name.endsWith('.docx') ||
              file.name.endsWith('.doc')
          ) {
              type = 'document';
              displayText = 'Word Document';
          }
          
          onSendMessage(
              displayText,
              type,
              { 
                  attachmentUrl: upload.publicUrl,
                  media_path: upload.path,
                  fileName: file.name,
                  fileSize: (file.size / 1024 / 1024).toFixed(2) + ' MB'
              }
          );
          setResultNotice({ show: true, status: 'success', title: 'Archivo enviado', message: 'El archivo fue subido y enviado correctamente.' });
      } catch (error) {
          console.error("Upload failed", error);
          setResultNotice({ show: true, status: 'error', title: 'Error de subida', message: 'No se pudo subir el archivo.' });
      } finally {
          setIsUploading(false);
          setIsActionLoading(false);
          setActionLoadingMsg('');
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

    const handleCreateTask = async () => {
            if (!newTaskTitle.trim() || !onAddTask) return;
            if (dueDateError) {
                setResultNotice({ show: true, status: 'error', title: 'Fecha inválida', message: dueDateError });
                return;
            }

            const localTask: Task = {
                    id: Date.now().toString(),
                    title: newTaskTitle,
                    description: newTaskDescription,
                    status: 'todo',
                    assigneeId: newTaskAssignee,
                    conversationId: conversation.id,
                    clientName: conversation.contactName,
                    dueDate: newTaskDueDate ? new Date(newTaskDueDate) : new Date(Date.now() + 86400000)
            };

            // Optimistically add to UI
            try {
                setIsActionLoading(true);
                setActionLoadingMsg('Guardando tarea...');

                if (currentUser?.organizationId) {
                    const created = await taskService.createTask(localTask, currentUser.organizationId, newTaskNotify);
                    const createdTask: Task = {
                        id: created.id || localTask.id,
                        title: created.title || localTask.title,
                        description: created.description || localTask.description,
                        assigneeId: created.assignee_id || localTask.assigneeId,
                        conversationId: created.conversation_id || localTask.conversationId,
                        clientName: conversation.contactName,
                        status: created.status || localTask.status,
                        dueDate: created.due_date ? new Date(created.due_date) : localTask.dueDate
                    };
                    onAddTask(createdTask);

                    if (created._emailSkipped) {
                        setResultNotice({ show: true, status: 'warning', title: 'Tarea creada', message: 'La tarea se guardó, pero no se envió notificación por email. Configura Gmail en Configuración > Channels.' });
                    } else {
                        setResultNotice({ show: true, status: 'success', title: 'Tarea creada', message: 'La tarea fue guardada.' });
                    }

                    // If user requested, send WhatsApp template after creation
                    try {
                        if (newTaskSendWhatsApp && newTaskTemplateId) {
                            const tpl = templatesList.find(t => t.name === newTaskTemplateId || t.id === newTaskTemplateId);
                            const templateName = tpl ? tpl.name : newTaskTemplateId;
                            const templateLang = tpl ? tpl.language : 'en_US';

                            const assignee = teamMembers.find(tm => tm.id === (createdTask.assigneeId || localTask.assigneeId));
                            // If assignee doesn't have phone, skip WhatsApp send and inform user
                            if (!assignee || !assignee.phone || !validationService.validatePhoneNumber(assignee.phone)) {
                                console.warn('WhatsApp skipped: assignee has no valid phone', assignee?.id);
                                setResultNotice({ show: true, status: 'warning', title: 'WhatsApp', message: 'No se envió WhatsApp: el encargado no tiene número válido.' });
                            } else {
                                const assigneeName = assignee.name || '';
                                const dueDateStr = createdTask.dueDate ? new Date(createdTask.dueDate).toLocaleString() : (localTask.dueDate ? localTask.dueDate.toLocaleString() : '');

                                // Send template directly to assignee's phone (to + organization_id)
                                const tplVars = [assigneeName, createdTask.title || localTask.title, dueDateStr];
                                try {
                                    const { error } = await supabase.functions.invoke('whatsapp-send', {
                                        body: {
                                            organization_id: currentUser.organizationId,
                                            to: assignee.phone,
                                            type: 'template',
                                            template_name: templateName,
                                            template_language: templateLang,
                                            template_variables: tplVars,
                                            author_name: currentUser.name
                                        }
                                    });
                                    if (error) throw error;
                                } catch (sendErr) {
                                    console.error('WhatsApp direct send error', sendErr);
                                    throw sendErr;
                                }
                            }
                        }
                    } catch (waErr) {
                        console.error('WhatsApp send error', waErr);
                        setResultNotice({ show: true, status: 'warning', title: 'WhatsApp', message: 'No se pudo enviar el template por WhatsApp.' });
                    }
                } else {
                    // No org id: fallback to local add
                    onAddTask(localTask);
                    setResultNotice({ show: true, status: 'warning', title: 'Tarea en memoria', message: 'No hay organización configurada; la tarea se agregó localmente.' });
                }
            } catch (err: any) {
                console.error('Create task error', err);
                // Fallback: add locally so user doesn't lose work
                onAddTask(localTask);
                setResultNotice({ show: true, status: 'error', title: 'Error al guardar', message: err?.message || 'No se pudo guardar la tarea en el servidor.' });
                } finally {
                setIsActionLoading(false);
                setActionLoadingMsg('');
                setShowTaskModal(false);
                setNewTaskTitle('');
                setNewTaskDescription('');
                setNewTaskAssignee(currentUser.id);
                setNewTaskDueDate('');
                    setNewTaskNotify(true);
            }
    };

  const handleSaveContact = () => {
      if(!onSaveContact) return;
      const newContact: CRMContact = {
          id: contactForm.id,
          name: contactForm.name,
          email: contactForm.email,
          phone: contactForm.phone,
          company: contactForm.company,
          pipelineStageId: existingContact ? existingContact.pipelineStageId : 'lead',
          avatar: conversation.contactAvatar,
          properties: contactForm.properties
      };
      onSaveContact(newContact);
      setShowContactModal(false);
  };

  const handleTriggerCall = async (type: 'now' | 'schedule') => {
      // 1. Update UI immediately
      if (type === 'now') {
          setCallState('dialing');
          // Simulate switch to 'active' after 4 seconds if no other event comes
          setTimeout(() => {
              setCallState(prev => prev === 'dialing' ? 'active' : prev);
          }, 4000);
      }

      try {
          setIsActionLoading(true);
          setActionLoadingMsg(type === 'schedule' ? 'Programando llamada...' : 'Iniciando llamada...');
          await chatService.triggerRetellCall(conversation.id, currentUser.id, type, type === 'schedule' ? callScheduleDate : undefined);
          setShowCallModal(false);
          if (type === 'schedule') {
              setResultNotice({ show: true, status: 'success', title: 'Llamada programada', message: 'La llamada fue programada correctamente.' });
          } else {
              setResultNotice({ show: true, status: 'info', title: 'Llamando...', message: 'La llamada con el bot está en curso.' });
          }
      } catch (error: any) {
          setResultNotice({ show: true, status: 'error', title: 'Error de llamada', message: error?.message || 'No se pudo iniciar la llamada.' });
          setCallState('idle'); // Reset on error
      } finally {
          setIsActionLoading(false);
          setActionLoadingMsg('');
      }
  };

  const renderStatusIcon = (status: Message['status'], whatsappMessageId?: string) => {
      const baseClasses = "inline-flex items-center gap-0.5";
      
      if (status === 'read') {
          return (
              <span title="Leído" className={baseClasses}>
                  <CheckCheck size={14} className="text-blue-500" />
              </span>
          );
      }
      if (status === 'delivered') {
          return (
              <span title="Entregado" className={baseClasses}>
                  <CheckCheck size={14} className="text-slate-400" />
              </span>
          );
      }
      if (status === 'sent') {
          return (
              <span title="Enviado" className={baseClasses}>
                  <Check size={14} className="text-slate-400" />
              </span>
          );
      }
      if (status === 'failed') {
          return (
              <span title="Error al enviar" className={baseClasses}>
                  <AlertTriangle size={14} className="text-red-500" />
              </span>
          );
      }
      return <Check size={14} className="text-slate-300" />;
  };

  // Helper to render Call Log content (History items in chat)
  const renderCallLog = (msg: Message) => {
      const isScheduled = msg.callStatus === 'scheduled';
      const isFailed = msg.callStatus === 'failed' || msg.callStatus === 'voicemail';
      const isCompleted = msg.callStatus === 'completed';
      const isRinging = msg.callStatus === 'ringing' || (!msg.callStatus && msg.text.includes('Initiating')); // Fallback for old logs
      
      // If ringing/dialing, we show less info here because the Floating Banner handles the attention
      if (isRinging && callState !== 'idle') {
          return null; // Hide the bubble if we have the banner active to avoid duplication
      }

      let icon = <PhoneOutgoing size={20} className="text-indigo-600"/>;
      let bgColor = "bg-indigo-50";
      let borderColor = "border-indigo-100";
      let title = "Voice Call Initiated";

      if (isScheduled) {
          icon = <Calendar size={20} className="text-orange-600"/>;
          bgColor = "bg-orange-50";
          borderColor = "border-orange-100";
          title = "Call Scheduled";
      } else if (isFailed) {
          icon = <PhoneMissed size={20} className="text-red-600"/>;
          bgColor = "bg-red-50";
          borderColor = "border-red-100";
          title = msg.callStatus === 'voicemail' ? "Voicemail Left" : "Call Failed / Busy";
      } else if (isCompleted) {
          icon = <Phone size={20} className="text-green-600"/>;
          bgColor = "bg-green-50";
          borderColor = "border-green-100";
          title = "Call Completed";
      }

      return (
          <div className={`p-4 rounded-lg border ${borderColor} ${bgColor} min-w-[280px]`}>
              <div className="flex items-center gap-3 mb-2">
                  <div className="bg-white p-2 rounded-full shadow-sm">{icon}</div>
                  <div>
                      <h4 className="font-bold text-slate-700 text-sm">{title}</h4>
                      <p className="text-xs text-slate-500">Bot: Retell AI</p>
                  </div>
              </div>
              
              {isScheduled && msg.scheduledTime && (
                  <div className="text-sm text-slate-700 mt-1 flex items-center gap-2">
                       <Clock size={14}/> 
                       {msg.scheduledTime.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
              )}

              {isCompleted && msg.callDuration && (
                   <div className="text-xs text-slate-500 mt-1">
                       Duration: {Math.floor(msg.callDuration / 60)}m {msg.callDuration % 60}s
                   </div>
              )}

              {isCompleted && msg.attachmentUrl && (
                  <div className="mt-3 bg-white p-2 rounded border border-slate-200 flex items-center gap-2">
                      <div className="bg-indigo-100 p-1.5 rounded-full text-indigo-600"><Play size={12}/></div>
                      <a href={msg.attachmentUrl} target="_blank" className="text-xs font-medium text-indigo-600 hover:underline">Escuchar grabación</a>
                  </div>
              )}
              
              {msg.text && !msg.text.startsWith('[') && !isRinging && (
                  <p className="mt-2 text-xs text-slate-600 italic border-t border-slate-200 pt-2">"{msg.text}"</p>
              )}
          </div>
      );
  };

  return (
    <div className="flex h-full w-full">
        {/* MAIN CHAT AREA */}
        <div className="flex flex-col h-full bg-[#efeae2] chat-bg relative overflow-hidden flex-1 min-w-0">
                <LoadingOverlay show={isActionLoading} message={actionLoadingMsg || 'Procesando...'} />
                <ResultOverlay
                    show={resultNotice.show}
                    status={resultNotice.status}
                    title={resultNotice.title}
                    message={resultNotice.message}
                    onClose={() => setResultNotice({ ...resultNotice, show: false })}
                    autoCloseMs={3000}
                />
        
        {/* BACKGROUND PATTERN */}
        <div className="absolute inset-0 opacity-5 pointer-events-none bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]"></div>

        {/* 1. HEADER */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 py-3 flex items-center justify-between z-20 shadow-sm flex-shrink-0 w-full relative">
            
            {/* FLOATING CALL BANNER (If Active) */}
            {callState !== 'idle' && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-slate-800 text-white px-6 py-2.5 rounded-full shadow-xl z-50 flex items-center gap-4 animate-in slide-in-from-top-2 border border-slate-600">
                    <div className="relative">
                        <div className={`absolute inset-0 rounded-full ${callState === 'active' ? 'bg-green-500 animate-ping opacity-75' : ''}`}></div>
                        <div className={`relative p-2 rounded-full ${callState === 'active' ? 'bg-green-500' : 'bg-slate-600'}`}>
                            {callState === 'dialing' ? <Loader2 size={16} className="animate-spin text-white"/> : <Mic size={16} className="text-white"/>}
                        </div>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                            {callState === 'dialing' ? 'Calling...' : 'Call in Progress'}
                        </p>
                        <p className="text-sm font-mono text-white leading-none">
                            {callState === 'dialing' ? 'Connecting...' : formatDuration(callDuration)}
                        </p>
                    </div>
                    <div className="h-8 w-px bg-slate-600 mx-1"></div>
                    <button 
                        onClick={endCallUI} 
                        className="bg-red-500 hover:bg-red-600 p-2 rounded-full transition-colors text-white"
                        title="Dismiss Indicator"
                    >
                        <PhoneOff size={16}/>
                    </button>
                </div>
            )}

            <div className="flex items-center gap-3">
                <button onClick={onBack} className="md:hidden text-slate-500"><ArrowLeft size={24} /></button>
                <img src={conversation.contactAvatar} alt="" className="w-10 h-10 rounded-full object-cover border border-white shadow-sm" />
                <div>
                    <h2 className="font-semibold text-slate-800 flex items-center gap-2 cursor-pointer hover:underline" onClick={() => setShowPropertySidebar(!showPropertySidebar)}>
                        {conversation.contactName}
                    </h2>
                    <p className="text-xs text-slate-500 capitalize flex items-center gap-1">
                        {conversation.platform}
                        {conversation.platform === 'whatsapp' && isWindowClosed && (
                            <span className="text-amber-600 bg-amber-100 px-1 rounded flex items-center gap-0.5" title="24h Session Closed">
                                <Clock size={10} /> 24h Closed
                            </span>
                        )}
                    </p>
                </div>
            </div>
            
            <div className="flex items-center gap-2 text-slate-600">
                {/* Voice bot temporarily disabled */}
                <button 
                    disabled
                    className="bg-slate-100 text-slate-400 p-2 rounded-full mr-2 border border-slate-200 cursor-not-allowed"
                    title="Voice bot coming soon"
                >
                    <PhoneOff size={20} />
                </button>

                <div className="flex bg-slate-200 rounded-lg p-0.5 mr-2">
                    <button onClick={() => setActiveTab('chat')} className={`p-2 rounded-md ${activeTab === 'chat' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}><MessageSquare size={18} /></button>
                    <button onClick={() => setActiveTab('notes')} className={`p-2 rounded-md ${activeTab === 'notes' ? 'bg-white shadow text-yellow-600' : 'text-slate-500'}`}><StickyNote size={18} /></button>
                </div>
                
                {/* CRM/Task/Menu Buttons ... */}
                <button 
                    onClick={() => setShowContactModal(true)} 
                    className={`hover:bg-slate-200 p-2 rounded-full ${existingContact ? 'text-blue-600' : 'text-slate-500'}`} 
                >
                    {existingContact ? <UserCheck size={20} /> : <UserPlus size={20} />}
                </button>
                <button 
                    onClick={() => setShowTaskModal(true)} 
                    className="hover:bg-slate-200 p-2 rounded-full text-slate-500 hover:text-slate-800" 
                >
                    <CheckSquare size={20} />
                </button>
                <div className="relative">
                    <button onClick={() => setShowMenuDropdown(!showMenuDropdown)} className="hover:bg-slate-200 p-2 rounded-full"><MoreVertical size={20} /></button>
                    {showMenuDropdown && (
                        <div className="absolute right-0 top-10 bg-white shadow-lg border rounded-lg w-40 z-50 py-1">
                            <button className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm flex gap-2 items-center"><Archive size={14}/> Archive Chat</button>
                            <button className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 text-sm flex gap-2 items-center"><Trash2 size={14}/> Delete</button>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* 2. CONTENT (Chat or Notes) */}
        <div className="flex-1 overflow-y-auto relative z-10 scrollbar-thin scrollbar-thumb-slate-300 w-full">
            {activeTab === 'chat' ? (
                <div className="p-4 space-y-3 pb-4">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.isIncoming ? 'justify-start' : 'justify-end'} ${msg.type === 'call_log' ? 'justify-center my-4' : ''}`}>
                            
                            {/* SPECIAL RENDER FOR CALL LOGS */}
                            {msg.type === 'call_log' ? (
                                renderCallLog(msg)
                            ) : (
                                // STANDARD MESSAGES
                                <div className={`relative max-w-[85%] sm:max-w-[70%] rounded-lg px-3 py-2 shadow-sm text-sm ${msg.isIncoming ? 'bg-white text-slate-800 rounded-tl-none' : 'bg-[#d9fdd3] text-slate-900 rounded-tr-none'} ${msg.type === 'template' ? 'border border-yellow-200 bg-yellow-50' : ''}`}>
                                    
                                    {msg.type === 'template' && <div className="text-[10px] font-bold text-yellow-600 uppercase mb-1">Template Message</div>}
                                    
                                    {msg.type === 'image' && (() => {
                                        const imgSrc = msg.attachmentUrl || (msg.media_path ? signedUrls[msg.media_path] : null);
                                        const isLoading = msg.media_path && mediaLoading[msg.media_path];

                                        if (!msg.media_path && !msg.attachmentUrl) {
                                            return (
                                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-center gap-3 max-w-sm">
                                                    <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
                                                    <div>
                                                        <p className="text-sm font-semibold text-amber-700">Imagen sin ruta</p>
                                                        <p className="text-xs text-amber-600 mt-1">Falta media_path o URL</p>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return imgSrc ? <ImageViewer src={imgSrc} alt={msg.text || "Image"} isLoading={isLoading} /> : null;
                                    })()}

                                    {msg.type === 'audio' && (() => {
                                        const audioSrc = msg.attachmentUrl || (msg.media_path ? signedUrls[msg.media_path] : null);
                                        const isLoading = msg.media_path && mediaLoading[msg.media_path];
                                        return audioSrc ? <AudioPlayer src={audioSrc} duration={msg.duration} isLoading={isLoading} /> : null;
                                    })()}

                                    {msg.type === 'video' && (() => {
                                        const videoSrc = msg.attachmentUrl || (msg.media_path ? signedUrls[msg.media_path] : null);
                                        const isLoading = msg.media_path && mediaLoading[msg.media_path];
                                        return videoSrc ? <VideoPlayer src={videoSrc} isLoading={isLoading} /> : null;
                                    })()}

                                    {(msg.type === 'file' || msg.type === 'document') && (() => {
                                        const fileSrc = msg.attachmentUrl || (msg.media_path ? signedUrls[msg.media_path] : null);
                                        const isLoading = msg.media_path && mediaLoading[msg.media_path];
                                        return fileSrc ? (
                                            <DocumentViewer 
                                                src={fileSrc} 
                                                fileName={msg.fileName || msg.media_path?.split('/').pop()} 
                                                fileSize={msg.fileSize}
                                                mimeType={msg.media_mime_type}
                                                isLoading={isLoading}
                                            />
                                        ) : null;
                                    })()}

                                    {/* Only show text if message is not media (image/audio/video/file/document) */}
                                    {msg.text && !['image', 'audio', 'video', 'file', 'document'].includes(msg.type) && (
                                        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                                    )}
                                    <div className="flex items-center justify-end gap-1 mt-1 opacity-70">
                                        <span className="text-[10px]">{msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        {!msg.isIncoming && renderStatusIcon(msg.status, msg.whatsappMessageId)}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            ) : (
                <div className="p-6 space-y-4 bg-yellow-50/50 min-h-full">
                    {/* Notes logic remains same */}
                    {notes.map(note => (
                        <div key={note.id} className="bg-yellow-100 border border-yellow-200 p-4 rounded-lg shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-xs text-slate-700">{note.authorName}</span>
                                <span className="text-[10px] text-slate-500">{note.timestamp.toLocaleDateString()}</span>
                            </div>
                            <p className="text-slate-800 text-sm">{note.text}</p>
                        </div>
                    ))}
                    <div ref={notesEndRef} />
                </div>
            )}
        </div>

        {/* 3. FOOTER */}
        <div className="bg-[#f0f2f5] px-4 py-2 z-20 flex-shrink-0 w-full relative">
            
            {/* FILE INPUT HIDDEN */}
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileUpload} 
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,audio/*"
            />

            {/* ATTACHMENT MENU POPUP */}
            {showAttachMenu && (
                <div className="absolute bottom-16 left-4 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 flex flex-col gap-1 w-48 animate-in slide-in-from-bottom-5">
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded text-slate-700 text-sm text-left">
                        <div className="p-2 bg-purple-100 text-purple-600 rounded-full"><ImageIcon size={16}/></div> Photos & Videos
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded text-slate-700 text-sm text-left">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-full"><Paperclip size={16}/></div> Document
                    </button>
                </div>
            )}

            {/* SNIPPET SUGGESTIONS POPUP */}
            {showSnippetSuggestions && (
                <div className="absolute bottom-full left-4 mb-2 w-72 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-50">
                    <div className="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500 border-b flex items-center gap-2">
                        <Zap size={12} className="text-emerald-600"/> Quick Replies
                    </div>
                    {filteredSnippets.map(s => (
                        <button 
                            key={s.id} 
                            onClick={() => insertSnippet(s)}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0"
                        >
                            <span className="font-bold text-emerald-600 font-mono text-xs block">{s.shortcut}</span>
                            <span className="text-xs text-slate-600 line-clamp-1">{s.content}</span>
                        </button>
                    ))}
                </div>
            )}

            {activeTab === 'chat' ? (
                !isViewer ? (
                    <div className="w-full space-y-2">
                        {/* 24-HOUR WARNING BANNER */}
                        {isWindowClosed && (
                            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-800 text-sm">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle size={16} />
                                    <span>24h session expired. You can only send Templates.</span>
                                </div>
                                <button 
                                    onClick={() => setShowTemplateModal(true)}
                                    className="bg-amber-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-amber-700"
                                >
                                    Select Template
                                </button>
                            </div>
                        )}

                        {/* AI Reply Button (Only if window OPEN and last msg incoming) */}
                        {!isWindowClosed && messages.length > 0 && messages[messages.length-1].isIncoming && (
                            <div className="flex justify-center">
                                <button onClick={handleSmartReply} disabled={isGenerating} className="bg-white/90 border border-slate-200 text-slate-600 text-xs px-3 py-1 rounded-full shadow-sm hover:bg-white flex items-center gap-1">
                                    <Sparkles size={12} className={isGenerating ? "animate-spin text-purple-500" : "text-purple-500"} />
                                    {isGenerating ? "Gemini is thinking..." : "AI Suggestion"}
                                </button>
                            </div>
                        )}

                        <div className="flex items-end gap-2 w-full">
                            <button 
                                onClick={() => setShowAttachMenu(!showAttachMenu)} 
                                disabled={isWindowClosed}
                                className={`p-2 rounded-full mb-1 transition-colors ${showAttachMenu ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-200'} ${isWindowClosed ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <Plus size={24} className={`transition-transform ${showAttachMenu ? 'rotate-45' : ''}`} />
                            </button>
                            <div className={`flex-1 bg-white rounded-lg flex items-center border shadow-sm relative ${isWindowClosed ? 'bg-slate-100' : ''}`}>
                                <input 
                                    type="text" 
                                    placeholder={isWindowClosed ? "Sesión expirada. Envía una Plantilla para reabrir." : "Escribe un mensaje (escribe / para snippets)"} 
                                    className="flex-1 px-4 py-3 bg-transparent outline-none text-sm w-full" 
                                    value={inputText} 
                                    onChange={handleInputChange} 
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
                                    disabled={isUploading || isWindowClosed}
                                />
                                {isUploading && <Loader2 size={16} className="animate-spin text-slate-400 mr-2"/>}
                                <button 
                                    className={`mr-1 p-2 ${isWindowClosed ? 'text-emerald-600 animate-pulse' : 'text-slate-400 hover:text-emerald-600'}`} 
                                    title="Templates" 
                                    onClick={() => setShowTemplateModal(true)}
                                >
                                    <FileJson size={18} />
                                </button>
                                <button 
                                    className="mr-2 text-slate-400" 
                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                    disabled={isWindowClosed}
                                >
                                    <Smile size={20} />
                                </button>
                            </div>
                            <button 
                                onClick={handleSend} 
                                disabled={isUploading || isWindowClosed} 
                                className={`p-3 text-white rounded-full shadow-sm mb-1 disabled:opacity-50 ${isWindowClosed ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                            >
                                <Send size={20} />
                            </button>
                        </div>
                    </div>
                ) : <div className="text-center text-slate-500 text-sm py-3">View only</div>
            ) : (
                !isViewer && (
                    <div className="flex gap-2 w-full">
                        <input type="text" className="flex-1 px-4 py-3 bg-white border border-yellow-200 rounded-lg outline-none focus:ring-2 focus:ring-yellow-400" placeholder="Agregar nota interna..." value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                        <button onClick={handleSaveNote} className="bg-yellow-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-yellow-600">Guardar</button>
                    </div>
                )
            )}
        </div>
        
        </div>

        {/* SIDEBAR ... (Same as before) */}
        {showPropertySidebar && (
            <div className="w-72 bg-white border-l border-slate-200 flex flex-col h-full shadow-xl z-30">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-700">Contact Details</h3>
                    <button onClick={() => setShowPropertySidebar(false)}><X size={18} className="text-slate-400"/></button>
                </div>
                <div className="p-4 overflow-y-auto flex-1 space-y-6">
                    <div className="text-center">
                        <img src={conversation.contactAvatar} className="w-20 h-20 rounded-full mx-auto mb-2 border-4 border-slate-100"/>
                        <h4 className="font-bold text-lg">{conversation.contactName}</h4>
                        <p className="text-slate-500 text-sm">{contactForm.phone || 'No Phone'}</p>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-slate-50 p-3 rounded-lg">
                            <label className="text-xs font-bold text-slate-400 uppercase">Custom Properties</label>
                            {customProperties.length === 0 && <p className="text-xs text-slate-400 italic mt-1">No properties defined.</p>}
                            <div className="space-y-3 mt-2">
                                {customProperties.map(prop => (
                                    <div key={prop.id}>
                                        <label className="text-xs text-slate-600 block mb-1">{prop.name}</label>
                                        <input 
                                            type={prop.type === 'number' ? 'number' : 'text'}
                                            className="w-full border border-slate-200 rounded px-2 py-1 text-sm bg-white focus:ring-1 focus:ring-emerald-500 outline-none"
                                            value={contactForm.properties[prop.id] || ''}
                                            onChange={(e) => setContactForm({
                                                ...contactForm,
                                                properties: { ...contactForm.properties, [prop.id]: e.target.value }
                                            })}
                                        />
                                    </div>
                                ))}
                                {customProperties.length > 0 && (
                                    <button onClick={handleSaveContact} className="w-full bg-emerald-600 text-white text-xs py-2 rounded mt-2">Actualizar propiedades</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Voice bot modal disabled (coming soon) */}

        {/* ... Other Modals (Templates, Task, Contact) ... */}
        {showTemplateModal && (
            <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FileJson size={20} className="text-emerald-600"/> Enviar Plantilla</h3>
                        <button onClick={() => setShowTemplateModal(false)}><X size={20} className="text-slate-400"/></button>
                    </div>
                    <div className="overflow-y-auto flex-1 space-y-4 pr-1">
                        {templates.length === 0 ? (
                            <div className="text-center py-10 text-slate-500">
                                <p>No templates found.</p>
                                <p className="text-xs">Go to Settings {">"} Templates to create one.</p>
                            </div>
                        ) : (
                            templates.map(t => (
                                <div key={t.id} className="bg-slate-50 border border-slate-200 p-4 rounded-lg hover:border-emerald-500 cursor-pointer transition-colors" onClick={() => handleSendTemplate(t)}>
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-slate-700">{t.name}</h4>
                                        <span className="text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-500 uppercase">{t.language}</span>
                                    </div>
                                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{t.body}</p>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="mt-4 pt-2 border-t text-right">
                        <button onClick={() => setShowTemplateModal(false)} className="text-slate-500 text-sm hover:underline">Cancelar</button>
                    </div>
                </div>
            </div>
        )}
        
        {/* Contact and Task Modals preserved as they were */}
        {showContactModal && (
            <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                {/* ... CRM Modal Content ... */}
                  <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                  <div className="flex justify-between items-center p-6 pb-4 border-b">
                      <h3 className="text-lg font-bold text-slate-800">{existingContact ? 'Editar Contacto' : 'Agregar al CRM'}</h3>
                      <button onClick={()=>setShowContactModal(false)}><X size={20} className="text-slate-400"/></button>
                  </div>
                  <div className="overflow-y-auto flex-1 px-6 py-4">
                      <div className="space-y-3 mb-6">
                        <label className="block text-xs font-bold text-slate-500 uppercase">Información Básica</label>
                        <input type="text" className="w-full border border-slate-300 p-2 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="Nombre completo" value={contactForm.name} onChange={e=>setContactForm({...contactForm, name: e.target.value})} />
                        <input type="email" className="w-full border border-slate-300 p-2 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="Correo electrónico" value={contactForm.email} onChange={e=>setContactForm({...contactForm, email: e.target.value})} />
                        <input type="tel" className="w-full border border-slate-300 p-2 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="Teléfono" value={contactForm.phone} onChange={e=>setContactForm({...contactForm, phone: e.target.value})} />
                        <input type="text" className="w-full border border-slate-300 p-2 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" placeholder="Empresa" value={contactForm.company} onChange={e=>setContactForm({...contactForm, company: e.target.value})} />
                      </div>
                      
                      {customProperties.length > 0 && (
                        <div className="space-y-3">
                          <label className="block text-xs font-bold text-slate-500 uppercase">Custom Properties</label>
                          {customProperties.map(prop => (
                            <div key={prop.id}>
                              <label className="block text-xs text-slate-600 mb-1 font-medium">{prop.name}</label>
                              {prop.type === 'text' && (
                                <input 
                                  type="text" 
                                  className="w-full border border-slate-300 p-2 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" 
                                  placeholder={prop.name}
                                  value={contactForm.properties[prop.id] || ''} 
                                  onChange={e => setContactForm({
                                    ...contactForm, 
                                    properties: {...contactForm.properties, [prop.id]: e.target.value}
                                  })} 
                                />
                              )}
                              {prop.type === 'number' && (
                                <input 
                                  type="number" 
                                  className="w-full border border-slate-300 p-2 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" 
                                  placeholder={prop.name}
                                  value={contactForm.properties[prop.id] || ''} 
                                  onChange={e => setContactForm({
                                    ...contactForm, 
                                    properties: {...contactForm.properties, [prop.id]: e.target.value}
                                  })} 
                                />
                              )}
                              {prop.type === 'date' && (
                                <input 
                                  type="date" 
                                  className="w-full border border-slate-300 p-2 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" 
                                  value={contactForm.properties[prop.id] || ''} 
                                  onChange={e => setContactForm({
                                    ...contactForm, 
                                    properties: {...contactForm.properties, [prop.id]: e.target.value}
                                  })} 
                                />
                              )}
                              {prop.type === 'time' && (
                                <input 
                                  type="time" 
                                  className="w-full border border-slate-300 p-2 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" 
                                  value={contactForm.properties[prop.id] || ''} 
                                  onChange={e => setContactForm({
                                    ...contactForm, 
                                    properties: {...contactForm.properties, [prop.id]: e.target.value}
                                  })} 
                                />
                              )}
                              {prop.type === 'phone' && (
                                <input 
                                  type="tel" 
                                  className="w-full border border-slate-300 p-2 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" 
                                  placeholder="+1234567890"
                                  value={contactForm.properties[prop.id] || ''} 
                                  onChange={e => setContactForm({
                                    ...contactForm, 
                                    properties: {...contactForm.properties, [prop.id]: e.target.value}
                                  })} 
                                />
                              )}
                              {prop.type === 'percentage' && (
                                <div className="relative">
                                  <input 
                                    type="number" 
                                    min="0"
                                    max="100"
                                    className="w-full border border-slate-300 p-2 pr-8 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" 
                                    placeholder="0"
                                    value={contactForm.properties[prop.id] || ''} 
                                    onChange={e => setContactForm({
                                      ...contactForm, 
                                      properties: {...contactForm.properties, [prop.id]: e.target.value}
                                    })} 
                                  />
                                  <span className="absolute right-3 top-2 text-slate-500 text-sm">%</span>
                                </div>
                              )}
                              {prop.type === 'select' && (
                                <select 
                                  className="w-full border border-slate-300 p-2 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" 
                                  value={contactForm.properties[prop.id] || ''} 
                                  onChange={e => setContactForm({
                                    ...contactForm, 
                                    properties: {...contactForm.properties, [prop.id]: e.target.value}
                                  })}
                                >
                                  <option value="">Seleccionar {prop.name}</option>
                                  {(prop.options || []).map((option, idx) => (
                                    <option key={idx} value={option}>{option}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                  <div className="flex gap-2 p-6 pt-4 border-t bg-white">
                      <button onClick={handleSaveContact} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors">Guardar Contacto</button>
                      <button onClick={()=>setShowContactModal(false)} className="flex-1 bg-slate-200 text-slate-700 py-2 rounded-lg font-medium hover:bg-slate-300 transition-colors">Cancelar</button>
                  </div>
              </div>
            </div>
        )}
        
                {showTaskModal && (
                        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
                                    <h3 className="text-lg font-bold mb-4">Nueva Tarea</h3>
                                    <input type="text" className="w-full border p-2 rounded mb-3" placeholder="Título de la tarea" value={newTaskTitle} onChange={e=>setNewTaskTitle(e.target.value)} />
                                    <textarea className="w-full border p-2 rounded mb-3 text-sm" placeholder="Descripción (opcional)" rows={3} value={newTaskDescription} onChange={e=>setNewTaskDescription(e.target.value)} />

                                    <div className="grid grid-cols-1 gap-3 mb-3">
                                        <label className="text-xs text-slate-600 font-medium">Asignar a</label>
                                        <div ref={assigneeRef} className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
                                                className="w-full border p-2 rounded text-sm flex items-center gap-2 justify-between"
                                            >
                                                <div className="flex items-center gap-2">
                                                    {teamMembers.find(m => m.id === newTaskAssignee) ? (
                                                        <>
                                                            <img src={teamMembers.find(m => m.id === newTaskAssignee)!.avatar} className="w-6 h-6 rounded-full" />
                                                            <span className="truncate">{teamMembers.find(m => m.id === newTaskAssignee)!.name}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <img src={currentUser.avatar} className="w-6 h-6 rounded-full" />
                                                            <span className="truncate">{currentUser.name} (Tú)</span>
                                                        </>
                                                    )}
                                                </div>
                                                <svg className="w-4 h-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd"/></svg>
                                            </button>

                                            {showAssigneeDropdown && (
                                                <div className="absolute z-40 mt-1 left-0 right-0 bg-white border rounded shadow max-h-56 overflow-auto">
                                                    {teamMembers.length > 0 ? teamMembers.map(m => (
                                                        <button key={m.id} onClick={() => { setNewTaskAssignee(m.id); setShowAssigneeDropdown(false); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-3">
                                                            <img src={m.avatar} className="w-6 h-6 rounded-full" />
                                                            <div className="flex flex-col text-sm">
                                                                <span className="font-medium text-slate-700">{m.name}</span>
                                                                <span className="text-xs text-slate-400">{m.email}</span>
                                                            </div>
                                                        </button>
                                                    )) : (
                                                        <div className="p-3 text-xs text-slate-500">No hay miembros del equipo</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <label className="text-xs text-slate-600 font-medium">Fecha límite / Programar</label>
                                        <input
                                            type="datetime-local"
                                            value={newTaskDueDate}
                                            onChange={(e) => setNewTaskDueDate(e.target.value)}
                                            className="w-full border p-2 rounded text-sm"
                                        />
                                        {dueDateError && (
                                            <div className="text-xs text-red-500 mt-1">{dueDateError}</div>
                                        )}
                                        <div className="flex items-center gap-4 mt-2">
                                            <div className="flex items-center gap-2">
                                                <input id="notify-checkbox" type="checkbox" checked={newTaskNotify} onChange={e => setNewTaskNotify(e.target.checked)} className="w-4 h-4" />
                                                <label htmlFor="notify-checkbox" className="text-sm text-slate-700">Notificar al encargado</label>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <label className="text-sm text-slate-500 line-through">Enviar por WhatsApp</label>
                                                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-medium">Próximamente</span>
                                            </div>
                                        </div>
                                        {false && (
                                            <div className="mt-2">
                                                <label className="text-xs text-slate-600 font-medium">Template de WhatsApp</label>
                                                <select className="w-full border p-2 rounded text-sm" value={newTaskTemplateId || ''} onChange={e => setNewTaskTemplateId(e.target.value || null)}>
                                                    <option value="">Selecciona un template...</option>
                                                    {templatesList.filter(t => t.status === 'approved').map(t => (
                                                        <option key={t.id} value={t.name}>{t.name} — {t.language}</option>
                                                    ))}
                                                </select>
                                                <div className="text-xs text-slate-400 mt-1">Nota: el template debe existir y estar aprobado en Meta/WhatsApp.</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                            <button onClick={handleCreateTask} disabled={!!dueDateError || !newTaskTitle.trim() || isActionLoading} className={`flex-1 py-2 rounded ${!!dueDateError || !newTaskTitle.trim() || isActionLoading ? 'bg-slate-300 text-slate-600 cursor-not-allowed' : 'bg-emerald-600 text-white'}`}>Crear</button>
                                            <button onClick={()=>{setShowTaskModal(false); setNewTaskAssignee(currentUser.id); setNewTaskDueDate('');}} className="flex-1 bg-slate-200 text-slate-700 py-2 rounded">Cancelar</button>
                                    </div>
                            </div>
                        </div>
                )}
    </div>
  );
};

export default ChatWindow;
