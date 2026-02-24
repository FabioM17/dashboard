import { supabase } from './supabaseClient';
import { Workflow, WorkflowStep, WorkflowStepChannel, WorkflowEnrollment, Template } from '../types';

export const workflowService = {
  /**
   * Get all workflows for organization
   */
  async getWorkflows(organizationId: string): Promise<Workflow[]> {
    try {
      const { data, error } = await supabase.functions.invoke('workflows-manage?action=list', {
        body: { organization_id: organizationId }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return (data.workflows || []).map((w: any) => ({
        id: w.id,
        organizationId: w.organization_id,
        name: w.name,
        listId: w.list_id,
        isActive: w.is_active,
        createdAt: new Date(w.created_at),
        updatedAt: new Date(w.updated_at),
        createdBy: w.created_by,
        list: w.lists ? {
          id: w.lists.id,
          name: w.lists.name,
          filters: [],
          manualContactIds: [],
          createdAt: new Date()
        } : undefined,
        stats: w.stats ? {
          activeEnrollments: w.stats.active_enrollments || 0,
          completedEnrollments: w.stats.completed_enrollments || 0,
          failedEnrollments: w.stats.failed_enrollments || 0
        } : undefined
      }));
    } catch (error) {
      console.error('Error fetching workflows:', error);
      throw error;
    }
  },

  /**
   * Get workflow details with steps and enrollments
   */
  async getWorkflowDetails(workflowId: string): Promise<Workflow> {
    try {
      const { data, error } = await supabase.functions.invoke(
        `workflows-manage?action=details&id=${workflowId}`,
        { method: 'GET' }
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const w = data.workflow;
      return {
        id: w.id,
        organizationId: w.organization_id,
        name: w.name,
        listId: w.list_id,
        isActive: w.is_active,
        createdAt: new Date(w.created_at),
        updatedAt: new Date(w.updated_at),
        createdBy: w.created_by,
        list: w.lists ? {
          id: w.lists.id,
          name: w.lists.name,
          filters: w.lists.filters || [],
          manualContactIds: w.lists.manual_contact_ids || [],
          inactiveContactIds: w.lists.inactive_contact_ids || [],
          createdAt: new Date()
        } : undefined,
        steps: (w.workflow_steps || []).map((s: any) => ({
          id: s.id,
          stepOrder: s.step_order,
          channel: (s.channel || 'whatsapp') as WorkflowStepChannel,
          templateId: s.template_id,
          templateName: s.template_name,
          emailSubject: s.email_subject,
          emailBody: s.email_body,
          variableMappings: s.variable_mappings || [],
          delayDays: s.delay_days,
          sendTime: s.send_time ? workflowService.utcTimeToLocal(s.send_time) : null,
          template: s.meta_templates ? {
            id: s.meta_templates.id,
            name: s.meta_templates.name,
            body: s.meta_templates.body,
            language: s.meta_templates.language,
            status: s.meta_templates.status,
            category: 'marketing'
          } : undefined
        })),
        enrollments: (w.enrollments || []).map((e: any) => ({
          id: e.id,
          workflowId: e.workflow_id,
          contactId: e.contact_id,
          organizationId: e.organization_id,
          currentStep: e.current_step,
          status: e.status,
          enrolledAt: new Date(e.enrolled_at),
          nextSendAt: e.next_send_at ? new Date(e.next_send_at) : undefined,
          completedAt: e.completed_at ? new Date(e.completed_at) : undefined,
          lastError: e.last_error,
          retryCount: e.retry_count || 0,
          contact: e.crm_contacts ? {
            id: e.crm_contacts.id,
            organizationId: w.organization_id,
            name: e.crm_contacts.name,
            email: e.crm_contacts.email,
            phone: e.crm_contacts.phone,
            company: e.crm_contacts.company,
            customProperties: e.crm_contacts.custom_properties || {},
            createdAt: new Date(),
            avatar_url: e.crm_contacts.avatar_url
          } : undefined
        }))
      };
    } catch (error) {
      console.error('Error fetching workflow details:', error);
      throw error;
    }
  },

  /**
   * Create a new workflow
   */
  async createWorkflow(
    organizationId: string,
    name: string,
    listId: string,
    steps: Array<{
      channel?: WorkflowStepChannel;
      templateId?: string;
      templateName?: string;
      emailSubject?: string;
      emailBody?: string;
      variableMappings?: Array<{ variable: string; source: 'property' | 'manual'; value: string }>;
      delayDays: number;
      sendTime?: string | null;
      stepOrder: number;
    }>,
    isActive: boolean = false,
    createdBy?: string
  ): Promise<Workflow> {
    try {
      // Transform steps to snake_case for Edge Function
      const stepsSnakeCase = steps.map(step => ({
        channel: step.channel || 'whatsapp',
        template_id: step.templateId || null,
        template_name: step.templateName || null,
        email_subject: step.emailSubject || null,
        email_body: step.emailBody || null,
        variable_mappings: step.variableMappings || [],
        delay_days: step.delayDays,
        send_time: step.sendTime ? workflowService.localTimeToUTC(step.sendTime) : null,
        step_order: step.stepOrder
      }));

      const { data, error } = await supabase.functions.invoke('workflows-manage?action=create', {
        body: {
          organization_id: organizationId,
          name,
          list_id: listId,
          steps: stepsSnakeCase,
          is_active: isActive,
          created_by: createdBy
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const w = data.workflow;
      return {
        id: w.id,
        organizationId: w.organization_id,
        name: w.name,
        listId: w.list_id,
        isActive: w.is_active,
        createdAt: new Date(w.created_at),
        updatedAt: new Date(w.updated_at),
        createdBy: w.created_by
      };
    } catch (error) {
      console.error('Error creating workflow:', error);
      throw error;
    }
  },

  /**
   * Update workflow (name or active status)
   */
  async updateWorkflow(
    workflowId: string,
    organizationId: string,
    updates: { name?: string; isActive?: boolean }
  ): Promise<Workflow> {
    try {
      const { data, error } = await supabase.functions.invoke('workflows-manage?action=update', {
        body: {
          workflow_id: workflowId,
          organization_id: organizationId,
          name: updates.name,
          is_active: updates.isActive
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const w = data.workflow;
      return {
        id: w.id,
        organizationId: w.organization_id,
        name: w.name,
        listId: w.list_id,
        isActive: w.is_active,
        createdAt: new Date(w.created_at),
        updatedAt: new Date(w.updated_at),
        createdBy: w.created_by
      };
    } catch (error) {
      console.error('Error updating workflow:', error);
      throw error;
    }
  },

  /**
   * Delete workflow
   */
  async deleteWorkflow(workflowId: string, organizationId: string): Promise<void> {
    try {
      const { data, error } = await supabase.functions.invoke('workflows-manage?action=delete', {
        body: {
          workflow_id: workflowId,
          organization_id: organizationId
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    } catch (error) {
      console.error('Error deleting workflow:', error);
      throw error;
    }
  },

  /**
   * Manually enroll contact(s) in workflow
   */
  async enrollContacts(
    workflowId: string,
    organizationId: string,
    contactIds: string[]
  ): Promise<number> {
    try {
      const { data, error } = await supabase.functions.invoke('workflows-manage?action=enroll', {
        body: {
          workflow_id: workflowId,
          organization_id: organizationId,
          contact_ids: contactIds
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data.enrolled || 0;
    } catch (error) {
      console.error('Error enrolling contacts:', error);
      throw error;
    }
  },

  /**
   * Unenroll (remove) contact from workflow
   */
  async unenrollContact(enrollmentId: string, organizationId: string): Promise<void> {
    try {
      const { data, error } = await supabase.functions.invoke('workflows-manage?action=unenroll', {
        body: {
          enrollment_id: enrollmentId,
          organization_id: organizationId
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    } catch (error) {
      console.error('Error unenrolling contact:', error);
      throw error;
    }
  },

  /**
   * Extract template variables from a template body
   * Returns variable names found in {{variable}} format
   */
  extractTemplateVariables(templateBody: string): string[] {
    const matches = templateBody.match(/\{\{(\w+)\}\}/g) || [];
    return matches.map(m => m.replace(/[\{\}]/g, ''));
  },

  /**
   * Get available contact fields for variable mapping
   */
  getAvailableContactFields(): Array<{ name: string; label: string }> {
    return [
      { name: 'name', label: 'Nombre' },
      { name: 'email', label: 'Email' },
      { name: 'phone', label: 'Teléfono' },
      { name: 'company', label: 'Empresa' }
      // Custom properties would be added dynamically
    ];
  },

  /**
   * Convert local time "HH:MM" to UTC "HH:MM"
   * Uses the browser's timezone for conversion
   */
  localTimeToUTC(localTime: string): string {
    if (!localTime || !/^\d{2}:\d{2}$/.test(localTime)) return localTime;
    const [h, m] = localTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
  },

  /**
   * Convert UTC time "HH:MM" back to local time "HH:MM" for display
   */
  utcTimeToLocal(utcTime: string): string {
    if (!utcTime || !/^\d{2}:\d{2}$/.test(utcTime)) return utcTime;
    const [h, m] = utcTime.split(':').map(Number);
    const d = new Date();
    d.setUTCHours(h, m, 0, 0);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
};
