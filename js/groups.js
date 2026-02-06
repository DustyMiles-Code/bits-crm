// Groups Module
const Groups = {
  async list() {
    const { data, error } = await supabase
      .from('groups')
      .select('*, contact_groups(contact_id)')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []).map(g => ({
      ...g,
      contact_count: g.contact_groups?.length || 0
    }));
  },

  async get(id) {
    const { data, error } = await supabase
      .from('groups')
      .select('*, contact_groups(contact_id)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return { ...data, contact_count: data.contact_groups?.length || 0 };
  },

  async create(group) {
    const user = await Auth.getUser();
    const { data, error } = await supabase
      .from('groups')
      .insert({ ...group, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('groups')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  COMMON_EMOJIS: [
    '📁', '⭐', '🏢', '👥', '💼', '🎯', '💰', '🤝',
    '📞', '✉️', '🏠', '🎓', '🔥', '💡', '🚀', '🎪',
    '❤️', '💎', '🌟', '🏆', '📌', '🔑', '🌈', '🎨',
    '🛠️', '📊', '🎁', '🌍', '🧠', '⚡', '🍀', '🐝'
  ]
};
