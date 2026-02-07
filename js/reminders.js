// Reminders Module
const Reminders = {
  async listForContact(contactId) {
    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('contact_id', contactId)
      .order('due_date', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async listAll({ includeCompleted = false } = {}) {
    let query = supabase
      .from('reminders')
      .select('*, contacts:contact_id(id, first_name, last_name)')
      .order('due_date', { ascending: true });

    if (!includeCompleted) {
      query = query.eq('completed', false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async create(reminder) {
    const user = await Auth.getUser();
    const { data, error } = await supabase
      .from('reminders')
      .insert({ ...reminder, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('reminders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async toggleComplete(id) {
    // Get current state
    const { data: reminder } = await supabase
      .from('reminders')
      .select('*')
      .eq('id', id)
      .single();

    if (!reminder) return;

    if (!reminder.completed && reminder.is_recurring && reminder.recurrence_interval) {
      // For recurring reminders, advance the due date instead of marking complete
      const newDueDate = new Date(reminder.due_date);
      newDueDate.setDate(newDueDate.getDate() + reminder.recurrence_interval);
      return this.update(id, { due_date: newDueDate.toISOString() });
    }

    return this.update(id, { completed: !reminder.completed });
  },

  async reschedule(id, newDate) {
    return this.update(id, { due_date: new Date(newDate).toISOString() });
  },

  async delete(id) {
    const { error } = await supabase
      .from('reminders')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // Keep-in-touch goals
  async getGoal(contactId) {
    const { data, error } = await supabase
      .from('keep_in_touch_goals')
      .select('*')
      .eq('contact_id', contactId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async setGoal(contactId, frequencyDays) {
    const user = await Auth.getUser();
    // Get last interaction date
    const lastInteraction = await Interactions.getLastInteraction(contactId);
    const { data, error } = await supabase
      .from('keep_in_touch_goals')
      .upsert(
        {
          user_id: user.id,
          contact_id: contactId,
          frequency_days: frequencyDays,
          last_interaction_date: lastInteraction?.interaction_date || null
        },
        { onConflict: 'user_id,contact_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async removeGoal(contactId) {
    const user = await Auth.getUser();
    const { error } = await supabase
      .from('keep_in_touch_goals')
      .delete()
      .eq('contact_id', contactId)
      .eq('user_id', user.id);
    if (error) throw error;
  },

  isOverdue(reminder) {
    return !reminder.completed && new Date(reminder.due_date) < new Date();
  },

  formatDueDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === -1) return 'Yesterday';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `In ${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  FREQUENCY_OPTIONS: [
    { value: 7, label: 'Weekly' },
    { value: 14, label: 'Every 2 weeks' },
    { value: 30, label: 'Monthly' },
    { value: 60, label: 'Every 2 months' },
    { value: 90, label: 'Quarterly' },
    { value: 180, label: 'Every 6 months' },
    { value: 365, label: 'Yearly' }
  ]
};
