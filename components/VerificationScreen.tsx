import React, { useState, useEffect } from 'react';
import { CheckCircle, Lock, Eye, EyeOff, Loader2, AlertCircle, Mail } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { authService } from '../services/authService';

interface VerificationScreenProps {
  onVerificationComplete: () => void;
  onCancel: () => void;
}

const VerificationScreen: React.FC<VerificationScreenProps> = ({ onVerificationComplete, onCancel }) => {
  const [step, setStep] = useState<'confirm' | 'password'>('confirm');
  const [userEmail, setUserEmail] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Get current user email
  useEffect(() => {
    console.log("📬 VerificationScreen mounted");
    const getCurrentUserEmail = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log("📧 Session retrieved:", { hasSession: !!session, email: session?.user?.email });
        if (session?.user?.email) {
          console.log("✅ Setting email:", session.user.email);
          setUserEmail(session.user.email);
        }
      } catch (err) {
        console.error("❌ Error getting session:", err);
      }
    };
    getCurrentUserEmail();
  }, []);

  const handleConfirmInvitation = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Supabase ya procesó el link, usuario ya está en sesión
      // Solo mostramos confirmación visual
      setSuccess(true);
      setTimeout(() => {
        setStep('password');
        setSuccess(false);
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async () => {
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      console.log("🔐 Updating user password...");
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) throw updateError;

      console.log("✅ Password updated successfully");
      setSuccess(true);
      
      // Clean up URL - remove any token or query params
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      console.log("🧹 URL cleaned");
      
      setTimeout(() => {
        onVerificationComplete();
      }, 2000);
    } catch (err: any) {
      console.error("❌ Password update error:", err);
      setError(err.message || 'Error al actualizar la contraseña');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 p-8 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail size={32} />
            </div>
            <h1 className="text-2xl font-bold">Confirma tu Invitación</h1>
            <p className="text-emerald-100 text-sm mt-2">Bienvenido a nuestro equipo</p>
          </div>

          {/* Content */}
          <div className="p-8 space-y-6">
            {/* Step 1: Confirm Invitation */}
            {step === 'confirm' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Mail size={20} className="text-emerald-600 mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-slate-800">Email de Invitación</h3>
                      <p className="text-sm text-slate-600 mt-1 break-all">{userEmail}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex gap-3">
                    <AlertCircle size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <strong>¿Correo incorrecto?</strong> Haz clic en <span className="underline cursor-pointer hover:text-blue-900">Cancelar</span> para usar otra cuenta.
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                  <h4 className="font-semibold text-slate-800 text-sm">Lo que haremos:</h4>
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-emerald-600" />
                      Confirmar tu pertenencia al equipo
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-emerald-600" />
                      Solicitar una contraseña segura
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-emerald-600" />
                      Llevarte al dashboard
                    </li>
                  </ul>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {success && (
                  <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg text-sm flex items-center gap-2 animate-pulse">
                    <CheckCircle size={16} />
                    ¡Confirmado! Un momento...
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={onCancel}
                    disabled={isLoading}
                    className="flex-1 px-4 py-3 border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmInvitation}
                    disabled={isLoading || !userEmail}
                    className="flex-1 px-4 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Confirmando...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} />
                        Sí, Confirmo
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Set Password */}
            {step === 'password' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                    <CheckCircle size={18} />
                    Invitación Confirmada ✓
                  </div>
                  <p className="text-sm text-emerald-700 mt-2">Ahora crea una contraseña para acceder a tu cuenta.</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <Lock size={16} />
                    Nueva Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <Lock size={16} />
                    Confirmar Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repite tu contraseña"
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                    />
                    <button
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {success && (
                  <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg text-sm flex items-center gap-2 animate-pulse">
                    <CheckCircle size={16} />
                    ¡Contraseña configurada! Entrando al dashboard...
                  </div>
                )}

                <button
                  onClick={handleSetPassword}
                  disabled={isLoading || !newPassword || !confirmPassword}
                  className="w-full px-4 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Configurando...
                    </>
                  ) : (
                    <>
                      <Lock size={16} />
                      Crear Contraseña y Continuar
                    </>
                  )}
                </button>

                <p className="text-xs text-slate-500 text-center">
                  La contraseña debe tener al menos 8 caracteres
                </p>
              </div>
            )}
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

export default VerificationScreen;
