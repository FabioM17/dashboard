import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { navigateBack } from '../services/navigationService';

interface PrivacyPolicyScreenProps {
  onBack?: () => void;
}

const PrivacyPolicyScreen: React.FC<PrivacyPolicyScreenProps> = ({ onBack }) => {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigateBack();
    }
  };

  // Add SEO meta tags and structured data for Google
  useEffect(() => {
    // Set page title
    document.title = 'Políticas de Privacidad - Docre-A';

    // Add or update meta description
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', 'Políticas de privacidad de Domen Capital S.A. De C.V. - Aplicación Docre-A. Lee nuestras políticas de protección de datos y privacidad del usuario.');

    // Add canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `${window.location.origin}/politicas-de-privacidad`);

    // Add og:title for social media
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement('meta');
      ogTitle.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute('content', 'Políticas de Privacidad - Docre-A');

    // Add og:description
    let ogDescription = document.querySelector('meta[property="og:description"]');
    if (!ogDescription) {
      ogDescription = document.createElement('meta');
      ogDescription.setAttribute('property', 'og:description');
      document.head.appendChild(ogDescription);
    }
    ogDescription.setAttribute('content', 'Políticas de privacidad de Domen Capital S.A. De C.V. - Aplicación Docre-A');

    // Add og:url
    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.setAttribute('content', `${window.location.origin}/politicas-de-privacidad`);

    // Add structured data (Schema.org PrivacyPolicy)
    const structuredDataScript = document.createElement('script');
    structuredDataScript.type = 'application/ld+json';
    structuredDataScript.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'PrivacyPolicy',
      'name': 'Políticas de Privacidad - Docre-A',
      'description': 'Políticas de privacidad de Domen Capital S.A. De C.V. - Aplicación Docre-A',
      'url': `${window.location.origin}/politicas-de-privacidad`,
      'publisher': {
        '@type': 'Organization',
        'name': 'Domen Capital S.A. De C.V.',
        'contactPoint': {
          '@type': 'ContactPoint',
          'email': 'notificaciones@docreativelatam.com',
          'contactType': 'Customer Support'
        }
      },
      'datePublished': '2026-02-18',
      'dateModified': new Date().toISOString().split('T')[0],
      'inLanguage': 'es'
    });
    document.head.appendChild(structuredDataScript);

    // Cleanup on unmount
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
          <h1 className="text-2xl font-bold text-slate-800">Políticas de Privacidad</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8 text-slate-700 leading-relaxed">
        <section className="mb-8">
          <p className="mb-4">
            <strong>Domen Capital S.A. De C.V.</strong> es una compañía registrada en (El Salvador) con número de identificación tributaria 0614-271120-105-0 con domicilio social en Avenida Bernal, Residencia San Luis, Senda Yanet, casa #7, San Salvador, San Salvador Centro, San Salvador. Domen Capital opera el sitio web: <a href="https://latinalliance.docreativelatam.com/" className="text-emerald-600 hover:underline">https://dashboardchat.docreativelatam.com</a>
          </p>
          <p className="mb-4">
            Al usar el sitio web o cualquier aplicación o complemento de aplicación («Aplicaciones»), usted acepta seguir y estar sujeto a estos términos y condiciones de uso (los «Términos de servicio») y acepta cumplir con todas las leyes y regulaciones aplicables.
          </p>
          <p className="mb-4">
            Es su responsabilidad revisar estos Términos de uso periódicamente. Si en algún momento encuentra inaceptables estos Términos de uso o no está de acuerdo con estos Términos de uso, no utilice este Sitio web ni ninguna Aplicación. Podemos revisar estos Términos de uso en cualquier momento sin previo aviso. Si tiene alguna pregunta sobre estos Términos de uso, comuníquese con nuestro centro de atención al cliente por medio de correo electrónico a <a href="mailto:notificaciones@docreativelatam.com" className="text-emerald-600 hover:underline">notificaciones@docreativelatam.com</a>.
          </p>
          <p className="mb-4 font-bold">
            USTED ACEPTA QUE, AL USAR EL SITIO, CUALQUIER APLICACIÓN Y LOS SERVICIOS, TIENE AL MENOS 18 AÑOS DE EDAD Y PUEDE PARTICIPAR LEGALMENTE EN UN CONTRATO.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">1. Entendiendo estos términos</h2>
          <p className="mb-4">
            1.1. En estos Términos y condiciones de uso, cuando nos referimos a «nosotros», «nos» o «nuestro», nos referimos a Domen Capital; y cuando nos referimos a «usted» o «su» nos referimos a usted, la persona que accede o utiliza el sitio web.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">2. Nuestra responsabilidad</h2>
          <p className="mb-4">
            2.1. El material en este sitio web se proporciona solo para información general. No hacemos representaciones o garantías en cuanto a la precisión o integridad de cualquier material e información incorporada al presente sitio.
          </p>
          <p className="mb-4">
            2.2. El sitio web está disponible de forma gratuita. No garantizamos que el sitio web, o cualquier contenido en este documento, esté siempre disponible o será ininterrumpido.
          </p>
          <p className="mb-4">
            2.3. No asumiremos ningún tipo de responsabilidad en relación con los anuncios de terceros transmitidos a través del sitio web.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">3. Propiedad intelectual</h2>
          <p className="mb-4">
            3.1. Somos los propietarios o licenciatarios de todos los derechos de propiedad intelectual en el sitio web y su contenido, nuestro nombre y marca y nuestros nombres de productos, imágenes y empaques.
          </p>
          <p className="mb-4">
            3.2. Ninguna información de este sitio web puede copiarse, distribuirse o transmitirse de ninguna manera para uso comercial sin nuestro consentimiento expreso por escrito. Nos reservamos la propiedad total y los derechos de propiedad intelectual de cualquier material descargado de este sitio web.
          </p>
          <p className="mb-4">
            3.3. Puede descargar o imprimir una copia de todos y cada uno de los materiales de este sitio web para uso personal y no comercial, siempre que no modifique o altere el material de ninguna manera, ni elimine, altere o cambie ningún derecho de autor, marca registrada o cualquier otra Propiedad intelectual del mismo.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">4. Privacidad</h2>
          <p className="mb-4">
            4.1. Solo usamos su información personal para usos propios, con fin de mejorar nuestro servicio y comunicar avances o productos nuevos.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">5. Cookies</h2>
          <p className="mb-4">
            5.1. El sitio web utiliza cookies, cuyo uso se rige y cumple la siguiente ley: Ley para la Protección de Datos Personales (Decreto No. 144 de 2024) de El Salvador.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">6. Condiciones generales de uso</h2>
          <p className="mb-4">
            6.1. Al acceder a este sitio web, usted acepta no:
          </p>
          <ul className="list-disc list-inside ml-4 mb-4 space-y-2">
            <li>usar el sitio web de manera ilegal, para cualquier propósito ilegal o de cualquier manera incompatible con estos Términos y condiciones de uso.</li>
            <li>transmitir cualquier material que sea difamatorio, ofensivo u objetable en relación con su uso del sitio web.</li>
          </ul>
          <p className="mb-4">
            6.2. No garantizamos que el sitio web sea totalmente seguro o libre de errores o virus. Usted es responsable de configurar su tecnología de la información, sus programas informáticos y su plataforma para acceder al sitio web y le recomendamos que utilice su propio software de protección antivirus.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">7. Limitación de responsabilidad</h2>
          <p className="mb-4">
            7.1. El sitio web y todo el contenido del sitio web, incluida cualquier oferta actual o futura de productos o servicios, se proporcionan «tal cual» y pueden incluir imprecisiones o errores tipográficos. Los Propietarios no ofrecen ninguna garantía ni representación en cuanto a la disponibilidad, precisión o integridad del Contenido. Ni el Proveedor ni ninguna compañía tenedora, afiliada o subsidiaria del Proveedor serán responsables de ningún daño especial, consecuente u otro daño directo o indirecto de ningún tipo que haya sufrido o incurrido, relacionado con el uso o la imposibilidad de acceder o usar el Contenido o el Sitio web o cualquier funcionalidad del mismo, o de cualquier sitio web vinculado, incluso si el Proveedor se lo informa expresamente.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">8. Cambio en estos términos y condiciones de uso</h2>
          <p className="mb-4">
            8.1 Nos reservamos el derecho de modificar estos Términos y condiciones de uso en cualquier momento sin previo aviso o advertencia, y cualquier uso continuado del sitio web implica la aceptación por parte del usuario. Cualquier usuario que no acepte los nuevos Términos y condiciones de uso debe notificarnos por escrito a través de <a href="mailto:Info@araconstructores.com" className="text-emerald-600 hover:underline">marketing@docreativelatam.com</a> y debe dejar de acceder de inmediato al sitio web.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">9. Navegación sin registro</h2>
          <p className="mb-4">
            9.1 El usuario puede visitar el sitio web sin proporcionar ninguna información personal. En tales casos, los servidores del sitio web recopilarán la dirección IP de la computadora del usuario, pero no la dirección de correo electrónico ni ninguna otra información distintiva. Esta información se agrega para medir el número de visitas, el tiempo promedio de permanencia en el sitio web, las páginas visitadas, etc. El proveedor usa esta información para determinar el uso del sitio web y para mejorar el contenido al respecto. El proveedor no asume ninguna obligación de proteger esta información y puede copiar, distribuir o utilizar dicha información sin limitación.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">10. Fuerza mayor</h2>
          <p className="mb-4">
            10.1 No se nos considerará en incumplimiento o violación de estos Términos de servicio o cualquier contrato con nosotros, y no seremos responsables ante nosotros por cualquier cese, interrupción o retraso en el cumplimiento de sus obligaciones en virtud del presente por causa de terremoto, inundación, fuego, tormenta, rayo, sequía, deslizamiento de tierra, huracán, ciclón, tifón, tornado, desastre natural, epidemia, hambruna o peste, acción de un tribunal o autoridad pública, cambio de ley, explosión, guerra , terrorismo, conflicto armado, huelga laboral, cierre patronal, boicot o evento similar más allá de nuestro control razonable, ya sea previsto o imprevisto (cada uno un «Evento de Fuerza Mayor»). Si un evento continúa durante más de 60 días en total, podemos rescindir de inmediato estos Términos de servicio y no tendremos ninguna responsabilidad ante mí por o como resultado de dicha terminación.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">11. Derecho a rechazar</h2>
          <p className="mb-4">
            11.1 Usted reconoce que nos reservamos el derecho de rechazar el servicio a cualquier persona en cualquier momento sin emitir ningún motivo por el mismo.
          </p>
        </section>

        {/* ── Google API Services – Secciones requeridas por la política de datos de usuario de Google ── */}
        <div className="mt-10 mb-6 border-t-2 border-emerald-200 pt-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Uso de Servicios de API de Google</h2>
          <p className="text-sm text-slate-500 mb-6">
            Las siguientes secciones (12–16) describen específicamente cómo Docre-A accede, utiliza, almacena y elimina los datos obtenidos a través de los Servicios de API de Google, en cumplimiento de la{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
              Política de Datos de Usuario de Servicios de API de Google
            </a>{' '}
            y los{' '}
            <a href="https://developers.google.com/terms" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
              Términos de Servicio de las API de Google
            </a>.
          </p>
        </div>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">12. Datos a los que accedemos desde Google</h2>
          <p className="mb-4">
            Cuando un usuario o administrador de una organización elige conectar una cuenta de Gmail a Docre-A, la aplicación solicita autorización a través del flujo OAuth 2.0 de Google y accede únicamente a los siguientes datos:
          </p>
          <ul className="list-disc list-inside ml-4 mb-4 space-y-2">
            <li>
              <strong>Dirección de correo electrónico de Google</strong> — obtenida mediante el alcance (scope){' '}
              <code className="bg-slate-100 px-1 rounded text-sm">https://www.googleapis.com/auth/userinfo.email</code>.
              Se utiliza para identificar qué cuenta de Gmail está vinculada a la organización.
            </li>
            <li>
              <strong>Permiso para enviar correos electrónicos</strong> — obtenido mediante el alcance (scope){' '}
              <code className="bg-slate-100 px-1 rounded text-sm">https://www.googleapis.com/auth/gmail.send</code>.
              Permite a la plataforma enviar correos electrónicos en nombre de la organización a través de su propia cuenta de Gmail.
            </li>
          </ul>
          <p className="mb-4">
            La aplicación <strong>no</strong> accede a la bandeja de entrada, a los correos recibidos, a los contactos de Google, a Google Drive, ni a ningún otro dato o servicio de Google más allá de los permisos explícitamente listados.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">13. Uso de los datos de Google</h2>
          <p className="mb-4">
            Los datos de Google obtenidos se utilizan exclusivamente para los siguientes fines:
          </p>
          <ul className="list-disc list-inside ml-4 mb-4 space-y-2">
            <li>
              <strong>Envío de correos electrónicos transaccionales y de campaña:</strong> Los tokens de acceso OAuth se utilizan para llamar a la API de Gmail y enviar correos en nombre de la organización vinculada. Esto incluye respuestas a contactos, comunicaciones de campañas de marketing y notificaciones generadas por workflows configurados por el usuario.
            </li>
            <li>
              <strong>Renovación automática de acceso:</strong> Cuando el token de acceso expira, la aplicación utiliza el refresh token para obtener un nuevo token de acceso de Google sin necesidad de que el usuario vuelva a autenticarse, garantizando la continuidad del servicio.
            </li>
            <li>
              <strong>Identificación de la cuenta conectada:</strong> La dirección de correo electrónico se muestra en la pantalla de configuración para que el usuario sepa qué cuenta de Gmail está activa en su organización.
            </li>
          </ul>
          <p className="mb-4">
            Los datos de Google <strong>no</strong> se utilizan con fines publicitarios, no se comparten con terceros para propósitos comerciales y no se emplean para elaborar perfiles de usuarios individuales.
          </p>
          <p className="mb-4">
            El uso de la información obtenida de las API de Google se ajusta a la{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
              Política de Datos de Usuario de los Servicios de API de Google
            </a>, incluidos los requisitos de uso limitado.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">14. Compartición de datos de Google con terceros</h2>
          <p className="mb-4">
            Los datos obtenidos a través de los Servicios de API de Google <strong>no se venden, alquilan ni comparten</strong> con terceros para fines comerciales o publicitarios. La transferencia de datos a terceros se limita estrictamente a lo siguiente:
          </p>
          <ul className="list-disc list-inside ml-4 mb-4 space-y-2">
            <li>
              <strong>Supabase (proveedor de infraestructura):</strong> Los tokens OAuth (access token y refresh token) y la dirección de correo vinculada se almacenan de forma segura en la base de datos PostgreSQL administrada por Supabase ({' '}
              <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">Política de privacidad de Supabase</a>
              ). Supabase actúa como procesador de datos y cumple con los estándares SOC 2 Tipo II.
            </li>
            <li>
              <strong>Google LLC:</strong> Al enviar correos electrónicos, la solicitud se realiza directamente contra la API de Gmail de Google. Google recibe el token de acceso y los datos del mensaje (destinatario, asunto, cuerpo) según los términos de uso de su propia API.
            </li>
          </ul>
          <p className="mb-4">
            No existe ninguna otra transferencia de datos de Google a ningún otro tercero, socio, anunciante o servicio de análisis externo.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">15. Almacenamiento y protección de los datos de Google</h2>
          <p className="mb-4">
            Los datos de Google (access token, refresh token y dirección de correo) se almacenan en la tabla <code className="bg-slate-100 px-1 rounded text-sm">integration_settings</code> de la base de datos PostgreSQL alojada en Supabase. Las medidas de seguridad aplicadas son:
          </p>
          <ul className="list-disc list-inside ml-4 mb-4 space-y-2">
            <li><strong>Cifrado en tránsito:</strong> Todas las comunicaciones entre la aplicación, Supabase y las API de Google se realizan exclusivamente mediante HTTPS/TLS.</li>
            <li><strong>Cifrado en reposo:</strong> La base de datos de Supabase cifra los datos almacenados en reposo conforme a los estándares AES-256.</li>
            <li><strong>Control de acceso:</strong> El acceso a los tokens se realiza únicamente a través de funciones de servidor (Supabase Edge Functions) que utilizan la clave de servicio con privilegios mínimos. Los tokens nunca se exponen directamente al navegador del usuario final.</li>
            <li><strong>Aislamiento por organización:</strong> Los tokens están vinculados a un <code className="bg-slate-100 px-1 rounded text-sm">organization_id</code> y sólo son accesibles por los miembros autorizados de esa organización.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">16. Retención y eliminación de los datos de Google</h2>
          <p className="mb-4">
            <strong>Retención:</strong> Los tokens OAuth y la dirección de correo de Gmail se conservan mientras la integración de Gmail esté activa en la organización. No existe un período de retención fijo adicional; los datos permanecen únicamente mientras el usuario mantenga la conexión activa.
          </p>
          <p className="mb-4">
            <strong>Eliminación de la integración:</strong> En cualquier momento, el administrador de la organización puede desconectar la cuenta de Gmail desde la pantalla de <em>Configuración → Integraciones → Gmail</em>. Esta acción elimina permanentemente el access token, el refresh token y la dirección de correo de la base de datos de Docre-A.
          </p>
          <p className="mb-4">
            <strong>Eliminación completa de la cuenta:</strong> Si un usuario solicita la eliminación total de su cuenta y los datos de su organización, todos los datos —incluidos los tokens de Google— se eliminan de forma permanente. Este proceso puede iniciarse en la pantalla de{' '}
            <a href="/eliminacion-de-datos" className="text-emerald-600 hover:underline">Eliminación de Datos</a>{' '}
            o enviando una solicitud a{' '}
            <a href="mailto:notificaciones@docreativelatam.com" className="text-emerald-600 hover:underline">notificaciones@docreativelatam.com</a>.
          </p>
          <p className="mb-4">
            <strong>Revocación de permisos en Google:</strong> Adicionalmente, el usuario puede revocar en cualquier momento el acceso de Docre-A a su cuenta de Google directamente desde la consola de seguridad de Google en{' '}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
              myaccount.google.com/permissions
            </a>. Tras la revocación, los tokens almacenados dejarán de ser válidos y la integración de Gmail quedará inoperativa hasta que se vuelva a autorizar.
          </p>
        </section>

        {/* ── Meta / Facebook – Secciones requeridas por la Política de Plataforma de Meta ── */}
        <div className="mt-10 mb-6 border-t-2 border-blue-200 pt-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Uso de Servicios de la Plataforma de Meta (WhatsApp Business API)</h2>
          <p className="text-sm text-slate-500 mb-6">
            Las siguientes secciones (17–21) describen cómo Docre-A accede, utiliza, almacena y elimina los datos obtenidos a través de la Plataforma de Meta (Facebook / WhatsApp), en cumplimiento de las{' '}
            <a href="https://developers.facebook.com/policy/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Políticas para Desarrolladores de Meta
            </a>{' '}
            y las{' '}
            <a href="https://www.whatsapp.com/legal/business-policy/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Políticas de WhatsApp Business
            </a>.
          </p>
        </div>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">17. Datos a los que accedemos desde Meta</h2>
          <p className="mb-4">
            Cuando un administrador de una organización conecta su cuenta de Facebook/Meta a Docre-A mediante el flujo de Embedded Signup de WhatsApp Business, la aplicación solicita acceso y obtiene los siguientes datos a través de la API de Facebook Graph:
          </p>
          <ul className="list-disc list-inside ml-4 mb-4 space-y-2">
            <li><strong>ID de usuario de Facebook</strong> — identificador único del perfil de Facebook del usuario que realizó la autorización.</li>
            <li><strong>Nombre y correo electrónico del usuario de Facebook</strong> — obtenidos desde el endpoint <code className="bg-slate-100 px-1 rounded text-sm">/me?fields=id,name,email</code> para identificar quién vinculó la cuenta.</li>
            <li><strong>Token de acceso de Facebook (Facebook Access Token)</strong> — token OAuth de corta o larga duración utilizado para autenticar las llamadas a la API de Meta.</li>
            <li><strong>ID de la cuenta de WhatsApp Business (WABA ID)</strong> — identificador de la cuenta de WhatsApp Business asociada a la organización, obtenido de <code className="bg-slate-100 px-1 rounded text-sm">/me/owned_whatsapp_business_accounts</code>.</li>
            <li><strong>ID del número de teléfono de WhatsApp</strong> — identificador del número de teléfono de WhatsApp Business activo, obtenido de <code className="bg-slate-100 px-1 rounded text-sm">/{"{waba_id}"}/phone_numbers</code>.</li>
            <li><strong>ID de negocio de Meta (Business ID), IDs de cuentas publicitarias, IDs de páginas e IDs de datasets</strong> — datos proporcionados directamente por el flujo de Embedded Signup v3 de Meta, necesarios para la correcta configuración de la integración.</li>
          </ul>
          <p className="mb-4">
            La aplicación <strong>no</strong> accede al contenido de mensajes de Facebook Messenger, al historial de publicaciones, a datos de anuncios, ni a ningún otro dato de la plataforma de Meta más allá de los permisos explícitamente listados para la integración con WhatsApp Business API.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">18. Uso de los datos de Meta</h2>
          <p className="mb-4">
            Los datos de Meta obtenidos se utilizan exclusivamente para los siguientes fines:
          </p>
          <ul className="list-disc list-inside ml-4 mb-4 space-y-2">
            <li><strong>Autenticación y autorización de la integración WhatsApp Business:</strong> El token de acceso de Facebook se utiliza para autenticar las llamadas a la WhatsApp Business API, lo que permite enviar y recibir mensajes de WhatsApp a través de la plataforma.</li>
            <li><strong>Identificación de la cuenta vinculada:</strong> El nombre del usuario de Facebook, el email y el WABA ID se muestran en la pantalla de Configuración para que el administrador identifique qué cuenta está activa.</li>
            <li><strong>Sincronización de plantillas de WhatsApp:</strong> El WABA ID y el token de acceso se utilizan para sincronizar las plantillas de mensajes aprobadas por Meta desde el panel de WhatsApp Business.</li>
            <li><strong>Operación continua del canal WhatsApp:</strong> El token de acceso es accedido por las Supabase Edge Functions para enviar mensajes, recibir webhooks y gestionar la configuración del número de teléfono.</li>
          </ul>
          <p className="mb-4">
            Los datos de Meta <strong>no</strong> se utilizan con fines publicitarios, no se emplean para elaborar perfiles de comportamiento de los usuarios finales, y no se comparten con terceros para propósitos ajenos a la integración declarada.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">19. Compartición de datos de Meta con terceros</h2>
          <p className="mb-4">
            Los datos obtenidos a través de la Plataforma de Meta <strong>no se venden ni se comparten</strong> con terceros para fines comerciales o publicitarios. La transferencia de datos se limita estrictamente a:
          </p>
          <ul className="list-disc list-inside ml-4 mb-4 space-y-2">
            <li>
              <strong>Supabase (proveedor de infraestructura):</strong> El token de acceso, el WABA ID, el phone number ID y demás credenciales de la integración se almacenan en la base de datos PostgreSQL de Supabase (
              <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Política de privacidad de Supabase</a>
              ), que actúa como procesador de datos bajo estándares SOC 2 Tipo II.
            </li>
            <li>
              <strong>Meta Platforms / WhatsApp Business API:</strong> El token de acceso se envía a los endpoints de la API de Facebook Graph y de WhatsApp Business API para ejecutar las operaciones de mensajería autorizadas por el usuario administrador.
            </li>
          </ul>
          <p className="mb-4">
            No existe ninguna otra transferencia de datos de Meta a ningún otro tercero, socio, anunciante o plataforma de análisis externa.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">20. Almacenamiento y protección de los datos de Meta</h2>
          <p className="mb-4">
            Los datos de Meta (token de acceso, WABA ID, phone number ID, user ID, nombre y email) se almacenan en la tabla <code className="bg-slate-100 px-1 rounded text-sm">integration_settings</code> de la base de datos PostgreSQL alojada en Supabase, junto a los datos de la integración de WhatsApp. Las medidas de protección son:
          </p>
          <ul className="list-disc list-inside ml-4 mb-4 space-y-2">
            <li><strong>Cifrado en tránsito:</strong> Toda la comunicación entre la aplicación, Supabase y las API de Meta se realiza exclusivamente mediante HTTPS/TLS.</li>
            <li><strong>Cifrado en reposo:</strong> Los datos almacenados en Supabase se cifran en reposo con AES-256.</li>
            <li><strong>Control de acceso mínimo:</strong> Los tokens sólo son accesibles por las Supabase Edge Functions mediante la clave de servicio. No se exponen al navegador del usuario final.</li>
            <li><strong>Aislamiento por organización:</strong> Las credenciales están vinculadas a un <code className="bg-slate-100 px-1 rounded text-sm">organization_id</code> y sólo son accesibles por los administradores autorizados de esa organización.</li>
            <li><strong>Expiración del token:</strong> La aplicación almacena la fecha de expiración del token (<code className="bg-slate-100 px-1 rounded text-sm">facebook_expires_at</code>) para gestionar su ciclo de vida y evitar utilizar tokens vencidos.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">21. Retención y eliminación de los datos de Meta</h2>
          <p className="mb-4">
            <strong>Retención:</strong> El token de acceso de Facebook y los demás datos de la integración de Meta/WhatsApp se conservan mientras la integración esté activa en la organización. Los datos no se retienen más allá de este período activo.
          </p>
          <p className="mb-4">
            <strong>Eliminación de la integración:</strong> El administrador puede desconectar la integración de WhatsApp/Facebook desde <em>Configuración → Integraciones → WhatsApp</em>. Esta acción elimina permanentemente el token de acceso y el resto de credenciales de Meta de la base de datos de Docre-A.
          </p>
          <p className="mb-4">
            <strong>Eliminación completa de la cuenta:</strong> Si se solicita la eliminación total de la cuenta y los datos de la organización, todos los datos —incluidos los tokens y credenciales de Meta— se eliminan de forma permanente. El proceso puede iniciarse en la página de{' '}
            <a href="/eliminacion-de-datos" className="text-blue-600 hover:underline">Eliminación de Datos</a>{' '}
            o enviando una solicitud a{' '}
            <a href="mailto:notificaciones@docreativelatam.com" className="text-blue-600 hover:underline">notificaciones@docreativelatam.com</a>.
          </p>
          <p className="mb-4">
            <strong>URL de eliminación de datos de Facebook:</strong> Conforme a los requisitos de Meta para aplicaciones de Facebook, la URL oficial para solicitar la eliminación de datos asociados al inicio de sesión con Facebook es:{' '}
            <a href="/eliminacion-de-datos" className="text-blue-600 hover:underline">
              https://dashboardchat.docreativelatam.com/eliminacion-de-datos
            </a>.
          </p>
        </section>

        <div className="mt-12 pt-8 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-slate-500">
              Última actualización: 4 de marzo de 2026
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <a
                href="/eliminacion-de-datos"
                className="text-emerald-600 hover:underline font-medium"
                onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/eliminacion-de-datos'); window.dispatchEvent(new PopStateEvent('popstate')); }}
              >
                Eliminación de Datos
              </a>
              <a
                href="mailto:notificaciones@docreativelatam.com"
                className="text-emerald-600 hover:underline font-medium"
              >
                notificaciones@docreativelatam.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyScreen;
