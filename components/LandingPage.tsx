import React, { useEffect, useState, useCallback } from 'react';
import {
  MessageSquare, CheckCircle, Zap, Users, BarChart3, CheckSquare,
  Mail, ArrowRight, Menu, X, Shield, Lock, Star, ExternalLink,
  Globe, PhoneCall, Key, Send, Inbox, Brain, Share2,
} from 'lucide-react';

interface LandingPageProps {
  onGoToLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGoToLogin }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [formSent, setFormSent] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = useCallback((id: string) => {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const subject = encodeURIComponent(`[Docre-A] Consulta: ${data.get('asunto') || 'Información'}`);
    const body = encodeURIComponent(
      `Nombre: ${data.get('nombre')}\nEmpresa: ${data.get('empresa')}\nTeléfono: ${data.get('telefono')}\nEmail: ${data.get('email')}\n\nMensaje:\n${data.get('mensaje')}`
    );
    window.open(`mailto:notificaciones@docreativelatam.com?subject=${subject}&body=${body}`, '_blank');
    setFormSent(true);
    setTimeout(() => setFormSent(false), 5000);
  };

  const navLinks = [
    { label: 'Plataforma', id: 'way' },
    { label: 'Funciones', id: 'features' },
    { label: 'Canales', id: 'whatsapp' },
    { label: 'Beneficios', id: 'benefits' },
    { label: 'Planes', id: 'pricing' },
    { label: 'Contacto', id: 'contact' },
  ];

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800 overflow-x-hidden">

      {/* HEADER */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-shadow duration-300 ${scrolled ? 'shadow-lg' : ''} bg-slate-900`}>
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => scrollTo('hero')}
              className="flex items-center gap-2 text-white font-bold text-xl tracking-tight"
            >
              <div className="bg-emerald-500 p-1.5 rounded-lg">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              Docre<span className="text-emerald-400">-A</span>
            </button>

            <nav className="hidden md:flex items-center gap-6">
              {navLinks.map(l => (
                <button
                  key={l.id}
                  onClick={() => scrollTo(l.id)}
                  className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
                >
                  {l.label}
                </button>
              ))}
              <button
                onClick={onGoToLogin}
                className="ml-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors shadow-lg"
              >
                Iniciar sesión →
              </button>
            </nav>

            <button
              className="md:hidden text-slate-300 hover:text-white p-1"
              onClick={() => setMobileOpen(v => !v)}
              aria-label="Menú"
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden bg-slate-900 border-t border-slate-700 px-4 pb-4 pt-2 space-y-1">
            {navLinks.map(l => (
              <button
                key={l.id}
                onClick={() => scrollTo(l.id)}
                className="block w-full text-left text-slate-300 hover:text-white hover:bg-slate-800 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {l.label}
              </button>
            ))}
            <button
              onClick={onGoToLogin}
              className="block w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-3 rounded-lg transition-colors text-center"
            >
              Iniciar sesión →
            </button>
          </div>
        )}
      </header>

      {/* HERO */}
      <section id="hero" className="w-full bg-slate-900 pt-16">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="text-center max-w-4xl mx-auto">

            <div className="inline-flex items-center gap-2 bg-emerald-900/50 border border-emerald-700/50 text-emerald-400 text-xs font-semibold tracking-widest uppercase px-4 py-2 rounded-full mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Plataforma de Mensajería Empresarial
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
              Gestiona clientes desde{' '}
              <span className="text-emerald-400">WhatsApp</span>{' '}
              y{' '}
              <span className="text-emerald-400">Gmail</span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-400 leading-relaxed mb-10 max-w-2xl mx-auto">
              Docre-A centraliza tus conversaciones de WhatsApp Business y el envío de correos desde Gmail
              en una sola plataforma. CRM, workflows, campañas y métricas — todo en un lugar.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <button
                onClick={onGoToLogin}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-4 rounded-xl text-base transition-colors shadow-xl"
              >
                Acceder a la plataforma <ArrowRight size={18} />
              </button>
              <button
                onClick={() => scrollTo('features')}
                className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-8 py-4 rounded-xl text-base transition-colors border border-slate-700"
              >
                Ver funciones
              </button>
            </div>

            <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto border-t border-slate-700/60 pt-10">
              {[
                { num: '3+', label: 'Canales activos' },
                { num: '17+', label: 'Módulos disponibles' },
                { num: '100%', label: 'Datos verificados' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className="text-3xl font-extrabold text-white">{s.num}</div>
                  <div className="text-xs text-slate-500 uppercase tracking-widest mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PLATFORM OVERVIEW */}
      <section id="way" className="w-full bg-white py-20 lg:py-28">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            <div>
              <p className="text-emerald-600 text-xs font-bold tracking-widest uppercase mb-3">La manera Docre-A</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight mb-5">
                Todo lo que tu equipo necesita en un solo panel
              </h2>
              <p className="text-slate-600 text-base leading-relaxed mb-8">
                Deja de saltar entre aplicaciones. Atiende WhatsApp, envía correos con Gmail,
                gestiona contactos y automatiza procesos — sin cambiar de pantalla.
              </p>

              <ul className="space-y-3 mb-8">
                {[
                  { text: 'Conversaciones de WhatsApp Business en tiempo real' },
                  { text: 'Envío de correos desde tu cuenta Gmail conectada' },
                  { text: 'CRM con pipeline de ventas y propiedades personalizadas' },
                  { text: 'Tablero de tareas Kanban para tu equipo' },
                  { text: 'Flujos de trabajo y automatizaciones multi-paso' },
                  { text: 'Campañas masivas de WhatsApp y correo' },
                  { text: 'Estadísticas y métricas de conversaciones' },
                  { text: 'Roles de acceso: Admin, Gerente y Agente' },
                  { text: 'Asistente IA integrado en el CRM y conversaciones' },
                  { text: 'Conexión con plataformas de automatización externas' },
                  { text: 'Instagram Direct — próximamente', soon: true },
                  { text: 'Facebook Messenger — próximamente', soon: true },
                ].map((item, i) => (
                  <li key={i} className={`flex items-start gap-3 ${item.soon ? 'opacity-50' : ''}`}>
                    <CheckCircle className="text-emerald-500 flex-shrink-0 mt-0.5" size={18} />
                    <span className="text-sm text-slate-700">
                      {item.text}
                      {item.soon && (
                        <span className="ml-2 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          Pronto
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                onClick={onGoToLogin}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl transition-colors"
              >
                Empezar ahora <ArrowRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: <MessageSquare className="text-emerald-600" size={24} />, title: 'WhatsApp Business', desc: 'Mensajes, medios, plantillas y estados en tiempo real.', color: 'bg-emerald-50 border-emerald-200' },
                { icon: <Mail className="text-red-500" size={24} />, title: 'Gmail — envío', desc: 'Envía correos a contactos desde tu cuenta Gmail conectada.', color: 'bg-red-50 border-red-200' },
                { icon: <Users className="text-blue-600" size={24} />, title: 'CRM integrado', desc: 'Contactos, pipeline de ventas y propiedades personalizadas.', color: 'bg-blue-50 border-blue-200' },
                { icon: <Zap className="text-amber-500" size={24} />, title: 'Flujos de trabajo', desc: 'Automatizaciones multi-paso con triggers y acciones.', color: 'bg-amber-50 border-amber-200' },
                { icon: <CheckSquare className="text-violet-600" size={24} />, title: 'Tablero de tareas', desc: 'Kanban compartido para organizar el trabajo del equipo.', color: 'bg-violet-50 border-violet-200' },
                { icon: <BarChart3 className="text-slate-600" size={24} />, title: 'Estadísticas', desc: 'Métricas de volumen, tiempos de respuesta y actividad.', color: 'bg-slate-50 border-slate-200' },
              ].map((card, i) => (
                <div key={i} className={`rounded-xl border p-5 ${card.color}`}>
                  <div className="mb-3">{card.icon}</div>
                  <h4 className="font-bold text-slate-800 text-sm mb-1">{card.title}</h4>
                  <p className="text-slate-600 text-xs leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section id="features" className="w-full bg-slate-50 py-20 lg:py-28">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center mb-14">
            <p className="text-emerald-600 text-xs font-bold tracking-widest uppercase mb-3">Funcionalidades reales</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
              Todo lo que necesitas, disponible hoy
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-base leading-relaxed">
              Cada módulo existe y funciona. Sin promesas vacías — solo herramientas reales.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <Inbox className="text-emerald-600" size={22} />,
                bg: 'bg-emerald-50',
                title: 'Bandeja Unificada',
                desc: 'Recibe y responde conversaciones de WhatsApp Business. Envía correos vía Gmail. Historial completo, búsqueda y filtros. Instagram y Messenger próximamente.',
              },
              {
                icon: <PhoneCall className="text-emerald-600" size={22} />,
                bg: 'bg-emerald-50',
                title: 'WhatsApp Business API',
                desc: 'Conexión oficial con la API de Meta. Texto, imágenes, audio, video y documentos. Estado de mensajes con doble check. Plantillas aprobadas y snippets de respuesta rápida.',
              },
              {
                icon: <Mail className="text-red-500" size={22} />,
                bg: 'bg-red-50',
                title: 'Envío de Correo — Gmail',
                desc: 'Conecta Gmail via OAuth 2.0. Redacta y envía correos a tus contactos del CRM. Solo envío saliente: no leemos ni almacenamos tu bandeja de entrada.',
              },
              {
                icon: <Users className="text-blue-600" size={22} />,
                bg: 'bg-blue-50',
                title: 'CRM con Pipeline',
                desc: 'Contactos con nombre, correo, teléfono, empresa y etapas personalizables. Propiedades custom, filtros avanzados y vinculación con conversaciones.',
              },
              {
                icon: <CheckSquare className="text-violet-600" size={22} />,
                bg: 'bg-violet-50',
                title: 'Tablero de Tareas',
                desc: 'Kanban con columnas pendiente, en progreso y completada. Asigna tareas a agentes, vincula con conversaciones o contactos.',
              },
              {
                icon: <Zap className="text-amber-500" size={22} />,
                bg: 'bg-amber-50',
                title: 'Flujos de Trabajo',
                desc: 'Automatizaciones multi-paso con condiciones y acciones. Envía mensajes, actualiza contactos, asigna agentes automáticamente.',
              },
              {
                icon: <Send className="text-indigo-600" size={22} />,
                bg: 'bg-indigo-50',
                title: 'Campañas Masivas',
                desc: 'Envía campañas a listas de contactos por WhatsApp (plantillas Meta) o por correo vía Gmail. Programa envíos y consulta historial.',
              },
              {
                icon: <BarChart3 className="text-slate-600" size={22} />,
                bg: 'bg-slate-100',
                title: 'Estadísticas',
                desc: 'Métricas de volumen de conversaciones, tiempo de respuesta, mensajes por canal y actividad por agente. Datos reales.',
              },
              {
                icon: <Key className="text-rose-500" size={22} />,
                bg: 'bg-rose-50',
                title: 'API Externa',
                desc: 'Genera API Keys para conectar Docre-A con sistemas externos. Envía mensajes, crea contactos y consulta conversaciones via REST API documentada.',
              },
              {
                icon: <Brain className="text-purple-600" size={22} />,
                bg: 'bg-purple-50',
                title: 'Asistente IA en el CRM',
                desc: 'Genera respuestas, resúmenes y sugerencias con inteligencia artificial directamente desde las conversaciones y el perfil de cada contacto en el CRM.',
              },
              {
                icon: <Share2 className="text-teal-600" size={22} />,
                bg: 'bg-teal-50',
                title: 'Conexión con plataformas de automatización',
                desc: 'Conecta Docre-A con plataformas de automatización externas para disparar flujos — integra con cualquier app, base de datos o servicio usando webhooks y la API REST.',
              },
            ].map((card, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-md hover:-translate-y-1 transition-all duration-200">
                <div className={`w-11 h-11 ${card.bg} rounded-xl flex items-center justify-center mb-4`}>
                  {card.icon}
                </div>
                <h3 className="font-bold text-slate-800 text-sm mb-2 uppercase tracking-wide">{card.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CHANNELS SECTION */}
      <section id="whatsapp" className="w-full bg-slate-50 py-20 lg:py-28">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Section header */}
          <div className="text-center mb-16">
            <p className="text-emerald-600 text-xs font-bold tracking-widest uppercase mb-3">Canales integrados</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
              Dos canales, una sola plataforma
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-base leading-relaxed">
              Gestiona WhatsApp Business y envía correos con Gmail sin salir de Docre-A.
              Cada canal con su propio historial, vinculado al mismo contacto del CRM.
            </p>
          </div>

          {/* ── WhatsApp ── */}
          <div id="wa-block" className="grid lg:grid-cols-2 gap-16 items-start mb-20 pb-20 border-b border-slate-200">

            {/* Left — visual card */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden order-2 lg:order-1">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50">
                <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 448 512" className="w-4 h-4 fill-green-500" xmlns="http://www.w3.org/2000/svg">
                    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                  </svg>
                </div>
                <div>
                  <div className="font-bold text-slate-800 text-sm">Carlos Mendoza</div>
                  <div className="text-slate-500 text-xs flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> WhatsApp Business
                  </div>
                </div>
                <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">Cotización</span>
              </div>

              {/* Chat */}
              <div className="px-5 py-4 space-y-2.5 bg-[#efeae2]">
                <div className="flex justify-end">
                  <div className="bg-[#dcf8c6] text-slate-800 text-sm rounded-xl rounded-tr-sm px-3 py-2 max-w-[75%] shadow-sm">
                    Hola, quisiera saber más sobre sus servicios
                    <div className="text-slate-400 text-xs mt-0.5 text-right">✔✔ 09:41</div>
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-white text-slate-800 text-sm rounded-xl rounded-tl-sm px-3 py-2 max-w-[75%] shadow-sm">
                    ¡Con gusto! ¿En qué área puedo ayudarte?
                    <div className="text-slate-400 text-xs mt-0.5">09:42</div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="bg-[#dcf8c6] text-slate-800 text-sm rounded-xl rounded-tr-sm px-3 py-2 max-w-[75%] shadow-sm">
                    Necesito cotización para 5 usuarios
                    <div className="text-slate-400 text-xs mt-0.5 text-right">✔✔ 09:43</div>
                  </div>
                </div>
              </div>

              {/* Footer CTA */}
              <div className="px-5 py-4 border-t border-slate-100">
                <button
                  onClick={onGoToLogin}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg transition-colors text-sm"
                >
                  Conectar WhatsApp Business →
                </button>
              </div>
            </div>

            {/* Right — copy */}
            <div className="order-1 lg:order-2">
              <p className="text-emerald-600 text-xs font-bold tracking-widest uppercase mb-3">WhatsApp Business API</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight mb-5">
                Atiende a tus clientes donde ya están: WhatsApp
              </h2>
              <p className="text-slate-600 text-base leading-relaxed mb-8">
                Conecta tu número de WhatsApp Business con la API oficial de Meta y
                gestiona todas las conversaciones desde Docre-A — sin tocar el teléfono.
              </p>

              <ul className="space-y-4 mb-8">
                {[
                  { title: 'Mensajes en tiempo real', desc: 'Texto, imágenes, audio, video y documentos desde el panel.' },
                  { title: 'Plantillas aprobadas por Meta', desc: 'Sincroniza y usa tus plantillas para notificaciones y campañas.' },
                  { title: 'Estado de entrega', desc: 'Ve si el mensaje fue enviado, entregado o leído. Doble check incluido.' },
                  { title: 'Respuestas rápidas', desc: 'Snippets pre-escritos para responder más rápido y con consistencia.' },
                  { title: 'Asignación de agentes', desc: 'Distribuye conversaciones entre agentes y supervisa la atención.' },
                ].map((item, i) => (
                  <li key={i} className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle className="text-emerald-600" size={14} />
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800 text-sm">{item.title}: </span>
                      <span className="text-slate-600 text-sm">{item.desc}</span>
                    </div>
                  </li>
                ))}
              </ul>

              <button
                onClick={onGoToLogin}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl transition-colors"
              >
                Empezar ahora <ArrowRight size={16} />
              </button>
            </div>
          </div>{/* end WA grid */}

          {/* ── Gmail ── */}
          <div id="gmail" className="grid lg:grid-cols-2 gap-16 items-start">

            {/* Left — copy */}
            <div>
              <p className="text-emerald-600 text-xs font-bold tracking-widest uppercase mb-3">Correo electrónico</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight mb-5">
                Envía correos a tus contactos sin salir de Docre-A
              </h2>
              <p className="text-slate-600 text-base leading-relaxed mb-8">
                Conecta tu cuenta de Gmail y redacta correos directamente desde la conversación o el perfil
                de cualquier contacto del CRM. El correo sale desde tu propia cuenta — sin intermediarios.
              </p>

              <ul className="space-y-4 mb-8">
                {[
                  { title: 'Un solo clic para conectar', desc: 'Vincula tu Gmail en segundos desde la configuración. No hace falta instalar nada.' },
                  { title: 'Historial unificado', desc: 'Cada correo enviado queda registrado en el perfil del contacto junto a sus conversaciones de WhatsApp.' },
                  { title: 'Para campañas también', desc: 'Usa Gmail para enviar campañas masivas de correo a segmentos de tu CRM directamente desde Docre-A.' },
                  { title: 'Tu cuenta, tu identidad', desc: 'Los correos salen desde tu dirección Gmail. Tus contactos ven tu nombre, no el de un servicio externo.' },
                ].map((item, i) => (
                  <li key={i} className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle className="text-emerald-600" size={14} />
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800 text-sm">{item.title}: </span>
                      <span className="text-slate-600 text-sm">{item.desc}</span>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="text-xs text-slate-400 leading-relaxed">
                La integración usa OAuth 2.0 de Google con permiso exclusivo de envío. Docre-A nunca lee
                ni almacena tu bandeja de entrada.{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-500 hover:underline"
                >
                  Más info →
                </a>
              </p>
            </div>

            {/* Right — visual card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <Mail className="text-red-500" size={20} />
                </div>
                <div>
                  <div className="font-bold text-slate-800 text-sm">Nueva conversación por correo</div>
                  <div className="text-slate-500 text-xs">Para: cliente@empresa.com</div>
                </div>
              </div>

              {[
                { label: 'Asunto', value: 'Seguimiento de tu solicitud' },
                { label: 'Desde', value: 'tu-cuenta@gmail.com' },
                { label: 'Contacto CRM', value: 'María López — Pipeline: Negociación' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center text-sm border-b border-slate-100 pb-3">
                  <span className="text-slate-500 font-medium">{row.label}</span>
                  <span className="text-slate-800 font-semibold text-right max-w-xs">{row.value}</span>
                </div>
              ))}

              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-slate-500 text-xs mb-1 font-semibold uppercase tracking-wide">Mensaje</p>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Hola María, quería darte seguimiento a tu consulta de la semana pasada...
                </p>
              </div>

              <button
                onClick={onGoToLogin}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors text-sm"
              >
                Conectar mi Gmail →
              </button>
            </div>
          </div>{/* end Gmail grid */}

        </div>
      </section>

      {/* BENEFITS */}
      <section id="benefits" className="w-full bg-slate-50 py-20 lg:py-28">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center mb-14">
            <p className="text-emerald-600 text-xs font-bold tracking-widest uppercase mb-3">Ventajas reales</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
              Los beneficios de usar Docre-A
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: '🧩', title: 'Todo en un lugar', desc: 'WhatsApp y Gmail en una sola pantalla. Instagram y Messenger se suman próximamente.' },
              { icon: '👁️', title: 'Visibilidad completa', desc: 'Estado de cada mensaje: enviado, entregado y leído. Historial completo por contacto.' },
              { icon: '⚡', title: 'Respuestas rápidas', desc: 'Snippets y plantillas pre-escritas para responder al instante con consistencia.' },
              { icon: '🔁', title: 'Automatizaciones', desc: 'Flujos que ejecutan tareas repetitivas automáticamente. Menos trabajo, más resultados.' },
              { icon: '📋', title: 'CRM integrado', desc: 'Cada conversación vinculada a un contacto con historial completo y etapa de pipeline.' },
              { icon: '👥', title: 'Control de roles', desc: 'Admin con acceso total, Gerente para supervisión, Agente para atención al cliente.' },
              { icon: '📡', title: 'API para integraciones', desc: 'Conecta Docre-A con tus sistemas usando nuestra REST API documentada.' },
              { icon: '🔒', title: 'Datos aislados', desc: 'Multi-tenant con Row Level Security: los datos de tu organización son completamente privados.' },
            ].map((b, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 text-center hover:shadow-md transition-shadow">
                <div className="text-3xl mb-4">{b.icon}</div>
                <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wide mb-2">{b.title}</h4>
                <p className="text-slate-600 text-sm leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="w-full bg-slate-50 py-20 lg:py-28">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-8 lg:px-12">

          <div className="text-center mb-14">
            <p className="text-emerald-600 text-xs font-bold tracking-widest uppercase mb-3">Planes y paquetes</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
              Paga según lo que usas, no lo que no necesitas
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-base leading-relaxed">
              Cada plan define límites de consumo claros — contactos, conversaciones y campañas.
              Más consumo, más plan. Sin sorpresas.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 2xl:grid-cols-4 gap-8 items-stretch">

            {/* Plan Básico */}
            <div className="bg-white rounded-2xl border border-slate-200 p-7 flex flex-col hover:shadow-md transition-shadow">
              <div className="mb-5">
                <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center mb-4">
                  <Users className="text-emerald-600" size={22} />
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 mb-1">Básico</h3>
                <p className="text-slate-500 text-sm leading-snug">Para negocios pequeños que inician con WhatsApp</p>
              </div>

              {/* Cuota de consumo */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-5 space-y-2">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">Cuota mensual incluida</p>
                {[
                  ['Contactos CRM', '500'],
                  ['Conversaciones / mes', '1,000'],
                  ['Mensajes de campaña / mes', '500'],
                  ['Ejecuciones de flujo / mes', '50'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-bold text-emerald-700">{value}</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-emerald-100 flex items-center justify-between text-sm">
                  <span className="text-slate-600">Número WhatsApp</span>
                  <span className="font-bold text-emerald-700">1</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Agentes</span>
                  <span className="font-bold text-emerald-700">3</span>
                </div>
              </div>

              {/* Funcionalidades */}
              <ul className="space-y-2.5 flex-1 mb-8">
                {[
                  'Bandeja unificada (WhatsApp + Gmail)',
                  'CRM con pipeline de ventas',
                  'Importar y exportar contactos',
                  'Plantillas y snippets de respuesta rápida',
                  'Tablero de tareas Kanban',
                  '3 roles: Admin, Gerente y Agente',
                  'Asistente IA (con tu propio token de API)',
                  'Estadísticas básicas de conversaciones',
                  'Soporte por correo electrónico',
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle className="text-emerald-500 flex-shrink-0 mt-0.5" size={15} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => scrollTo('contact')}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 rounded-xl transition-colors text-sm border border-slate-200"
              >
                Solicitar información →
              </button>
            </div>

            {/* Plan Intermedio - POPULAR */}
            <div className="bg-slate-900 rounded-2xl p-7 flex flex-col relative ring-2 ring-emerald-500 shadow-xl">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="bg-emerald-500 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wide shadow">
                  Más popular
                </span>
              </div>
              <div className="mb-5">
                <div className="w-11 h-11 bg-white/10 rounded-xl flex items-center justify-center mb-4">
                  <Zap className="text-emerald-400" size={22} />
                </div>
                <h3 className="text-xl font-extrabold text-white mb-1">Intermedio</h3>
                <p className="text-slate-400 text-sm leading-snug">Para equipos en crecimiento con automatización y campañas</p>
              </div>

              {/* Cuota de consumo */}
              <div className="bg-white/10 border border-white/20 rounded-xl p-4 mb-5 space-y-2">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wide mb-1">Cuota mensual incluida</p>
                {[
                  ['Contactos CRM', '2,500'],
                  ['Conversaciones / mes', '5,000'],
                  ['Mensajes de campaña / mes', '5,000'],
                  ['Ejecuciones de flujo / mes', '500'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{label}</span>
                    <span className="font-bold text-emerald-400">{value}</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-white/10 flex items-center justify-between text-sm">
                  <span className="text-slate-300">Números WhatsApp</span>
                  <span className="font-bold text-emerald-400">2</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">Agentes</span>
                  <span className="font-bold text-emerald-400">10</span>
                </div>
              </div>

              {/* Funcionalidades */}
              <ul className="space-y-2.5 flex-1 mb-8">
                {[
                  'Todo lo del plan Básico',
                  'CRM avanzado con propiedades personalizadas',
                  'Listas dinámicas y segmentación de contactos',
                  'Constructor de formularios web embebibles',
                  'Flujos de trabajo automatizados',
                  'Campañas masivas (WhatsApp y correo)',
                  'Notificaciones push',
                  'Soporte prioritario',
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-200">
                    <CheckCircle className="text-emerald-400 flex-shrink-0 mt-0.5" size={15} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={onGoToLogin}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl transition-colors text-sm"
              >
                Empezar ahora →
              </button>
            </div>

            {/* Plan Avanzado */}
            <div className="bg-white rounded-2xl border border-slate-200 p-7 flex flex-col hover:shadow-md transition-shadow">
              <div className="mb-5">
                <div className="w-11 h-11 bg-violet-50 rounded-xl flex items-center justify-center mb-4">
                  <Shield className="text-violet-600" size={22} />
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 mb-1">Avanzado</h3>
                <p className="text-slate-500 text-sm leading-snug">Para empresas medianas con múltiples equipos e integraciones</p>
              </div>

              {/* Cuota de consumo */}
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 mb-5 space-y-2">
                <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-1">Cuota mensual incluida</p>
                {[
                  ['Contactos CRM', '15,000'],
                  ['Conversaciones / mes', '25,000'],
                  ['Mensajes de campaña / mes', '25,000'],
                  ['Ejecuciones de flujo / mes', 'Ilimitadas'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-bold text-violet-700">{value}</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-violet-100 flex items-center justify-between text-sm">
                  <span className="text-slate-600">Números WhatsApp</span>
                  <span className="font-bold text-violet-700">5</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Agentes</span>
                  <span className="font-bold text-violet-700">25</span>
                </div>
              </div>

              {/* Funcionalidades */}
              <ul className="space-y-2.5 flex-1 mb-8">
                {[
                  'Todo lo del plan Intermedio',
                  'Flujos de trabajo ilimitados',
                  'API externa con claves de acceso',
                  'Webhook de automatización hacia sistemas externos',
                  'Múltiples organizaciones',
                  'Informes de rendimiento por agente',
                  'Soporte dedicado',
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle className="text-emerald-500 flex-shrink-0 mt-0.5" size={15} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => scrollTo('contact')}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 rounded-xl transition-colors text-sm border border-slate-200"
              >
                Solicitar información →
              </button>
            </div>

            {/* Plan Corporativo */}
            <div className="bg-white rounded-2xl border border-slate-200 p-7 flex flex-col hover:shadow-md transition-shadow">
              <div className="mb-5">
                <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center mb-4">
                  <Star className="text-amber-500" size={22} fill="currentColor" />
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 mb-1">Corporativo</h3>
                <p className="text-slate-500 text-sm leading-snug">Para corporaciones con SLA garantizado y sin límites de uso</p>
              </div>

              {/* Cuota de consumo */}
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-5 space-y-2">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Consumo sin límites</p>
                {[
                  ['Contactos CRM', 'Ilimitados'],
                  ['Conversaciones / mes', 'Ilimitadas'],
                  ['Mensajes de campaña / mes', 'Ilimitados'],
                  ['Ejecuciones de flujo / mes', 'Ilimitadas'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-bold text-amber-700">{value}</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-amber-100 flex items-center justify-between text-sm">
                  <span className="text-slate-600">Números WhatsApp</span>
                  <span className="font-bold text-amber-700">Ilimitados</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Agentes</span>
                  <span className="font-bold text-amber-700">Ilimitados</span>
                </div>
              </div>

              {/* Funcionalidades */}
              <ul className="space-y-2.5 flex-1 mb-8">
                {[
                  'Todo lo del plan Avanzado',
                  'Organizaciones ilimitadas',
                  'Onboarding personalizado incluido',
                  'Manager de cuenta exclusivo',
                  'SLA de disponibilidad garantizado',
                  'Integraciones y configuraciones a medida',
                  'Soporte 24/7 dedicado',
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle className="text-emerald-500 flex-shrink-0 mt-0.5" size={15} />
                    {f}
                  </li>
                ))}
                <li className="flex items-start gap-2.5 text-sm text-slate-400">
                  <CheckCircle className="text-slate-300 flex-shrink-0 mt-0.5" size={15} />
                  <span>Agente de voz y canales adicionales{' '}<span className="text-xs font-semibold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">Próximamente</span></span>
                </li>
              </ul>
              <button
                onClick={() => scrollTo('contact')}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-colors text-sm"
              >
                Contactar ventas →
              </button>
            </div>

          </div>

          <p className="text-center text-slate-500 text-sm mt-10">
            ¿Necesitas más consumo o un plan a tu medida?{' '}
            <button
              onClick={() => scrollTo('contact')}
              className="text-emerald-600 font-semibold hover:underline"
            >
              Escríbenos y lo armamos juntos →
            </button>
          </p>

        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="w-full bg-white py-20 lg:py-28">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center mb-14">
            <p className="text-emerald-600 text-xs font-bold tracking-widest uppercase mb-3">Usuarios</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
              Lo que dirán nuestros usuarios
            </h2>
            <p className="text-slate-600 max-w-xl mx-auto text-base">
              Esta sección se actualizará con testimonios verificados de empresas que ya usan Docre-A.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 mb-12">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col gap-4">
                <div className="flex text-amber-400 text-sm gap-0.5">
                  {[...Array(5)].map((_, j) => <Star key={j} size={14} fill="currentColor" />)}
                </div>
                <p className="text-slate-500 text-sm leading-relaxed italic flex-1">
                  "Testimonio real próximamente. En fase de primeros usuarios — esta reseña será reemplazada por una experiencia verificada."
                </p>
                <div className="flex items-center gap-3 pt-3 border-t border-slate-200">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-bold text-base">?</div>
                  <div>
                    <div className="font-bold text-slate-700 text-sm">Próximamente</div>
                    <div className="text-emerald-600 text-xs">Testimonio verificado</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <button
              onClick={onGoToLogin}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-4 rounded-xl transition-colors shadow-lg"
            >
              Sé de los primeros en usar Docre-A <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="w-full bg-slate-50 py-20 lg:py-28">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <p className="text-emerald-600 text-xs font-bold tracking-widest uppercase mb-3">Contáctanos</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">¿Listo para empezar?</h2>

              {formSent && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-lg mb-6">
                  <CheckCircle size={16} className="flex-shrink-0" />
                  Se abrió tu cliente de correo con el mensaje listo. ¡Gracias!
                </div>
              )}

              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-lg mb-4">
                <Mail size={15} className="flex-shrink-0 mt-0.5 text-emerald-600" />
                <span>Escríbenos tus preguntas a{' '}<a href="mailto:notificaciones@docreativelatam.com" className="font-semibold underline hover:text-emerald-700">notificaciones@docreativelatam.com</a></span>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Nombre *</label>
                    <input
                      name="nombre"
                      required
                      placeholder="Tu nombre"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Empresa</label>
                    <input
                      name="empresa"
                      placeholder="Tu empresa"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Correo *</label>
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="correo@empresa.com"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">WhatsApp</label>
                    <input
                      name="telefono"
                      placeholder="+503 0000-0000"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Asunto</label>
                  <select
                    name="asunto"
                    defaultValue=""
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                  >
                    <option value="" disabled>Selecciona un tema</option>
                    <option value="demo">Solicitar demostración</option>
                    <option value="integracion-whatsapp">Integración WhatsApp API</option>
                    <option value="integracion-gmail">Integración Gmail</option>
                    <option value="api">API y desarrolladores</option>
                    <option value="soporte">Soporte técnico</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Mensaje *</label>
                  <textarea
                    name="mensaje"
                    required
                    rows={4}
                    placeholder="Cuéntanos sobre tu negocio y qué necesitas..."
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white resize-y"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors text-sm uppercase tracking-wide"
                >
                  Enviar mensaje →
                </button>
              </form>
            </div>

            <div className="space-y-6">
              <div className="bg-slate-900 rounded-2xl p-8 text-white">
                <div className="bg-emerald-500 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                  <MessageSquare size={24} className="text-white" />
                </div>
                <h3 className="text-xl font-extrabold mb-3">Accede ahora mismo</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Entra directamente a la plataforma. Si ya tienes cuenta, inicia sesión.
                  Si no, crea una nueva organización en minutos.
                </p>
                <button
                  onClick={onGoToLogin}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                >
                  Ir al panel de control →
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <h4 className="font-bold text-slate-800">Información de contacto</h4>
                <div className="flex items-center gap-3">
                  <Mail className="text-emerald-600 flex-shrink-0" size={18} />
                  <a href="mailto:notificaciones@docreativelatam.com" className="text-sm text-slate-700 hover:text-emerald-600 transition-colors">
                    notificaciones@docreativelatam.com
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <Globe className="text-emerald-600 flex-shrink-0" size={18} />
                  <a
                    href="https://docreativelatam.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate-700 hover:text-emerald-600 transition-colors"
                  >
                    docreativelatam.com
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <Lock className="text-emerald-600 flex-shrink-0" size={18} />
                  <a
                    href="https://dashboardchat.docreativelatam.com/politicas-de-privacidad"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate-700 hover:text-emerald-600 transition-colors"
                  >
                    Políticas de privacidad
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="w-full bg-slate-900 border-t border-slate-700">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid sm:grid-cols-3 gap-10 mb-10">

            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-emerald-600 p-1.5 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <span className="text-white font-bold text-lg">
                  Docre<span className="text-emerald-400">-A</span>
                </span>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed mb-3">
                Plataforma de mensajería empresarial integrada. WhatsApp Business y Gmail en un solo panel,
                con CRM, flujos de trabajo y campañas masivas.
              </p>
              <p className="text-slate-600 text-xs">Domen Capital S.A. De C.V. — El Salvador</p>
            </div>

            <div>
              <h5 className="text-slate-300 font-semibold text-xs uppercase tracking-widest mb-4">Plataforma</h5>
              <ul className="space-y-2.5">
                {[
                  { label: 'Funcionalidades', action: () => scrollTo('features') },
                  { label: 'WhatsApp & Gmail', action: () => scrollTo('whatsapp') },
                  { label: 'Beneficios', action: () => scrollTo('benefits') },
                  { label: 'Planes', action: () => scrollTo('pricing') },
                  { label: 'Iniciar sesión', action: onGoToLogin },
                ].map(item => (
                  <li key={item.label}>
                    <button
                      onClick={item.action}
                      className="text-slate-400 hover:text-white text-sm transition-colors text-left"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h5 className="text-slate-300 font-semibold text-xs uppercase tracking-widest mb-4">Legal</h5>
              <ul className="space-y-2.5">
                <li>
                  <a
                    href="https://dashboardchat.docreativelatam.com/politicas-de-privacidad"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-white text-sm transition-colors flex items-center gap-1.5"
                  >
                    Políticas de privacidad <ExternalLink size={11} className="opacity-50" />
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:notificaciones@docreativelatam.com"
                    className="text-slate-400 hover:text-white text-sm transition-colors"
                  >
                    notificaciones@docreativelatam.com
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-700/60 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-slate-600 text-xs">
              © {new Date().getFullYear()} Docre-A · Domen Capital S.A. De C.V. — Todos los derechos reservados.
            </p>
            <a
              href="https://dashboardchat.docreativelatam.com/politicas-de-privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-emerald-400 text-xs transition-colors"
            >
              Políticas de Privacidad
            </a>
          </div>
        </div>
      </footer>

      {/* WhatsApp float button */}
      <a
        href="https://wa.me/TUNUMERO?text=Hola%2C%20me%20interesa%20Docre-A"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-110"
        aria-label="Contactar por WhatsApp"
      >
        <svg viewBox="0 0 448 512" className="w-7 h-7 fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
        </svg>
      </a>

    </div>
  );
};

export default LandingPage;
