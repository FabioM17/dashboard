import { supabase } from './supabaseClient';

export const notificationService = {
  async sendNotification(to: string | string[], subject: string, html: string, organizationId?: string) {
    try {
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
