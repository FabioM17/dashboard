
import { supabase } from './supabaseClient';

export const storageService = {
  /**
   * Uploads a file to the 'chat-attachments' bucket.
   * Returns the public URL.
   * Organizes by: chat-attachments/{organizationId}/{mediaType}/{folder}/{filename}
   */
  async uploadFile(file: File, folder: string = 'general', organizationId?: string, mediaType: 'image' | 'audio' | 'document' = 'document'): Promise<{ publicUrl: string; path: string }> {
    const fileExt = file.name.split('.').pop();
    const orgPrefix = organizationId ? `${organizationId}/` : '';
    const fileName = `${orgPrefix}${mediaType}/${folder}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(fileName, file);

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(fileName);

    return { publicUrl: data.publicUrl, path: fileName };
  }
};
