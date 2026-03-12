import { supabase } from './supabaseClient';

export interface PipelineStageConfig {
  id: string;      // text key — also used as crm_contacts.pipeline_stage value
  name: string;
  color: string;
  position: number;
}

const DEFAULT_STAGES: PipelineStageConfig[] = [
  { id: 'lead',       name: 'New Lead',     color: 'bg-blue-500',   position: 0 },
  { id: 'contacted',  name: 'Contacted',    color: 'bg-yellow-500', position: 1 },
  { id: 'qualified',  name: 'Qualified',    color: 'bg-purple-500', position: 2 },
  { id: 'closed',     name: 'Closed Won',   color: 'bg-green-500',  position: 3 },
];

const STAGE_COLORS = [
  'bg-slate-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
  'bg-orange-500', 'bg-purple-500', 'bg-pink-500', 'bg-red-500', 'bg-teal-500',
];

export const pipelineStageService = {
  STAGE_COLORS,

  async getStages(organizationId: string): Promise<PipelineStageConfig[]> {
    if (!organizationId) return DEFAULT_STAGES;

    const { data, error } = await supabase
      .from('pipeline_stages')
      .select('id, name, color, position')
      .eq('organization_id', organizationId)
      .order('position', { ascending: true });

    if (error) {
      console.error('pipelineStageService.getStages error:', error);
      return DEFAULT_STAGES;
    }

    return data && data.length > 0
      ? (data as PipelineStageConfig[])
      : DEFAULT_STAGES;
  },

  async saveStages(
    organizationId: string,
    stages: PipelineStageConfig[]
  ): Promise<void> {
    if (!organizationId) return;

    const rows = stages.map((s, i) => ({
      id: s.id,
      organization_id: organizationId,
      name: s.name,
      color: s.color,
      position: i,
    }));

    const { error: upsertError } = await supabase
      .from('pipeline_stages')
      .upsert(rows, { onConflict: 'id,organization_id' });

    if (upsertError) {
      console.error('pipelineStageService.saveStages upsert error:', upsertError);
      return;
    }

    const keepIds = stages.map(s => s.id);
    const { error: deleteError } = await supabase
      .from('pipeline_stages')
      .delete()
      .eq('organization_id', organizationId)
      .not('id', 'in', `(${keepIds.map(id => `"${id}"`).join(',')})`);

    if (deleteError) {
      console.error('pipelineStageService.saveStages delete error:', deleteError);
    }
  },

  getDefaultStages(): PipelineStageConfig[] {
    return DEFAULT_STAGES;
  },
};
