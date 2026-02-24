import { supabase } from './supabaseClient';

interface WhatsAppEmbeddedSignupData {
  phone_number_id: string;
  waba_id: string;
  business_id: string;
  access_token?: string; // Optional: comes from backend
  page_ids?: string[];
  catalog_ids?: string[];
  dataset_ids?: string[];
  instagram_account_ids?: string[];
}

/**
 * Fetch the phone number from WhatsApp Business API
 * Uses Phone Number ID and Access Token
 * API: GET https://graph.facebook.com/v18.0/{Phone-Number-ID}
 */
async function fetchPhoneNumberFromAPI(phoneNumberId: string, accessToken: string): Promise<string | null> {
  try {
    console.log('📞 [WhatsApp API] Fetching phone number for ID:', phoneNumberId);
    
    // CORRECCIÓN: Usar graph.facebook.com (no graph.instagram.com)
    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}?fields=display_phone_number,verified_name&access_token=${encodeURIComponent(accessToken)}`;
    
    console.log('📡 [WhatsApp API] Request URL:', url.replace(accessToken, '***TOKEN***'));
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`❌ [WhatsApp API] Error ${response.status}:`, errorData);
      throw new Error(`API Error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('✅ [WhatsApp API] Full Response:', data);
    
    // The API returns display_phone_number in format like "+1234567890"
    const displayPhoneNumber = data.display_phone_number;
    
    if (!displayPhoneNumber) {
      console.warn('⚠️ [WhatsApp API] No display_phone_number in response');
      console.warn('Response data:', JSON.stringify(data));
      return null;
    }
    
    // Formatear el número (asegurar que tenga formato correcto)
    const formattedNumber = displayPhoneNumber.startsWith('+') 
      ? displayPhoneNumber 
      : '+' + displayPhoneNumber;
    
    console.log('✅ [WhatsApp API] Phone number obtained:', formattedNumber);
    console.log('✅ [WhatsApp API] Verified name:', data.verified_name || 'N/A');
    return formattedNumber;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [WhatsApp API] Failed to fetch phone number:', errorMsg);
    return null;
  }
}

/**
 * Save WhatsApp embedded signup data directly from the component
 * This uses data captured from the WA_EMBEDDED_SIGNUP event in Event Log
 * Automatically fetches and saves the phone number from WhatsApp API
 */
