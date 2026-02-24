
import { supabase } from './supabaseClient';
import { Task, TaskStatus } from '../types';

export const taskService = {
  async getTasks(organizationId: string): Promise<Task[]> {
    if (!organizationId) {
      console.error('Organization ID required for getTasks');
      return [];
    }

    // Join with conversations table to get contact_name
    const { data, error } = await supabase
      .from('tasks')
      .select('*, conversations(contact_name)')
      .eq('organization_id', organizationId);
      
    if (error) { console.error(error); return []; }
    
    return data.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      assigneeId: t.assignee_id,
      conversationId: t.conversation_id,
      clientName: t.conversations?.contact_name || 'General Task', // Populate client name
      status: t.status as TaskStatus,
      dueDate: new Date(t.due_date)
    }));
  },

  async createTask(task: Task, organizationId: string, notifyAssignee = true) {
     const { data, error } = await supabase.from('tasks').insert({
         organization_id: organizationId,
         title: task.title,
         description: task.description,
         status: task.status,
         assignee_id: task.assigneeId,
         conversation_id: task.conversationId,
         due_date: task.dueDate.toISOString()
     }).select().single();
     
     if(error) throw error;
     // After creating the task, optionally send a notification to the assignee (if email available)
     try {
       // Fetch assignee profile
      if (data?.assignee_id) {
         const { data: profile } = await supabase
           .from('profiles')
           .select('email, full_name')
           .eq('id', data.assignee_id)
           .single();

        if (profile?.email && notifyAssignee) {
          // Invoke Edge Function to send notification email
          try {
            await supabase.functions.invoke('app-notifications', {
              body: {
                to: profile.email,
                subject: `Nueva tarea asignada: ${data.title}`,
                html: `<p>Hola ${profile.full_name || ''},</p><p>Se te ha asignado la tarea: <strong>${data.title}</strong>.</p><p>Descripción: ${data.description || 'Sin descripción'}</p><p>Fecha de vencimiento: ${new Date(data.due_date).toLocaleString()}</p>`,
                organization_id: organizationId
              }
            });
          } catch (fnErr) {
            console.error('Failed to invoke notification function:', fnErr);
          }
        }
       }

       // Schedule a reminder 24 hours before due date (insert into scheduled_notifications)
       if (data?.due_date) {
         const due = new Date(data.due_date);
         const remindAt = new Date(due.getTime() - 24 * 60 * 60 * 1000); // 24h before
         await supabase.from('scheduled_notifications').insert({
           organization_id: organizationId,
           assignee_id: data.assignee_id || null,
           task_id: data.id,
           payload: { type: 'task_due_reminder', task_title: data.title, assignee_id: data.assignee_id || null },
           send_at: remindAt.toISOString(),
           sent: false,
           attempts: 0,
           failed: false,
           last_error: null
         });
       }
     } catch (notifyErr) {
       console.error('Post-create notifications error:', notifyErr);
     }

     return data; // returns created task with real DB ID
  },

    async updateTaskStatus(taskId: string, status: TaskStatus, organizationId: string) {
      if (!organizationId) throw new Error("Organization ID required");
      const { error } = await supabase
       .from('tasks')
       .update({ status })
       .eq('id', taskId)
       .eq('organization_id', organizationId);
     if(error) throw error;
  },

    async deleteTask(taskId: string, organizationId: string) {
      if (!organizationId) throw new Error("Organization ID required");
      const { error } = await supabase
       .from('tasks')
       .delete()
       .eq('id', taskId)
       .eq('organization_id', organizationId);
     if(error) throw error;
  }
};
