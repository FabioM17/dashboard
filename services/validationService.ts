// validationService.ts - Input validation and sanitization
export const validationService = {
  // Validate conversation ID (UUID format)
  validateConversationId(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  },

  // Validate phone number (international format)
  validatePhoneNumber(phone: string): boolean {
    // Permite formato internacional con o sin +
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  },

  // Validate message text (ONLY length, sanitization is done separately)
  validateMessageText(text: string): { valid: boolean; error?: string } {
    if (!text || text.trim().length === 0) {
      return { valid: false, error: 'Message text is required' };
    }
    // Sanitize first, then check if anything remains
    const sanitized = this.sanitizeText(text);
    if (sanitized.length === 0) {
      return { valid: false, error: 'Message is empty after removing malicious content' };
    }
    if (text.length > 4096) {
      return { valid: false, error: 'Message text exceeds maximum length (4096 characters)' };
    }
    return { valid: true };
  },

  // Validate file name
  validateFileName(fileName: string): { valid: boolean; error?: string } {
    if (!fileName) {
      return { valid: false, error: 'File name is required' };
    }
    if (fileName.length > 255) {
      return { valid: false, error: 'File name too long' };
    }
    // Check for path traversal
    if (/\.\.\/|\.\.\\/.test(fileName)) {
      return { valid: false, error: 'Invalid file name (path traversal detected)' };
    }
    // Check for invalid characters
    if (/[<>:"|?*\x00-\x1f]/g.test(fileName)) {
      return { valid: false, error: 'File name contains invalid characters' };
    }
    return { valid: true };
  },

  // Validate URL
  validateUrl(url: string): { valid: boolean; error?: string } {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, error: 'Only HTTP(S) URLs are allowed' };
      }
      return { valid: true };
    } catch (e) {
      return { valid: false, error: 'Invalid URL format' };
    }
  },

  // Sanitize text (remove potentially dangerous content)
  sanitizeText(text: string): string {
    return text
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  },

  // Validate organization ID
  validateOrganizationId(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  },

  // Validate email
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Validate template name
  validateTemplateName(name: string): { valid: boolean; error?: string } {
    if (!name) {
      return { valid: false, error: 'Template name is required' };
    }
    if (name.length > 100) {
      return { valid: false, error: 'Template name too long' };
    }
    // Only alphanumeric, underscore, and spaces
    if (!/^[a-zA-Z0-9_\s]+$/.test(name)) {
      return { valid: false, error: 'Template name contains invalid characters' };
    }
    return { valid: true };
  }
};
