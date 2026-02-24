import React, { useRef, useCallback } from 'react';
import { CustomProperty } from '../types';

interface EmailEditorProps {
  subject: string;
  body: string;
  onSubjectChange: (subject: string) => void;
  onBodyChange: (body: string) => void;
  customProperties?: CustomProperty[];
  /** Compact mode hides the header section */
  compact?: boolean;
}

const STANDARD_MERGE_TAGS = [
  { key: 'name', label: 'Nombre', icon: '👤' },
  { key: 'email', label: 'Email', icon: '📧' },
  { key: 'phone', label: 'Teléfono', icon: '📱' },
  { key: 'company', label: 'Empresa', icon: '🏢' },
];

export const EmailEditor: React.FC<EmailEditorProps> = ({
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  customProperties = [],
  compact = false,
}) => {
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Track which field was last focused to insert merge tags there
  const lastFocusedRef = useRef<'subject' | 'body'>('body');

  const insertMergeTag = useCallback((tag: string) => {
    const mergeTag = `{{${tag}}}`;
    const target = lastFocusedRef.current;

    if (target === 'subject' && subjectRef.current) {
      const input = subjectRef.current;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const newValue = subject.substring(0, start) + mergeTag + subject.substring(end);
      onSubjectChange(newValue);
      // Restore cursor after merge tag
      requestAnimationFrame(() => {
        input.selectionStart = input.selectionEnd = start + mergeTag.length;
        input.focus();
      });
    } else if (bodyRef.current) {
      const textarea = bodyRef.current;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const newValue = body.substring(0, start) + mergeTag + body.substring(end);
      onBodyChange(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + mergeTag.length;
        textarea.focus();
      });
    }
  }, [subject, body, onSubjectChange, onBodyChange]);

  // Build custom property merge tags
  const customTags = customProperties.map(prop => ({
    key: prop.name,
    label: prop.name,
    icon: prop.type === 'phone' ? '📱' : prop.type === 'date' ? '📅' : prop.type === 'number' ? '#️⃣' : prop.type === 'percentage' ? '📊' : '🔖',
  }));

  const allTags = [...STANDARD_MERGE_TAGS, ...customTags];

  return (
    <div className="space-y-3">
      {/* Subject */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Asunto</label>
        <input
          ref={subjectRef}
          type="text"
          value={subject}
          onChange={e => onSubjectChange(e.target.value)}
          onFocus={() => { lastFocusedRef.current = 'subject'; }}
          placeholder="Ej: Hola {{name}}, tenemos novedades"
          className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
        />
      </div>

      {/* Body */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Cuerpo del correo <span className="text-gray-500 text-xs">(soporta HTML)</span>
        </label>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={e => {
            onBodyChange(e.target.value);
            // auto-resize
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          onFocus={() => { lastFocusedRef.current = 'body'; }}
          placeholder={"<h2>Hola {{name}}</h2>\n<p>Te escribimos de {{company}}...</p>"}
          rows={compact ? 10 : 18}
          style={{ overflow: 'hidden', resize: 'none' }}
          className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 font-mono text-sm"
        />
      </div>

      {/* Merge Tags */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Variables de personalización <span className="text-gray-500 text-xs">(clic para insertar)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {allTags.map(tag => (
            <button
              key={tag.key}
              type="button"
              onClick={() => insertMergeTag(tag.key)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md border border-gray-600 transition-colors"
              title={`Insertar {{${tag.key}}}`}
            >
              <span>{tag.icon}</span>
              <span>{`{{${tag.key}}}`}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Preview hint */}
      {body && (
        <details className="text-sm" open>
          <summary className="cursor-pointer text-gray-400 hover:text-gray-300 select-none">
            Vista previa HTML
          </summary>
          <div
            className="mt-2 p-4 bg-white rounded-lg text-gray-900 text-sm border border-gray-300"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        </details>
      )}
    </div>
  );
};

export default EmailEditor;
