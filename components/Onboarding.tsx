import React, { useState } from 'react';
import { UserInfo } from '../types';
import { MessageSquare, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { authService } from '../services/authService';

interface OnboardingProps {
  onComplete: () => void;
  onBackToLogin: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onBackToLogin }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<UserInfo>({
    firstName: '',
    lastName: '',
    country: '',
    email: '',
    whatsappNumber: '',
    password: '',
    organizationName: '',
    companySize: '',
    platformUse: '',
    botName: '',
    industry: ''
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleNext = async () => {
    setError(null);

    if (step < 3) {
      setStep(step + 1);
      return;
    }

    try {
      setIsLoading(true);
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();

      // STEP 1: Create user in Auth with metadata
      // Store all onboarding data in user_metadata so it's available after email confirmation
      const signUpData = await authService.signUp(
        formData.email, 
        formData.password,
        {
          firstName: formData.firstName,
          lastName: formData.lastName,
          fullName,
          organizationName: formData.organizationName,
          country: formData.country,
          whatsappNumber: formData.whatsappNumber,
          companySize: formData.companySize,
          platformUse: formData.platformUse,
          industry: formData.industry,
          botName: formData.botName
        }
      );
      
      console.log('📧 Signup result:', { 
        hasSession: !!signUpData.session, 
        hasUser: !!signUpData.user, 
        userId: signUpData.user?.id 
      });

      if (!signUpData.user) {
        throw new Error('No se pudo crear la cuenta');
      }

      // STEP 2: Show confirmation screen
      // Organization will be created automatically after email confirmation via webhook/trigger
      console.log('✅ User created, waiting for email confirmation');
      console.log('📦 Metadata enviado:', {
        firstName: formData.firstName,
        lastName: formData.lastName,
        fullName,
        organizationName: formData.organizationName,
        country: formData.country,
        whatsappNumber: formData.whatsappNumber,
        companySize: formData.companySize,
        platformUse: formData.platformUse,
        industry: formData.industry,
        botName: formData.botName
      });
      console.log('🔔 El trigger en Supabase ahora debería crear automáticamente:');
      console.log('   1. Organización');
      console.log('   2. Perfil (con organization_id)');
      console.log('   3. Metadatos en integration_settings');
      setError(null);
      setStep(4);
    } catch (err: any) {
      console.error('❌ Signup error:', err);
      setError(err.message || 'No se pudo crear la cuenta.');
    } finally {
      setIsLoading(false);
    }
  };

  const isStepInvalid =
    (step === 1 && (!formData.firstName || !formData.lastName || !formData.email || !formData.country || !formData.whatsappNumber || !formData.password || formData.password.length < 8 || formData.password !== confirmPassword)) ||
    (step === 2 && (!formData.organizationName || !formData.companySize || !formData.platformUse)) ||
    (step === 3 && !formData.botName);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="max-w-5xl w-full grid md:grid-cols-2 bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Left Side: Illustration & Progress */}
        <div className="bg-emerald-600 p-12 text-white flex flex-col">
          <div className="flex items-center gap-3 mb-12">
            <div className="bg-white/20 p-2 rounded-lg">
              <MessageSquare className="w-7 h-7" />
            </div>
            <span className="text-2xl font-bold tracking-tight">Docre-A</span>
          </div>
          
          <div className="flex-1">
            <h2 className="text-3xl font-bold mb-6 leading-tight">Configura tu cuenta y tu organización en minutos.</h2>
            <div className="space-y-6">
              {[
                { s: 1, text: 'Información personal' },
                { s: 2, text: 'Organización' },
                { s: 3, text: 'Primer bot' },
                { s: 4, text: 'Confirmación' }
              ].map((item) => (
                <div key={item.s} className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold ${
                    step >= item.s ? 'bg-white text-emerald-600 border-white' : 'border-emerald-300 text-emerald-200'
                  }`}>
                    {step > item.s ? <CheckCircle2 size={16} /> : item.s}
                  </div>
                  <span className={`font-medium ${step >= item.s ? 'text-white' : 'text-emerald-100/70'}`}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={onBackToLogin}
            className="text-sm text-emerald-100/80 hover:text-white transition-colors mt-10 w-fit"
          >
            ¿Ya tienes cuenta? Inicia sesión
          </button>

          <p className="text-xs opacity-70 mt-6">© 2026 Docre-A</p>
        </div>

        {/* Right Side: Form */}
        <div className="p-12 flex flex-col justify-center">
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
              <h3 className="text-2xl font-bold text-slate-800">Comencemos con lo básico</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Nombre</label>
                  <input 
                    type="text" 
                    value={formData.firstName}
                    onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="Juan"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Apellido</label>
                  <input 
                    type="text" 
                    value={formData.lastName}
                    onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="Pérez"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Correo electrónico</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="nombre@empresa.com"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">País</label>
                  <input 
                    type="text" 
                    value={formData.country}
                    onChange={e => setFormData({ ...formData, country: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="México"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Número de WhatsApp</label>
                  <input 
                    type="tel" 
                    value={formData.whatsappNumber}
                    onChange={e => setFormData({ ...formData, whatsappNumber: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="+52 55 1234 5678"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Contraseña</label>
                <input 
                  type="password" 
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Confirmar contraseña</label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Repite tu contraseña"
                />
                {confirmPassword && formData.password !== confirmPassword && (
                  <p className="mt-2 text-sm text-red-600">Las contraseñas no coinciden</p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
              <h3 className="text-2xl font-bold text-slate-800">Define tu organización</h3>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Empresa</label>
                <input 
                  type="text" 
                  value={formData.organizationName}
                  onChange={e => setFormData({ ...formData, organizationName: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Docre-A Labs"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tamaño de la empresa</label>
                <select 
                  value={formData.companySize}
                  onChange={e => setFormData({ ...formData, companySize: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">Selecciona una opción</option>
                  <option value="1-5">1-5 empleados</option>
                  <option value="6-20">6-20 empleados</option>
                  <option value="21-50">21-50 empleados</option>
                  <option value="51-200">51-200 empleados</option>
                  <option value="201+">201+ empleados</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">¿Para qué desea usar la plataforma?</label>
                <textarea
                  value={formData.platformUse}
                  onChange={e => setFormData({ ...formData, platformUse: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none min-h-[110px]"
                  placeholder="Atención al cliente, ventas, soporte técnico..."
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
              <h3 className="text-2xl font-bold text-slate-800">Nombra tu primer bot</h3>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre del bot</label>
                <input 
                  type="text" 
                  value={formData.botName}
                  onChange={e => setFormData({ ...formData, botName: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Soporte Docré"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 size={26} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-slate-800">Revisa tu correo</h3>
                <p className="text-slate-600">
                  Te enviamos un correo de confirmación a <strong>{formData.email}</strong>.
                  Una vez que confirmes, podrás completar la creación de tu organización.
                </p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl text-sm">
                Si no ves el correo, revisa tu bandeja de spam o promociones.
              </div>
            </div>
          )}

          {error && step !== 4 && (
            <div className="mt-6 bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button 
            onClick={step === 4 ? onBackToLogin : handleNext}
            disabled={step === 4 ? false : isStepInvalid || isLoading}
            className="mt-10 w-full py-4 bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {isLoading && <Loader2 size={18} className="animate-spin" />}
            {step === 4 ? 'Ir al inicio de sesión' : step === 3 ? 'Crear cuenta' : 'Continuar'}
            {!isLoading && step !== 4 && <ArrowRight size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
