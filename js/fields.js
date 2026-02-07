// Custom Fields Module
const Fields = {
  async list() {
    // Try with sort_order first, fall back to created_at if column doesn't exist
    let { data, error } = await supabase
      .from('custom_fields')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      // sort_order column may not exist — retry without it
      const retry = await supabase
        .from('custom_fields')
        .select('*')
        .order('created_at', { ascending: true });
      if (retry.error) throw retry.error;
      data = retry.data;
    }
    // Ensure options is always an array
    return (data || []).map(f => ({
      ...f,
      options: Array.isArray(f.options) ? f.options
        : (typeof f.options === 'string' ? (() => { try { return JSON.parse(f.options); } catch { return []; } })()
        : [])
    }));
  },

  async create(field) {
    const user = await Auth.getUser();
    const { data, error } = await supabase
      .from('custom_fields')
      .insert({ ...field, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('custom_fields')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase
      .from('custom_fields')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async getValuesForContact(contactId) {
    const { data, error } = await supabase
      .from('custom_field_values')
      .select('*, custom_fields:custom_field_id(id, name, field_type, options)')
      .eq('contact_id', contactId);
    if (error) throw error;
    return data || [];
  },

  async setValueForContact(contactId, fieldId, value) {
    const { data, error } = await supabase
      .from('custom_field_values')
      .upsert(
        { contact_id: contactId, custom_field_id: fieldId, value },
        { onConflict: 'contact_id,custom_field_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteValueForContact(contactId, fieldId) {
    const { error } = await supabase
      .from('custom_field_values')
      .delete()
      .eq('contact_id', contactId)
      .eq('custom_field_id', fieldId);
    if (error) throw error;
  }
};