export async function saveWhatsAppEmbeddedSignupData(
  organizationId: string,
  embeddedSignupData: WhatsAppEmbeddedSignupData,
  accessToken?: string // Optional: token from OAuth flow
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('🔍 [WhatsApp Service] Starting save process...');
    console.log('🔍 [WhatsApp Service] Organization ID:', organizationId);
    console.log('🔍 [WhatsApp Service] Embedded Signup Data:', embeddedSignupData);

    if (!organizationId) {
      console.error('❌ [WhatsApp Service] Organization ID is missing');
      throw new Error('Organization ID is required');
    }

    if (!embeddedSignupData || !embeddedSignupData.waba_id) {
      console.error('❌ [WhatsApp Service] Embedded signup data is incomplete:', embeddedSignupData);
      throw new Error('WhatsApp embedded signup data is incomplete');
    }

    // 1. Prepare credentials base (SIN phone_number todavía)
    const whatsappCredentials = {
      waba_id: embeddedSignupData.waba_id,
      phone_id: embeddedSignupData.phone_number_id, // phone_id from embedded signup
      phone_number_id: embeddedSignupData.phone_number_id, // keep both for compatibility
      business_id: embeddedSignupData.business_id,
      phone_number: '', // Will be filled after saving access_token
      access_token: accessToken || embeddedSignupData.access_token || '', // Save if provided
      verify_token: '', // User configures this in Settings for webhook verification
      page_ids: embeddedSignupData.page_ids || [],
      catalog_ids: embeddedSignupData.catalog_ids || [],
      dataset_ids: embeddedSignupData.dataset_ids || [],
      instagram_account_ids: embeddedSignupData.instagram_account_ids || [],
      linked_at: new Date().toISOString(),
      source: 'embedded_signup_event',
    };

    console.log('✍️ [WhatsApp Service] Prepared credentials (base):', whatsappCredentials);
    console.log('📡 [WhatsApp Service] Step 1: Saving base configuration to Supabase...');

    // 2. Save to integration_settings PRIMERO (guardar access_token)
    const { data, error } = await supabase
      .from('integration_settings')
      .upsert(
        {
          service_name: 'whatsapp',
          organization_id: organizationId,
          credentials: whatsappCredentials,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'organization_id,service_name',
        }
      )
      .select();

    console.log('📊 [WhatsApp Service] Supabase Response:', { data, error });

    if (error) {
      console.error('❌ [WhatsApp Service] Supabase Error:', error);
      console.error('❌ [WhatsApp Service] Error Code:', error.code);
      console.error('❌ [WhatsApp Service] Error Details:', error.details);
      console.error('❌ [WhatsApp Service] Error Message:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log('✅ [WhatsApp Service] Base configuration saved successfully');
    console.log('📝 [WhatsApp Service] Datos guardados (base):');
    console.log('   ✅ WABA ID:', embeddedSignupData.waba_id);
    console.log('   ✅ Phone ID:', embeddedSignupData.phone_number_id);
    console.log('   ✅ access_token:', accessToken || embeddedSignupData.access_token ? 'Guardado ✓' : 'Pendiente (se guardará desde backend)');
    
    // NO intentar obtener el número aquí porque el access_token se guarda desde el backend DESPUÉS
    // El número se obtendrá desde handleWhatsAppSignupSuccess cuando el backend complete
    
    console.log('✅ [WhatsApp Service] Configuration complete');
    console.log('   ℹ️ Phone number will be fetched after backend saves access_token');
    console.log('   ⚠️ verify_token: Pendiente (configurar manualmente en Settings)');
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [WhatsApp Service] Exception caught:', errorMsg);
    console.error('❌ [WhatsApp Service] Stack:', error instanceof Error ? error.stack : 'No stack');
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Fetch and save phone number from WhatsApp API
 * Called when access token is saved/updated in Settings
 * This ensures phone number is always available if token and phone ID are present
 */
export async function fetchAndSavePhoneNumber(
  organizationId: string,
  phoneNumberId: string,
  accessToken: string
): Promise<{ success: boolean; phoneNumber?: string; error?: string }> {
  try {
    console.log('📞 [WhatsApp Service] Fetching phone number from API...');
    
    if (!phoneNumberId || !accessToken) {
      throw new Error('Phone Number ID and Access Token are required');
    }

    // Fetch phone number from API
    const phoneNumber = await fetchPhoneNumberFromAPI(phoneNumberId, accessToken);
    
    if (!phoneNumber) {
      throw new Error('Could not retrieve phone number from WhatsApp API');
    }

    // Update the phone_number field in integration_settings
    const { data: existingData } = await supabase
      .from('integration_settings')
      .select('credentials')
      .eq('organization_id', organizationId)
      .eq('service_name', 'whatsapp')
      .single();

    const existingCredentials = existingData?.credentials || {};

    const updatedCredentials = {
      ...existingCredentials,
      phone_number: phoneNumber,
    };

    const { error } = await supabase
      .from('integration_settings')
      .upsert({
        organization_id: organizationId,
        service_name: 'whatsapp',
        credentials: updatedCredentials,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,service_name',
      });

    if (error) {
      console.error('❌ [WhatsApp Service] Error saving phone number:', error.message);
      throw error;
    }

    console.log('✅ [WhatsApp Service] Phone number saved successfully:', phoneNumber);
    return { success: true, phoneNumber };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [WhatsApp Service] Failed to fetch and save phone number:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}
