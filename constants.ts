import { Conversation, Message, User, CRMContact, PipelineStage, CustomProperty, Note, ChannelConfig, Template, Snippet, Task } from './types';

// Mock Users with different roles
export const USERS: User[] = [
  {
    id: 'admin_001',
    name: 'Alex Johnson (Admin)',
    email: 'alex.j@docrechat.example.com',
    avatar: 'https://picsum.photos/id/64/100/100',
    role: 'admin'
  },
  {
    id: 'agent_002',
    name: 'Sarah Smith',
    email: 'sarah.s@docrechat.example.com',
    avatar: 'https://picsum.photos/id/68/100/100',
    role: 'agent'
  },
  {
    id: 'viewer_003',
    name: 'Mike Analyst',
    email: 'mike.a@docrechat.example.com',
    avatar: 'https://picsum.photos/id/69/100/100',
    role: 'viewer'
  }
];

export const CURRENT_USER: User = USERS[0]; // Default to Admin

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    contactName: 'Maria Garcia',
    contactAvatar: 'https://picsum.photos/id/65/100/100',
    lastMessage: 'Is my order shipped yet?',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 5), // 5 mins ago
    unreadCount: 2,
    tags: ['Order', 'Urgent'],
    platform: 'whatsapp'
  },
  {
    id: 'c2',
    contactName: 'Tech Solutions Inc.',
    contactAvatar: 'https://picsum.photos/id/66/100/100',
    lastMessage: 'Thanks for the quick help!',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    unreadCount: 0,
    tags: ['Support', 'Closed'],
    platform: 'messenger'
  },
  {
    id: 'c3',
    contactName: 'John Doe',
    contactAvatar: 'https://picsum.photos/id/67/100/100',
    lastMessage: 'How do I reset my password?',
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    unreadCount: 1,
    tags: ['Account'],
    platform: 'instagram'
  }
];

export const MOCK_MESSAGES: Record<string, Message[]> = {
  'c1': [
    {
      id: 'm1',
      conversationId: 'c1',
      senderId: 'customer_1',
      text: 'Hi, I placed an order yesterday.',
      timestamp: new Date(Date.now() - 1000 * 60 * 15),
      isIncoming: true,
      status: 'read',
      type: 'text'
    },
    {
      id: 'm1_img',
      conversationId: 'c1',
      senderId: 'customer_1',
      text: 'Here is the receipt',
      attachmentUrl: 'https://picsum.photos/id/42/300/200',
      timestamp: new Date(Date.now() - 1000 * 60 * 14),
      isIncoming: true,
      status: 'read',
      type: 'image'
    },
    {
      id: 'm2',
      conversationId: 'c1',
      senderId: 'ai_bot',
      text: 'Hello Maria! I can help with that. Do you have your order number?',
      timestamp: new Date(Date.now() - 1000 * 60 * 10),
      isIncoming: false,
      status: 'read',
      isAI: true,
      authorName: 'DocreChat AI',
      type: 'text'
    },
    {
      id: 'm3',
      conversationId: 'c1',
      senderId: 'customer_1',
      text: '', // Audio message often has no text
      timestamp: new Date(Date.now() - 1000 * 60 * 6),
      isIncoming: true,
      status: 'read',
      type: 'audio',
      duration: '0:15'
    },
    {
      id: 'm4',
      conversationId: 'c1',
      senderId: 'customer_1',
      text: 'Is my order shipped yet?',
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
      isIncoming: true,
      status: 'read',
      type: 'text'
    }
  ],
  'c2': [
    {
      id: 'm21',
      conversationId: 'c2',
      senderId: 'customer_2',
      text: 'I need to upgrade my plan.',
      timestamp: new Date(Date.now() - 1000 * 60 * 125),
      isIncoming: true,
      status: 'read',
      type: 'text'
    },
    {
      id: 'm22',
      conversationId: 'c2',
      senderId: 'agent_002',
      text: 'Sure, I have attached the new pricing guide.',
      timestamp: new Date(Date.now() - 1000 * 60 * 122),
      isIncoming: false,
      status: 'read',
      isAI: false,
      authorName: 'Sarah Smith',
      type: 'file',
      fileName: 'Enterprise_Pricing_2024.pdf',
      fileSize: '2.4 MB'
    },
    {
      id: 'm23',
      conversationId: 'c2',
      senderId: 'customer_2',
      text: 'Thanks for the quick help!',
      timestamp: new Date(Date.now() - 1000 * 60 * 120),
      isIncoming: true,
      status: 'read',
      type: 'text'
    }
  ],
  'c3': [
     {
      id: 'm31',
      conversationId: 'c3',
      senderId: 'customer_3',
      text: 'How do I reset my password?',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
      isIncoming: true,
      status: 'read',
      type: 'text'
    }
  ]
};

export const MOCK_NOTES: Record<string, Note[]> = {
  'c1': [
    {
      id: 'n1',
      conversationId: 'c1',
      authorId: 'agent_001',
      authorName: 'Alex Johnson',
      text: 'Customer is VIP, prioritize shipping issues.',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2)
    }
  ]
};

