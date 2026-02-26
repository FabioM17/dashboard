import { supabase } from './supabaseClient';

export const notificationService = {
  /**
   * Verifica que Gmail esté configurado para la organización antes de enviar.
   * Retorna true si está configurado, false si no.
   */
  async isGmailConfigured(organizationId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('credentials')
        .eq('organization_id', organizationId)
        .eq('service_name', 'gmail')
        .single();

      if (error || !data?.credentials?.access_token) return false;
      return true;
    } catch {
      return false;
    }
  },

  async sendNotification(to: string | string[], subject: string, html: string, organizationId?: string) {
    try {
      // Verificar que Gmail esté configurado antes de intentar enviar
      if (organizationId) {
        const gmailReady = await this.isGmailConfigured(organizationId);
        if (!gmailReady) {
          console.warn('[notificationService] Gmail no configurado para la organización. El email no se enviará.');
          return;
        }
      }

      await supabase.functions.invoke('app-notifications', {
        body: {
          to,
          subject,
          html,
          organization_id: organizationId
        }
      });
    } catch (error) {
      console.error('Notification send failed', error);
    }
  }
};
