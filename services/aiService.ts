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

      // Invoke the generic ai-generate function with provider info
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: {
          provider: config.activeProvider,
          conversation: recentMessages.map(msg => ({
            role: msg.isIncoming ? 'user' : 'assistant',
            text: msg.text
          })),
          customer_name: customerName,
          system_instruction: config.providers[config.activeProvider]?.systemInstruction || config.defaultSystemInstruction,
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
  }
};
