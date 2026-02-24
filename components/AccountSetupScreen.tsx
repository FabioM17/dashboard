import React, { useState, useEffect } from 'react';
import { CheckCircle, Building2, User, Sparkles, Loader2, AlertCircle, Mail } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface AccountSetupScreenProps {
  onSetupComplete: () => void;
  onCancel?: () => void;
}

interface OnboardingData {
  fullName: string;
  firstName: string;
  lastName: string;
  country: string;
  whatsappNumber: string;
  organizationName: string;
  companySize: string;
  platformUse: string;
  industry?: string;
  botName?: string;
  email: string;
}

const AccountSetupScreen: React.FC<AccountSetupScreenProps> = ({ onSetupComplete, onCancel }) => {
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("✅ AccountSetupScreen mounted - Email verified");
    
    // Recuperar datos de user_metadata (guardados durante signup)
    const loadUserMetadata = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        
        if (user?.user_metadata) {
          const metadata = user.user_metadata;
          console.log("✅ User metadata loaded:", metadata);
          
          setOnboardingData({
            fullName: metadata.fullName || `${metadata.firstName || ''} ${metadata.lastName || ''}`.trim(),
            firstName: metadata.firstName || '',
            lastName: metadata.lastName || '',
            country: metadata.country || '',
            whatsappNumber: metadata.whatsappNumber || '',
            organizationName: metadata.organizationName || '',
            companySize: metadata.companySize || '',
            platformUse: metadata.platformUse || '',
            industry: metadata.industry,
            botName: metadata.botName,
            email: user.email || ''
          });
        } else {
          console.error("❌ No user metadata found");
          setError('No se encontraron datos de registro.');
        }
      } catch (err) {
        console.error("❌ Error loading user metadata:", err);
        setError('Error al cargar datos de registro.');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadUserMetadata();
  }, []);

  const handleContinue = () => {
    console.log("🚀 User continuing to dashboard");
    onSetupComplete();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center justify-center mb-6">
            <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
          </div>
          <p className="text-center text-slate-600">Cargando datos de tu cuenta...</p>
        </div>
      </div>
    );
  }

  if (error || !onboardingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center justify-center mb-6">
            <AlertCircle className="w-12 h-12 text-red-600" />
          </div>
          <p className="text-center text-slate-600 font-semibold">Error</p>
          <p className="text-center text-slate-500 mt-2 text-sm">{error || 'No se pudieron cargar los datos'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 p-8 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} />
            </div>
            <h1 className="text-2xl font-bold">¡Email Verificado!</h1>
            <p className="text-emerald-100 text-sm mt-2">Tu cuenta ha sido confirmada correctamente</p>
          </div>

          {/* Content */}
          <div className="p-8 space-y-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Mail size={20} className="text-emerald-600 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-800">Email confirmado</h3>
                  <p className="text-sm text-slate-600 mt-1 break-all">{onboardingData.email}</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-slate-800 text-sm">Datos de tu cuenta:</h4>
              
              <div className="flex items-center gap-3 text-sm">
                <User size={16} className="text-slate-500" />
                <div>
                  <span className="text-slate-500">Nombre:</span>
                  <span className="ml-2 font-medium text-slate-800">{onboardingData.fullName}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <User size={16} className="text-slate-500" />
                <div>
                  <span className="text-slate-500">País:</span>
                  <span className="ml-2 font-medium text-slate-800">{onboardingData.country}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <User size={16} className="text-slate-500" />
                <div>
                  <span className="text-slate-500">WhatsApp:</span>
                  <span className="ml-2 font-medium text-slate-800">{onboardingData.whatsappNumber}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Building2 size={16} className="text-slate-500" />
                <div>
                  <span className="text-slate-500">Organización:</span>
                  <span className="ml-2 font-medium text-slate-800">{onboardingData.organizationName}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Building2 size={16} className="text-slate-500" />
                <div>
                  <span className="text-slate-500">Tamaño:</span>
                  <span className="ml-2 font-medium text-slate-800">{onboardingData.companySize}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Sparkles size={16} className="text-slate-500" />
                <div>
                  <span className="text-slate-500">Uso:</span>
                  <span className="ml-2 font-medium text-slate-800">{onboardingData.platformUse}</span>
                </div>
              </div>

              {onboardingData.industry && (
                <div className="flex items-center gap-3 text-sm">
                  <Sparkles size={16} className="text-slate-500" />
                  <div>
                    <span className="text-slate-500">Industria:</span>
                    <span className="ml-2 font-medium text-slate-800">{onboardingData.industry}</span>
                  </div>
                </div>
              )}

              {onboardingData.botName && (
                <div className="flex items-center gap-3 text-sm">
                  <Sparkles size={16} className="text-slate-500" />
                  <div>
                    <span className="text-slate-500">Bot:</span>
                    <span className="ml-2 font-medium text-slate-800">{onboardingData.botName}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex gap-3">
                <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-800">
                  Tu organización y perfil han sido creados. Ya puedes acceder al <strong>dashboard</strong>.
                </div>
              </div>
            </div>

            <div className="flex pt-4">
              <button
                onClick={handleContinue}
                className="w-full px-4 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle size={16} />
                Ir al Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-white/60 text-xs mt-6">
          © 2026 Docre-A — Sistema de Soporte Inteligente
        </p>
      </div>
    </div>
  );
};

export default AccountSetupScreen;
