
import React, { useState } from 'react';
import { MessageSquare, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { authService } from '../services/authService';

interface LoginScreenProps {
  onLogin: () => void;
  onCreateAccount: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onCreateAccount }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await authService.signIn(email, password);
      onLogin(); // App.tsx will handle fetching the user details
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'No se pudo iniciar sesión. Verifica tus credenciales.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-3 sm:p-6">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-4xl flex flex-col md:flex-row">
          
          {/* Left Side - Brand */}
          <div className="bg-emerald-600 p-6 sm:p-10 flex flex-col justify-center items-start text-white md:w-1/2">
            <div className="flex items-center gap-3 mb-6 sm:mb-8">
              <div className="bg-white/20 p-2 rounded-lg">
                <MessageSquare className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Docre-A</h1>
            </div>
            
            <h2 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4">Administra conversaciones con clientes a escala.</h2>
            <p className="text-emerald-100 mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
              Conecta WhatsApp, Instagram y Messenger en una bandeja de entrada unificada. 
              Usa respuestas inteligentes con IA para cerrar tickets más rápido.
            </p>
            
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-300 flex-shrink-0" />
                <span className="text-sm sm:text-base">Bandeja de entrada unificada</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-300 flex-shrink-0" />
                <span className="text-sm sm:text-base">Colaboración en equipo</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-300 flex-shrink-0" />
                <span className="text-sm sm:text-base">Integración con IA Gemini</span>
              </div>
            </div>
          </div>

          {/* Right Side - Form */}
          <div className="p-6 sm:p-10 md:w-1/2 flex flex-col justify-center bg-white">
            <div className="text-center mb-6 sm:mb-8">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-800">Bienvenido de nuevo</h3>
              <p className="text-slate-500 text-sm sm:text-base">Inicia sesión en tu panel de control</p>
            </div>

            <button
              onClick={onCreateAccount}
              className="w-full mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold py-3 px-4 rounded-lg hover:bg-emerald-100 transition-colors text-sm sm:text-base"
            >
              Crear una cuenta
            </button>

            <div className="space-y-4">
              <button 
                disabled
                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 text-slate-400 cursor-not-allowed font-medium py-3 px-4 rounded-lg opacity-60 text-sm"
              >
                <svg className="w-5 h-5 grayscale opacity-50 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Iniciar sesión con Google (Próximamente)
              </button>
              
              <div className="relative flex py-3 items-center">
                  <div className="flex-grow border-t border-slate-200"></div>
                  <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">O inicia sesión con correo</span>
                  <div className="flex-grow border-t border-slate-200"></div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <form className="space-y-4" onSubmit={handleLogin}>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Correo electrónico</label>
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                    placeholder="nombre@empresa.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                    placeholder="••••••••"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold py-3 px-4 rounded-lg transition-colors shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
                >
                  {isLoading && <Loader2 size={18} className="animate-spin" />}
                  {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Professional Footer */}
      <footer className="bg-slate-800 border-t border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {/* Footer Content */}
          <div className="grid md:grid-cols-3 gap-12 mb-8">
            {/* Empresa */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-emerald-600 p-2 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <h4 className="text-white font-bold text-lg">Docre-A</h4>
              </div>
              <p className="text-slate-400 text-sm">Plataforma de mensajería empresarial integrada. Gestiona WhatsApp, Gmail, Facebook Messenger e Instagram desde un solo lugar.</p>
            </div>

            {/* Enlaces */}
            <div>
              <h4 className="text-white font-semibold mb-4">Enlaces</h4>
              <ul className="space-y-2">
                <li>
                  <a 
                    href="https://dashboardchat.docreativelatam.com/politicas-de-privacidad"
                    className="text-slate-400 hover:text-emerald-400 transition-colors text-sm font-medium"
                  >
                    Política de Privacidad
                  </a>
                </li>
                <li>
                  <a href="mailto:notificaciones@docreativelatam.com" className="text-slate-400 hover:text-emerald-400 transition-colors text-sm font-medium">
                    Contacto
                  </a>
                </li>
              </ul>
            </div>

            {/* Empresa Info */}
            <div>
              <h4 className="text-white font-semibold mb-4">Empresa</h4>
              <div className="text-slate-400 text-sm space-y-2">
                <p><strong className="text-slate-300">Domen Capital S.A. De C.V.</strong></p>
                <p>El Salvador</p>
                <p className="text-xs text-slate-500">Email: notificaciones@docreativelatam.com</p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-700 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-slate-400 text-sm">&copy; 2026 Docre-A. Todos los derechos reservados.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LoginScreen;
