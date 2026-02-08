// Contacts Module
const Contacts = {
  async list({ search = '', groupId = null, sortBy = 'first_name', sortDir = 'asc' } = {}) {
    let query = supabase
      .from('contacts')
      .select(`
        *,
        contact_groups(group_id),
        keep_in_touch_goals(frequency_days, last_interaction_date)
      `)
      .order(sortBy, { ascending: sortDir === 'asc' });

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%,phone.ilike.%${search}%,notes.ilike.%${search}%,title.ilike.%${search}%,bio.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    let contacts = data || [];

    // Filter by group client-side if needed
    if (groupId) {
      contacts = contacts.filter(c =>
        c.contact_groups && c.contact_groups.some(cg => cg.group_id === groupId)
      );
    }

    return contacts;
  },

  async get(id) {
    const { data, error } = await supabase
      .from('contacts')
      .select(`
        *,
        contact_groups(group_id, groups:group_id(id, name, emoji)),
        keep_in_touch_goals(id, frequency_days, last_interaction_date),
        custom_field_values(id, custom_field_id, value)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(contact) {
    const user = await Auth.getUser();
    const { data, error } = await supabase
      .from('contacts')
      .insert({ ...contact, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async addToGroup(contactId, groupId) {
    const { error } = await supabase
      .from('contact_groups')
      .insert({ contact_id: contactId, group_id: groupId });
    if (error && error.code !== '23505') throw error; // ignore duplicate
  },

  async removeFromGroup(contactId, groupId) {
    const { error } = await supabase
      .from('contact_groups')
      .delete()
      .eq('contact_id', contactId)
      .eq('group_id', groupId);
    if (error) throw error;
  },

  async searchAcrossFields(search) {
    // Search contacts and custom field values
    const [contactsResult, cfvResult] = await Promise.all([
      this.list({ search }),
      supabase
        .from('custom_field_values')
        .select('contact_id')
        .ilike('value', `%${search}%`)
    ]);

    if (cfvResult.error) throw cfvResult.error;

    // Merge results: add contacts found via custom fields
    const contactIds = new Set(contactsResult.map(c => c.id));
    const extraIds = (cfvResult.data || [])
      .map(r => r.contact_id)
      .filter(id => !contactIds.has(id));

    if (extraIds.length > 0) {
      const { data } = await supabase
        .from('contacts')
        .select(`
          *,
          contact_groups(group_id),
          keep_in_touch_goals(frequency_days, last_interaction_date)
        `)
        .in('id', extraIds);
      return [...contactsResult, ...(data || [])];
    }

    return contactsResult;
  },

  async uploadAvatar(contactId, file) {
    const user = await Auth.getUser();
    const ext = file.name.split('.').pop().toLowerCase();
    const path = `${user.id}/${contactId}.${ext}`;

    // Remove old avatar first (different extension possible)
    await this.deleteAvatarFile(contactId);

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(path);

    // Bust cache with timestamp
    const avatarUrl = publicUrl + '?t=' + Date.now();
    await this.update(contactId, { avatar_url: avatarUrl });
    return avatarUrl;
  },

  async deleteAvatar(contactId) {
    await this.deleteAvatarFile(contactId);
    await this.update(contactId, { avatar_url: null });
  },

  async deleteAvatarFile(contactId) {
    const user = await Auth.getUser();
    const prefix = `${user.id}/${contactId}`;
    const { data: files } = await supabase.storage
      .from('avatars')
      .list(user.id, { search: contactId });
    if (files && files.length > 0) {
      const paths = files.map(f => `${user.id}/${f.name}`);
      await supabase.storage.from('avatars').remove(paths);
    }
  },

  renderAvatarHTML(contact, size = 'sm') {
    const sizeClass = size === 'lg' ? 'profile-avatar' : 'contact-avatar';
    if (contact.avatar_url) {
      return `<div class="${sizeClass}"><img src="${contact.avatar_url}" alt="" loading="lazy"></div>`;
    }
    return `<div class="${sizeClass}">${this.getInitials(contact)}</div>`;
  },

  getInitials(contact) {
    const first = (contact.first_name || '')[0] || '';
    const last = (contact.last_name || '')[0] || '';
    return (first + last).toUpperCase() || '?';
  },

  getFullName(contact) {
    return [contact.first_name, contact.last_name].filter(Boolean).join(' ');
  },

  getEmails(contact) {
    try {
      const emails = typeof contact.emails === 'string' ? JSON.parse(contact.emails) : contact.emails;
      if (Array.isArray(emails) && emails.length > 0) return emails;
    } catch (e) {}
    // Fallback to legacy field
    if (contact.email) return [{ value: contact.email, label: 'personal' }];
    return [];
  },

  getPhones(contact) {
    try {
      const phones = typeof contact.phones === 'string' ? JSON.parse(contact.phones) : contact.phones;
      if (Array.isArray(phones) && phones.length > 0) return phones;
    } catch (e) {}
    // Fallback to legacy field
    if (contact.phone) return [{ value: contact.phone, label: 'personal' }];
    return [];
  },

  getPrimaryEmail(contact) {
    const emails = this.getEmails(contact);
    return emails.length > 0 ? emails[0].value : '';
  },

  getPrimaryPhone(contact) {
    const phones = this.getPhones(contact);
    return phones.length > 0 ? phones[0].value : '';
  },

  getKitStatus(contact) {
    const goal = contact.keep_in_touch_goals?.[0];
    if (!goal) return { status: 'none', label: '—' };

    const lastDate = goal.last_interaction_date ? new Date(goal.last_interaction_date) : null;
    if (!lastDate) return { status: 'overdue', label: 'No interactions' };

    const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    const freq = goal.frequency_days;

    if (daysSince > freq) {
      return { status: 'overdue', label: `${daysSince - freq}d overdue` };
    } else if (daysSince > freq * 0.75) {
      return { status: 'due-soon', label: `Due in ${freq - daysSince}d` };
    } else {
      return { status: 'on-track', label: `${freq - daysSince}d left` };
    }
  }
};
