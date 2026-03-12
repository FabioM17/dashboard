import { Message, AIProvider, AIProviderConfig } from '../types';
import { supabase } from './supabaseClient';

export const aiService = {
  
  /**
   * Genera una respuesta inteligente usando el proveedor de IA configurado
   */
  async generateSmartReply(
    conversationContext: Message[], 
    customerName: string,
    organizationId: string
  ): Promise<string> {
    try {
      const config = await this.getAIConfig(organizationId);
      if (!config || !config.activeProvider) {
        throw new Error('No AI provider configured. Please set one in Settings > AI.');
      }

      const recentMessages = conversationContext.slice(-5); // Last 5 messages

      const prompts = await this.getSystemPrompts(organizationId);

      // Invoke the generic ai-generate function with provider info
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: {
          provider: config.activeProvider,
          task_type: 'chat_reply',
          conversation: recentMessages.map(msg => ({
            role: msg.isIncoming ? 'user' : 'assistant',
            text: msg.text
          })),
          customer_name: customerName,
          system_instruction: prompts.chat_reply || config.providers[config.activeProvider]?.systemInstruction || config.defaultSystemInstruction,
        }
      });

      if (error) {
        console.error("AI Function Error:", error);
        throw error;
      }

      return data.reply || "I apologize, I couldn't generate a suggestion.";
      
    } catch (error) {
      console.error("AI Service Error:", error);
      return "AI features are unavailable. Please check your configuration in Settings > AI.";
    }
  },

  /**
   * Guarda la configuración de un proveedor de IA
   */
  async saveAIProviderConfig(
    organizationId: string,
    provider: AIProvider,
    config: Partial<AIProviderConfig>
  ) {
    if (!organizationId) throw new Error("Organization ID is required");
    
    const { error } = await supabase
      .from('integration_settings')
      .upsert({ 
        organization_id: organizationId,
        service_name: `ai_provider_${provider}`, 
        credentials: {
          provider,
          apiKey: config.apiKey,
          systemInstruction: config.systemInstruction,
          modelId: config.modelId,
          isActive: config.isActive ?? false
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'organization_id, service_name' });
    
    if (error) throw error;
  },

  /**
   * Obtiene la configuración de un proveedor específico
   */
  async getAIProviderConfig(
    organizationId: string,
    provider: AIProvider
  ): Promise<AIProviderConfig | null> {
    if (!organizationId) return null;
    
    const { data, error } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organizationId)
      .eq('service_name', `ai_provider_${provider}`)
      .single()
      .returns<{ credentials: any }>();
    
    if (error) return null;
    return data?.credentials as AIProviderConfig;
  },

  /**
   * Obtiene toda la configuración de IA (todos los proveedores)
   */
  async getAIConfig(organizationId: string) {
    if (!organizationId) return null;
    
    const { data, error } = await supabase
      .from('integration_settings')
      .select('service_name, credentials')
      .eq('organization_id', organizationId)
      .like('service_name', 'ai_provider_%');
    
    if (error || !data) return null;

    const providers: Record<AIProvider, AIProviderConfig> = {
      gemini: { provider: 'gemini', apiKey: '', isActive: false },
      openai: { provider: 'openai', apiKey: '', isActive: false },
      claude: { provider: 'claude', apiKey: '', isActive: false },
      custom: { provider: 'custom', apiKey: '', isActive: false }
    };

    let activeProvider: AIProvider = 'gemini';
    let defaultSystemInstruction = 'You are a helpful assistant.';

    data.forEach((row: any) => {
      const providerName = row.service_name.replace('ai_provider_', '') as AIProvider;
      const credentials = row.credentials as AIProviderConfig;
      
      if (providers[providerName]) {
        providers[providerName] = credentials;
        if (credentials.isActive) {
          activeProvider = providerName;
          defaultSystemInstruction = credentials.systemInstruction || 'You are a helpful assistant.';
        }
      }
    });

    return {
      activeProvider,
      providers,
      defaultSystemInstruction
    };
  },

  /**
   * Activa un proveedor específico
   */
  async setActiveProvider(organizationId: string, provider: AIProvider) {
    if (!organizationId) throw new Error("Organization ID is required");

    // Desactivar todos los proveedores
    const allProviders: AIProvider[] = ['gemini', 'openai', 'claude', 'custom'];
    for (const prov of allProviders) {
      const current = await this.getAIProviderConfig(organizationId, prov);
      if (current) {
        await this.saveAIProviderConfig(organizationId, prov, {
          ...current,
          isActive: false
        });
      }
    }

    // Activar el proveedor seleccionado
    const selected = await this.getAIProviderConfig(organizationId, provider);
    if (selected) {
      await this.saveAIProviderConfig(organizationId, provider, {
        ...selected,
        isActive: true
      });
    }
  },

  /**
   * Obtiene lista de proveedores configurados
   */
  async getConfiguredProviders(organizationId: string): Promise<AIProvider[]> {
    const config = await this.getAIConfig(organizationId);
    if (!config) return [];
    
    return Object.keys(config.providers).filter(
      key => config.providers[key as AIProvider].apiKey
    ) as AIProvider[];
  },

  /**
   * Test de conexión a un proveedor
   */
  async testProvider(organizationId: string, provider: AIProvider): Promise<boolean> {
    try {
      const config = await this.getAIProviderConfig(organizationId, provider);
      if (!config?.apiKey) return false;

      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: {
          provider,
          conversation: [{ role: 'user', text: 'test' }],
          customer_name: 'Test User',
          system_instruction: 'Respond with: Test successful',
          isTest: true
        }
      });

      return !error && !!data?.reply;
    } catch (error) {
      console.error(`Test failed for ${provider}:`, error);
      return false;
    }
  },

  /**
   * Obtiene lista de modelos disponibles para un proveedor.
   * Si se pasa apiKeyPreview, la usa en lugar de la guardada en DB.
   */
  async fetchModels(
    organizationId: string,
    provider: AIProvider,
    apiKeyPreview?: string
  ): Promise<string[]> {
    try {
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: { action: 'list_models', provider, apiKeyPreview },
      });
      if (error || !data?.models) return [];
      return data.models as string[];
    } catch {
      return [];
    }
  },

  /**
   * Genera un análisis de IA para un contacto del CRM.
   * insightType:
   *  'summary'     – resumen del perfil del contacto
   *  'suggestions' – acciones recomendadas para avanzar la relación
   *  'next_action' – siguiente mensaje / follow-up sugerido
   */
  async generateCRMInsight(
    contact: { name: string; email?: string; phone?: string; company?: string; pipelineStageId?: string; properties?: Record<string, any> },
    recentMessages: Array<{ text: string; isIncoming: boolean }>,
    organizationId: string,
    insightType: 'summary' | 'suggestions' | 'next_action' = 'summary'
  ): Promise<string> {
    try {
      const [config, prompts] = await Promise.all([
        this.getAIConfig(organizationId),
        this.getSystemPrompts(organizationId),
      ]);
      if (!config || !config.activeProvider) {
        throw new Error('No AI provider configured. Please set one in Settings > AI.');
      }

      const promptKey = insightType === 'summary' ? 'crm_summary'
        : insightType === 'suggestions' ? 'crm_suggestions'
        : 'crm_next_action';

      const propsText = contact.properties && Object.keys(contact.properties).length > 0
        ? '\nPropiedades adicionales:\n' +
          Object.entries(contact.properties)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `  ${k}: ${v}`)
            .join('\n')
        : '';

      const contactContext =
        `Nombre: ${contact.name}` +
        `\nEmail: ${contact.email || 'N/A'}` +
        `\nTeléfono: ${contact.phone || 'N/A'}` +
        `\nEmpresa: ${contact.company || 'N/A'}` +
        `\nEtapa del pipeline: ${contact.pipelineStageId || 'N/A'}` +
        propsText;

      const conversation = [
        { role: 'user' as const, text: `Información del contacto:\n${contactContext}` },
        ...recentMessages.slice(-6).map((m) => ({
          role: (m.isIncoming ? 'user' : 'assistant') as 'user' | 'assistant',
          text: m.text,
        })),
      ];

      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: {
          provider: config.activeProvider,
          task_type: 'crm_insight',
          conversation,
          customer_name: contact.name,
          system_instruction: prompts[promptKey],
        },
      });

      if (error) throw error;
      return data?.reply || 'No se pudo generar el análisis.';
    } catch (error) {
      console.error('CRM AI Insight Error:', error);
      return 'Error al generar análisis. Verifica tu configuración de IA en Ajustes > IA.';
    }
  },

  // ── DEFAULT SYSTEM PROMPTS ─────────────────────────────────────────────────

  DEFAULT_PROMPTS: {
    chat_reply:
      'Eres un asistente de atención al cliente profesional, amable y conciso. Tu objetivo es ayudar al agente a responder al cliente de forma clara, empática y orientada a resolver su necesidad. Responde en el mismo idioma que el cliente.',
    crm_summary:
      'Eres un asistente de CRM. Genera un resumen profesional y conciso del perfil de este contacto, destacando la información más relevante para el equipo de ventas o soporte. Usa viñetas cuando sea útil. Responde en el mismo idioma que la información proporcionada.',
    crm_suggestions:
      'Eres un asistente de CRM. Basándote en el perfil e historial del contacto, sugiere 3-5 acciones concretas y priorizadas que el equipo debería tomar para avanzar esta relación comercial. Enumera cada acción con su justificación. Responde en el mismo idioma que la información.',
    crm_next_action:
      'Eres un asistente de CRM. Basándote en la conversación más reciente, redacta el siguiente mensaje de seguimiento ideal que el agente debería enviar. Debe ser personalizado, breve y orientado a resultados. Responde en el mismo idioma que la conversación.',
    crm_bulk_analysis:
      'Eres un analista de negocio experto en CRM y ventas. Analiza el siguiente conjunto de contactos y genera: 1) Un resumen ejecutivo del estado general del pipeline, 2) Los segmentos de clientes más relevantes, 3) Las 5-7 oportunidades de negocio más prioritarias con justificación, 4) Riesgos o cuellos de botella detectados, 5) Recomendaciones estratégicas accionables. Sé exhaustivo y específico. Responde en español.',
  } as Record<string, string>,

  /**
   * Obtiene los prompts del sistema configurados para la organización.
   * Devuelve los defaults si aún no existe configuración.
   */
  async getSystemPrompts(organizationId: string): Promise<Record<string, string>> {
    if (!organizationId) return { ...this.DEFAULT_PROMPTS };
    const { data } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organizationId)
      .eq('service_name', 'ai_system_prompts')
      .single()
      .returns<{ credentials: Record<string, string> }>();
    const saved: Record<string, string> = (data?.credentials as Record<string, string>) || {};
    // Merge with defaults so new prompts always have a fallback
    return { ...this.DEFAULT_PROMPTS, ...saved };
  },

  /**
   * Guarda los prompts del sistema para la organización.
   */
  async saveSystemPrompts(organizationId: string, prompts: Record<string, string>): Promise<void> {
    if (!organizationId) throw new Error('Organization ID is required');
    const { error } = await supabase
      .from('integration_settings')
      .upsert(
        { organization_id: organizationId, service_name: 'ai_system_prompts', credentials: prompts, updated_at: new Date().toISOString() },
        { onConflict: 'organization_id, service_name' }
      );
    if (error) throw error;
  },

  /**
   * Análisis masivo del CRM.
   * Estrategia de optimización de costos:
   *  1. Se minimizan los datos enviados por contacto (solo campos relevantes).
   *  2. Si hay más de CHUNK_SIZE contactos, se procesan en chunks y luego
   *     se hace una síntesis final. Cada chunk devuelve un mini-resumen que
   *     se concatena para el prompt de síntesis.
   *  3. El usuario puede filtrar por etapa de pipeline para reducir volumen.
   */
  async analyzeCRM(
    contacts: Array<{
      name: string;
      email?: string;
      phone?: string;
      company?: string;
      pipelineStageId?: string;
      properties?: Record<string, any>;
    }>,
    organizationId: string,
    analysisType: 'full' | 'opportunities' | 'risks' | 'segmentation' = 'full'
  ): Promise<{ result: string; chunksUsed: number; contactsAnalyzed: number }> {
    const config = await this.getAIConfig(organizationId);
    if (!config || !config.activeProvider) {
      throw new Error('No AI provider configured. Please set one in Settings > AI.');
    }

    const prompts = await this.getSystemPrompts(organizationId);
    const basePrompt = prompts.crm_bulk_analysis;

    const analysisTypeInstructions: Record<string, string> = {
      full: 'Realiza un análisis completo del CRM: pipeline, segmentos, oportunidades, riesgos y recomendaciones estratégicas.',
      opportunities: 'Enfócate exclusivamente en identificar y priorizar oportunidades de negocio y leads con mayor potencial de conversión.',
      risks: 'Enfócate exclusivamente en detectar riesgos: clientes en riesgo de abandono, deals estancados, problemas recurrentes.',
      segmentation: 'Realiza una segmentación detallada de los contactos por comportamiento, valor potencial y etapa del ciclo de vida.',
    };

    const CHUNK_SIZE = 30;

    // Serialize each contact to minimal token-efficient text
    const serializeContact = (c: typeof contacts[0], idx: number) =>
      `[${idx + 1}] ${c.name}` +
      (c.company ? ` (${c.company})` : '') +
      (c.pipelineStageId ? ` | Etapa: ${c.pipelineStageId}` : '') +
      (c.email ? ` | email: ${c.email}` : '') +
      (c.phone ? ` | tel: ${c.phone}` : '');

    const callAI = async (prompt: string): Promise<string> => {
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: {
          provider: config.activeProvider,
          task_type: 'bulk_analysis',
          conversation: [{ role: 'user', text: prompt }],
          customer_name: 'CRM Analysis',
          system_instruction: basePrompt,
        },
      });
      if (error) throw error;
      return data?.reply || '';
    };

    if (contacts.length <= CHUNK_SIZE) {
      // Single pass — fits in one request
      const contactList = contacts.map(serializeContact).join('\n');
      const prompt =
        `${analysisTypeInstructions[analysisType]}\n\nTotal de contactos: ${contacts.length}\n\nListado de contactos:\n${contactList}`;
      const result = await callAI(prompt);
      return { result, chunksUsed: 1, contactsAnalyzed: contacts.length };
    }

    // Multi-chunk strategy: summarize each chunk, then synthesize
    const chunks: typeof contacts[] = [];
    for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
      chunks.push(contacts.slice(i, i + CHUNK_SIZE));
    }

    const chunkSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const contactList = chunk.map((c, idx) => serializeContact(c, i * CHUNK_SIZE + idx)).join('\n');
      const chunkPrompt =
        `Resumen parcial (grupo ${i + 1} de ${chunks.length}, contactos ${i * CHUNK_SIZE + 1}-${i * CHUNK_SIZE + chunk.length}):\n` +
        `Genera un resumen ejecutivo muy conciso (máx 200 palabras) de este subgrupo de contactos.\n\n${contactList}`;
      const summary = await callAI(chunkPrompt);
      chunkSummaries.push(`--- Grupo ${i + 1} (${chunk.length} contactos) ---\n${summary}`);
    }

    // Final synthesis pass
    const synthesisPrompt =
      `${analysisTypeInstructions[analysisType]}\n\n` +
      `Total de contactos analizados: ${contacts.length} (procesados en ${chunks.length} grupos).\n\n` +
      `Resúmenes por grupo:\n${chunkSummaries.join('\n\n')}\n\n` +
      `Basándote en todos los resúmenes anteriores, genera el análisis final consolidado.`;
    const result = await callAI(synthesisPrompt);
    return { result, chunksUsed: chunks.length + 1, contactsAnalyzed: contacts.length };
  },
};
