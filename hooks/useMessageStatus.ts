import { useEffect, useState, useCallback } from 'react';
import { chatService } from '../services/chatService';

interface MessageStatusUpdate {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  pricing?: any;
  metadata?: any;
}

/**
 * Hook para suscribirse a actualizaciones de estado de mensajes en tiempo real
 * @param conversationId - ID de la conversación
 * @param enabled - Si la suscripción está habilitada (default: true)
 * @returns Object con statusUpdates y isLoading
 */
export const useMessageStatus = (conversationId: string, enabled = true) => {
  const [statusUpdates, setStatusUpdates] = useState<Record<string, MessageStatusUpdate>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Cargar estados iniciales
  useEffect(() => {
    if (!conversationId || !enabled) return;

    let mounted = true;
    setIsLoading(true);

    chatService
      .getMessageStatuses(conversationId)
      .then((statuses) => {
        if (!mounted) return;
        
        const updates: Record<string, MessageStatusUpdate> = {};
        statuses.forEach((status: any) => {
          updates[status.message_id] = {
            messageId: status.message_id,
            status: status.status,
            timestamp: new Date(status.timestamp),
            pricing: status.pricing,
            metadata: status.metadata,
          };
        });
        
        setStatusUpdates(updates);
        setError(null);
      })
      .catch((err) => {
        if (mounted) {
          console.error('[useMessageStatus] Error loading initial statuses:', err);
          setError(err);
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [conversationId, enabled]);

  // Suscribirse a actualizaciones de estado en tiempo real
  useEffect(() => {
    if (!conversationId || !enabled) return;

    let unsubscribe: (() => void) | null = null;

    try {
      const subscription = chatService.subscribeToChanges(
        // onNewMessage
        () => {
          // Handled by parent component
        },
        // onConversationUpdate
        () => {
          // Handled by parent component
        },
        // onNewConversation
        () => {
          // Handled by parent component
        },
        // onMessageStatusUpdate
        (update: any) => {
          console.log('[useMessageStatus] Real-time status update:', update);
          if (update.messageId) {
            setStatusUpdates((prev) => ({
              ...prev,
              [update.messageId]: {
                messageId: update.messageId,
                status: update.status,
                timestamp: update.timestamp,
                pricing: update.pricing,
                metadata: update.metadata,
              },
            }));
          }
        }
      );
      
      unsubscribe = subscription.unsubscribe;
    } catch (err) {
      console.error('[useMessageStatus] Error setting up subscription:', err);
      setError(err as Error);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [conversationId, enabled]);

  // Helper to get status of a specific message
  const getStatus = useCallback(
    (messageId: string): MessageStatusUpdate | undefined => {
      return statusUpdates[messageId];
    },
    [statusUpdates]
  );

  // Helper to get formatted status string
  const getStatusLabel = useCallback(
    (messageId: string): string => {
      const update = statusUpdates[messageId];
      if (!update) return 'enviando...';
      
      switch (update.status) {
        case 'sent':
          return 'Enviado';
        case 'delivered':
          return 'Entregado';
        case 'read':
          return 'Leído';
        case 'failed':
          return 'Error al enviar';
        default:
          return update.status;
      }
    },
    [statusUpdates]
  );

  return {
    statusUpdates,
    isLoading,
    error,
    getStatus,
    getStatusLabel,
  };
};
