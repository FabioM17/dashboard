
import { supabase } from './supabaseClient';
import { Snippet } from '../types';

export const snippetService = {
  
  // 1. Obtener Snippets de la organización
  async getSnippets(organizationId: string | undefined): Promise<Snippet[]> {
    if (!organizationId) return [];
    const { data, error } = await supabase
      .from('snippets')
      .select('*')
      .eq('organization_id', organizationId)
      .order('shortcut', { ascending: true });

    if (error) {
      console.error("Error fetching snippets:", error);
      return [];
    }

    return data.map((s: any) => ({
      id: s.id,
      shortcut: s.shortcut,
      content: s.content
    }));
  },

  // 2. Crear un nuevo snippet
  async createSnippet(shortcut: string, content: string, organizationId: string) {
    // Asegurar que el atajo empiece con "/"
    const formattedShortcut = shortcut.startsWith('/') ? shortcut : `/${shortcut}`;

    const { error } = await supabase.from('snippets').insert({
      organization_id: organizationId,
      shortcut: formattedShortcut,
      content: content
    });

    if (error) throw error;
  },

  // 3. Eliminar snippet
  async deleteSnippet(id: string, organizationId: string) {
    if (!organizationId) throw new Error("Organization ID required");
    const { error } = await supabase
      .from('snippets')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);
    if (error) throw error;
  },

  // 4. GENERAR EJEMPLOS (Seed)
  // Esto llena la base de datos con ejemplos útiles si está vacía
  async seedDefaults(organizationId: string) {
      const defaults = [
          { shortcut: '/hi', content: 'Hello! 👋 How can I help you today?' },
          { shortcut: '/bye', content: 'Thank you for contacting us. Have a wonderful day!' },
          { shortcut: '/price', content: 'Our standard plan starts at $29/month. You can view full pricing at docrechat.com/pricing' },
          { shortcut: '/refund', content: 'To process a refund, please provide your Order ID and reason for return.' },
          { shortcut: '/hours', content: 'Our support hours are Mon-Fri, 9AM to 6PM EST.' }
      ];

      const { error } = await supabase.from('snippets').insert(
          defaults.map(d => ({
              organization_id: organizationId,
              shortcut: d.shortcut,
              content: d.content
          }))
      );

      if (error) throw error;
  }
};
