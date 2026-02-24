
import { supabase } from './supabaseClient';
import { Conversation, Message, Note } from '../types';
import { validationService } from './validationService';
import { deduplicationService } from './deduplicationService';
import { rateLimitingService } from './rateLimitingService';
import { fetchAndSavePhoneNumber } from './whatsappIntegrationService';

export const chatService = {
  
  // 1. Obtener Conversaciones
  async getConversations(organizationId: string): Promise<Conversation[]> {
    if (!organizationId) {
      console.error('Organization ID required for getConversations');
      return [];
    }

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('last_message_time', { ascending: false });

    if (error) {
      console.error('Error fetching conversations:', error);
      return [];
    }

    return data.map((c: any) => ({
      id: c.id,
      contactName: c.contact_name,
      contactAvatar: c.contact_avatar || 'https://ui-avatars.com/api/?name=' + c.contact_name,
      lastMessage: c.last_message || '',
      lastMessageTime: new Date(c.last_message_time),
      unreadCount: c.unread_count || 0,
      tags: c.tags || [],
      platform: (c.platform as 'whatsapp' | 'instagram' | 'messenger') || 'whatsapp',
      assignedTo: c.assigned_to || undefined,
      status: c.status || 'open',
    })) as Conversation[];
  },

  // 2. Obtener Mensajes (Con soporte para message_statuses)
  async getMessages(conversationId: string): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return [];
    }

    return data.map((m: any) => ({
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      text: m.text || '',
      timestamp: new Date(m.created_at),
      isIncoming: m.is_incoming,
      status: m.status || 'sent',
      type: m.type || 'text',
      authorName: m.author_name || 'User',
      isAI: m.is_ai || false,
      attachmentUrl: m.metadata?.attachmentUrl,
      fileName: m.metadata?.fileName,
      duration: m.metadata?.duration,
      latitude: m.metadata?.latitude,
      longitude: m.metadata?.longitude,
      templateName: m.metadata?.template_name,
      // Storage fields (for media_path integration)
      media_path: m.media_path,
      media_mime_type: m.media_mime_type,
      media_size: m.media_size,
      // Call Log Metadata Mapping
      callStatus: m.metadata?.call_status,
      callDuration: m.metadata?.call_duration,
      scheduledTime: m.metadata?.scheduled_time ? new Date(m.metadata.scheduled_time) : undefined,
      // WhatsApp Message ID (WAMID) for status tracking
      whatsappMessageId: m.metadata?.wamid
    })) as Message[];
  },

  // 2.5. Obtener Estados de Mensajes (NEW)
  async getMessageStatuses(conversationId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('message_statuses')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching message statuses:', error);
      return [];
    }

    return data.map((s: any) => ({
      id: s.id,
      messageId: s.message_id,
      conversationId: s.conversation_id,
      whatsappMessageId: s.whatsapp_message_id,
      status: s.status, // 'sent', 'delivered', 'read', 'failed'
      timestamp: new Date(s.timestamp),
      recipientPhone: s.recipient_phone,
      pricing: s.pricing, // { billable, pricing_model, category, type }
      metadata: s.metadata
    }));
  },

  // 2.6. Obtener Estado Actual de un Mensaje (NEW)
  async getMessageStatus(messageId: string): Promise<any | null> {
    const { data, error } = await supabase
      .from('message_statuses')
      .select('*')
      .eq('message_id', messageId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()
      .returns<any>();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      messageId: data.message_id,
      status: data.status,
      timestamp: new Date(data.timestamp),
      pricing: data.pricing,
      metadata: data.metadata
    };
  },

  // 3. Enviar Mensaje
  async sendMessage(message: Message, userId?: string): Promise<Message | null> {
    try {
        // VALIDATIONS
        // 1. Validate conversation ID
        if (!validationService.validateConversationId(message.conversationId)) {
            throw new Error('Invalid conversation ID format');
        }

        // 2. Validate message text
        if (message.text) {
            const textValidation = validationService.validateMessageText(message.text);
            if (!textValidation.valid) {
                throw new Error(textValidation.error);
            }
            // Sanitize text
            message.text = validationService.sanitizeText(message.text);
        }

        // 3. Validate file name if present
        if (message.fileName) {
            const fileValidation = validationService.validateFileName(message.fileName);
            if (!fileValidation.valid) {
                throw new Error(fileValidation.error);
            }
        }

        // 4. Validate attachment URL if present
        if (message.attachmentUrl) {
            const urlValidation = validationService.validateUrl(message.attachmentUrl);
            if (!urlValidation.valid) {
                throw new Error(urlValidation.error);
            }
        }

        // 5. Check rate limiting
        if (userId) {
            if (rateLimitingService.isRateLimited(userId, 'message')) {
                const resetTime = rateLimitingService.getResetTime(userId, 'message');
                throw new Error(`Rate limit exceeded. Try again in ${resetTime} seconds.`);
            }
        }

        // 6. Check for duplicate messages
        if (userId && message.text) {
            if (deduplicationService.isDuplicate(message.conversationId, message.text, userId)) {
                console.warn('Duplicate message detected, skipping');
                throw new Error('Duplicate message detected. Please wait before sending again.');
            }
            
            // Mark as pending
            deduplicationService.markPending(message.conversationId, message.text, userId);
        }

        const { data: conv, error: convError } = await supabase
            .from('conversations')
            .select('platform, organization_id')
            .eq('id', message.conversationId)
            .single()
            .returns<{ platform: string; organization_id: string }>();

        if (convError) {
            throw new Error(`Failed to fetch conversation: ${convError.message}`);
        }

        if (!conv) {
            throw new Error('Conversation not found');
        }

        const organizationId = conv.organization_id;

        if (conv && conv.platform === 'whatsapp') {
          // Prepare template variables: filter out empty/null values to avoid Meta errors
          const rawTplVars = (message as any).templateVariables;
          const tplVars = Array.isArray(rawTplVars) ? rawTplVars.map(String).filter(v => v != null && String(v).trim() !== '') : undefined;

          const payload = {
            id: message.id,
            conversation_id: message.conversationId,
            text: message.text,
            sender_id: message.senderId,
            author_name: message.authorName,
            // New fields for Templates
            type: message.type,
            template_name: message.templateName,
            template_language: message.templateLanguage,
            template_variables: tplVars,
            // Media fields for WhatsApp Cloud API
            attachmentUrl: message.attachmentUrl,
            media_path: message.media_path,
            media_mime_type: message.media_mime_type,
            media_size: message.media_size,
            fileName: message.fileName
          };

          console.log('[chatService] Invoking whatsapp-send with payload:', { conversationId: message.conversationId, template_variables: tplVars, template_name: message.templateName });

          const { data, error } = await supabase.functions.invoke('whatsapp-send', { body: payload });
            if (error) {
                // Mark as completed to allow retry
                if (userId && message.text) {
                    deduplicationService.markCompleted(message.conversationId, message.text, userId);
                }
                throw error;
            }

            // Increment rate limit counter
            if (userId) {
                rateLimitingService.incrementCounter(userId, 'message');
            }

            // Mark deduplication as completed
            if (userId && message.text) {
                deduplicationService.markCompleted(message.conversationId, message.text, userId);
            }

            return message;
        }

        const dbMessage = {
            id: message.id,
            conversation_id: message.conversationId,
            organization_id: organizationId,
            sender_id: message.senderId,
            text: message.text,
            is_incoming: message.isIncoming,
            status: 'sent',
            type: message.type,
            author_name: message.authorName,
            is_ai: message.isAI || false,
            created_at: message.timestamp.toISOString(),
            media_path: message.media_path,
            media_mime_type: message.media_mime_type,
            media_size: message.media_size,
            metadata: {
                attachmentUrl: message.attachmentUrl,
                fileName: message.fileName,
                duration: message.duration,
                latitude: message.latitude,
                longitude: message.longitude,
                template_name: message.templateName
            }
        };

        const { error } = await supabase.from('messages').insert([dbMessage]);
        if (error) {
            // Mark as completed to allow retry
            if (userId && message.text) {
                deduplicationService.markCompleted(message.conversationId, message.text, userId);
            }
            throw error;
        }

        await supabase
        .from('conversations')
        .update({ 
            last_message: message.type === 'text' ? message.text : `Attachment: ${message.type}`,
            last_message_time: new Date().toISOString(),
            unread_count: 0 
        })
        .eq('id', message.conversationId);

        // Increment rate limit counter
        if (userId) {
            rateLimitingService.incrementCounter(userId, 'message');
        }

        // Mark deduplication as completed
        if (userId && message.text) {
            deduplicationService.markCompleted(message.conversationId, message.text, userId);
        }

        return message;

    } catch (err) {
        console.error('Error sending message:', err);
    throw err;
    }
  },

  // 4. Marcar como Leído
  async markAsRead(conversationId: string) {
      const { error } = await supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', conversationId);
      
      if (error) console.error("Error marking as read:", error);
  },

  // === NOTES MANAGEMENT ===
  async getNotes(conversationId: string): Promise<Note[]> {
    const { data, error } = await supabase
      .from('notes')
      .select('*, profiles(full_name)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
      
    if (error) {
        console.error("Error getting notes:", error);
        return [];
    }
    
    return data.map((n: any) => ({
        id: n.id,
        conversationId: n.conversation_id,
        authorId: n.author_id,
        authorName: n.profiles?.full_name || 'Agent',
        text: n.text,
        timestamp: new Date(n.created_at)
    }));
  },

  async addNote(note: Note) {
      const { error } = await supabase.from('notes').insert({
          id: note.id,
          conversation_id: note.conversationId,
          author_id: note.authorId,
          text: note.text,
          created_at: note.timestamp.toISOString()
      });
      if (error) console.error("Error saving note:", error);
  },

  // === INTEGRATION CONFIG ===
  async saveWhatsAppConfig(organizationId: string, phoneId: string, wabaId: string, accessToken: string, verifyToken: string) {
    if (!organizationId) throw new Error("Organization ID is required");
    
    // First get existing config to merge
    const { data: existingData } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organizationId)
      .eq('service_name', 'whatsapp')
      .single();
    
    const existingCredentials = existingData?.credentials || {};
    
    // Merge with existing data, keeping fields not being updated
    const mergedCredentials = {
      ...existingCredentials,
      phone_id: phoneId || existingCredentials.phone_id,
      waba_id: wabaId || existingCredentials.waba_id,
      access_token: accessToken || existingCredentials.access_token,
      verify_token: verifyToken || existingCredentials.verify_token
    };
    
    const { error } = await supabase
      .from('integration_settings')
      .upsert({ 
        organization_id: organizationId,
        service_name: 'whatsapp', 
        credentials: mergedCredentials,
        updated_at: new Date().toISOString()
      }, { onConflict: 'organization_id, service_name' });
    if (error) throw error;
    
    // Try to fetch phone number if we have access token and phone ID
    if (accessToken && phoneId) {
      try {
        console.log('📞 [ChatService] Attempting to fetch phone number from API...');
        const result = await fetchAndSavePhoneNumber(organizationId, phoneId, accessToken);
        if (result.success) {
          console.log('✅ [ChatService] Phone number fetched and saved:', result.phoneNumber);
        } else {
          console.warn('⚠️ [ChatService] Could not fetch phone number:', result.error);
          // Don't throw - phone number is optional, everything else was saved
        }
      } catch (error) {
        console.warn('⚠️ [ChatService] Error fetching phone number:', error);
        // Don't throw - phone number is optional, everything else was saved
      }
    }
  },

  async getWhatsAppConfig(organizationId: string) {
    if (!organizationId) return null;
    const { data, error } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organizationId)
      .eq('service_name', 'whatsapp')
      .single()
      .returns<{ credentials: any }>();
    if (error) return null;
    return data?.credentials;
  },

  async saveGeminiConfig(organizationId: string, apiKey: string, systemInstruction: string) {
    if (!organizationId) throw new Error("Organization ID is required");
    // Save to both old and new location for compatibility
    const { error } = await supabase
      .from('integration_settings')
      .upsert({ 
        organization_id: organizationId,
        service_name: 'gemini', 
        credentials: { api_key: apiKey, system_instruction: systemInstruction },
        updated_at: new Date().toISOString()
      }, { onConflict: 'organization_id, service_name' });
    if (error) throw error;
    
    // Also save to new AI provider system
    try {
      await supabase
        .from('integration_settings')
        .upsert({ 
          organization_id: organizationId,
          service_name: 'ai_provider_gemini', 
          credentials: { 
            provider: 'gemini',
            apiKey: apiKey, 
            systemInstruction: systemInstruction,
            isActive: true 
          },
          updated_at: new Date().toISOString()
        }, { onConflict: 'organization_id, service_name' });
    } catch (e) {
      // If this fails, don't break - the main save already worked
      console.warn('Could not save to new AI provider system:', e);
    }
  },

  async getGeminiConfig(organizationId: string) {
    if (!organizationId) return null;
    const { data, error } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organizationId)
      .eq('service_name', 'gemini')
      .single()
      .returns<{ credentials: any }>();
    if (error) return null;
    return data?.credentials;
  },

  // === N8N AUTOMATION CONFIG ===
  async saveN8nConfig(organizationId: string, webhookUrl: string, isActive: boolean) {
    if (!organizationId) throw new Error("Organization ID is required");
    const { error } = await supabase
      .from('integration_settings')
      .upsert({ 
        organization_id: organizationId,
        service_name: 'n8n', 
        credentials: { webhook_url: webhookUrl, is_active: isActive },
        updated_at: new Date().toISOString()
      }, { onConflict: 'organization_id, service_name' });
    if (error) throw error;
  },

  async getN8nConfig(organizationId: string) {
    if (!organizationId) return null;
    const { data, error } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organizationId)
      .eq('service_name', 'n8n')
      .single()
      .returns<{ credentials: any }>();
    if (error) return null;
    return data?.credentials;
  },

  // === RETELL AI CONFIG (NEW) ===
  async saveRetellConfig(organizationId: string, webhookUrl: string) {
    if (!organizationId) throw new Error("Organization ID is required");
    const { error } = await supabase
      .from('integration_settings')
      .upsert({ 
        organization_id: organizationId,
        service_name: 'retell', 
        credentials: { webhook_url: webhookUrl },
        updated_at: new Date().toISOString()
      }, { onConflict: 'organization_id, service_name' });
    if (error) throw error;
  },

  async getRetellConfig(organizationId: string) {
    if (!organizationId) return null;
    const { data, error } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organizationId)
      .eq('service_name', 'retell')
      .single()
      .returns<{ credentials: any }>();
    if (error) return null;
    return data?.credentials;
  },

  // TRIGGER CALL FUNCTION (UPDATED)
  async triggerRetellCall(conversationId: string, authorId: string, action: 'now' | 'schedule', scheduledTime?: string) {
      const { data, error } = await supabase.functions.invoke('trigger-retell', {
          body: {
              conversation_id: conversationId,
              author_id: authorId,
              action,
              scheduled_time: scheduledTime
          }
      });
      
      if (error) throw error;
      return data;
  },

  // TEST CONNECTION (NEW)
  // Invokes the edge function to ping the webhook without needing DB data
  async testRetellConnection(webhookUrl: string) {
      const { data, error } = await supabase.functions.invoke('trigger-retell', {
          body: {
              action: 'test_connection',
              webhook_url: webhookUrl
          }
      });
      
      if (error) throw error;
      return data;
  },

  // 5. Suscribirse a Cambios (Enhanced with message_statuses + error handling + organization filter)
  subscribeToChanges(
    organizationId: string,  // NEW: Filter by organization
    onNewMessage: (msg: Message) => void,
    onConversationUpdate: (conv: Partial<Conversation>) => void,
    onNewConversation: (conv: Conversation) => void,
    onMessageStatusUpdate?: (status: any) => void
  ) {
    console.log(`🔌 Initializing Supabase Realtime Subscription for org: ${organizationId}`);
    
    // Use organization-specific channel name to avoid conflicts
    const channel = supabase.channel(`org-${organizationId}-changes`);
    
    let connectionAttempts = 0;
    const maxConnectionAttempts = 3;
    
    channel
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'messages'
        },
        (payload) => {
          try {
            const newMsg = payload.new;
            if (newMsg?.organization_id && newMsg.organization_id !== organizationId) return; // Client-side guard
            const formattedMsg: Message = {
              id: newMsg.id,
              conversationId: newMsg.conversation_id,
              senderId: newMsg.sender_id,
              text: newMsg.text || '',
              timestamp: new Date(newMsg.created_at),
              isIncoming: newMsg.is_incoming,
              status: newMsg.status,
              type: newMsg.type || 'text',
              authorName: newMsg.author_name,
              isAI: newMsg.is_ai,
              attachmentUrl: newMsg.metadata?.attachmentUrl,
              fileName: newMsg.metadata?.fileName,
              duration: newMsg.metadata?.duration,
              latitude: newMsg.metadata?.latitude,
              longitude: newMsg.metadata?.longitude,
              templateName: newMsg.metadata?.template_name,
              media_path: newMsg.media_path,
              media_mime_type: newMsg.media_mime_type,
              media_size: newMsg.media_size,
              callStatus: newMsg.metadata?.call_status,
              callDuration: newMsg.metadata?.call_duration,
              scheduledTime: newMsg.metadata?.scheduled_time ? new Date(newMsg.metadata.scheduled_time) : undefined,
              whatsappMessageId: newMsg.metadata?.wamid
            };
            onNewMessage(formattedMsg);
          } catch (error) {
            console.error('❌ Error processing new message:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'messages'
        },
        (payload) => {
          try {
            const updated = payload.new;
            if (updated?.organization_id && updated.organization_id !== organizationId) return; // Client-side guard
            const formattedMsg: Message = {
              id: updated.id,
              conversationId: updated.conversation_id,
              senderId: updated.sender_id,
              text: updated.text || '',
              timestamp: new Date(updated.created_at),
              isIncoming: updated.is_incoming,
              status: updated.status,
              type: updated.type || 'text',
              authorName: updated.author_name,
              isAI: updated.is_ai,
              attachmentUrl: updated.metadata?.attachmentUrl,
              fileName: updated.metadata?.fileName,
              duration: updated.metadata?.duration,
              latitude: updated.metadata?.latitude,
              longitude: updated.metadata?.longitude,
              templateName: updated.metadata?.template_name,
              media_path: updated.media_path,
              media_mime_type: updated.media_mime_type,
              media_size: updated.media_size,
              callStatus: updated.metadata?.call_status,
              callDuration: updated.metadata?.call_duration,
              scheduledTime: updated.metadata?.scheduled_time ? new Date(updated.metadata.scheduled_time) : undefined,
              whatsappMessageId: updated.metadata?.wamid
            };
            onNewMessage(formattedMsg);
          } catch (error) {
            console.error('❌ Error processing updated message:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'conversations'
        },
        (payload) => {
          try {
            const updated = payload.new;
            if (updated?.organization_id && updated.organization_id !== organizationId) return; // Client-side guard
            onConversationUpdate({
              id: updated.id,
              lastMessage: updated.last_message,
              lastMessageTime: new Date(updated.last_message_time),
              unreadCount: updated.unread_count
            });
          } catch (error) {
            console.error('❌ Error processing conversation update:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'conversations'
        },
        (payload) => {
          try {
            const c = payload.new;
            if (c?.organization_id && c.organization_id !== organizationId) return; // Client-side guard
            const newConv: Conversation = {
              id: c.id,
              contactName: c.contact_name,
              contactAvatar: c.contact_avatar || 'https://ui-avatars.com/api/?name=' + c.contact_name,
              lastMessage: c.last_message || '',
              lastMessageTime: new Date(c.last_message_time),
              unreadCount: c.unread_count || 1,
              tags: c.tags || [],
              platform: (c.platform as 'whatsapp' | 'instagram' | 'messenger') || 'whatsapp',
            };
            onNewConversation(newConv);
          } catch (error) {
            console.error('❌ Error processing new conversation:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'message_statuses'
        },
        (payload) => {
          try {
            const newStatus = payload.new;
            if (newStatus?.organization_id && newStatus.organization_id !== organizationId) return; // Client-side guard
            if (onMessageStatusUpdate) {
              onMessageStatusUpdate({
                id: newStatus.id,
                messageId: newStatus.message_id,
                conversationId: newStatus.conversation_id,
                whatsappMessageId: newStatus.whatsapp_message_id,
                status: newStatus.status,
                timestamp: new Date(newStatus.timestamp),
                pricing: newStatus.pricing,
                metadata: newStatus.metadata
              });
            }
          } catch (error) {
            console.error('❌ Error processing message status:', error);
          }
        }
      )
      .on('error', (error) => {
        console.error('❌ Realtime channel error:', error);
      })
      .on('close', () => {
        console.warn('⚠️ Realtime channel closed');
      });

    const status = channel.subscribe((status) => {
      console.log(`📡 Subscription status: ${status}`);
      
      if (status === 'SUBSCRIBED') {
        console.log('✅ Realtime subscription active');
        connectionAttempts = 0;
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Channel error - will attempt reconnection');
      } else if (status === 'TIMED_OUT') {
        console.error('❌ Subscription timeout - will attempt reconnection');
      }
    });

    return {
      unsubscribe: () => {
        console.log('🔌 Unsubscribing from Realtime');
        supabase.removeChannel(channel);
      }
    };
  },

  // 5.5. Suscribirse Solo a Estados de un Mensaje (NEW)
  subscribeToMessageStatus(
    messageId: string,
    onStatusChange: (status: any) => void
  ) {
    const channel = supabase.channel(`message-status-${messageId}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'message_statuses',
          filter: `message_id=eq.${messageId}`
        },
        (payload) => {
          const newStatus = payload.new;
          onStatusChange({
            status: newStatus.status,
            timestamp: new Date(newStatus.timestamp),
            pricing: newStatus.pricing,
            metadata: newStatus.metadata
          });
        }
      )
      .subscribe();

    return {
      unsubscribe: () => {
        supabase.removeChannel(channel);
      }
    };
  },

  // 5.6 Heartbeat para verificar conexión activa
  setupHeartbeat(
    organizationId: string,
    onConnectionStatusChange?: (isHealthy: boolean) => void
  ) {
    let isHealthy = true;
    
    const heartbeat = setInterval(async () => {
      try {
        // Ping a la base de datos para verificar conexión (sin timeout)
        const { data, error } = await supabase
          .from('organizations')
          .select('id')
          .eq('id', organizationId)
          .limit(1);
        
        if (error || !data) {
          if (isHealthy) {
            console.error('❌ Heartbeat failed - connection lost:', error?.message);
            isHealthy = false;
            if (onConnectionStatusChange) onConnectionStatusChange(false);
          }
        } else {
          if (!isHealthy) {
            console.log('✅ Heartbeat restored - connection alive');
            isHealthy = true;
            if (onConnectionStatusChange) onConnectionStatusChange(true);
          }
        }
      } catch (error) {
        if (isHealthy) {
          console.error('❌ Heartbeat error:', error);
          isHealthy = false;
          if (onConnectionStatusChange) onConnectionStatusChange(false);
        }
      }
    }, 30000); // Every 30 seconds
    
    return {
      stop: () => clearInterval(heartbeat)
    };
  },

  // 5.7 Sincronización forzada de mensajes con deduplicación
  async syncMessagesWithDedup(conversationId: string, existingMessages: Message[]): Promise<Message[]> {
    try {
      const fresh = await this.getMessages(conversationId);
      const existingIds = new Set(existingMessages.map(m => m.id));
      const newMessages = fresh.filter(m => !existingIds.has(m.id));
      
      console.log(`🔄 Synced ${newMessages.length} new messages for conversation ${conversationId}`);
      return [...existingMessages, ...newMessages];
    } catch (error) {
      console.error('❌ Sync failed:', error);
      return existingMessages;
    }
  }
};

