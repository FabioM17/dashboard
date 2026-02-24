
import { supabase } from './supabaseClient';
import { Campaign, CRMContact } from '../types';

export const campaignService = {
  
  // 1. Crear campaña (guardada en Supabase con RLS)
  async createCampaign(campaign: Campaign, organizationId: string): Promise<Campaign> {
    try {
      if (!campaign.stats) {
        campaign.stats = { sent: 0, delivered: 0, read: 0, failed: 0 };
      }

      const campaignData = {
        id: campaign.id,
        name: campaign.name,
        type: campaign.type,
        status: campaign.status,
        recipient_count: campaign.recipientCount,
        recipient_ids: campaign.recipientIds,
        stats: campaign.stats,
        template_id: campaign.templateId,
        template_name: campaign.templateName,
        template_language: campaign.templateLanguage,
        email_subject: campaign.emailSubject,
        email_body: campaign.emailBody,
        organization_id: organizationId,
        created_at: campaign.createdAt.toISOString(),
        sent_at: campaign.sentAt?.toISOString(),
        scheduled_at: campaign.scheduledAt?.toISOString(),
        created_by: (await supabase.auth.getUser()).data.user?.id
      };

      const { data, error } = await supabase
        .from('campaigns')
        .insert(campaignData)
        .select()
        .single();

      if (error) throw error;

      return this.mapCampaignFromDB(data);
    } catch (error) {
      console.error('Error creating campaign:', error);
      throw error;
    }
  },

  // Helper para mapear campaign desde DB
  mapCampaignFromDB(data: any): Campaign {
    return {
      id: data.id,
      name: data.name,
      type: data.type,
      status: data.status,
      recipientCount: data.recipient_count,
      recipientIds: data.recipient_ids || [],
      stats: data.stats,
      templateId: data.template_id,
      templateName: data.template_name,
      templateLanguage: data.template_language,
      emailSubject: data.email_subject,
      emailBody: data.email_body,
      createdAt: new Date(data.created_at),
      sentAt: data.sent_at ? new Date(data.sent_at) : undefined,
      scheduledAt: data.scheduled_at ? new Date(data.scheduled_at) : undefined,
      createdBy: data.created_by
    };
  },

  // Helper para reemplazar variables dinámicas estilo Chatfuel
  replaceVariables(text: string, contact: CRMContact): string {
    let result = text;
    // Variables base
    result = result.replace(/{{name}}/g, contact.name || '');
    result = result.replace(/{{email}}/g, contact.email || '');
    result = result.replace(/{{phone}}/g, contact.phone || '');
    result = result.replace(/{{company}}/g, contact.company || '');
    
    // Custom properties
    Object.keys(contact.properties || {}).forEach(key => {
      const reg = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(reg, String(contact.properties[key] || ''));
    });
    
    return result;
  },

  // 2. Obtener todas las campañas
  async getCampaigns(organizationId: string): Promise<Campaign[]> {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(this.mapCampaignFromDB);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      return [];
    }
  },

  // 3. Enviar campaña por WhatsApp
  async sendWhatsAppCampaign(
    campaign: Campaign,
    recipients: CRMContact[],
    organizationId: string
  ): Promise<{ success: number; failed: number }> {
    // Si la campaña está programada, guardar sin enviar
    if (campaign.scheduledAt) {
      campaign.status = 'scheduled';
      campaign.stats = { sent: 0, delivered: 0, read: 0, failed: 0 };
      await this.updateCampaign(campaign, organizationId);
      console.log(`Campaign scheduled for ${campaign.scheduledAt.toISOString()}`);
      return { success: 0, failed: 0 };
    }

    // Envío inmediato
    let success = 0;
    let failed = 0;

    campaign.status = 'sending';
    campaign.stats = { sent: 0, delivered: 0, read: 0, failed: 0 };
    await this.updateCampaign(campaign, organizationId);

    // Enviar a cada contacto usando la edge function unificada (Reutiliza lógica de ChatWindow)
    for (const contact of recipients) {
      try {
        const { error } = await supabase.functions.invoke('whatsapp-send', {
          body: {
            organization_id: organizationId,
            to: contact.phone,
            type: 'template',
            template_name: campaign.templateName,
            template_language: campaign.templateLanguage || 'en_US',
            text: campaign.emailBody, // En WA guardamos el cuerpo del template para referencia
            author_name: 'Campaign System'
          }
        });

        if (error) {
          console.error(`Error sending to ${contact.phone}:`, error);
          failed++;
        } else {
          success++;
        }
      } catch (err) {
        console.error(`Exception sending to ${contact.phone}:`, err);
        failed++;
      }
      
      // Actualizar progreso
      if (campaign.stats) {
        campaign.stats.sent = success;
        campaign.stats.failed = failed;
        await this.updateCampaign(campaign, organizationId);
      }
    }

    // Actualizar estado final
    campaign.status = 'sent';
    campaign.sentAt = new Date();
    await this.updateCampaign(campaign, organizationId);

    return { success, failed };
  },

  // 4. Enviar campaña por Email con personalización (real Gmail API)
  async sendEmailCampaign(
    campaign: Campaign,
    recipients: CRMContact[],
    subject: string,
    body: string,
    organizationId: string
  ): Promise<{ success: number; failed: number }> {
    // Si la campaña está programada, guardar sin enviar
    if (campaign.scheduledAt) {
      campaign.status = 'scheduled';
      campaign.stats = { sent: 0, delivered: 0, read: 0, failed: 0 };
      await this.updateCampaign(campaign, organizationId);
      console.log(`Email campaign scheduled for ${campaign.scheduledAt.toISOString()}`);
      return { success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;

    campaign.status = 'sending';
    campaign.stats = { sent: 0, delivered: 0, read: 0, failed: 0 };
    await this.updateCampaign(campaign, organizationId);

    for (const contact of recipients) {
      try {
        if (!contact.email) {
          console.warn(`Contact ${contact.id} has no email, skipping`);
          failed++;
          continue;
        }

        const personalizedSubject = this.replaceVariables(subject, contact);
        const personalizedBody = this.replaceVariables(body, contact);

        console.log(`Sending email to ${contact.email}:`, { personalizedSubject });
        
        // Envío real via gmail-send Edge Function
        const { data, error } = await supabase.functions.invoke('gmail-send', {
          body: {
            organization_id: organizationId,
            to: contact.email,
            subject: personalizedSubject,
            body: personalizedBody,
          }
        });

        if (error || data?.error) {
          console.error(`Email failed for ${contact.email}:`, error || data?.error);
          failed++;
        } else {
          success++;
        }
      } catch (err) {
        console.error(`Exception sending email to ${contact.email}:`, err);
        failed++;
      }
      
      if (campaign.stats) {
        campaign.stats.sent = success;
        campaign.stats.failed = failed;
        await this.updateCampaign(campaign, organizationId);
      }
    }

    campaign.status = 'sent';
    campaign.sentAt = new Date();
    await this.updateCampaign(campaign, organizationId);

    return { success, failed };
  },

  // 5. Actualizar campaña
  async updateCampaign(campaign: Campaign, organizationId: string): Promise<void> {
    try {
      const campaignData = {
        status: campaign.status,
        stats: campaign.stats,
        sent_at: campaign.sentAt?.toISOString(),
        scheduled_at: campaign.scheduledAt?.toISOString()
      };

      const { error } = await supabase
        .from('campaigns')
        .update(campaignData)
        .eq('id', campaign.id)
        .eq('organization_id', organizationId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating campaign:', error);
      throw error;
    }
  },

  // 6. Eliminar campaña
  async deleteCampaign(id: string, organizationId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting campaign:', error);
      throw error;
    }
  }
};
