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

        <div className="mt-12 pt-8 border-t border-slate-200">
          <p className="text-sm text-slate-500">
            Última actualización: 18 de febrero de 2026
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyScreen;
