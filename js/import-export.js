// Import/Export Module
const ImportExport = {
  // CSV Export
  async exportContacts(contacts) {
    if (!contacts || contacts.length === 0) {
      throw new Error('No contacts to export');
    }

    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Title', 'Birthday', 'Notes'];
    const rows = contacts.map(c => [
      c.first_name || '',
      c.last_name || '',
      c.email || '',
      c.phone || '',
      c.company || '',
      c.title || '',
      c.birthday || '',
      c.notes || ''
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `crm-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  },

  // CSV Parse
  parseCSV(text) {
    const lines = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (inQuotes && text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        lines.push(current);
        current = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && text[i + 1] === '\n') i++;
        lines.push(current);
        current = '';
        // Mark row boundary
        lines.push('\n');
      } else {
        current += char;
      }
    }
    if (current) lines.push(current);

    // Split into rows
    const rows = [[]];
    for (const item of lines) {
      if (item === '\n') {
        rows.push([]);
      } else {
        rows[rows.length - 1].push(item.trim());
      }
    }

    return rows.filter(r => r.length > 0 && r.some(cell => cell !== ''));
  },

  // Detect field mapping from headers
  detectMapping(headers) {
    const mapping = {};
    const fieldMap = {
      'first name': 'first_name',
      'firstname': 'first_name',
      'first': 'first_name',
      'given name': 'first_name',
      'last name': 'last_name',
      'lastname': 'last_name',
      'last': 'last_name',
      'surname': 'last_name',
      'family name': 'last_name',
      'email': 'email',
      'e-mail': 'email',
      'email address': 'email',
      'phone': 'phone',
      'telephone': 'phone',
      'mobile': 'phone',
      'phone number': 'phone',
      'company': 'company',
      'organization': 'company',
      'organisation': 'company',
      'title': 'title',
      'job title': 'title',
      'position': 'title',
      'role': 'title',
      'birthday': 'birthday',
      'birth date': 'birthday',
      'date of birth': 'birthday',
      'notes': 'notes',
      'note': 'notes',
      'description': 'notes',
      'name': 'full_name' // will split
    };

    headers.forEach((header, index) => {
      const normalized = header.toLowerCase().trim();
      if (fieldMap[normalized]) {
        mapping[index] = fieldMap[normalized];
      }
    });

    return mapping;
  },

  // Import contacts from parsed CSV
  async importContacts(rows, mapping) {
    const user = await Auth.getUser();
    const headers = rows[0];
    const dataRows = rows.slice(1);
    const results = { imported: 0, errors: [] };

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      try {
        const contact = { user_id: user.id };

        Object.entries(mapping).forEach(([colIndex, field]) => {
          const value = row[colIndex]?.trim();
          if (!value) return;

          if (field === 'full_name') {
            const parts = value.split(/\s+/);
            contact.first_name = parts[0];
            contact.last_name = parts.slice(1).join(' ');
          } else {
            contact[field] = value;
          }
        });

        if (!contact.first_name && !contact.last_name && !contact.email) {
          results.errors.push(`Row ${i + 2}: No name or email found`);
          continue;
        }

        if (!contact.first_name) contact.first_name = contact.email || 'Unknown';

        const { error } = await supabase.from('contacts').insert(contact);
        if (error) throw error;
        results.imported++;
      } catch (err) {
        results.errors.push(`Row ${i + 2}: ${err.message}`);
      }
    }

    return results;
  },

  // Find potential duplicates
  async findDuplicates() {
    const contacts = await Contacts.list();
    const pairs = [];
    const seen = new Set();

    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const a = contacts[i];
        const b = contacts[j];
        const key = [a.id, b.id].sort().join('-');
        if (seen.has(key)) continue;

        const score = this.similarityScore(a, b);
        if (score >= 0.6) {
          seen.add(key);
          pairs.push({ a, b, score });
        }
      }
    }

    return pairs.sort((x, y) => y.score - x.score);
  },

  similarityScore(a, b) {
    let score = 0;
    let checks = 0;

    // Email match is strongest signal
    if (a.email && b.email) {
      checks++;
      if (a.email.toLowerCase() === b.email.toLowerCase()) score += 1;
    }

    // Name similarity
    const nameA = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase().trim();
    const nameB = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase().trim();
    if (nameA && nameB) {
      checks++;
      if (nameA === nameB) score += 1;
      else if (nameA.includes(nameB) || nameB.includes(nameA)) score += 0.7;
    }

    // Phone match
    if (a.phone && b.phone) {
      checks++;
      const phoneA = a.phone.replace(/\D/g, '');
      const phoneB = b.phone.replace(/\D/g, '');
      if (phoneA === phoneB) score += 1;
    }

    // Company match
    if (a.company && b.company) {
      checks++;
      if (a.company.toLowerCase() === b.company.toLowerCase()) score += 0.5;
    }

    return checks > 0 ? score / checks : 0;
  },

  // Merge two contacts (keep primary, merge data from secondary, delete secondary)
  async mergeContacts(primaryId, secondaryId) {
    const [primary, secondary] = await Promise.all([
      Contacts.get(primaryId),
      Contacts.get(secondaryId)
    ]);

    // Merge: fill in blank fields from secondary
    const updates = {};
    const fields = ['last_name', 'email', 'phone', 'company', 'title', 'notes', 'birthday'];
    fields.forEach(f => {
      if (!primary[f] && secondary[f]) {
        updates[f] = secondary[f];
      }
    });

    // Merge notes
    if (primary.notes && secondary.notes && primary.notes !== secondary.notes) {
      updates.notes = `${primary.notes}\n\n--- Merged ---\n${secondary.notes}`;
    }

    if (Object.keys(updates).length > 0) {
      await Contacts.update(primaryId, updates);
    }

    // Move interactions from secondary to primary
    await supabase
      .from('interactions')
      .update({ contact_id: primaryId })
      .eq('contact_id', secondaryId);

    // Move group memberships (ignore duplicates)
    const { data: secGroups } = await supabase
      .from('contact_groups')
      .select('group_id')
      .eq('contact_id', secondaryId);

    if (secGroups) {
      for (const sg of secGroups) {
        await Contacts.addToGroup(primaryId, sg.group_id).catch(() => {});
      }
    }

    // Move custom field values (don't overwrite existing)
    const { data: secFields } = await supabase
      .from('custom_field_values')
      .select('*')
      .eq('contact_id', secondaryId);

    const { data: priFields } = await supabase
      .from('custom_field_values')
      .select('custom_field_id')
      .eq('contact_id', primaryId);

    const priFieldIds = new Set((priFields || []).map(f => f.custom_field_id));

    if (secFields) {
      for (const sf of secFields) {
        if (!priFieldIds.has(sf.custom_field_id)) {
          await supabase.from('custom_field_values').insert({
            contact_id: primaryId,
            custom_field_id: sf.custom_field_id,
            value: sf.value
          }).catch(() => {});
        }
      }
    }

    // Move reminders
    await supabase
      .from('reminders')
      .update({ contact_id: primaryId })
      .eq('contact_id', secondaryId);

    // Delete secondary
    await Contacts.delete(secondaryId);

    return await Contacts.get(primaryId);
  }
};
