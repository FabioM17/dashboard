import { supabase } from './supabaseClient';

export interface TaskBoardPhase {
  id: string;       // text key — also used as tasks.status value
  label: string;
  color: string;
  position: number;
}

const DEFAULT_PHASES: TaskBoardPhase[] = [
  { id: 'todo',        label: 'Pendiente',  color: 'bg-slate-500', position: 0 },
  { id: 'in_progress', label: 'En Proceso', color: 'bg-blue-500',  position: 1 },
  { id: 'done',        label: 'Completado', color: 'bg-green-500', position: 2 },
];

export const taskBoardService = {
  /**
   * Returns the phases for an organization ordered by position.
   * Falls back to DEFAULT_PHASES when none are found.
   */
  async getPhases(organizationId: string): Promise<TaskBoardPhase[]> {
    if (!organizationId) return DEFAULT_PHASES;

    const { data, error } = await supabase
      .from('task_board_phases')
      .select('id, label, color, position')
      .eq('organization_id', organizationId)
      .order('position', { ascending: true });

    if (error) {
      console.error('taskBoardService.getPhases error:', error);
      return DEFAULT_PHASES;
    }

    return data && data.length > 0
      ? (data as TaskBoardPhase[])
      : DEFAULT_PHASES;
  },

  /**
   * Replaces all phases for an organization with the given array.
   * Deletes phases not in the new list, upserts the rest.
   */
  async savePhases(organizationId: string, phases: TaskBoardPhase[]): Promise<void> {
    if (!organizationId) return;

    // Upsert all current phases
    const rows = phases.map((p, i) => ({
      id: p.id,
      organization_id: organizationId,
      label: p.label,
      color: p.color,
      position: i,
    }));

    const { error: upsertError } = await supabase
      .from('task_board_phases')
      .upsert(rows, { onConflict: 'id,organization_id' });

    if (upsertError) {
      console.error('taskBoardService.savePhases upsert error:', upsertError);
      return;
    }

    // Delete phases that are no longer in the list
    const keepIds = phases.map(p => p.id);
    const { error: deleteError } = await supabase
      .from('task_board_phases')
      .delete()
      .eq('organization_id', organizationId)
      .not('id', 'in', `(${keepIds.map(id => `"${id}"`).join(',')})`);

    if (deleteError) {
      console.error('taskBoardService.savePhases delete error:', deleteError);
    }
  },

  getDefaultPhases(): TaskBoardPhase[] {
    return DEFAULT_PHASES;
  },
};
