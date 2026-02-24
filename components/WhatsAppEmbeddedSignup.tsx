import React, { useState, useEffect, useRef } from 'react';
import { X, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { saveWhatsAppEmbeddedSignupData } from '../services/whatsappIntegrationService';

interface WhatsAppEmbeddedSignupProps {
  organizationId: string;
  onSuccess: (data: any) => void;
  onClose: () => void;
}

// Declare Facebook types globally
declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

export const WhatsAppEmbeddedSignup: React.FC<WhatsAppEmbeddedSignupProps> = ({
  organizationId,
  onSuccess,
  onClose,
}) => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'processing' | 'success' | 'error'>('loading');
  const [logs, setLogs] = useState<Array<{ message: string; type: 'info' | 'success' | 'error' | 'warn' }>>([]);
  const [responseData, setResponseData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [embeddedSignupData, setEmbeddedSignupData] = useState<any>(null);

  const APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID || '';
  const CONFIG_ID = import.meta.env.VITE_WHATSAPP_CONFIG_ID || '';
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
    console.log(`[WhatsApp Signup ${type.toUpperCase()}] ${message}`);
    setLogs((prev) => [...prev, { message, type }]);
  };

  // Load Facebook SDK and listen for embedded signup messages
  useEffect(() => {
    if (!APP_ID || !CONFIG_ID) {
      setStatus('error');
      setErrorMessage('Missing configuration');
      addLog('❌ Missing APP_ID or CONFIG_ID', 'error');
      return;
    }

    addLog('Initializing WhatsApp signup component', 'info');

    // Listen for WA_EMBEDDED_SIGNUP messages from popup
    const handlePostMessage = (event: MessageEvent) => {
      // Validate origin (REQUIRED by Meta)
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") {
        console.log('[WhatsApp Signup] Ignored message from origin:', event.origin);
        return;
      }

      // Log ALL messages for debugging
      console.log('[WhatsApp Signup] postMessage received:', {
        origin: event.origin,
        type: event.data?.type,
        data: event.data
      });

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          addLog(`📨 Received WA_EMBEDDED_SIGNUP event: ${data.event}`, 'success');
        
          if (data.event === 'FINISH') {
            addLog('✅ Embedded signup finished successfully', 'success');
            const { phone_number_id, waba_id, business_id, page_ids, catalog_ids, dataset_ids } = data.data;
            
            addLog(`Phone Number ID: ${phone_number_id}`, 'success');
            addLog(`WABA ID: ${waba_id}`, 'success');
            addLog(`Business ID: ${business_id}`, 'success');
            addLog(`Full embedded data: ${JSON.stringify(data.data)}`, 'info');
            
            // Store ALL the embedded signup data
            setEmbeddedSignupData(data.data);

            // Save WhatsApp data immediately to Supabase
            addLog('💾 Saving WhatsApp data to Supabase...', 'info');
            saveWhatsAppEmbeddedSignupData(organizationId, data.data)
              .then((result) => {
                if (result.success) {
                  addLog('✅ WhatsApp data saved to Supabase successfully', 'success');
                  setStatus('success');
                  // Notify parent component to update state
                  onSuccess(data.data);
                } else {
                  addLog(`⚠️ Error saving WhatsApp data: ${result.error}`, 'warn');
                }
              })
              .catch((error) => {
                addLog(`⚠️ Error saving WhatsApp data: ${error.message}`, 'warn');
              });
          } else if (data.event === 'CANCEL') {
            const { current_step } = data.data;
            addLog(`⚠️ User cancelled at step: ${current_step}`, 'warn');
          } else if (data.event === 'ERROR') {
            const { error_message } = data.data;
            addLog(`❌ Error: ${error_message}`, 'error');
          }
        }
      } catch (e) {
        console.log('[WhatsApp Signup] Non-JSON response:', event.data);
      }
    };

    window.addEventListener('message', handlePostMessage);
    addLog('📡 Message listener registered', 'info');

    // Load Facebook SDK
    if (!window.FB) {
      addLog('Loading Facebook SDK v24.0', 'info');
      window.fbAsyncInit = function () {
        window.FB.init({
          appId: APP_ID,
          autoLogAppEvents: true,
          xfbml: true,
          version: 'v24.0',
        });
        
        // Subscribe to embedded signup events
        window.FB.Event.subscribe('send_whatsapp_signup', function(response: any) {
          addLog('📨 Facebook Event: send_whatsapp_signup', 'success');
          addLog(`Event data: ${JSON.stringify(response)}`, 'info');
          
          if (response && response.phone_number_id) {
            addLog(`✅ Phone Number ID: ${response.phone_number_id}`, 'success');
            addLog(`✅ WABA ID: ${response.waba_id}`, 'success');
            setEmbeddedSignupData(response);
          }
        });
        
        addLog('✅ Facebook SDK initialized', 'success');
        addLog('✅ Event listener subscribed', 'success');
        setStatus('ready');
      };

      const script = document.createElement('script');
      script.src = `https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v24.0&appId=${APP_ID}&onload=fbAsyncInit`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else {
      addLog('✅ Facebook SDK already loaded', 'success');
      setStatus('ready');
    }

    return () => {
      window.removeEventListener('message', handlePostMessage);
    };
  }, [APP_ID, CONFIG_ID]);

  const handleLaunchSignup = () => {
    if (!window.FB) {
      addLog('❌ Facebook SDK not available', 'error');
      setStatus('error');
      return;
    }

    setStatus('processing');
    addLog('Launching WhatsApp embedded signup...', 'info');

    window.FB.login(
      function (response: any) {
        addLog('FB.login callback received', 'info');
        addLog(`Response: ${JSON.stringify(response)}`, 'info');

        if (response.authResponse) {
          const authCode = response.authResponse.code;
          addLog(`✅ Authorization code obtained: ${authCode.substring(0, 25)}...`, 'success');

          // Wait for WA_EMBEDDED_SIGNUP event before exchanging code
          addLog('⏳ Waiting for embedded signup data...', 'info');
          setTimeout(() => {
            addLog('📤 Sending code to backend with embedded data', 'info');
            exchangeAuthCode(authCode);
          }, 2000); // Wait 2 seconds for the event to arrive
        } else {
          addLog('❌ No auth response from Facebook', 'error');
          setStatus('error');
          setErrorMessage('Authorization failed');
        }
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          version: 'v3',
          setup: {
            business: {
              id: null,
              phone: {},
              address: {},
              timezone: null
            },
            phone: {
              category: null,
              description: ''
            }
          }
        },
      }
    );
  };

  const exchangeAuthCode = async (code: string) => {
    try {
      addLog('Exchanging auth code with backend...', 'info');

      const state = JSON.stringify({
        org_id: organizationId,
        origin: window.location.origin,
        embedded_signup: embeddedSignupData,
      });

      // Use Supabase URL
      const callbackUrl = `${SUPABASE_URL}/functions/v1/facebook-auth-callback`;
      const url = `${callbackUrl}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}&format=json`;

      addLog(`Backend URL: ${callbackUrl}`, 'info');
      addLog(`Full request: ${url.substring(0, 100)}...`, 'info');

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
        },
      });

      const contentType = response.headers.get('content-type') || '';
      addLog(`Response content-type: ${contentType}`, 'info');

      if (!response.ok) {
        const text = await response.text();
        addLog(`Backend error ${response.status}: ${text.substring(0, 100)}...`, 'error');
        throw new Error(`Backend returned ${response.status}: ${response.statusText}`);
      }

      // Try to parse as JSON
      let data;
      try {
        const text = await response.text();
        if (!text) {
          throw new Error('Empty response from backend');
        }
        data = JSON.parse(text);
      } catch (parseError) {
        addLog(`Parse error: ${parseError instanceof Error ? parseError.message : 'Unknown'}`, 'error');
        throw new Error(`Invalid JSON response from backend`);
      }

      addLog('✅ Backend response received', 'success');

      if (data.success && data.data) {
        addLog('✅ Authentication successful', 'success');
        const userName = data.data.user?.name || data.data.user_name || 'Unknown User';
        addLog(`User: ${userName}`, 'success');

        setResponseData(data.data);
        setStatus('success');

        // Display WhatsApp Business Account data from backend response
        addLog('📊 WhatsApp Business Account Data', 'success');
        
        // Extract access_token from backend response
        let accessToken = '';
        if (data.data.authentication?.facebookAccessToken) {
          accessToken = data.data.authentication.facebookAccessToken;
          addLog('✅ Access Token received from backend', 'success');
        }
        
        // Data from embedded signup
        if (data.data.embeddedSignup) {
          const embedded = data.data.embeddedSignup;
          if (embedded.wabaId) {
            addLog(`✅ WABA ID: ${embedded.wabaId}`, 'success');
          }
          if (embedded.phoneNumberId) {
            addLog(`✅ Phone Number ID: ${embedded.phoneNumberId}`, 'success');
          }
          if (embedded.businessId) {
            addLog(`✅ Business ID: ${embedded.businessId}`, 'success');
          }

          // Update saved data with access_token if we have embedded signup data
          if (embeddedSignupData && accessToken) {
            addLog('💾 Updating WhatsApp data with access_token...', 'info');
            
            // ESPERAR a que se complete el guardado (incluido phone number)
            try {
              const result = await saveWhatsAppEmbeddedSignupData(organizationId, embeddedSignupData, accessToken);
              
              if (result.success) {
                addLog('✅ WhatsApp configuration saved successfully', 'success');
                addLog('✅ All data saved to Supabase', 'success');
                
                // Notify parent component to update state AHORA que todo está guardado
                onSuccess(data.data);
              } else {
                addLog(`⚠️ Error saving WhatsApp data: ${result.error}`, 'warn');
                // Aún así notificamos, pero puede que el phone_number no esté disponible
                onSuccess(data.data);
              }
            } catch (error) {
              addLog(`⚠️ Error saving WhatsApp data: ${error instanceof Error ? error.message : 'Unknown error'}`, 'warn');
              // Aún así notificamos
              onSuccess(data.data);
            }
          } else {
            // Si no hay datos para guardar, notificar inmediatamente
            addLog('✅ All data saved to Supabase', 'success');
            onSuccess(data.data);
          }
        }
      } else {
        addLog(`❌ Backend error: ${data.message || data.error}`, 'error');
        setStatus('error');
        setErrorMessage(data.message || data.error || 'Unknown error');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addLog(`❌ Exchange error: ${errorMsg}`, 'error');
      setStatus('error');
      setErrorMessage(errorMsg);
    }
  };

  // If success, show connected state with saved data
  if (status === 'success' && embeddedSignupData) {
    return (
      <div className="mt-6 border-t border-slate-200 pt-6">
        {/* Animated Success State */}
        <div className="relative bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-8 overflow-hidden">
          {/* Animated Background Circles */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-200 rounded-full opacity-20 animate-pulse"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-emerald-200 rounded-full opacity-20 animate-pulse delay-75"></div>
          
          {/* Success Icon with Animation */}
          <div className="relative flex justify-center mb-6">
            <div className="relative">
              {/* Pulsing ring */}
              <div className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-30"></div>
              {/* Success icon */}
              <div className="relative p-4 rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-lg">
                <CheckCircle size={48} className="text-white animate-bounce" style={{ animationDuration: '2s' }} />
              </div>
            </div>
          </div>

          {/* Success Message */}
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-green-900 mb-2">¡Conexión Exitosa! 🎉</h3>
            <p className="text-sm text-green-700">Tu cuenta de WhatsApp Business ha sido configurada correctamente</p>
          </div>

          {/* Data Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            <div className="bg-white/80 backdrop-blur rounded-lg p-4 border border-green-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">WABA ID</p>
              </div>
              <p className="text-sm font-mono text-slate-800 font-medium">{embeddedSignupData.waba_id}</p>
            </div>

            <div className="bg-white/80 backdrop-blur rounded-lg p-4 border border-green-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Phone Number ID</p>
              </div>
              <p className="text-sm font-mono text-slate-800 font-medium">{embeddedSignupData.phone_number_id}</p>
            </div>

            <div className="bg-white/80 backdrop-blur rounded-lg p-4 border border-green-100 shadow-sm hover:shadow-md transition-shadow md:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Business ID</p>
              </div>
              <p className="text-sm font-mono text-slate-800 font-medium">{embeddedSignupData.business_id}</p>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
          >
            Continuar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800">WhatsApp Business Registration</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
          title="Close"
        >
          <X size={20} className="text-slate-500" />
        </button>
      </div>

      {/* Status Box */}
      <div
        className={`p-4 rounded-lg mb-4 flex items-center gap-3 ${
          status === 'loading'
            ? 'bg-blue-50 border border-blue-200'
            : status === 'ready'
            ? 'bg-green-50 border border-green-200'
            : status === 'processing'
            ? 'bg-yellow-50 border border-yellow-200'
            : status === 'success'
            ? 'bg-green-100 border border-green-300'
            : 'bg-red-50 border border-red-200'
        }`}
      >
        {status === 'loading' && (
          <>
            <Loader size={20} className="animate-spin text-blue-600" />
            <span className="text-sm text-blue-700">Initializing...</span>
          </>
        )}
        {status === 'ready' && (
          <>
            <CheckCircle size={20} className="text-green-600" />
            <span className="text-sm text-green-700">Ready to launch signup</span>
          </>
        )}
        {status === 'processing' && (
          <>
            <Loader size={20} className="animate-spin text-yellow-600" />
            <span className="text-sm text-yellow-700">Processing authorization...</span>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={20} className="text-green-600" />
            <span className="text-sm text-green-700">✅ Registration successful!</span>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle size={20} className="text-red-600" />
            <span className="text-sm text-red-700">{errorMessage}</span>
          </>
        )}
      </div>

      {/* Launch Button */}
      {status === 'ready' && (
        <button
          onClick={handleLaunchSignup}
          className="w-full px-4 py-3 rounded-lg text-white font-medium bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all transform hover:scale-[1.02]"
        >
          Launch WhatsApp Registration
        </button>
      )}
    </div>
  );
};
