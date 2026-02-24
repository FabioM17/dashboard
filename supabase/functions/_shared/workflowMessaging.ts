// Shared utility functions for workflow messaging
// Reuses logic from process-scheduled-campaigns for WhatsApp sending

export interface ContactData {
  id: string;
  name?: string;
  email?: string;
  phone: string;
  company?: string;
  custom_properties?: Record<string, any>;
}

export interface TemplateData {
  id: string;
  name: string;
  body: string;
  language: string;
}

export interface VariableMappingDef {
  variable: string;
  source: 'property' | 'manual';
  value: string;
}

/**
 * Extract template variables from template body and map to contact data.
 * If variableMappings are provided, use those instead of auto-extraction.
 */
export function extractTemplateVariables(
  templateBody: string,
  contact: ContactData,
  variableMappings?: VariableMappingDef[]
): string[] {
  const varMatches = templateBody.match(/\{\{(\w+)\}\}/g) || [];
  
  // If custom mappings exist and cover all variables, use them
  if (variableMappings && variableMappings.length > 0) {
    return varMatches.map(match => {
      const varName = match.replace(/[\{\}]/g, '');
      const mapping = variableMappings.find(m => m.variable === varName);
      if (!mapping) {
        // Fallback to auto-mapping
        return _resolveContactField(varName, contact);
      }
      if (mapping.source === 'manual') {
        return mapping.value || '';
      }
      // source === 'property' → resolve the property name from contact
      return _resolveContactField(mapping.value, contact);
    });
  }

  // Default: auto-map by variable name
  return varMatches.map(match => {
    const varName = match.replace(/[\{\}]/g, '');
    return _resolveContactField(varName, contact);
  });
}

/**
 * Resolve a field name to a contact value
 */
function _resolveContactField(fieldName: string, contact: ContactData): string {
  if (fieldName === 'name') return contact.name || '';
  if (fieldName === 'email') return contact.email || '';
  if (fieldName === 'phone') return contact.phone || '';
  if (fieldName === 'company') return contact.company || '';
  if (contact.custom_properties?.[fieldName]) return String(contact.custom_properties[fieldName]);
  return '';
}

/**
 * Replace template variables in text with actual values
 */
export function personalizeTemplateText(
  templateBody: string,
  variables: string[]
): string {
  let result = templateBody;
  const varMatches = templateBody.match(/\{\{(\w+)\}\}/g) || [];
  
  varMatches.forEach((match, index) => {
    if (index < variables.length) {
      result = result.replace(match, variables[index]);
    }
  });
  
  return result;
}

/**
 * Send WhatsApp message using template (Direct to Meta API)
 * Returns: { success: boolean, messageId?: string, error?: string }
 */
export async function sendWhatsAppTemplate(
  supabase: any,
  params: {
    organizationId: string;
    contact: ContactData;
    template: TemplateData;
    variableMappings?: VariableMappingDef[];
    metadata?: Record<string, any>;
  }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Get WhatsApp credentials
    const { data: config, error: configError } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', params.organizationId)
      .eq('service_name', 'whatsapp')
      .single();

    if (configError || !config?.credentials) {
      console.error('[workflow-messaging] WhatsApp config not found:', configError);
      return { success: false, error: 'WhatsApp configuration not found' };
    }

    const credentials = config.credentials;
    if (typeof credentials !== 'object' || credentials === null) {
      return { success: false, error: 'Invalid WhatsApp credentials format' };
    }

    const phone_id = String(credentials.phone_id || credentials.phone_number_id || '').trim();
    const access_token = String(credentials.access_token || '').trim();

    if (!phone_id || !access_token) {
      return { success: false, error: 'Missing WhatsApp credentials' };
    }

    // Extract and map template variables (use custom mappings if provided)
    const templateVars = extractTemplateVariables(params.template.body, params.contact, params.variableMappings);
    const personalizedText = personalizeTemplateText(params.template.body, templateVars);

    console.log(`[workflow-messaging] Sending to ${params.contact.phone}, vars: ${templateVars.length}, mappings: ${params.variableMappings?.length || 0}`);

    // Build Meta API payload
    const metaBody: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: params.contact.phone,
      type: "template",
      template: {
        name: params.template.name,
        language: {
          code: params.template.language || "en_US"
        },
        components: []
      }
    };

    // Add template parameters if any
    if (templateVars.length > 0) {
      const templateParams = templateVars.map(v => ({ type: 'text', text: v }));
      (metaBody.template as any).components.push({ type: 'body', parameters: templateParams });
    }

    // Send to Meta
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phone_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${access_token}`
        },
        body: JSON.stringify(metaBody)
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`[workflow-messaging] Meta API error:`, responseData);
      return { 
        success: false, 
        error: responseData.error?.message || 'Meta API request failed' 
      };
    }

    const metaMessageId = responseData.messages?.[0]?.id;
    if (!metaMessageId) {
      return { success: false, error: 'Meta API did not return message ID' };
    }

    console.log(`[workflow-messaging] Sent successfully, wamid: ${metaMessageId}`);

    // Save to database (conversation + message)
    try {
      await saveMessageToDB(supabase, {
        organizationId: params.organizationId,
        contact: params.contact,
        messageText: personalizedText,
        metaMessageId,
        templateName: params.template.name,
        templateLanguage: params.template.language,
        templateVariables: templateVars,
        templateBody: params.template.body,
        metadata: params.metadata
      });
    } catch (dbError: any) {
      console.error('[workflow-messaging] DB save error:', dbError);
      // Don't fail if DB save fails - message was sent to Meta
    }

    return { success: true, messageId: metaMessageId };

  } catch (err: any) {
    console.error('[workflow-messaging] Exception:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Save message to conversations and messages tables
 */
async function saveMessageToDB(
  supabase: any,
  params: {
    organizationId: string;
    contact: ContactData;
    messageText: string;
    metaMessageId: string;
    templateName: string;
    templateLanguage: string;
    templateVariables: string[];
    templateBody: string;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  // Get or create conversation
  let conversationId: string;
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id')
    .eq('contact_phone', params.contact.phone)
    .eq('organization_id', params.organizationId)
    .single();

  if (existingConv) {
    conversationId = existingConv.id;
  } else {
    const { data: newConv, error: createConvError } = await supabase
      .from('conversations')
      .insert({
        organization_id: params.organizationId,
        contact_phone: params.contact.phone,
        contact_name: params.contact.name || params.contact.phone,
        platform: 'whatsapp',
        last_message: params.messageText || params.templateName,
        last_message_time: new Date().toISOString(),
        unread_count: 0,
        lead_id: params.contact.id
      })
      .select()
      .single();

    if (createConvError || !newConv) {
      throw new Error(`Failed to create conversation: ${createConvError?.message}`);
    }
    conversationId = newConv.id;
  }

  // Save message
  const { error: msgError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      organization_id: params.organizationId,
      sender_id: 'workflow_system',
      text: params.messageText || params.templateName,
      is_incoming: false,
      status: 'sent',
      author_name: 'Workflow System',
      type: 'template',
      metadata: {
        wamid: params.metaMessageId,
        template_name: params.templateName,
        template_language: params.templateLanguage,
        template_variables: params.templateVariables,
        template_body: params.templateBody,
        ...params.metadata
      }
    });

  if (msgError) {
    throw new Error(`Failed to save message: ${msgError.message}`);
  }

  // Update conversation
  await supabase
    .from('conversations')
    .update({
      last_message: params.messageText || `Template: ${params.templateName}`,
      last_message_time: new Date().toISOString()
    })
    .eq('id', conversationId);
}
