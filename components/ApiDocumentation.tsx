// components/ApiDocumentation.tsx
// Developer-facing API documentation component for the Settings > API tab

import React, { useState } from 'react';
import { Copy, CheckCircle, ChevronDown, ChevronRight, ExternalLink, Code, BookOpen } from 'lucide-react';

interface Props {
  apiBaseUrl: string;
}

const ApiDocumentation: React.FC<Props> = ({ apiBaseUrl }) => {
  const [expandedSection, setExpandedSection] = useState<string | null>('authentication');
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const CodeBlock: React.FC<{ code: string; id: string; language?: string }> = ({ code, id, language = 'bash' }) => (
    <div className="relative group">
      <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        onClick={() => copyCode(code, id)}
        className="absolute top-2 right-2 p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copiedSnippet === id ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
      </button>
    </div>
  );

  const Section: React.FC<{ id: string; title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ id, title, icon, children }) => (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="font-semibold text-slate-800">{title}</span>
        </div>
        {expandedSection === id ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
      </button>
      {expandedSection === id && (
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 space-y-4">
          {children}
        </div>
      )}
    </div>
  );

  const MethodBadge: React.FC<{ method: string }> = ({ method }) => {
    const colors: Record<string, string> = {
      GET: 'bg-blue-100 text-blue-700',
      POST: 'bg-green-100 text-green-700',
      PUT: 'bg-yellow-100 text-yellow-800',
      DELETE: 'bg-red-100 text-red-700',
    };
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${colors[method] || 'bg-slate-100 text-slate-600'}`}>{method}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-6 rounded-xl">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen size={24} />
          <h3 className="text-xl font-bold">API Documentation</h3>
        </div>
        <p className="text-slate-300 text-sm">Integrate your CRM data with external platforms using our REST API.</p>
        <div className="mt-4 bg-slate-700/50 rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">Base URL</p>
          <div className="flex items-center gap-2">
            <code className="text-emerald-400 text-sm font-mono">{apiBaseUrl}</code>
            <button onClick={() => copyCode(apiBaseUrl, 'base-url')} className="text-slate-400 hover:text-white">
              {copiedSnippet === 'base-url' ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* Authentication */}
      <Section id="authentication" title="Authentication" icon={<Code size={18} className="text-emerald-600" />}>
        <p className="text-sm text-slate-600">
          All API requests must include your API key in the <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs font-mono">X-API-Key</code> header.
        </p>
        <CodeBlock
          id="auth-example"
          code={`curl -X GET "${apiBaseUrl}/contacts" \\
  -H "X-API-Key: dk_live_your_api_key_here" \\
  -H "Content-Type: application/json"`}
        />
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-800">
            <strong>Security:</strong> Never expose your API key in client-side code or public repositories. 
            Store it as an environment variable on your server.
          </p>
        </div>
        <div className="space-y-2">
          <h4 className="font-semibold text-sm text-slate-700">Error Responses</h4>
          <div className="text-xs text-slate-600 space-y-1">
            <p><code className="bg-slate-200 px-1 rounded">401</code> - Missing or invalid API key</p>
            <p><code className="bg-slate-200 px-1 rounded">403</code> - Insufficient scope or endpoint disabled</p>
            <p><code className="bg-slate-200 px-1 rounded">404</code> - Resource not found</p>
            <p><code className="bg-slate-200 px-1 rounded">429</code> - Rate limit exceeded</p>
            <p><code className="bg-slate-200 px-1 rounded">500</code> - Internal server error</p>
          </div>
        </div>
      </Section>

      {/* Contacts */}
      <Section id="contacts" title="Contacts" icon={<Code size={18} className="text-blue-600" />}>
        <div className="space-y-6">
          {/* List Contacts */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MethodBadge method="GET" />
              <code className="text-sm font-mono text-slate-700">/contacts</code>
            </div>
            <p className="text-sm text-slate-600 mb-2">List all contacts. Supports pagination.</p>
            <div className="text-xs text-slate-500 mb-2">
              <strong>Query Parameters:</strong> <code>limit</code> (max 100, default 50), <code>offset</code> (default 0)
            </div>
            <CodeBlock
              id="list-contacts"
              code={`curl "${apiBaseUrl}/contacts?limit=20&offset=0" \\
  -H "X-API-Key: dk_live_your_key"

# Response:
{
  "data": [
    {
      "id": "uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "company": "Acme Inc",
      "pipeline_stage": "lead",
      "custom_properties": {},
      "created_at": "2026-01-15T10:30:00Z"
    }
  ],
  "pagination": { "total": 150, "limit": 20, "offset": 0 }
}`}
            />
          </div>

          {/* Get Single Contact */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MethodBadge method="GET" />
              <code className="text-sm font-mono text-slate-700">/contacts/:id</code>
            </div>
            <p className="text-sm text-slate-600 mb-2">Get a single contact by ID.</p>
            <CodeBlock
              id="get-contact"
              code={`curl "${apiBaseUrl}/contacts/uuid-here" \\
  -H "X-API-Key: dk_live_your_key"`}
            />
          </div>

          {/* Create Contact */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MethodBadge method="POST" />
              <code className="text-sm font-mono text-slate-700">/contacts</code>
            </div>
            <p className="text-sm text-slate-600 mb-2">Create a new contact. <code className="bg-slate-200 px-1 rounded text-xs">name</code> is required.</p>
            <CodeBlock
              id="create-contact"
              code={`curl -X POST "${apiBaseUrl}/contacts" \\
  -H "X-API-Key: dk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+54911234567",
    "company": "Tech Corp",
    "pipeline_stage": "qualified",
    "custom_properties": {
      "source": "website",
      "interest": "enterprise"
    }
  }'`}
            />
          </div>

          {/* Update Contact */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MethodBadge method="PUT" />
              <code className="text-sm font-mono text-slate-700">/contacts/:id</code>
            </div>
            <p className="text-sm text-slate-600 mb-2">Update an existing contact.</p>
            <CodeBlock
              id="update-contact"
              code={`curl -X PUT "${apiBaseUrl}/contacts/uuid-here" \\
  -H "X-API-Key: dk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "company": "New Corp", "pipeline_stage": "customer" }'`}
            />
          </div>

          {/* Delete Contact */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MethodBadge method="DELETE" />
              <code className="text-sm font-mono text-slate-700">/contacts/:id</code>
            </div>
            <p className="text-sm text-slate-600 mb-2">Delete a contact permanently.</p>
            <CodeBlock
              id="delete-contact"
              code={`curl -X DELETE "${apiBaseUrl}/contacts/uuid-here" \\
  -H "X-API-Key: dk_live_your_key"`}
            />
          </div>

          {/* Search Contacts */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MethodBadge method="POST" />
              <code className="text-sm font-mono text-slate-700">/contacts-search</code>
            </div>
            <p className="text-sm text-slate-600 mb-2">Search contacts with filters.</p>
            <CodeBlock
              id="search-contacts"
              code={`curl -X POST "${apiBaseUrl}/contacts-search" \\
  -H "X-API-Key: dk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "john",
    "field": "name",
    "pipeline_stage": "lead",
    "limit": 20,
    "offset": 0
  }'`}
            />
          </div>
        </div>
      </Section>

      {/* Conversations */}
      <Section id="conversations" title="Conversations" icon={<Code size={18} className="text-purple-600" />}>
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MethodBadge method="GET" />
              <code className="text-sm font-mono text-slate-700">/conversations</code>
            </div>
            <p className="text-sm text-slate-600 mb-2">List conversations. Supports filtering by status and platform.</p>
            <div className="text-xs text-slate-500 mb-2">
              <strong>Query Parameters:</strong> <code>limit</code>, <code>offset</code>, <code>status</code> (open|closed|snoozed), <code>platform</code> (whatsapp|instagram|messenger)
            </div>
            <CodeBlock
              id="list-conversations"
              code={`curl "${apiBaseUrl}/conversations?status=open&platform=whatsapp&limit=20" \\
  -H "X-API-Key: dk_live_your_key"

# Response:
{
  "data": [
    {
      "id": "uuid",
      "contact_name": "Maria Garcia",
      "contact_phone": "+5491155554444",
      "platform": "whatsapp",
      "status": "open",
      "last_message": "Hello!",
      "last_message_time": "2026-02-23T14:30:00Z",
      "unread_count": 2,
      "tags": ["VIP"]
    }
  ],
  "pagination": { "total": 45, "limit": 20, "offset": 0 }
}`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <MethodBadge method="PUT" />
              <code className="text-sm font-mono text-slate-700">/conversations/:id</code>
            </div>
            <p className="text-sm text-slate-600 mb-2">Update conversation status, assignment, or tags.</p>
            <CodeBlock
              id="update-conversation"
              code={`curl -X PUT "${apiBaseUrl}/conversations/uuid-here" \\
  -H "X-API-Key: dk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "status": "closed",
    "tags": ["resolved", "satisfied"]
  }'`}
            />
          </div>
        </div>
      </Section>

      {/* Messages */}
      <Section id="messages" title="Messages" icon={<Code size={18} className="text-orange-600" />}>
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MethodBadge method="GET" />
              <code className="text-sm font-mono text-slate-700">/messages?conversation_id=uuid</code>
            </div>
            <p className="text-sm text-slate-600 mb-2">Get messages for a conversation. <code className="bg-slate-200 px-1 rounded text-xs">conversation_id</code> is required.</p>
            <CodeBlock
              id="get-messages"
              code={`curl "${apiBaseUrl}/messages?conversation_id=uuid-here&limit=50" \\
  -H "X-API-Key: dk_live_your_key"

# Response:
{
  "data": [
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "text": "Hello, I need help",
      "type": "text",
      "is_incoming": true,
      "status": "read",
      "created_at": "2026-02-23T14:30:00Z"
    }
  ],
  "pagination": { "total": 120, "limit": 50, "offset": 0 }
}`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <MethodBadge method="POST" />
              <code className="text-sm font-mono text-slate-700">/send-message</code>
            </div>
            <p className="text-sm text-slate-600 mb-2">Send a message to a conversation.</p>
            <CodeBlock
              id="send-message"
              code={`curl -X POST "${apiBaseUrl}/send-message" \\
  -H "X-API-Key: dk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "conversation_id": "uuid-here",
    "text": "Hello from the API!",
    "type": "text"
  }'`}
            />
          </div>
        </div>
      </Section>

      {/* Templates */}
      <Section id="templates" title="Templates" icon={<Code size={18} className="text-emerald-600" />}>
        <div className="flex items-center gap-2 mb-2">
          <MethodBadge method="GET" />
          <code className="text-sm font-mono text-slate-700">/templates</code>
        </div>
        <p className="text-sm text-slate-600 mb-2">List WhatsApp message templates. Optionally filter by status.</p>
        <div className="text-xs text-slate-500 mb-2">
          <strong>Query Parameters:</strong> <code>limit</code>, <code>offset</code>, <code>status</code> (approved|pending|rejected)
        </div>
        <CodeBlock
          id="list-templates"
          code={`curl "${apiBaseUrl}/templates?status=approved" \\
  -H "X-API-Key: dk_live_your_key"

# Response:
{
  "data": [
    {
      "id": "uuid",
      "name": "welcome_message",
      "category": "marketing",
      "language": "en_US",
      "body": "Hello {{1}}! Welcome to {{2}}.",
      "status": "approved"
    }
  ],
  "pagination": { "total": 12, "limit": 50, "offset": 0 }
}`}
        />
      </Section>

      {/* Rate Limits */}
      <Section id="rate-limits" title="Rate Limits & Best Practices" icon={<Code size={18} className="text-red-600" />}>
        <div className="space-y-3 text-sm text-slate-600">
          <p>Each endpoint has a configurable rate limit (default: 60 requests/minute). Exceeding the limit returns a <code className="bg-slate-200 px-1 rounded text-xs">429</code> status.</p>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h4 className="font-semibold text-slate-700 mb-2">Best Practices</h4>
            <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
              <li>Use pagination for large result sets (max 100 items per page)</li>
              <li>Cache responses when possible to reduce API calls</li>
              <li>Implement exponential backoff when receiving 429 responses</li>
              <li>Use the most restrictive scopes needed for your integration</li>
              <li>Rotate API keys periodically and set expiration dates</li>
              <li>Monitor your key's last used date in the dashboard</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* SDK Examples */}
      <Section id="sdk-examples" title="Integration Examples" icon={<Code size={18} className="text-indigo-600" />}>
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm text-slate-700 mb-2">JavaScript / Node.js</h4>
            <CodeBlock
              id="js-example"
              code={`const API_KEY = process.env.DOCRECHAT_API_KEY;
const BASE_URL = "${apiBaseUrl}";

// Fetch contacts
const response = await fetch(\`\${BASE_URL}/contacts?limit=20\`, {
  headers: {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  },
});
const { data, pagination } = await response.json();
console.log(\`Found \${pagination.total} contacts\`);

// Create a contact
const newContact = await fetch(\`\${BASE_URL}/contacts\`, {
  method: "POST",
  headers: {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "New Lead",
    email: "lead@example.com",
    phone: "+54911555444",
    pipeline_stage: "lead",
  }),
});`}
            />
          </div>

          <div>
            <h4 className="font-semibold text-sm text-slate-700 mb-2">Python</h4>
            <CodeBlock
              id="python-example"
              code={`import requests
import os

API_KEY = os.environ["DOCRECHAT_API_KEY"]
BASE_URL = "${apiBaseUrl}"
HEADERS = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
}

# List contacts
response = requests.get(f"{BASE_URL}/contacts", headers=HEADERS)
data = response.json()
print(f"Found {data['pagination']['total']} contacts")

# Create a contact
new_contact = requests.post(
    f"{BASE_URL}/contacts",
    headers=HEADERS,
    json={
        "name": "New Lead",
        "email": "lead@example.com",
        "phone": "+54911555444",
    },
)
print(new_contact.json())`}
            />
          </div>

          <div>
            <h4 className="font-semibold text-sm text-slate-700 mb-2">PHP</h4>
            <CodeBlock
              id="php-example"
              code={`<?php
$apiKey = getenv('DOCRECHAT_API_KEY');
$baseUrl = "${apiBaseUrl}";

// List contacts
$ch = curl_init("$baseUrl/contacts?limit=20");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "X-API-Key: $apiKey",
        "Content-Type: application/json",
    ],
]);
$response = json_decode(curl_exec($ch), true);
echo "Found " . $response['pagination']['total'] . " contacts\\n";
curl_close($ch);

// Create a contact
$ch = curl_init("$baseUrl/contacts");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "X-API-Key: $apiKey",
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "name" => "New Lead",
        "email" => "lead@example.com",
    ]),
]);
$result = json_decode(curl_exec($ch), true);
print_r($result);
curl_close($ch);`}
            />
          </div>
        </div>
      </Section>
    </div>
  );
};

export default ApiDocumentation;
