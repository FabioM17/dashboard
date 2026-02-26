import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { navigateBack } from '../services/navigationService';

interface DataDeletionPolicyScreenProps {
  onBack?: () => void;
}

const DataDeletionPolicyScreen: React.FC<DataDeletionPolicyScreenProps> = ({ onBack }) => {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigateBack();
    }
  };

  // SEO meta tags and structured data for Google / Meta compliance
  useEffect(() => {
    document.title = 'Eliminación de Datos de Usuario - Docre-A';

    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', 'Guía completa para eliminar tus datos de usuario en la plataforma Docre-A de Domen Capital S.A. De C.V. Instrucciones paso a paso para la eliminación de datos conforme a GDPR, requisitos de Meta y políticas de Google.');

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `${window.location.origin}/eliminacion-de-datos`);

    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement('meta');
      ogTitle.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute('content', 'Eliminación de Datos de Usuario - Docre-A');

    let ogDescription = document.querySelector('meta[property="og:description"]');
    if (!ogDescription) {
      ogDescription = document.createElement('meta');
      ogDescription.setAttribute('property', 'og:description');
      document.head.appendChild(ogDescription);
    }
    ogDescription.setAttribute('content', 'Guía para eliminar datos de usuario en Docre-A. Cumplimiento GDPR, Meta y Google.');

    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.setAttribute('content', `${window.location.origin}/eliminacion-de-datos`);

    // Schema.org structured data for data deletion instructions
    const structuredDataScript = document.createElement('script');
    structuredDataScript.type = 'application/ld+json';
    structuredDataScript.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      'name': 'Eliminación de Datos de Usuario - Docre-A',
      'description': 'Instrucciones para eliminar datos de usuario de la plataforma Docre-A',
      'url': `${window.location.origin}/eliminacion-de-datos`,
      'publisher': {
        '@type': 'Organization',
        'name': 'Domen Capital S.A. De C.V.',
        'contactPoint': {
          '@type': 'ContactPoint',
          'email': 'notificaciones@docreativelatam.com',
          'contactType': 'Customer Support'
        }
      },
      'mainEntity': {
        '@type': 'HowTo',
        'name': 'Cómo eliminar tus datos de Docre-A',
        'description': 'Guía paso a paso para eliminar datos personales de la plataforma Docre-A',
        'step': [
          {
            '@type': 'HowToStep',
            'name': 'Iniciar sesión',
            'text': 'Inicia sesión en tu cuenta de Docre-A con tus credenciales.'
          },
          {
            '@type': 'HowToStep',
            'name': 'Ir a Configuración',
            'text': 'Navega a la sección de Configuración en el panel lateral.'
          },
          {
            '@type': 'HowToStep',
            'name': 'Acceder a Gestión de Datos',
            'text': 'Dentro de Configuración, haz clic en "Gestión de Datos" o "Eliminación de Datos".'
          },
          {
            '@type': 'HowToStep',
            'name': 'Seleccionar nivel de eliminación',
            'text': 'Elige el nivel de eliminación apropiado: anonimizar datos personales, eliminar un miembro, o eliminar toda la organización.'
          },
          {
            '@type': 'HowToStep',
            'name': 'Confirmar eliminación',
            'text': 'Escribe la frase de confirmación requerida y confirma la acción de eliminación.'
          }
        ]
      },
      'datePublished': '2026-02-25',
      'dateModified': new Date().toISOString().split('T')[0],
      'inLanguage': 'es'
    });
    document.head.appendChild(structuredDataScript);

    return () => {
      if (document.head.contains(structuredDataScript)) {
        document.head.removeChild(structuredDataScript);
      }
    };
  }, []);

  return (
    <div className="h-screen w-screen bg-white overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 shadow-sm z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Atrás"
          >
            <ArrowLeft size={24} className="text-slate-700" />
          </button>
          <h1 className="text-2xl font-bold text-slate-800">Eliminación de Datos de Usuario</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8 text-slate-700 leading-relaxed">

        {/* Introduction */}
        <section className="mb-8">
          <p className="mb-4">
            <strong>Domen Capital S.A. De C.V.</strong> se compromete a proteger la privacidad de sus usuarios y a cumplir con todas las regulaciones de protección de datos aplicables, incluyendo la Ley para la Protección de Datos Personales de El Salvador (Decreto No. 144 de 2024), las políticas de plataforma de Meta (Facebook/Instagram/WhatsApp), y las políticas de Google.
          </p>
          <p className="mb-4">
            Este documento describe cómo los usuarios de la plataforma <strong>Docre-A</strong> pueden solicitar y ejecutar la eliminación de sus datos personales y de su organización.
          </p>
          <p className="mb-4">
            La URL de eliminación de datos es: <a href={`${typeof window !== 'undefined' ? window.location.origin : ''}/eliminacion-de-datos`} className="text-emerald-600 hover:underline font-medium">{typeof window !== 'undefined' ? window.location.origin : ''}/eliminacion-de-datos</a>
          </p>
        </section>

        {/* What data we collect */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">1. Datos que recopilamos</h2>
          <p className="mb-4">Docre-A recopila y almacena los siguientes tipos de datos:</p>
          <div className="bg-slate-50 rounded-xl p-5 mb-4">
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <div>
                  <strong className="text-slate-800">Datos de Cuenta:</strong>
                  <span className="text-slate-600"> Nombre, correo electrónico, contraseña (cifrada), número de teléfono, foto de perfil, rol en la organización.</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <div>
                  <strong className="text-slate-800">Datos de la Organización:</strong>
                  <span className="text-slate-600"> Nombre de la empresa, correo de soporte, configuraciones de integración (WhatsApp, Gmail, AI).</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <div>
                  <strong className="text-slate-800">Datos de Comunicación:</strong>
                  <span className="text-slate-600"> Conversaciones de WhatsApp, Instagram y Messenger, mensajes enviados y recibidos, archivos multimedia, estados de entrega de mensajes.</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                <div>
                  <strong className="text-slate-800">Datos de CRM:</strong>
                  <span className="text-slate-600"> Contactos, propiedades personalizadas, etapas del pipeline, listas y segmentos.</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">5</span>
                <div>
                  <strong className="text-slate-800">Datos Operacionales:</strong>
                  <span className="text-slate-600"> Tareas, campañas, workflows, plantillas de mensajes, snippets, claves API, notas.</span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">6</span>
                <div>
                  <strong className="text-slate-800">Archivos:</strong>
                  <span className="text-slate-600"> Imágenes, documentos, audios y videos que se envían o reciben a través de la plataforma.</span>
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* Deletion Levels */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">2. Niveles de Eliminación de Datos</h2>
          <p className="mb-4">Ofrecemos tres niveles de eliminación para adaptarnos a diferentes necesidades:</p>

          {/* Level 1 */}
          <div className="border border-blue-200 rounded-xl p-5 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center">1</span>
              <h3 className="text-lg font-bold text-blue-800">Anonimización de Datos Personales</h3>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              <strong>Quién puede hacerlo:</strong> Cualquier usuario registrado para sus propios datos.
            </p>
            <p className="text-sm text-slate-600 mb-3">
              Este nivel elimina toda la información personal identificable (PII) del perfil del usuario, pero mantiene los datos organizacionales intactos para no interrumpir las operaciones del equipo.
            </p>
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-800 mb-2">Datos que se eliminan o anonimizan:</p>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>✓ Nombre → reemplazado por "Usuario Eliminado"</li>
                <li>✓ Email → reemplazado por identificador anónimo</li>
                <li>✓ Foto de perfil → eliminada</li>
                <li>✓ Número de teléfono → eliminado</li>
                <li>✓ Asignaciones de leads y jerarquía de equipo → eliminadas</li>
                <li>✓ Autoría de notas y mensajes → desvinculada</li>
              </ul>
            </div>
          </div>

          {/* Level 2 */}
          <div className="border border-orange-200 rounded-xl p-5 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 text-sm font-bold flex items-center justify-center">2</span>
              <h3 className="text-lg font-bold text-orange-800">Eliminación de Cuenta de Miembro</h3>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              <strong>Quién puede hacerlo:</strong> Solo el administrador creador de la organización.
            </p>
            <p className="text-sm text-slate-600 mb-3">
              Este nivel elimina completamente la cuenta de un miembro invitado, incluyendo su perfil, datos de autenticación y todos los registros asociados a ese usuario.
            </p>
            <div className="bg-orange-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-orange-800 mb-2">Datos que se eliminan:</p>
              <ul className="text-xs text-orange-700 space-y-1">
                <li>✓ Perfil completo del usuario</li>
                <li>✓ Cuenta de autenticación (login/contraseña)</li>
                <li>✓ Tareas asignadas al usuario</li>
                <li>✓ Notas creadas por el usuario</li>
                <li>✓ Asignaciones de leads y relaciones de equipo</li>
                <li>✓ Notificaciones programadas del usuario</li>
                <li>✓ Archivos almacenados del usuario</li>
                <li>✓ Los mensajes del usuario quedan con autor anónimo</li>
              </ul>
            </div>
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800">
                <strong>Protección:</strong> Los administradores invitados no pueden eliminar al administrador creador original de la organización. Solo el creador puede realizar eliminaciones de miembros.
              </p>
            </div>
          </div>

          {/* Level 3 */}
          <div className="border-2 border-red-200 rounded-xl p-5 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-8 h-8 rounded-lg bg-red-100 text-red-700 text-sm font-bold flex items-center justify-center">3</span>
              <h3 className="text-lg font-bold text-red-800">Eliminación Completa de la Organización</h3>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              <strong>Quién puede hacerlo:</strong> Exclusivamente el administrador creador de la organización.
            </p>
            <p className="text-sm text-slate-600 mb-3">
              Este es el nivel máximo de eliminación. Borra <strong>absolutamente todos</strong> los datos de la organización, incluyendo las cuentas de todos los miembros del equipo y del propio administrador creador. Esta acción es <strong>permanente e irreversible</strong>.
            </p>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-800 mb-2">Todos los datos eliminados:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <ul className="text-xs text-red-700 space-y-1">
                  <li>✓ La organización completa</li>
                  <li>✓ Todos los perfiles de miembros</li>
                  <li>✓ Todas las cuentas de autenticación</li>
                  <li>✓ Todas las conversaciones</li>
                  <li>✓ Todos los mensajes</li>
                  <li>✓ Todos los estados de entrega</li>
                  <li>✓ Todos los contactos CRM</li>
                  <li>✓ Todas las propiedades personalizadas</li>
                  <li>✓ Todas las listas y segmentos</li>
                </ul>
                <ul className="text-xs text-red-700 space-y-1">
                  <li>✓ Todas las campañas</li>
                  <li>✓ Todos los workflows y enrollments</li>
                  <li>✓ Todas las tareas</li>
                  <li>✓ Todas las notas</li>
                  <li>✓ Todas las plantillas de mensajes</li>
                  <li>✓ Todos los snippets</li>
                  <li>✓ Todas las claves API</li>
                  <li>✓ Todas las configuraciones de integración</li>
                  <li>✓ Todos los archivos almacenados</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Step by step guide */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">3. Cómo Eliminar tus Datos (Paso a Paso)</h2>

          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">1</div>
              <div>
                <h4 className="font-semibold text-slate-800">Inicia sesión en tu cuenta</h4>
                <p className="text-sm text-slate-600">
                  Ve a <a href="https://dashboardchat.docreativelatam.com" className="text-emerald-600 hover:underline">dashboardchat.docreativelatam.com</a> e ingresa con tu correo electrónico y contraseña.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">2</div>
              <div>
                <h4 className="font-semibold text-slate-800">Navega a Configuración</h4>
                <p className="text-sm text-slate-600">
                  En el panel lateral izquierdo, haz clic en el ícono de engranaje (⚙️) para acceder a la sección de Configuración.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">3</div>
              <div>
                <h4 className="font-semibold text-slate-800">Accede a "Gestión de Datos"</h4>
                <p className="text-sm text-slate-600">
                  En la pantalla de Configuración, busca y haz clic en la pestaña <strong>"Gestión de Datos"</strong>. Esta pestaña tiene un ícono de base de datos.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">4</div>
              <div>
                <h4 className="font-semibold text-slate-800">Selecciona el nivel de eliminación</h4>
                <p className="text-sm text-slate-600">
                  Verás los niveles de eliminación disponibles según tu rol:
                </p>
                <ul className="text-sm text-slate-600 mt-2 space-y-1 ml-4 list-disc">
                  <li><strong>Todos los usuarios:</strong> Pueden anonimizar sus datos personales (Nivel 1)</li>
                  <li><strong>Administrador creador:</strong> Puede eliminar miembros individuales (Nivel 2) o toda la organización (Nivel 3)</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">5</div>
              <div>
                <h4 className="font-semibold text-slate-800">Confirma la eliminación</h4>
                <p className="text-sm text-slate-600">
                  Por seguridad, deberás escribir una frase de confirmación específica (por ejemplo, "ELIMINAR TODO") para proceder con la eliminación. Esto previene acciones accidentales.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">6</div>
              <div>
                <h4 className="font-semibold text-slate-800">Proceso completado</h4>
                <p className="text-sm text-slate-600">
                  Una vez confirmada, la eliminación se ejecuta inmediatamente. Recibirás una confirmación en pantalla. Si eliminaste tu propia cuenta o la organización, serás redirigido a la pantalla de inicio de sesión.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Alternative: Contact support */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">4. Solicitar Eliminación por Correo Electrónico</h2>
          <p className="mb-4">
            Si no puedes acceder a tu cuenta o prefieres que nuestro equipo se encargue, puedes solicitar la eliminación de datos enviando un correo a:
          </p>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-4">
            <p className="text-center">
              <a href="mailto:notificaciones@docreativelatam.com" className="text-lg font-bold text-emerald-700 hover:underline">
                notificaciones@docreativelatam.com
              </a>
            </p>
          </div>
          <p className="mb-4">Tu solicitud debe incluir:</p>
          <ul className="list-disc list-inside ml-4 mb-4 space-y-2 text-sm">
            <li>Asunto: "Solicitud de Eliminación de Datos - [Tu Nombre]"</li>
            <li>Tu nombre completo</li>
            <li>El correo electrónico asociado a tu cuenta</li>
            <li>El nombre de tu organización</li>
            <li>El nivel de eliminación deseado (Nivel 1, 2 o 3)</li>
            <li>Una declaración explícita de que comprendes que la eliminación es irreversible</li>
          </ul>
          <p className="text-sm text-slate-600">
            Procesaremos tu solicitud dentro de un plazo máximo de <strong>30 días naturales</strong> desde la recepción. Recibirás una confirmación por correo electrónico una vez completada la eliminación.
          </p>
        </section>

        {/* Data retention */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">5. Retención de Datos</h2>
          <p className="mb-4">
            Los datos del usuario se retienen mientras la cuenta esté activa. Después de la eliminación:
          </p>
          <ul className="list-disc list-inside ml-4 mb-4 space-y-2 text-sm">
            <li><strong>Eliminación inmediata:</strong> Los datos se eliminan de nuestras bases de datos activas inmediatamente al ejecutar la solicitud.</li>
            <li><strong>Copias de seguridad:</strong> Los datos pueden persistir en copias de seguridad automatizadas por un período máximo de 30 días, después del cual se eliminan automáticamente.</li>
            <li><strong>Registros legales:</strong> Ciertos registros pueden conservarse según lo requiera la ley aplicable de El Salvador, incluyendo registros fiscales y de facturación.</li>
          </ul>
        </section>

        {/* Third party */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">6. Datos en Servicios de Terceros</h2>
          <p className="mb-4">
            Al eliminar datos de Docre-A, ten en cuenta que:
          </p>
          <ul className="list-disc list-inside ml-4 mb-4 space-y-2 text-sm">
            <li><strong>Meta (WhatsApp/Instagram/Messenger):</strong> Los mensajes enviados a través de la API de WhatsApp Business, Instagram o Messenger se eliminan de nuestros servidores, pero las copias en el dispositivo del destinatario permanecen bajo el control de Meta.</li>
            <li><strong>Google (Gmail):</strong> Los correos enviados a través de la integración de Gmail se eliminan de nuestros registros, pero permanecen en la cuenta de Gmail del remitente y destinatario.</li>
            <li><strong>Supabase:</strong> Los datos se eliminan de la infraestructura de Supabase conforme a sus políticas de retención.</li>
            <li><strong>Google Gemini (AI):</strong> Los prompts enviados a la API de Gemini se procesan según las políticas de privacidad de Google AI. No almacenamos respuestas de AI de forma permanente.</li>
          </ul>
        </section>

        {/* Meta specific compliance */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">7. Cumplimiento con la Plataforma de Meta</h2>
          <p className="mb-4">
            De acuerdo con los requisitos de la <strong>Plataforma de Meta</strong> para aplicaciones que utilizan la API de WhatsApp Business, la API de Instagram Graph y la API de Facebook Login:
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-4">
            <h4 className="font-semibold text-blue-800 mb-3">Instrucciones de Eliminación de Datos (Data Deletion Instructions URL)</h4>
            <p className="text-sm text-blue-700 mb-3">
              Nuestra aplicación proporciona a Meta la URL de instrucciones de eliminación de datos como mecanismo de cumplimiento. Cuando un usuario desea eliminar los datos asociados a su cuenta de Facebook/Instagram/WhatsApp:
            </p>
            <ol className="text-sm text-blue-700 space-y-2 list-decimal list-inside">
              <li>El usuario puede visitar esta página ({typeof window !== 'undefined' ? window.location.origin : ''}/eliminacion-de-datos) y seguir las instrucciones.</li>
              <li>Un administrador de la organización puede eliminar los datos del usuario desde Configuración → Gestión de Datos.</li>
              <li>Alternativamente, el usuario puede solicitar la eliminación por correo electrónico a notificaciones@docreativelatam.com.</li>
              <li>Al eliminar la organización (Nivel 3), se eliminan todas las configuraciones de integración con Meta, incluyendo tokens y datos de WhatsApp Business.</li>
            </ol>
            <p className="text-sm text-blue-700 mt-3">
              <strong>URL de instrucciones de eliminación:</strong> <a href={`${typeof window !== 'undefined' ? window.location.origin : ''}/eliminacion-de-datos`} className="underline">{typeof window !== 'undefined' ? window.location.origin : ''}/eliminacion-de-datos</a>
            </p>
          </div>
        </section>

        {/* Google specific compliance */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">8. Cumplimiento con las Políticas de Google</h2>
          <p className="mb-4">
            De acuerdo con las <strong>Políticas de API de Google</strong> y los requisitos de verificación de OAuth:
          </p>
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-4">
            <ul className="text-sm text-green-800 space-y-3">
              <li className="flex items-start gap-2">
                <span className="font-bold text-green-700 mt-0.5">✓</span>
                <span><strong>Acceso OAuth:</strong> Los usuarios pueden revocar el acceso de Docre-A a su cuenta de Google en cualquier momento desde <a href="https://myaccount.google.com/permissions" className="underline">myaccount.google.com/permissions</a>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-green-700 mt-0.5">✓</span>
                <span><strong>Tokens:</strong> Al eliminar datos de nuestra plataforma, se eliminan los tokens de Google almacenados en nuestra base de datos (refresh token y access token). Para revocar completamente el acceso, recomendamos también revocar los permisos desde <a href="https://myaccount.google.com/permissions" className="underline">myaccount.google.com/permissions</a>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-green-700 mt-0.5">✓</span>
                <span><strong>Datos de Gmail:</strong> Solo almacenamos la dirección de correo asociada y los tokens de autenticación. No almacenamos el contenido de los correos de Gmail del usuario.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-green-700 mt-0.5">✓</span>
                <span><strong>Eliminación transparente:</strong> Los usuarios pueden ver exactamente qué datos serán eliminados mediante la función de "Vista previa" antes de confirmar la eliminación.</span>
              </li>
            </ul>
          </div>
        </section>

        {/* User rights */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">9. Derechos del Usuario</h2>
          <p className="mb-4">Como usuario de Docre-A, tienes derecho a:</p>
          <ul className="list-disc list-inside ml-4 mb-4 space-y-2 text-sm">
            <li><strong>Acceso:</strong> Solicitar información sobre los datos personales que almacenamos, contactando a nuestro equipo de soporte por correo electrónico.</li>
            <li><strong>Rectificación:</strong> Corregir datos personales inexactos o incompletos desde tu perfil de usuario o contactando a soporte.</li>
            <li><strong>Eliminación:</strong> Solicitar la eliminación de tus datos según los niveles descritos en este documento, ya sea desde la plataforma o por correo electrónico.</li>
            <li><strong>Oposición:</strong> Oponerte al procesamiento de tus datos para ciertos fines.</li>
            <li><strong>Revocación:</strong> Revocar tu consentimiento en cualquier momento.</li>
          </ul>
          <p className="text-sm text-slate-600">
            Para ejercer cualquiera de estos derechos, contacta a nuestro equipo de soporte a través de{' '}
            <a href="mailto:notificaciones@docreativelatam.com" className="text-emerald-600 hover:underline">notificaciones@docreativelatam.com</a>.
          </p>
        </section>

        {/* Roles and permissions */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">10. Roles y Permisos de Eliminación</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-slate-300 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-4 py-2 text-left font-semibold text-slate-700">Acción</th>
                  <th className="border border-slate-300 px-4 py-2 text-center font-semibold text-slate-700">Admin Creador</th>
                  <th className="border border-slate-300 px-4 py-2 text-center font-semibold text-slate-700">Admin Invitado</th>
                  <th className="border border-slate-300 px-4 py-2 text-center font-semibold text-slate-700">Manager</th>
                  <th className="border border-slate-300 px-4 py-2 text-center font-semibold text-slate-700">Community</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-4 py-2">Anonimizar datos propios</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-green-600 font-bold">✓</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-green-600 font-bold">✓</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-green-600 font-bold">✓</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-green-600 font-bold">✓</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="border border-slate-300 px-4 py-2">Eliminar miembro invitado</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-green-600 font-bold">✓</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-red-500 font-bold">✗</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-red-500 font-bold">✗</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-red-500 font-bold">✗</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-4 py-2">Eliminar admin creador</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-slate-400">Solo vía Nivel 3</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-red-500 font-bold">✗</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-red-500 font-bold">✗</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-red-500 font-bold">✗</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="border border-slate-300 px-4 py-2">Eliminar toda la organización</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-green-600 font-bold">✓</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-red-500 font-bold">✗</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-red-500 font-bold">✗</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-red-500 font-bold">✗</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-4 py-2">Ver vista previa de eliminación</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-green-600 font-bold">✓</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-red-500 font-bold">✗</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-red-500 font-bold">✗</td>
                  <td className="border border-slate-300 px-4 py-2 text-center text-red-500 font-bold">✗</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Contact */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">11. Contacto</h2>
          <p className="mb-4">
            Para cualquier consulta sobre la eliminación de datos o esta política, puedes contactarnos:
          </p>
          <div className="bg-slate-50 rounded-xl p-5">
            <p className="mb-2"><strong>Empresa:</strong> Domen Capital S.A. De C.V.</p>
            <p className="mb-2"><strong>Email:</strong> <a href="mailto:notificaciones@docreativelatam.com" className="text-emerald-600 hover:underline">notificaciones@docreativelatam.com</a></p>
            <p className="mb-2"><strong>Dirección:</strong> Avenida Bernal, Residencia San Luis, Senda Yanet, casa #7, San Salvador, San Salvador Centro, San Salvador, El Salvador</p>
            <p><strong>NIT:</strong> 0614-271120-105-0</p>
          </div>
        </section>

        <div className="mt-12 pt-8 border-t border-slate-200">
          <p className="text-sm text-slate-500">
            Última actualización: 25 de febrero de 2026
          </p>
        </div>
      </div>
    </div>
  );
};

export default DataDeletionPolicyScreen;
