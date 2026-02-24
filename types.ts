// Filtros avanzados para CRM
export type CRMFilterComparison = 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte';

export interface CRMFilter {
  field: string; // atributo o propiedad
  comparison: CRMFilterComparison;
  value: string | number | Date;
}

export type UserRole = 'admin' | 'manager' | 'community';

export interface User {
  id: string;
  organizationId: string; // New field for Multi-tenancy
  name: string;
  avatar: string;
  email: string;
  role: UserRole;
  phone?: string; // optional international phone number (E.164 preferred)
  verified?: boolean; // Usuario ha completado el setup de invitación
  lastSignInAt?: string | null; // Fecha/hora del último inicio de sesión (null = nunca, invitado pendiente)
  team_lead_id?: string; // Para managers: ID del supervisor del equipo
  assigned_lead_ids?: string[]; // Para community: IDs de leads asignados
}

export interface UserInfo {
  firstName: string;
  lastName: string;
  country: string;
  email: string;
  whatsappNumber: string;
  password: string;
  organizationName: string;
  companySize: string;
  platformUse: string;
  botName: string;
  industry?: string;
}

export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'file' | 'document' | 'location' | 'template' | 'call_log';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string; // Can be caption or fallback text
  timestamp: Date;
  isIncoming: boolean; 
  status: 'sent' | 'delivered' | 'read' | 'failed';
  isAI?: boolean;
  authorName?: string;
  
  // Attachment fields
  type: MessageType;
  attachmentUrl?: string;
  fileName?: string;
  fileSize?: string;
  duration?: string; // For audio/video
  latitude?: number;
  longitude?: number;
  
  // Storage fields (for media_path integration)
  media_path?: string; // Path in Supabase Storage bucket (e.g., "documents/uuid.pdf" or "images/uuid.jpg")
  media_mime_type?: string; // MIME type (e.g., "image/jpeg", "audio/ogg")
  media_size?: number; // File size in bytes
  
  // Template fields
  templateName?: string;
  templateLanguage?: string;
  templateVariables?: string[];
  
  // Call Log fields (New)
  callStatus?: 'scheduled' | 'ringing' | 'completed' | 'failed' | 'voicemail';
  callDuration?: number; // seconds
  scheduledTime?: Date;
  
  // WhatsApp Message ID (for status tracking) - NEW
  whatsappMessageId?: string;
}

export interface Note {
  id: string;
  conversationId: string;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  contactName: string;
  contactAvatar: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  tags: string[];
  platform: 'whatsapp' | 'instagram' | 'messenger';
  assignedTo?: string; // ID del agente asignado
  status?: 'open' | 'closed' | 'snoozed';
}

// Asignación de leads/conversaciones a community users
export interface LeadAssignment {
  id: string;
  userId: string;
  contactId: string;
  assignedAt: Date;
  assignedBy: string;
  organizationId: string;
}

export enum AppState {
  LOGIN,
  ONBOARDING,
  VERIFICATION,
  DASHBOARD
}

export type DashboardView = 'chats' | 'crm' | 'stats' | 'settings' | 'tasks' | 'team' | 'properties' | 'integrations' | 'workflows';

// CRM Types
export interface CRMContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  pipelineStageId: string;
  avatar?: string;
  createdAt?: Date;
  properties: Record<string, any>;
}

export interface CRMList {
  id: string;
  name: string;
  filters: CRMFilter[];
  manualContactIds?: string[];
  inactiveContactIds?: string[]; // Contactos desactivados en la lista
  createdAt: Date;
}

export interface PipelineStage {
  id: string;
  name: string;
  color: string;
}

export interface CustomProperty {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'time' | 'select' | 'phone' | 'percentage';
  options?: string[]; // For select type
}

// Settings Types
export interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
}

export interface ChannelConfig {
  id: string;
  platform: 'facebook' | 'instagram' | 'whatsapp';
  isConnected: boolean;
  pageName?: string;
}

// New Types for Templates, Snippets, Tasks
export interface Template {
  id: string;
  name: string;
  category: 'marketing' | 'utility' | 'authentication';
  language: string;
  status: 'approved' | 'pending' | 'rejected';
  body: string;
}

// Campaign Types
export type CampaignType = 'email' | 'whatsapp';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  recipientCount: number;
  recipientIds: string[]; // IDs de contactos del CRM
  
  // Estadísticas (Estilo Chatfuel)
  stats?: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };

  // Para WhatsApp
  templateId?: string;
  templateName?: string;
  templateLanguage?: string;
  
  // Para Email
  emailSubject?: string;
  emailBody?: string;
  
  createdAt: Date;
  sentAt?: Date;
  scheduledAt?: Date; // Para programación futura
  createdBy?: string;
}

export interface Snippet {
  id: string;
  shortcut: string;
  content: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description?: string;
  assigneeId: string;
  conversationId?: string; // Optional link to chat
  clientName?: string; // Added for context
  status: TaskStatus;
  dueDate: Date;
}

// AI Provider Types
export type AIProvider = 'gemini' | 'openai' | 'claude' | 'custom';

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  systemInstruction?: string;
  modelId?: string;
  isActive: boolean;
}

export interface AIConfig {
  activeProvider: AIProvider;
  providers: Record<AIProvider, AIProviderConfig>;
  defaultSystemInstruction: string;
}

// Workflow Types
export type WorkflowStatus = 'active' | 'completed' | 'failed' | 'paused';

export type WorkflowStepChannel = 'whatsapp' | 'email';

export interface VariableMapping {
  variable: string;     // e.g. "name", "1", "custom_field"
  source: 'property' | 'manual';
  value: string;        // property name (e.g. "name") or manual text
}

export interface WorkflowStep {
  id: string;
  stepOrder: number;
  channel: WorkflowStepChannel;
  templateId?: string;
  templateName?: string;
  delayDays: number;
  sendTime?: string | null;
  template?: Template;
  emailSubject?: string;
  emailBody?: string;
  variableMappings?: VariableMapping[];
}

export interface Workflow {
  id: string;
  organizationId: string;
  name: string;
  listId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  list?: CRMList;
  steps?: WorkflowStep[];
  enrollments?: WorkflowEnrollment[];
  stats?: {
    activeEnrollments: number;
    completedEnrollments: number;
    failedEnrollments: number;
  };
}

export interface WorkflowEnrollment {
  id: string;
  workflowId: string;
  contactId: string;
  organizationId: string;
  currentStep: number;
  status: WorkflowStatus;
  enrolledAt: Date;
  nextSendAt: Date;
  completedAt?: Date;
  lastError?: string;
  retryCount: number;
  contact?: CRMContact;
}

// API Key Types
export interface ApiKey {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiEndpointConfig {
  id: string;
  organizationId: string;
  endpointName: string;
  method: string;
  isEnabled: boolean;
  rateLimitPerMinute: number;
  createdAt: Date;
  updatedAt: Date;
}