export const MOCK_CHANNELS: ChannelConfig[] = [
  { id: 'fb', platform: 'facebook', isConnected: true, pageName: 'DocreChat Page' },
  { id: 'ig', platform: 'instagram', isConnected: false },
  { id: 'wa', platform: 'whatsapp', isConnected: true, pageName: '+1 555 0192' }
];

export const MOCK_PIPELINES: PipelineStage[] = [
  { id: 'lead', name: 'New Lead', color: 'bg-blue-500' },
  { id: 'contacted', name: 'Contacted', color: 'bg-yellow-500' },
  { id: 'qualified', name: 'Qualified', color: 'bg-purple-500' },
  { id: 'closed', name: 'Closed Won', color: 'bg-green-500' }
];

export const MOCK_CONTACTS: CRMContact[] = [
  {
    id: 'ct1',
    name: 'Maria Garcia',
    email: 'maria.g@example.com',
    phone: '+1 555 0123',
    company: 'Freelance',
    pipelineStageId: 'contacted',
    properties: { city: 'Madrid' }
  },
  {
    id: 'ct2',
    name: 'John Doe',
    email: 'john.d@techsolutions.inc',
    phone: '+1 555 9876',
    company: 'Tech Solutions Inc.',
    pipelineStageId: 'qualified',
    properties: { city: 'New York' }
  }
];

export const MOCK_PROPERTIES: CustomProperty[] = [
  { id: 'city', name: 'City', type: 'text' },
  { id: 'budget', name: 'Budget', type: 'number' }
];

export const MOCK_TEMPLATES: Template[] = [
    {
        id: 't1',
        name: 'shipping_update',
        category: 'utility',
        language: 'en_US',
        status: 'approved',
        body: 'Your order {{1}} has been shipped! Track it here: {{2}}'
    },
    {
        id: 't2',
        name: 'welcome_discount',
        category: 'marketing',
        language: 'en_US',
        status: 'approved',
        body: 'Welcome to DocreChat! Use code {{1}} for 20% off your first purchase.'
    },
    {
        id: 't3',
        name: 'appointment_reminder',
        category: 'utility',
        language: 'es_ES',
        status: 'pending',
        body: 'Hola {{1}}, recuerda tu cita para mañana a las {{2}}.'
    }
];

export const MOCK_SNIPPETS: Snippet[] = [
    { id: 's1', shortcut: '/hi', content: 'Hello! How can I help you today?' },
    { id: 's2', shortcut: '/bye', content: 'Thank you for contacting us. Have a great day!' },
    { id: 's3', shortcut: '/price', content: 'Our basic plan starts at $29/mo.' },
    { id: 's4', shortcut: '/refund', content: 'To process a refund, please provide your Order ID.' }
];

export const MOCK_TASKS: Task[] = [
    {
        id: 'tk1',
        title: 'Follow up on Enterprise Deal',
        description: 'Check if they received the PDF proposal',
        assigneeId: 'agent_002',
        conversationId: 'c2',
        status: 'in_progress',
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24)
    },
    {
        id: 'tk2',
        title: 'Reset Password Issue',
        description: 'John Doe having trouble with 2FA',
        assigneeId: 'admin_001',
        conversationId: 'c3',
        status: 'todo',
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 48)
    }
];

// ─── Countries ────────────────────────────────────────────────────────────────
export const COUNTRIES: string[] = [
  'Afganistán','Albania','Alemania','Andorra','Angola','Antigua y Barbuda','Arabia Saudita','Argelia','Argentina',
  'Armenia','Australia','Austria','Azerbaiyán','Bahamas','Bangladés','Barbados','Baréin','Bélgica','Belice',
  'Benín','Bielorrusia','Bolivia','Bosnia y Herzegovina','Botsuana','Brasil','Brunéi','Bulgaria','Burkina Faso',
  'Burundi','Bután','Cabo Verde','Camboya','Camerún','Canadá','Catar','Chad','Chile','China','Chipre',
  'Colombia','Comoras','Corea del Norte','Corea del Sur','Costa de Marfil','Costa Rica','Croacia','Cuba',
  'Dinamarca','Dominica','Ecuador','Egipto','El Salvador','Emiratos Árabes Unidos','Eritrea',
  'Eslovaquia','Eslovenia','España','Estados Unidos','Estonia','Etiopía','Filipinas','Finlandia','Fiyi',
  'Francia','Gabón','Gambia','Georgia','Ghana','Granada','Grecia','Guatemala','Guinea','Guinea-Bisáu',
  'Guinea Ecuatorial','Guyana','Haití','Honduras','Hungría','India','Indonesia','Irak','Irán','Irlanda',
  'Islandia','Islas Marshall','Islas Salomón','Israel','Italia','Jamaica','Japón','Jordania','Kazajistán',
  'Kenia','Kirguistán','Kiribati','Kuwait','Laos','Lesoto','Letonia','Líbano','Liberia','Libia',
  'Liechtenstein','Lituania','Luxemburgo','Macedonia del Norte','Madagascar','Malasia','Malaui','Maldivas',
  'Malí','Malta','Marruecos','Mauricio','Mauritania','México','Micronesia','Moldavia','Mónaco','Mongolia',
  'Montenegro','Mozambique','Myanmar','Namibia','Nauru','Nepal','Nicaragua','Níger','Nigeria','Noruega',
  'Nueva Zelanda','Omán','Países Bajos','Pakistán','Palaos','Palestina','Panamá','Papúa Nueva Guinea',
  'Paraguay','Perú','Polonia','Portugal','Reino Unido','República Centroafricana','República Checa',
  'República del Congo','República Democrática del Congo','República Dominicana','Ruanda','Rumania',
  'Rusia','Samoa','San Cristóbal y Nieves','San Marino','San Vicente y las Granadinas','Santa Lucía',
  'Santo Tomé y Príncipe','Senegal','Serbia','Seychelles','Sierra Leona','Singapur','Siria','Somalia',
  'Sri Lanka','Suazilandia','Sudáfrica','Sudán','Sudán del Sur','Suecia','Suiza','Surinam','Tailandia',
  'Tanzania','Tayikistán','Timor Oriental','Togo','Tonga','Trinidad y Tobago','Túnez','Turkmenistán',
  'Turquía','Tuvalu','Ucrania','Uganda','Uruguay','Uzbekistán','Vanuatu','Venezuela','Vietnam',
  'Yemen','Yibuti','Zambia','Zimbabue',
];

