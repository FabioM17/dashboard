# DoCreChat

**Plataforma omnicanal de mensajería empresarial con CRM, automatizaciones e IA.**

DoCreChat centraliza conversaciones de WhatsApp, Instagram y Facebook Messenger en un único panel, integrando un CRM completo, un tablero de tareas, campañas programadas, flujos de trabajo automatizados y respuestas inteligentes potenciadas por Google Gemini.

---

## Tabla de contenidos

1. [Características principales](#características-principales)  
2. [Stack tecnológico](#stack-tecnológico)  
3. [Arquitectura del proyecto](#arquitectura-del-proyecto)  
4. [Variables de entorno](#variables-de-entorno)  
5. [Instalación y ejecución local](#instalación-y-ejecución-local)  
6. [Base de datos (Supabase)](#base-de-datos-supabase)  
7. [Edge Functions](#edge-functions)  
8. [Componentes principales](#componentes-principales)  
9. [Servicios](#servicios)  
10. [Sistema de roles y permisos](#sistema-de-roles-y-permisos)  
11. [Integraciones externas](#integraciones-externas)  
12. [Despliegue en producción](#despliegue-en-producción)  
13. [Estructura de carpetas](#estructura-de-carpetas)  

---

## Características principales

| Módulo | Descripción |
|---|---|
| **Bandeja omnicanal** | Gestión unificada de conversaciones de WhatsApp, Instagram y Messenger |
| **CRM** | Contactos, etapas de pipeline, propiedades personalizadas y notas |
| **Tablero de tareas** | Vista Kanban con asignación de agentes y estados (pendiente, en curso, completado) |
| **Campañas** | Envío masivo programado con plantillas de WhatsApp y correo |
| **Workflows** | Automatizaciones multi-paso con soporte para WhatsApp, email y notificaciones |
| **IA (Gemini)** | Sugerencias de respuesta inteligente basadas en el contexto de la conversación |
| **Estadísticas** | Panel de analítica con métricas de mensajes, conversiones y rendimiento de agentes |
| **Gestión de equipos** | Usuarios con roles (Admin, Manager, Community), invitación por email y verificación |
| **Integración WhatsApp** | Conexión nativa mediante WhatsApp Embedded Signup (Flow de Facebook) |
| **Gmail / Google OAuth** | Envío de correos y conexión con cuentas Google desde la plataforma |
| **Media & Archivos** | Visualización y descarga de imágenes, audio, video y documentos con URLs firmadas |
| **API externa** | Endpoints REST para integrar DoCreChat con sistemas de terceros |
| **Multi-tenancy** | Organizaciones aisladas; cada usuario pertenece a una organización |

---

## Stack tecnológico

### Frontend
- **React 19** + **TypeScript**
- **Vite 6** — bundler y servidor de desarrollo
- **Lucide React** — iconografía
- **yet-another-react-lightbox** — visor de imágenes
- **react-player** / **react-h5-audio-player** — reproducción de media
- **pdfjs-dist** — vista previa de PDFs
- **docx** / **xlsx** — generación/lectura de documentos Office

### Backend (serverless)
- **Supabase** — base de datos PostgreSQL, autenticación, storage y edge functions
- **Supabase Edge Functions** (Deno/TypeScript) — lógica de backend sin servidor

### IA
- **Google Gemini** (`@google/genai`) — generación de respuestas inteligentes

### Integraciones
- **WhatsApp Business API** (Meta Graph API v18)
- **Facebook / Instagram** OAuth y Messenger
- **Gmail API** / **Google OAuth 2.0**
- **Retell AI** — llamadas telefónicas automatizadas

---

## Arquitectura del proyecto

```
Browser (React SPA)
       │
       ▼
  Supabase JS Client
       │
       ├─── PostgreSQL (tablas + RLS)
       ├─── Supabase Auth (email/password + OAuth)
       ├─── Supabase Storage (media, documentos)
       └─── Edge Functions (Deno)
                ├── ai-generate          → Gemini API
                ├── create-org-admin     → Onboarding
                ├── email-send           → SMTP / Gmail
                ├── gmail-send           → Gmail API
                ├── facebook-auth-callback → Facebook OAuth
                ├── google-auth-callback → Google OAuth
                ├── whatsapp-sync-templates → Meta API
                ├── process-workflows    → Automatizaciones
                ├── process-scheduled-campaigns → Campañas
                ├── generate-signed-urls → Storage seguro
                ├── validate-permissions → RBAC
                ├── external-api         → API pública
                └── workflows-manage     → CRUD Workflows
```

---

## Variables de entorno

Copia `.env.example` a `.env.local` y completa los valores:

```bash
cp .env.example .env.local
```

| Variable | Descripción |
|---|---|
| `GEMINI_API_KEY` | Clave de API de Google AI Studio (Gemini) |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Clave pública anon de Supabase |
| `VITE_SITE_URL` | URL pública de la aplicación (para redirecciones OAuth) |
| `VITE_FACEBOOK_APP_ID` | ID de la aplicación de Meta Developers |
| `VITE_WHATSAPP_CONFIG_ID` | Config ID del flujo de WhatsApp Embedded Signup |
| `VITE_GOOGLE_CLIENT_ID` | Client ID de Google OAuth 2.0 |

> **⚠️ Nunca subas `.env.local` al repositorio.** Está incluido en `.gitignore`.

---

## Instalación y ejecución local

### Prerrequisitos

- **Node.js** >= 18
- **npm** >= 9
- Cuenta en [Supabase](https://supabase.com) con un proyecto creado
- (Opcional) [Supabase CLI](https://supabase.com/docs/guides/cli) para ejecutar Edge Functions localmente

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/<tu-usuario>/docrechat.git
cd docrechat

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus claves reales

# 4. Iniciar el servidor de desarrollo
npm run dev
# Disponible en http://localhost:3000
```

### Construir para producción

```bash
npm run build
# Salida en dist/
```

---

## Base de datos (Supabase)

Las migraciones SQL se encuentran en `supabase/migrations/`. Se aplican en orden cronológico:

| Migración | Descripción |
|---|---|
| `20260115_create_lists_and_update_campaigns.sql` | Listas de contactos y campañas |
| `20260121_add_facebook_auth_to_integration_settings.sql` | Integración Facebook en ajustes |
| `20260126_add_scheduled_notifications.sql` | Notificaciones programadas |
| `20260201_implement_three_roles.sql` | Sistema de tres roles (Admin, Manager, Community) |
| `20260215_analytics_enhancements.sql` | Tablas y vistas de analítica |
| `20260216_add_workflows.sql` | Flujos de trabajo |
| `20260223_create_api_keys_and_endpoints.sql` | API keys y endpoints externos |
| `rls_organizations_policies.sql` | Políticas RLS de multi-tenancy |

Para aplicar las migraciones en un proyecto Supabase local:

```bash
npx supabase db push
```

---

## Edge Functions

Todas las functions se encuentran en `supabase/functions/`. Para desplegarlas:

```bash
# Desplegar todas
npx supabase functions deploy

# Desplegar una en específico
npx supabase functions deploy create-org-admin
```

| Función | JWT requerido | Descripción |
|---|---|---|
| `ai-generate` | ✅ | Generación de respuestas con Google Gemini |
| `app-notifications` | ✅ | Envío de notificaciones internas |
| `create-org-admin` | ❌ | Crea organización y primer usuario admin (onboarding) |
| `email-send` | ✅ | Envío de correos genéricos |
| `external-api` | ❌ | Endpoints REST para integraciones de terceros |
| `facebook-auth-callback` | ❌ | Callback del flujo OAuth de Facebook |
| `generate-signed-urls` | ✅ | Genera URLs firmadas para acceder a archivos privados |
| `gmail-send` | ✅ | Envío de correos vía Gmail API |
| `google-auth-callback` | ❌ | Callback del flujo OAuth de Google |
| `process-scheduled-campaigns` | ✅ | Procesamiento de campañas programadas (cron) |
| `process-scheduled-notifications` | ✅ | Procesamiento de notificaciones programadas (cron) |
| `process-workflows` | ✅ | Ejecución de pasos de workflows (cron) |
| `trigger-retell` | ✅ | Dispara llamadas con Retell AI |
| `validate-permissions` | ✅ | Validación centralizada de permisos RBAC |
| `whatsapp-sync-templates` | ✅ | Sincroniza plantillas desde Meta API |
| `workflows-manage` | ✅ | CRUD de workflows y enrolamientos |

---

## Componentes principales

| Componente | Ruta | Descripción |
|---|---|---|
| `LoginScreen` | `components/LoginScreen.tsx` | Pantalla de inicio de sesión |
| `Onboarding` | `components/Onboarding.tsx` | Flujo de registro de nueva organización |
| `VerificationScreen` | `components/VerificationScreen.tsx` | Verificación de cuenta por email |
| `AccountSetupScreen` | `components/AccountSetupScreen.tsx` | Configuración inicial del perfil |
| `ConversationList` | `components/ConversationList.tsx` | Lista lateral de conversaciones con filtros |
| `ChatWindow` | `components/ChatWindow.tsx` | Ventana de chat con soporte multimedia |
| `MessagesList` | `components/MessagesList.tsx` | Renderizado de mensajes (texto, media, plantillas) |
| `CRMScreen` | `components/CRMScreen.tsx` | CRM con vista de contactos y pipeline |
| `TaskBoard` | `components/TaskBoard.tsx` | Tablero Kanban de tareas |
| `WorkflowsScreen` | `components/WorkflowsScreen.tsx` | Constructor y gestión de workflows |
| `StatisticsScreen` | `components/StatisticsScreen.tsx` | Dashboard de analítica |
| `SettingsScreen` | `components/SettingsScreen.tsx` | Configuración de integraciones, plantillas, equipo y API |
| `EmailEditor` | `components/EmailEditor.tsx` | Editor de correos electrónicos |
| `MediaViewer` | `components/MediaViewer.tsx` | Visor fullscreen de imágenes, video y audio |
| `WhatsAppEmbeddedSignup` | `components/WhatsAppEmbeddedSignup.tsx` | Flujo oficial de conexión con WhatsApp Business |
| `ApiDocumentation` | `components/ApiDocumentation.tsx` | Documentación interactiva de la API externa |
| `ToastNotifications` | `components/ToastNotifications.tsx` | Notificaciones tipo toast (éxito, error, info) |
| `LoadingOverlay` | `components/LoadingOverlay.tsx` | Overlay de carga global |
| `PrivacyPolicyScreen` | `components/PrivacyPolicyScreen.tsx` | Política de privacidad (`/politicas-de-privacidad`) |

---

## Servicios

Los servicios en `services/` encapsulan toda la lógica de negocio y comunicación con Supabase:

| Servicio | Descripción |
|---|---|
| `authService` | Registro, login, logout y sesión de usuario |
| `chatService` | Conversaciones, mensajes, notas y estado de lectura |
| `crmService` | Contactos, pipeline, etapas y propiedades personalizadas |
| `taskService` | Tareas (CRUD, asignación, cambio de estado) |
| `teamService` | Gestión de usuarios del equipo e invitaciones |
| `workflowService` | Workflows, pasos y enrolamientos |
| `campaignService` | Campañas de mensajería masiva |
| `templateService` | Plantillas de WhatsApp y email |
| `snippetService` | Respuestas rápidas reutilizables |
| `listService` | Listas de contactos para campañas y workflows |
| `mediaService` | Subida, descarga y visualización de archivos |
| `geminiService` | Sugerencias de respuesta inteligente (IA) |
| `gmailService` | Envío de correo y autorización Google |
| `whatsappIntegrationService` | Conexión con Meta API (números, webhooks) |
| `facebookAuthService` | Autenticación OAuth con Facebook |
| `analyticsService` | Consultas de datos para estadísticas |
| `notificationService` | Notificaciones in-app y programadas |
| `organizationService` | Configuración y datos de la organización |
| `apiKeyService` | Gestión de API keys para la API externa |
| `rolePermissionService` | Verificación de permisos por rol |
| `validationService` | Validaciones de datos de entrada |
| `deduplicationService` | Prevención de mensajes/contactos duplicados |
| `rateLimitingService` | Control de límites de envío |
| `storageService` | Gestión del bucket de Supabase Storage |
| `tokenProcessingService` | Procesamiento de tokens en plantillas |
| `navigationService` | Navegación programática entre vistas |
| `dataAccessService` | Capa de acceso a datos centralizada |
| `backendPermissionService` | Validación de permisos desde el backend |
| `backendValidationService` | Validaciones contra el backend |

---

## Sistema de roles y permisos

DoCreChat implementa un sistema RBAC (Role-Based Access Control) con tres roles:

| Rol | Permisos |
|---|---|
| **Admin** | Acceso total: configuración, equipo, integraciones, estadísticas, todos los contactos y conversaciones |
| **Manager** | Gestión de su equipo asignado, conversaciones del equipo, estadísticas del equipo |
| **Community** | Solo sus propias conversaciones y los leads asignados explícitamente |

Los permisos se verifican tanto en el frontend (`rolePermissionService`, `roleGuards.tsx`) como en el backend (`validate-permissions` Edge Function + políticas RLS en PostgreSQL).

---

## Integraciones externas

### WhatsApp Business API
- Conexión mediante **WhatsApp Embedded Signup** (flujo oficial de Meta)
- Sincronización automática de plantillas aprobadas
- Envío de mensajes de plantilla y texto libre
- Recepción de mensajes a través de webhooks

### Facebook / Instagram
- Autenticación OAuth para conectar páginas de Facebook e Instagram
- Gestión de conversaciones de Messenger e Instagram DM

### Google Gmail
- Autorización OAuth 2.0 para conectar cuentas de Gmail
- Envío de correos personalizados desde la plataforma

### Google Gemini (IA)
- Sugerencias contextuales de respuesta basadas en los últimos mensajes
- Configurable a través de `Settings > AI Agent`

### Retell AI
- Disparo de llamadas telefónicas automatizadas desde workflows

---

## Despliegue en producción

### Frontend (Hosting estático)
El frontend compilado (`dist/`) puede desplegarse en cualquier CDN o hosting estático (Vercel, Netlify, Cloudflare Pages, etc.):

```bash
npm run build
# Subir contenido de dist/ al proveedor elegido
```

Configura las variables de entorno en el panel de tu proveedor de hosting con los mismos nombres que los descritos en la sección [Variables de entorno](#variables-de-entorno).

### Edge Functions
```bash
# Autenticar con Supabase CLI
npx supabase login

# Vincular al proyecto de producción
npx supabase link --project-ref <PROJECT_REF>

# Desplegar todas las funciones
npx supabase functions deploy
```

### Migraciones de base de datos
```bash
npx supabase db push
```

---

## Estructura de carpetas

```
docrechat/
├── components/          # Componentes React de la UI
├── services/            # Lógica de negocio y acceso a datos
├── hooks/               # Custom hooks de React
├── supabase/
│   ├── functions/       # Edge Functions (Deno/TypeScript)
│   └── migrations/      # Migraciones SQL históricas
├── public/              # Archivos estáticos públicos
├── App.tsx              # Componente raíz y enrutamiento
├── types.ts             # Tipos TypeScript globales
├── constants.ts         # Datos mock y constantes
├── index.tsx            # Punto de entrada de React
├── vite.config.ts       # Configuración de Vite
├── tsconfig.json        # Configuración de TypeScript
├── .env.example         # Plantilla de variables de entorno
└── schema.sql           # Esquema completo de la base de datos
```

---

## Licencia

Proyecto privado — © DoCreative Latam. Todos los derechos reservados.
