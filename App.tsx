
import React, { useState, useEffect, useCallback } from 'react';
import { AppState, Conversation, Message, User, DashboardView, Note, MessageType, Task, TaskStatus, CRMContact, CustomProperty } from './types';
import LoginScreen from './components/LoginScreen';
import Onboarding from './components/Onboarding';
import VerificationScreen from './components/VerificationScreen';
import AccountSetupScreen from './components/AccountSetupScreen';
import ConversationList from './components/ConversationList';
import ChatWindow from './components/ChatWindow';
import SettingsScreen from './components/SettingsScreen';
import StatisticsScreen from './components/StatisticsScreen';
import CRMScreen from './components/CRMScreen';
import TaskBoard from './components/TaskBoard';
import WorkflowsScreen from './components/WorkflowsScreen';
import PrivacyPolicyScreen from './components/PrivacyPolicyScreen';
import { Settings, LogOut, Users, BarChart3, MessageSquare, CheckSquare, Loader2, Lock, Eye, EyeOff } from 'lucide-react';
import { chatService } from './services/chatService';
import { authService } from './services/authService';
import { crmService } from './services/crmService';
import { taskService } from './services/taskService';
import { teamService } from './services/teamService';
import { validationService } from './services/validationService';
import { rolePermissionService } from './services/rolePermissionService';
import { tokenProcessingService } from './services/tokenProcessingService';
import { supabase } from './services/supabaseClient';
import LoadingOverlay from './components/LoadingOverlay';
import ResultOverlay from './components/ResultOverlay';
import ToastNotifications, { Toast } from './components/ToastNotifications';

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const App: React.FC = () => {
  // ── Google OAuth popup handler ──────────────────────────────────────
  // When the Edge Function redirects back to this SPA (inside the popup),
  // detect the ?google_auth= params, write result to localStorage, and close.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleAuth = params.get('google_auth');
    if (!googleAuth) return; // Not an OAuth redirect — normal app load

    // Write the result so the parent window's poll/storage listener picks it up
    const result = googleAuth === 'success'
      ? { status: 'success', email: params.get('google_auth_email') || '' }
      : { status: 'error', message: params.get('google_auth_message') || 'Error desconocido' };

    localStorage.setItem('google_auth_result', JSON.stringify(result));

    // Clean the URL and try to close
    document.title = googleAuth === 'success' ? '✅ Gmail conectado' : '❌ Error';
    document.body.innerHTML = `<div style="font-family:sans-serif;text-align:center;padding:60px;">
      <h2>${googleAuth === 'success' ? '✅ Gmail conectado correctamente' : '❌ ' + (result as any).message}</h2>
      <p style="color:#888;">Puedes cerrar esta ventana.</p></div>`;
    setTimeout(() => { try { window.close(); } catch(_) {} }, 1500);
  }, []);

  // ── Route Handler for Privacy Policy ───────────────────────────────────────────
  // Detect if the current pathname is /politicas-de-privacidad
  React.useEffect(() => {
    const handlePathChange = () => {
      const pathname = window.location.pathname;
      setIsPrivacyPolicyPage(pathname === '/politicas-de-privacidad');
    };

    handlePathChange();
    window.addEventListener('popstate', handlePathChange);
    
    return () => {
      window.removeEventListener('popstate', handlePathChange);
    };
  }, []);

  const [appState, setAppState] = useState<AppState>(AppState.LOGIN);
  const [dashboardView, setDashboardView] = useState<DashboardView>('chats');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPrivacyPolicyPage, setIsPrivacyPolicyPage] = useState(false);
  
  // Password Reset State
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  
  // Data State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messagesData, setMessagesData] = useState<Record<string, Message[]>>({});
  
  const [notesData, setNotesData] = useState<Record<string, Note[]>>({});
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [properties, setProperties] = useState<CustomProperty[]>([]);
    const [teamMembers, setTeamMembers] = useState<User[]>([]);
  
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isMobileListVisible, setIsMobileListVisible] = useState(true);

    // Track latest values to avoid stale closures inside subscriptions
    const activeConversationIdRef = React.useRef<string | null>(null);
    const conversationsRef = React.useRef<Conversation[]>([]);

    // Keep refs in sync with state for subscription callbacks
    useEffect(() => {
        activeConversationIdRef.current = activeConversationId;
    }, [activeConversationId]);

    useEffect(() => {
        conversationsRef.current = conversations;
    }, [conversations]);

    // Global notice overlay
    const [notice, setNotice] = useState<{ show: boolean; status: 'success' | 'error' | 'info' | 'warning'; title?: string; message?: string; autoCloseMs?: number }>({ show: false, status: 'info' });
    const showNotice = (status: 'success' | 'error' | 'info' | 'warning', title?: string, message?: string, autoCloseMs?: number) => {
        setNotice({ show: true, status, title, message, autoCloseMs });
    };
    // Lightweight toasts for non-blocking notifications
    const [toasts, setToasts] = useState<Toast[]>([]);
    const pushToast = (status: Toast['status'], title?: string, message?: string, duration = 3000) => {
        const id = crypto.randomUUID();
        setToasts(prev => [...prev, { id, status, title, message, duration }]);
        if (duration > 0) {
                setTimeout(() => {
                        setToasts(prev => prev.filter(t => t.id !== id));
                }, duration);
        }
    };

  // 1. ROBUST AUTHENTICATION HANDLING (FIXED)
  useEffect(() => {
    let mounted = true;

    // Safety Timeout: If Supabase hangs, force end loading after 3 seconds
    const safetyTimer = setTimeout(() => {
        if (mounted && isAuthLoading) {
            console.warn("⚠️ Auth Check timed out. Forcing UI render.");
            setIsAuthLoading(false);
        }
    }, 3000);

    const checkSession = async (sessionData?: any) => {
        try {
            console.log("🔄 checkSession started");
            
            // If session is passed (from event), use it. Otherwise fetch it.
            const user = await authService.getCurrentUser(sessionData);
            
            if (!mounted) return;

            console.log("📊 checkSession result - user:", user?.email, "isInvitationFlow:", tokenProcessingService.isInvitationFlow());

            if (user) {
                console.log("✅ User Loaded:", user.email);
                console.log("👤 User organizationId:", user.organizationId);
                setCurrentUser(user);
                
                // PRIORITY 1: Check if user is coming from verification link (invite or signup)
                // This takes PRECEDENCE over organizationId check
                if (tokenProcessingService.isInvitationFlow()) {
                    const verificationType = tokenProcessingService.getVerificationType();
                    console.log(`📬 ${verificationType} flow detected - showing verification screen`);
                    console.log("📬 Routing to VERIFICATION screen");
                    setAppState(AppState.VERIFICATION);
                } else if (!user.organizationId) {
                    // User without organization and not from verification link
                    // This means they need to complete onboarding
                    console.log("📝 No organizationId, routing to ONBOARDING");
                    setAppState(AppState.ONBOARDING);
                } else {
                    console.log("✨ Valid user with org, routing to DASHBOARD");
                    setAppState(AppState.DASHBOARD);
                }
            } else {
                console.log("🔒 No user, redirecting to login");
                setCurrentUser(null);
                setAppState(AppState.LOGIN);
            }
        } catch (error) {
            console.error("Auth Error:", error);
            if (mounted) {
                setCurrentUser(null);
                setAppState(AppState.LOGIN);
            }
        } finally {
            if (mounted) setIsAuthLoading(false);
        }
    };

    const initAuth = async () => {
        console.log("🚀 Initializing authentication...");
        console.log("🔗 URL:", window.location.href);
        console.log("🔍 Hash:", window.location.hash);
        console.log("❓ Query:", window.location.search);

        // STEP 1: Process invitation token if present in URL
        try {
            const tokenProcessed = await tokenProcessingService.processInvitationToken();
            console.log("📋 Token processing result:", tokenProcessed);
        } catch (err) {
            console.error("⚠️ Error processing token:", err);
        }

        // STEP 2: Check session immediately
        console.log("📡 Checking session with Supabase...");
        const { data: { session } } = await supabase.auth.getSession();
        console.log("📡 getSession result:", { hasSession: !!session, email: session?.user?.email });
        
        if (mounted) {
            await checkSession(session);
        }
    };

    initAuth();

    // B. Listen for Auth Changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        console.log("🔔 Auth Event:", event, { hasSession: !!session, email: session?.user?.email });
        
        if (event === 'PASSWORD_RECOVERY') {
            setShowPasswordResetModal(true);
        }

        if (event === 'SIGNED_OUT') {
            if (mounted) {
                setAppState(AppState.LOGIN);
                setCurrentUser(null);
                setIsAuthLoading(false);
            }
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            console.log("🔐 Auth state changed, rechecking session...");
            checkSession(session);
        }
    });

    return () => { 
        mounted = false;
        clearTimeout(safetyTimer);
        subscription.unsubscribe(); 
    };
  }, []); // Empty dependency array ensures this runs once

  // 2. Load Initial Data (Conversations, Tasks, Contacts)
  useEffect(() => {
    if (appState === AppState.DASHBOARD && currentUser) {
        const loadData = async () => {
            try {
                    if (!currentUser.organizationId) {
                        console.error('No organization ID found for user');
                        return;
                    }
                // Parallel fetching
                const [convs, tks, cnts, props] = await Promise.all([
                        chatService.getConversations(currentUser.organizationId),
                        taskService.getTasks(currentUser.organizationId),
                        crmService.getContacts(currentUser.organizationId),
                                                        crmService.getProperties(currentUser.organizationId)
                ]);
                setConversations(convs);
                setTasks(tks);
                setContacts(cnts);
                setProperties(props);
                                // Load team members for TaskBoard/assignments
                                try {
                                    const members = await teamService.getTeamMembers(currentUser.organizationId);
                                    setTeamMembers(members || []);
                                } catch (err) {
                                    console.error('Failed loading team members in App', err);
                                }
            } catch (e) {
                console.error("Error loading dashboard data", e);
            }
        };
        loadData();

        // Subscribe to REALTIME Chat changes WITH RETRY LOGIC
        let isComponentMounted = true;
        let reconnectTimer: NodeJS.Timeout | null = null;
        let retryCount = 0;
        const MAX_RETRIES = 5;
        const messageTimestampMap = new Map<string, number>();
        let chatSubscription: any = null; // Store subscription for cleanup
        
        const subscribeWithRetry = async () => {
            try {
                console.log(`🔌 Attempting Realtime subscription (retry ${retryCount}/${MAX_RETRIES})...`);
                
                const sub = chatService.subscribeToChanges(
                    currentUser.organizationId,
                    (newMsg) => {
                        // Deduplicación: Evitar mensajes duplicados
                        const msgKey = `${newMsg.id}-${newMsg.timestamp.getTime()}`;
                        if (messageTimestampMap.has(msgKey)) {
                            console.log('⚠️ Duplicate message filtered:', newMsg.id);
                            return;
                        }
                        messageTimestampMap.set(msgKey, Date.now());
                        
                        console.log('📨 New message received:', newMsg.id);
                        
                        const currentActiveId = activeConversationIdRef.current;
                        const currentConversations = conversationsRef.current;

                        // Notificar si el mensaje es entrante y es de una conversación diferente
                        if (newMsg.isIncoming && newMsg.conversationId !== currentActiveId) {
                            const conv = currentConversations.find(c => c.id === newMsg.conversationId);
                            if (conv) {
                                pushToast('info', 'Nuevo mensaje', `De ${conv.contactName}: ${newMsg.text?.substring(0, 80) || 'Mensaje recibido'}`, 4000);
                            }
                        }
                        
                        setMessagesData(prev => {
                            const currentList = prev[newMsg.conversationId] || [];
                            if (currentList.some(m => m.id === newMsg.id)) return prev;
                            return { ...prev, [newMsg.conversationId]: [...currentList, newMsg] };
                        });
                    },
                    (updatedConv) => {
                        console.log('🔄 Conversation updated:', updatedConv.id);
                        setConversations(prev => {
                            const newList = prev.map(c => c.id === updatedConv.id ? { ...c, ...updatedConv } : c);
                            const sorted = newList.sort((a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime());
                            conversationsRef.current = sorted; // keep ref fresh
                            return sorted;
                        });
                    },
                    (newConv) => {
                        console.log('✨ New conversation created:', newConv.id);
                        setConversations(prev => {
                            if (prev.some(c => c.id === newConv.id)) return prev;
                            const updated = [newConv, ...prev];
                            conversationsRef.current = updated;
                            return updated;
                        });
                    },
                    (statusUpdate) => {
                        if (!statusUpdate?.conversationId || !statusUpdate?.messageId) return;
                        setMessagesData(prev => {
                            const currentList = prev[statusUpdate.conversationId];
                            if (!currentList) return prev;
                            const idx = currentList.findIndex(m => m.id === statusUpdate.messageId);
                            if (idx === -1) return prev;
                            const updatedMsg = { ...currentList[idx], status: statusUpdate.status } as Message;
                            const updatedList = [...currentList];
                            updatedList[idx] = updatedMsg;
                            return { ...prev, [statusUpdate.conversationId]: updatedList };
                        });
                    }
                );
                
                if (isComponentMounted) {
                    chatSubscription = sub; // Store subscription reference
                    console.log('✅ Realtime subscription active', sub);
                    retryCount = 0; // Reset on successful connection
                    pushToast('info', 'Conectado', 'Actualizaciones en tiempo real activas', 3000);
                }
                
                return sub;
            } catch (error) {
                console.error('❌ Subscription error:', error);
                showNotice('error', 'Connection Error', 'Retrying real-time connection...', 3000);
                
                if (retryCount < MAX_RETRIES && isComponentMounted) {
                    retryCount++;
                    const backoffDelay = 1000 * retryCount; // Exponential backoff
                    console.log(`⏳ Retrying in ${backoffDelay}ms...`);
                    reconnectTimer = setTimeout(subscribeWithRetry, backoffDelay);
                }
            }
        };
        
        subscribeWithRetry();
        
        return () => {
            isComponentMounted = false;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            // Properly cleanup the subscription
            if (chatSubscription?.unsubscribe) {
                console.log('🔌 Cleaning up Realtime subscription');
                chatSubscription.unsubscribe();
            }
            messageTimestampMap.clear();
        };
    }
  }, [appState, currentUser?.organizationId]); // Changed from currentUser?.id to organizationId

  // Handle network connectivity changes
  useEffect(() => {
    const handleOnline = () => {
        console.log('✅ Back online - refreshing data');
        pushToast('info', 'Conectado', 'Reconectado, sincronizando datos', 3000);
        // Reload conversations to sync latest state
        if (currentUser?.organizationId) {
            chatService.getConversations(currentUser.organizationId).then(convs => {
                setConversations(convs);
            });
        }
    };
    
    const handleOffline = () => {
        console.warn('❌ Lost connection - messages may not update in real-time');
        pushToast('warning', 'Sin conexión', 'Las actualizaciones en vivo están pausadas', 5000);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, [currentUser?.organizationId]);

  // Setup heartbeat to check connection health
  useEffect(() => {
    if (appState !== AppState.DASHBOARD || !currentUser?.organizationId) return;
    
    let isComponentMounted = true;
    
    const heartbeat = chatService.setupHeartbeat(
      currentUser.organizationId,
      (isHealthy) => {
        if (isComponentMounted) {
          if (isHealthy) {
            console.log('✅ Connection healthy');
          } else {
            console.warn('⚠️ Connection unhealthy - attempting recovery...');
            // Attempt to reload conversations to sync
            chatService.getConversations(currentUser.organizationId).then(convs => {
              if (isComponentMounted) setConversations(convs);
            });
          }
        }
      }
    );
    
    return () => {
      isComponentMounted = false;
      heartbeat.stop();
    };
  }, [appState, currentUser?.organizationId]);

  // Auto-sync messages periodically to catch any missed updates
  useEffect(() => {
    if (!activeConversationId || !messagesData[activeConversationId]) return;
    
    let isMounted = true;
    
        const syncInterval = setInterval(async () => {
            if (!isMounted || !activeConversationId) return;
      
      try {
        const synced = await chatService.syncMessagesWithDedup(
          activeConversationId,
          messagesData[activeConversationId] || []
        );
        if (isMounted && synced.length > (messagesData[activeConversationId]?.length || 0)) {
          setMessagesData(prev => ({
            ...prev,
            [activeConversationId]: synced
          }));
        }
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    }, 60000); // Every 60 seconds
    
    return () => {
      isMounted = false;
      clearInterval(syncInterval);
    };
  }, [activeConversationId, messagesData]);

  // 3. Load Messages & Notes when Active Conversation Changes (IMPROVED)
  useEffect(() => {
      if (activeConversationId) {
          let isMounted = true;
          
          // Load messages with better error handling
          if (!messagesData[activeConversationId]) {
              console.log(`📨 Loading messages for conversation: ${activeConversationId}`);
              chatService.getMessages(activeConversationId)
                  .then(msgs => {
                      if (isMounted) {
                          console.log(`✅ Loaded ${msgs.length} messages`);
                          setMessagesData(prev => ({ ...prev, [activeConversationId]: msgs }));
                      }
                  })
                  .catch(error => {
                      console.error('❌ Failed to load messages:', error);
                      if (isMounted) {
                          showNotice('error', 'Load Failed', 'Could not load messages', 3000);
                      }
                  });
          } else {
              console.log(`✓ Messages already loaded for: ${activeConversationId}`);
          }
          
          // Load notes with better error handling
          if (!notesData[activeConversationId]) {
              console.log(`📝 Loading notes for conversation: ${activeConversationId}`);
              chatService.getNotes(activeConversationId)
                  .then(notes => {
                      if (isMounted) {
                          console.log(`✅ Loaded ${notes.length} notes`);
                          setNotesData(prev => ({ ...prev, [activeConversationId]: notes }));
                      }
                  })
                  .catch(error => {
                      console.error('❌ Failed to load notes:', error);
                      // Don't show error for notes as they're optional
                  });
          }
          
          return () => {
              isMounted = false;
          };
      }
  }, [activeConversationId]);

  // Responsive handling
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setIsMobileListVisible(true);
      else if (activeConversationId) setIsMobileListVisible(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeConversationId]);

  const handleLogout = async () => {
    await authService.signOut();
    // State updates are handled by the onAuthStateChange listener 'SIGNED_OUT' event
  };

  const handleSelectConversation = async (id: string) => {
    setActiveConversationId(id);
    const updatedConversations = conversations.map(c => c.id === id ? { ...c, unreadCount: 0 } : c);
    setConversations(updatedConversations);
    await chatService.markAsRead(id);
    if (window.innerWidth < 768) setIsMobileListVisible(false);
  };

  const handleNavigateToChat = (conversationId: string) => {
      setActiveConversationId(conversationId);
      setDashboardView('chats');
  };

  const handleChatFromContact = (contact: CRMContact) => {
      const conversation = conversations.find(c => 
          (contact.phone && c.id === contact.phone) || 
          c.contactName === contact.name 
      );
      if (conversation) {
          handleNavigateToChat(conversation.id);
      } else {
          showNotice('info', 'Conversation not found', 'No active conversation for this contact yet.', 3000);
      }
  };

  const handleSendMessage = async (text: string, type: MessageType = 'text', extraData: Partial<Message> = {}) => {
    if (!activeConversationId || !currentUser) return;
    
    // VALIDATE BEFORE optimistic update
    const textToSend = type === 'text' ? text : text;
    const sanitizedText = validationService.sanitizeText(textToSend);
    const textValidation = validationService.validateMessageText(sanitizedText);
    
    if (!textValidation.valid) {
      showNotice('error', 'Invalid Message', textValidation.error || 'Message validation failed', 3000);
      return;
    }

    const clientGeneratedId = generateUUID();
    const timestamp = new Date();

    const optimisticMessage: Message = {
      id: clientGeneratedId, conversationId: activeConversationId, senderId: currentUser.id,
      text: sanitizedText, timestamp: timestamp, isIncoming: false, status: 'sent',
      authorName: currentUser.name, isAI: false, type: type, ...extraData
    };

    // Only add to UI AFTER validation passes
    setMessagesData(prev => ({ ...prev, [activeConversationId]: [...(prev[activeConversationId] || []), optimisticMessage] }));

    let lastMsgText = sanitizedText;
    if (type !== 'text') lastMsgText = `[${type}]`;
    setConversations(prev => prev.map(c => c.id === activeConversationId ? { ...c, lastMessage: lastMsgText, lastMessageTime: timestamp } : c).sort((a,b)=>b.lastMessageTime.getTime()-a.lastMessageTime.getTime()));

    // Pass userId for validation and rate limiting
    try {
      await chatService.sendMessage(optimisticMessage, currentUser.id);
    } catch (error) {
      // Remove optimistic message if sending fails
      const errorMsg = error instanceof Error ? error.message : 'Failed to send message';
      showNotice('error', 'Send Failed', errorMsg, 4000);
      setMessagesData(prev => ({ ...prev, [activeConversationId]: (prev[activeConversationId] || []).filter(m => m.id !== clientGeneratedId) }));
    }
  };

  const handleAddNote = async (text: string) => {
      if(!activeConversationId || !currentUser) return;
      const newNote: Note = {
          id: generateUUID(), conversationId: activeConversationId, authorId: currentUser.id,
          authorName: currentUser.name, text: text, timestamp: new Date()
      };
      setNotesData(prev => ({ ...prev, [activeConversationId]: [...(prev[activeConversationId] || []), newNote] }));
      await chatService.addNote(newNote);
  };

  const handleAddTask = async (task: Task) => {
      if (!currentUser?.organizationId) return;
     // If the task already contains a DB UUID, assume it's already persisted and avoid double-create
     const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
     if (task.id && uuidV4.test(task.id)) {
       // Ensure dueDate is a Date instance
       const existing: Task = { ...task, dueDate: task.dueDate ? new Date(task.dueDate) : new Date() };
       setTasks(prev => [...prev, existing]);
       return;
     }

     const createdTask = await taskService.createTask(task, currentUser.organizationId, true);
     const newTaskUI: Task = {
         id: createdTask.id, title: createdTask.title, description: createdTask.description,
         assigneeId: createdTask.assignee_id, conversationId: createdTask.conversation_id,
         status: createdTask.status, dueDate: new Date(createdTask.due_date)
     };
     setTasks(prev => [...prev, newTaskUI]);
  };

  const handleUpdateTaskStatus = async (taskId: string, status: TaskStatus) => {
        if (!currentUser?.organizationId) return;
      setTasks(tasks.map(t => t.id === taskId ? { ...t, status } : t));
        await taskService.updateTaskStatus(taskId, status, currentUser.organizationId);
  };

  const handleDeleteTask = async (taskId: string) => {
     if (!currentUser?.organizationId) return;
      setTasks(tasks.filter(t => t.id !== taskId));
     await taskService.deleteTask(taskId, currentUser.organizationId);
  };

  const handleSaveContact = async (contact: CRMContact) => {
      if (!currentUser?.organizationId) return;
      await crmService.saveContact(contact, currentUser.organizationId);
      const updated = await crmService.getContacts(currentUser.organizationId);
      setContacts(updated);
  };

  const handleDeleteContact = async (id: string) => {
     if (!currentUser?.organizationId) return;
     await crmService.deleteContact(id, currentUser.organizationId);
      setContacts(contacts.filter(c => c.id !== id));
  };

  const handleAddProperty = async (prop: CustomProperty) => {
      if (!currentUser?.organizationId) return;
      await crmService.addProperty(prop, currentUser.organizationId);
      setProperties(prev => [...prev, prop]);
  };

  const handleDeleteProperty = async (id: string) => {
      if (!currentUser?.organizationId) return;
      await crmService.deleteProperty(id, currentUser.organizationId);
      setProperties(prev => prev.filter(p => p.id !== id));
  };

  // Password Reset Handler
  const handlePasswordResetSubmit = async () => {
      if (newPassword !== confirmPassword) {
          showNotice('error', 'Passwords do not match', 'Please ensure both passwords are identical.', 3000);
          return;
      }
      if (newPassword.length < 6) {
          showNotice('warning', 'Weak password', 'Password must be at least 6 characters.');
          return;
      }
      setIsResetting(true);
      try {
          const { error } = await supabase.auth.updateUser({ password: newPassword });
          if (error) throw error;
          showNotice('success', 'Password updated', 'You are now logged in.', 3000);
          setShowPasswordResetModal(false);
          setNewPassword('');
          setConfirmPassword('');
      } catch (e: any) {
          showNotice('error', 'Error updating password', e.message);
      } finally {
          setIsResetting(false);
      }
  };

  const renderDashboardContent = () => {
    switch (dashboardView) {
      case 'crm': return (
        <CRMScreen 
            contacts={contacts} 
            onSaveContact={handleSaveContact} 
            properties={properties} 
            onAddProperty={handleAddProperty} 
            onDeleteContact={handleDeleteContact} 
            onDeleteProperty={handleDeleteProperty}
            onChatSelect={handleChatFromContact}
            organizationId={currentUser?.organizationId || ''}
            currentUser={currentUser || undefined}
            conversations={conversations}
            teamMembers={teamMembers}
        />
      );
      case 'stats': return <StatisticsScreen currentUser={currentUser} />;
      case 'tasks': return (
        <TaskBoard 
            tasks={tasks} 
            onUpdateStatus={handleUpdateTaskStatus} 
            onDeleteTask={handleDeleteTask} 
            onChatSelect={handleNavigateToChat}
                        teamMembers={teamMembers}
        />
      );
      case 'workflows': return (
        <WorkflowsScreen
          organizationId={currentUser?.organizationId || ''}
          userId={currentUser?.id || ''}
          customProperties={properties}
        />
      );
      case 'settings': return <SettingsScreen />;
      default:
        return (
            <div className="h-full flex flex-col md:flex-row bg-white overflow-hidden w-full">
                <div className={`${isMobileListVisible ? 'flex' : 'hidden'} md:flex w-full md:w-80 lg:w-96 border-r border-slate-200 h-full flex-col flex-shrink-0`}>
                    <ConversationList conversations={conversations} activeId={activeConversationId} onSelect={handleSelectConversation} />
                </div>
                <div className={`${!isMobileListVisible ? 'flex' : 'hidden'} md:flex flex-1 h-full relative bg-[#efeae2] min-w-0 flex-col`}>
                    {activeConversationId ? (
                         <ChatWindow 
                            conversation={conversations.find(c => c.id === activeConversationId)!}
                            messages={messagesData[activeConversationId] || []}
                            notes={notesData[activeConversationId] || []}
                            currentUser={currentUser!}
                            customProperties={properties}
                            contacts={contacts}
                            onSendMessage={handleSendMessage}
                            onAddNote={handleAddNote}
                            onBack={() => { setActiveConversationId(null); setIsMobileListVisible(true); }}
                            onAddTask={handleAddTask}
                            onSaveContact={handleSaveContact}
                        />
                    ) : (
                        <div className="hidden md:flex flex-col items-center justify-center w-full h-full bg-[#f0f2f5] text-slate-400">
                            <div className="bg-white p-8 rounded-full shadow-sm mb-6"><MessageSquare size={64} className="text-emerald-500 opacity-80" /></div>
                            <h3 className="text-xl font-light text-slate-700">Docre-A Web</h3>
                        </div>
                    )}
                </div>
            </div>
        );
    }
  };

  if (isAuthLoading) return <div className="h-screen w-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-10 h-10 text-emerald-600 animate-spin" /></div>;
  
  // Show Privacy Policy page if the route is /politicas-de-privacidad
  if (isPrivacyPolicyPage) return (
    <PrivacyPolicyScreen
      onBack={() => {
        window.history.back();
      }}
    />
  );
  
  if (appState === AppState.LOGIN) return <LoginScreen onLogin={async () => { 
      // Force a manual check if LoginScreen succeeds
      const user = await authService.getCurrentUser(); 
      if(user) { setCurrentUser(user); setAppState(user.organizationId ? AppState.DASHBOARD : AppState.ONBOARDING); } 
  }} onCreateAccount={() => setAppState(AppState.ONBOARDING)} />;

  if (appState === AppState.ONBOARDING) return (
    <Onboarding
      onComplete={async () => {
        const user = await authService.getCurrentUser();
        if (user) {
          setCurrentUser(user);
          setAppState(user.organizationId ? AppState.DASHBOARD : AppState.ONBOARDING);
        }
      }}
      onBackToLogin={() => setAppState(AppState.LOGIN)}
    />
  );

  if (appState === AppState.VERIFICATION && currentUser) {
    const verificationType = tokenProcessingService.getVerificationType();
    
    // Si es signup flow, mostrar AccountSetupScreen para confirmar verificación
    if (verificationType === 'signup') {
      console.log("✨ Signup flow verified, showing verification confirmation screen");
      
      return (
        <AccountSetupScreen
          onSetupComplete={async () => {
            // After showing verification confirmation, redirect to dashboard
            console.log("✅ User confirmed email verification, going to dashboard");
            tokenProcessingService.clearInvitationFlow();
            setAppState(AppState.DASHBOARD);
            // Clean up URL
            const cleanUrl = window.location.origin;
            window.history.replaceState({}, document.title, cleanUrl);
          }}
        />
      );
    }
    
    // Si es invite flow, mostrar VerificationScreen para que ingrese contraseña
    return (
      <VerificationScreen
        onVerificationComplete={async () => {
          // After password is set, redirect to dashboard
          tokenProcessingService.clearInvitationFlow();
          setAppState(AppState.DASHBOARD);
          // Clean up URL completely - remove /auth/confirm and any params
          const cleanUrl = window.location.origin;
          window.history.replaceState({}, document.title, cleanUrl);
        }}
        onCancel={async () => {
          // User wants to use different email, logout
          tokenProcessingService.clearInvitationFlow();
          await authService.signOut();
          setAppState(AppState.LOGIN);
          setCurrentUser(null);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 relative">
      <nav className="w-16 md:w-20 bg-slate-900 flex flex-col items-center py-6 gap-6 flex-shrink-0 z-50 shadow-xl">
        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-xl mb-4">D</div>
        
        {/* CHATS - All roles can access */}
        <button 
          onClick={() => setDashboardView('chats')} 
          className={`p-3 rounded-xl transition-all ${dashboardView === 'chats' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}
          title="Conversations"
        >
          <MessageSquare size={20} />
        </button>

        {/* CRM - Admin and Manager */}
        {currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') && (
          <button 
            onClick={() => setDashboardView('crm')} 
            className={`p-3 rounded-xl transition-all ${dashboardView === 'crm' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}
            title="CRM & Contacts"
          >
            <Users size={20} />
          </button>
        )}

        {/* TASKS - Admin and Manager */}
        {currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') && (
          <button 
            onClick={() => setDashboardView('tasks')} 
            className={`p-3 rounded-xl transition-all ${dashboardView === 'tasks' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}
            title="Tasks"
          >
            <CheckSquare size={20} />
          </button>
        )}

        {/* WORKFLOWS - Admin and Manager */}
        {currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') && (
          <button 
            onClick={() => setDashboardView('workflows')} 
            className={`p-3 rounded-xl transition-all ${dashboardView === 'workflows' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}
            title="Workflows"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
        )}

        {/* STATISTICS - Admin and Manager */}
        {currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') && (
          <button 
            onClick={() => setDashboardView('stats')} 
            className={`p-3 rounded-xl transition-all ${dashboardView === 'stats' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}
            title="Statistics"
          >
            <BarChart3 size={20} />
          </button>
        )}

        <div className="mt-auto flex flex-col gap-4">
          {/* SETTINGS - Admin and Manager */}
          {currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') && (
            <button 
              onClick={() => setDashboardView('settings')} 
              className={`p-3 rounded-xl transition-all ${dashboardView === 'settings' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}
              title="Settings"
            >
              <Settings size={20} />
            </button>
          )}

          <button 
            onClick={handleLogout} 
            className="p-3 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition-all mt-2"
            title="Logout"
          >
            <LogOut size={20} />
          </button>

          <div className="w-8 h-8 rounded-full bg-slate-700 mt-2 border-2 border-slate-600 overflow-hidden" title={currentUser?.role}>
            <img src={currentUser?.avatar} className="w-full h-full object-cover" />
          </div>

          {/* Role Badge */}
          <div className="text-xs text-center text-slate-400 font-semibold uppercase mt-2 px-2 py-1 bg-slate-800 rounded">
            {currentUser?.role}
          </div>
        </div>
      </nav>
      <main className="flex-1 overflow-hidden relative w-full">{renderDashboardContent()}</main>

            {/* Global Result Overlay */}
            <ResultOverlay
                show={notice.show}
                status={notice.status}
                title={notice.title}
                message={notice.message}
                autoCloseMs={notice.autoCloseMs}
                onClose={() => setNotice(prev => ({ ...prev, show: false }))}
            />

            <ToastNotifications
                toasts={toasts}
                onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))}
            />

      {/* FORCE PASSWORD CHANGE MODAL */}
      {showPasswordResetModal && (
          <div className="absolute inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
                  <div className="flex justify-center mb-6">
                      <div className="bg-emerald-100 p-4 rounded-full">
                          <Lock size={32} className="text-emerald-600"/>
                      </div>
                  </div>
                  <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">Set New Password</h2>
                  <p className="text-center text-slate-500 mb-8">Please set a secure password for your account to continue.</p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">New Password</label>
                          <input 
                              type="password" 
                              className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" 
                              placeholder="Min. 6 characters"
                              value={newPassword}
                              onChange={e => setNewPassword(e.target.value)}
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">Confirm Password</label>
                          <input 
                              type="password" 
                              className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" 
                              placeholder="Repeat password"
                              value={confirmPassword}
                              onChange={e => setConfirmPassword(e.target.value)}
                          />
                      </div>
                      
                      <button 
                          onClick={handlePasswordResetSubmit}
                          disabled={isResetting || !newPassword || !confirmPassword}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2 mt-4"
                      >
                          {isResetting ? <Loader2 className="animate-spin"/> : 'Set Password & Login'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
export default App;