export const COUNTRY_REGIONS: { label: string; emoji: string; countries: string[] }[] = [
  { label: 'América del Norte', emoji: '🌎', countries: ['Canadá','Estados Unidos','México'] },
  { label: 'América Central',   emoji: '🌎', countries: ['Belice','Costa Rica','El Salvador','Guatemala','Honduras','Nicaragua','Panamá'] },
  { label: 'Caribe',            emoji: '🌴', countries: ['Antigua y Barbuda','Bahamas','Barbados','Cuba','Dominica','Granada','Haití','Jamaica','República Dominicana','San Cristóbal y Nieves','San Vicente y las Granadinas','Santa Lucía','Trinidad y Tobago'] },
  { label: 'América del Sur',   emoji: '🌎', countries: ['Argentina','Bolivia','Brasil','Chile','Colombia','Ecuador','Guyana','Paraguay','Perú','Surinam','Uruguay','Venezuela'] },
  { label: 'Europa',            emoji: '🌍', countries: ['Albania','Alemania','Andorra','Armenia','Austria','Azerbaiyán','Bélgica','Bielorrusia','Bosnia y Herzegovina','Bulgaria','Chipre','Croacia','Dinamarca','Eslovaquia','Eslovenia','España','Estonia','Finlandia','Francia','Georgia','Grecia','Hungría','Irlanda','Islandia','Italia','Letonia','Liechtenstein','Lituania','Luxemburgo','Macedonia del Norte','Malta','Moldavia','Mónaco','Montenegro','Noruega','Países Bajos','Polonia','Portugal','Reino Unido','República Checa','Rumania','Rusia','San Marino','Serbia','Suecia','Suiza','Turquía','Ucrania'] },
  { label: 'África',            emoji: '🌍', countries: ['Angola','Argelia','Benín','Botsuana','Burkina Faso','Burundi','Cabo Verde','Camerún','Chad','Comoras','Costa de Marfil','Eritrea','Etiopía','Gabón','Gambia','Ghana','Guinea','Guinea Ecuatorial','Guinea-Bisáu','Kenia','Lesoto','Liberia','Libia','Madagascar','Malaui','Malí','Marruecos','Mauricio','Mauritania','Mozambique','Namibia','Níger','Nigeria','República Centroafricana','República del Congo','República Democrática del Congo','Ruanda','Santo Tomé y Príncipe','Senegal','Seychelles','Sierra Leona','Somalia','Sudáfrica','Sudán','Sudán del Sur','Suazilandia','Tanzania','Togo','Túnez','Uganda','Yibuti','Zambia','Zimbabue'] },
  { label: 'Oriente Medio',     emoji: '🕌', countries: ['Arabia Saudita','Baréin','Catar','Egipto','Emiratos Árabes Unidos','Irak','Irán','Israel','Jordania','Kuwait','Líbano','Omán','Palestina','Siria','Yemen'] },
  { label: 'Asia',              emoji: '🌏', countries: ['Afganistán','Bangladés','Brunéi','Bután','Camboya','China','Corea del Norte','Corea del Sur','Filipinas','India','Indonesia','Japón','Kazajistán','Kirguistán','Laos','Malasia','Maldivas','Mongolia','Myanmar','Nepal','Pakistán','Singapur','Sri Lanka','Tailandia','Tayikistán','Timor Oriental','Turkmenistán','Uzbekistán','Vietnam'] },
  { label: 'Oceanía',           emoji: '🌊', countries: ['Australia','Fiyi','Islas Marshall','Islas Salomón','Kiribati','Micronesia','Nauru','Nueva Zelanda','Palaos','Papúa Nueva Guinea','Samoa','Tonga','Tuvalu','Vanuatu'] },
];