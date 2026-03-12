import { supabase } from './supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CRMFormField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'select' | 'date' | 'time' | 'textarea';
  required: boolean;
  placeholder: string;
  options?: string[];
  isBase: boolean;
}

export interface FormStyle {
  bgColor: string;
  cardBgColor: string;
  primaryColor: string;
  textColor: string;
  labelColor: string;
  borderColor: string;
  borderRadius: string;
  fontFamily: string;
  submitLabel: string;
  successMessage: string;
  errorMessage: string;
  showTitle: boolean;
  titleText: string;
  subtitleText: string;
}

export interface CRMForm {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  fields: CRMFormField[];
  style: FormStyle;
  allowed_origins: string[];
  is_active: boolean;
  submission_count: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCRMFormInput {
  organization_id: string;
  name: string;
  description?: string;
  fields: CRMFormField[];
  style: FormStyle;
  allowed_origins?: string[];
  created_by?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUPABASE_BASE = (() => {
  // In Vite/browser: environment variables via import.meta.env
  // Fallback to known URL
  try {
    return (import.meta as any).env?.VITE_SUPABASE_URL || 'https://gfavwcnokzypvazyoqod.supabase.co';
  } catch {
    return 'https://gfavwcnokzypvazyoqod.supabase.co';
  }
})();

export function getFormSubmitUrl(formId: string): string {
  return `${SUPABASE_BASE}/functions/v1/form-submit/${formId}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const formService = {

  /**
   * Get all forms for an organization.
   */
  async getForms(organizationId: string): Promise<CRMForm[]> {
    const { data, error } = await supabase
      .from('crm_forms')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as CRMForm[];
  },

  /**
   * Get a single form by id, scoped to organization.
   */
  async getForm(id: string, organizationId: string): Promise<CRMForm | null> {
    const { data, error } = await supabase
      .from('crm_forms')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // not found
      throw error;
    }
    return data as CRMForm;
  },

  /**
   * Create a new form.
   */
  async createForm(input: CreateCRMFormInput): Promise<CRMForm> {
    const { data, error } = await supabase
      .from('crm_forms')
      .insert({
        organization_id: input.organization_id,
        name: input.name,
        description: input.description || '',
        fields: input.fields,
        style: input.style,
        allowed_origins: input.allowed_origins || [],
        is_active: true,
        submission_count: 0,
        created_by: input.created_by || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data as CRMForm;
  },

  /**
   * Update an existing form. Scoped to organization for safety.
   */
  async updateForm(
    id: string,
    organizationId: string,
    patch: Partial<Pick<CRMForm, 'name' | 'description' | 'fields' | 'style' | 'allowed_origins' | 'is_active'>>
  ): Promise<CRMForm> {
    const { data, error } = await supabase
      .from('crm_forms')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)  // ensures cross-org access is impossible
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('Form not found or not authorized');
    return data as CRMForm;
  },

  /**
   * Delete a form. Scoped to organization.
   */
  async deleteForm(id: string, organizationId: string): Promise<void> {
    const { error } = await supabase
      .from('crm_forms')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;
  },

  /**
   * Toggle a form active/inactive without full update.
   */
  async toggleActive(id: string, organizationId: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('crm_forms')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;
  },
};
