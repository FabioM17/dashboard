
import { Message } from '../types';
import { supabase } from './supabaseClient';

export const generateSmartReply = async (
  conversationContext: Message[], 
  customerName: string
): Promise<string> => {
  try {
    const recentMessages = conversationContext.slice(-5); // Look at last 5 messages
    
    // Invocamos la función backend "gemini-generate"
    // Esta función leerá la API Key y el System Instruction seguros de la DB
    const { data, error } = await supabase.functions.invoke('gemini-generate', {
      body: {
        conversation: recentMessages.map(msg => ({
          role: msg.isIncoming ? 'user' : 'model',
          text: msg.text
        })),
        customer_name: customerName,
        // Podemos añadir más contexto aquí si es necesario
      }
    });

    if (error) {
      console.error("Function Error:", error);
      throw error;
    }

    return data.reply || "I apologize, I couldn't generate a suggestion.";
    
  } catch (error) {
    console.error("Gemini Service Error:", error);
    return "AI features are unavailable. Please check your configuration in Settings > AI Agent.";
  }
};
