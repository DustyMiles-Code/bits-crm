// Import/Export Module
const ImportExport = {
  // CSV field definitions
  CSV_FIELDS: [
    { key: 'first_name', label: 'First Name', get: c => c.first_name || '' },
    { key: 'last_name', label: 'Last Name', get: c => c.last_name || '' },
    { key: 'email', label: 'Email', get: c => Contacts.getPrimaryEmail(c) || '' },
    { key: 'phone', label: 'Phone', get: c => Contacts.getPrimaryPhone(c) || '' },
    { key: 'company', label: 'Company', get: c => c.company || '' },
    { key: 'title', label: 'Title', get: c => c.title || '' },
    { key: 'birthday', label: 'Birthday', get: c => c.birthday || '' },
    { key: 'notes', label: 'Notes', get: c => c.notes || '' },
    { key: 'all_emails', label: 'All Emails', get: c => Contacts.getEmails(c).map(e => e.value).join('; ') },
    { key: 'all_phones', label: 'All Phones', get: c => Contacts.getPhones(c).map(p => p.value).join('; ') }
  ],

  CSV_DEFAULT_FIELDS: ['first_name', 'last_name', 'email', 'phone', 'company', 'title', 'birthday', 'notes'],

  // CSV Export
  exportContacts(contacts, selectedFieldKeys = null) {
    if (!contacts || contacts.length === 0) {
      throw new Error('No contacts to export');
    }

    const fields = selectedFieldKeys
      ? this.CSV_FIELDS.filter(f => selectedFieldKeys.includes(f.key))
      : this.CSV_FIELDS.filter(f => this.CSV_DEFAULT_FIELDS.includes(f.key));

    const headers = fields.map(f => f.label);
    const rows = contacts.map(c => fields.map(f => f.get(c)));

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

  // vCard Export
  exportAsVCard(contacts) {
    if (!contacts || contacts.length === 0) {
      throw new Error('No contacts to export');
    }

    const escVCard = (str) => (str || '').replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n');

    const vcards = contacts.map(c => {
      const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
      const fn = [c.first_name, c.last_name].filter(Boolean).join(' ');
      lines.push(`FN:${escVCard(fn)}`);
      lines.push(`N:${escVCard(c.last_name || '')};${escVCard(c.first_name || '')};;;`);

      Contacts.getEmails(c).forEach(e => {
        const type = e.label === 'work' ? 'WORK' : e.label === 'other' ? 'OTHER' : 'HOME';
        lines.push(`EMAIL;TYPE=${type}:${e.value}`);
      });

      Contacts.getPhones(c).forEach(p => {
        const type = p.label === 'work' ? 'WORK' : p.label === 'other' ? 'OTHER' : 'HOME';
        lines.push(`TEL;TYPE=${type}:${p.value}`);
      });

      if (c.company) lines.push(`ORG:${escVCard(c.company)}`);
      if (c.title) lines.push(`TITLE:${escVCard(c.title)}`);
      if (c.birthday) lines.push(`BDAY:${c.birthday}`);
      if (c.notes) lines.push(`NOTE:${escVCard(c.notes)}`);

      lines.push('END:VCARD');
      return lines.join('\r\n');
    }).join('\r\n');

    const blob = new Blob([vcards], { type: 'text/vcard;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = contacts.length === 1
      ? `${[contacts[0].first_name, contacts[0].last_name].filter(Boolean).join('-').toLowerCase() || 'contact'}.vcf`
      : `crm-contacts-${new Date().toISOString().slice(0, 10)}.vcf`;
    link.download = filename;
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

        // Wrap single email/phone into JSONB arrays
        if (contact.email) {
          contact.emails = JSON.stringify([{ value: contact.email, label: 'personal' }]);
        }
        if (contact.phone) {
          contact.phones = JSON.stringify([{ value: contact.phone, label: 'personal' }]);
        }

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
        if (score >= 0.45) {
          seen.add(key);
          pairs.push({ a, b, score });
        }
      }
    }

    return pairs.sort((x, y) => y.score - x.score);
  },

  similarityScore(a, b) {
    let score = 0;
    let maxScore = 0;
    let exactNameMatch = false;

    // Name matching (weighted heavily)
    const nameA = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase().trim();
    const nameB = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase().trim();
    if (nameA && nameB) {
      maxScore += 1;
      if (nameA === nameB) {
        score += 1;
        exactNameMatch = true;
      } else {
        const firstA = (a.first_name || '').toLowerCase().trim();
        const firstB = (b.first_name || '').toLowerCase().trim();
        if (firstA && firstB && firstA === firstB) {
          score += 0.6;
        } else if (nameA.includes(nameB) || nameB.includes(nameA)) {
          score += 0.5;
        }
      }
    }

    // Email cross-match: only count when BOTH contacts have emails
    const emailsA = Contacts.getEmails(a);
    const emailsB = Contacts.getEmails(b);
    if (emailsA.length > 0 && emailsB.length > 0) {
      maxScore += 1;
      const emailSetA = new Set(emailsA.map(e => e.value.toLowerCase().trim()));
      const hasMatch = emailsB.some(e => emailSetA.has(e.value.toLowerCase().trim()));
      if (hasMatch) score += 1;
    }

    // Phone cross-match: only count when BOTH contacts have phones
    const phonesA = Contacts.getPhones(a);
    const phonesB = Contacts.getPhones(b);
    if (phonesA.length > 0 && phonesB.length > 0) {
      maxScore += 1;
      const phoneSetA = new Set(phonesA.map(p => p.value.replace(/\D/g, '')));
      const hasMatch = phonesB.some(p => phoneSetA.has(p.value.replace(/\D/g, '')));
      if (hasMatch) score += 1;
    }

    // Company match
    if (a.company && b.company) {
      maxScore += 0.5;
      if (a.company.toLowerCase() === b.company.toLowerCase()) score += 0.5;
    }

    const computed = maxScore > 0 ? score / maxScore : 0;

    // Exact full name match (first + last) should always flag as potential duplicate
    // even when email/phone differ (e.g. personal vs work contact info)
    if (exactNameMatch && nameA.includes(' ')) {
      return Math.max(computed, 0.6);
    }

    return computed;
  },

  // Merge two contacts (keep primary, merge data from secondary, delete secondary)
  async mergeContacts(primaryId, secondaryId) {
    const [primary, secondary] = await Promise.all([
      Contacts.get(primaryId),
      Contacts.get(secondaryId)
    ]);

    // Merge: fill in blank fields from secondary
    const updates = {};
    const fields = ['last_name', 'company', 'title', 'notes', 'birthday'];
    fields.forEach(f => {
      if (!primary[f] && secondary[f]) {
        updates[f] = secondary[f];
      }
    });

    // Merge notes
    if (primary.notes && secondary.notes && primary.notes !== secondary.notes) {
      updates.notes = `${primary.notes}\n\n--- Merged ---\n${secondary.notes}`;
    }

    // Merge emails JSONB arrays
    const priEmails = Contacts.getEmails(primary);
    const secEmails = Contacts.getEmails(secondary);
    const mergedEmails = [...priEmails];
    secEmails.forEach(se => {
      const normalized = se.value.toLowerCase().trim();
      if (!mergedEmails.some(e => e.value.toLowerCase().trim() === normalized)) {
        mergedEmails.push(se);
      }
    });
    if (mergedEmails.length > priEmails.length) {
      updates.emails = JSON.stringify(mergedEmails);
      updates.email = mergedEmails[0]?.value || null;
    }

    // Merge phones JSONB arrays
    const priPhones = Contacts.getPhones(primary);
    const secPhones = Contacts.getPhones(secondary);
    const mergedPhones = [...priPhones];
    secPhones.forEach(sp => {
      const normalized = sp.value.replace(/\D/g, '');
      if (!mergedPhones.some(p => p.value.replace(/\D/g, '') === normalized)) {
        mergedPhones.push(sp);
      }
    });
    if (mergedPhones.length > priPhones.length) {
      updates.phones = JSON.stringify(mergedPhones);
      updates.phone = mergedPhones[0]?.value || null;
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
  },

  // Merge two contacts with user-selected field values
  async mergeContactsWithSelections(keepId, deleteId, selectedData) {
    const updates = {};

    if (selectedData.first_name !== undefined) updates.first_name = selectedData.first_name;
    if (selectedData.last_name !== undefined) updates.last_name = selectedData.last_name;
    if (selectedData.company !== undefined) updates.company = selectedData.company || null;
    if (selectedData.title !== undefined) updates.title = selectedData.title || null;
    if (selectedData.birthday !== undefined) updates.birthday = selectedData.birthday || null;
    if (selectedData.notes !== undefined) updates.notes = selectedData.notes || null;

    // Emails & phones come as arrays from the merge UI
    if (selectedData.emails) {
      updates.emails = JSON.stringify(selectedData.emails);
      updates.email = selectedData.emails[0]?.value || null;
    }
    if (selectedData.phones) {
      updates.phones = JSON.stringify(selectedData.phones);
      updates.phone = selectedData.phones[0]?.value || null;
    }

    if (Object.keys(updates).length > 0) {
      await Contacts.update(keepId, updates);
    }

    // Move interactions from deleted contact to kept contact
    await supabase
      .from('interactions')
      .update({ contact_id: keepId })
      .eq('contact_id', deleteId);

    // Move group memberships (ignore duplicates)
    const { data: secGroups } = await supabase
      .from('contact_groups')
      .select('group_id')
      .eq('contact_id', deleteId);

    if (secGroups) {
      for (const sg of secGroups) {
        await Contacts.addToGroup(keepId, sg.group_id).catch(() => {});
      }
    }

    // Move custom field values (don't overwrite existing)
    const { data: secFields } = await supabase
      .from('custom_field_values')
      .select('*')
      .eq('contact_id', deleteId);

    const { data: priFields } = await supabase
      .from('custom_field_values')
      .select('custom_field_id')
      .eq('contact_id', keepId);

    const priFieldIds = new Set((priFields || []).map(f => f.custom_field_id));

    if (secFields) {
      for (const sf of secFields) {
        if (!priFieldIds.has(sf.custom_field_id)) {
          await supabase.from('custom_field_values').insert({
            contact_id: keepId,
            custom_field_id: sf.custom_field_id,
            value: sf.value
          }).catch(() => {});
        }
      }
    }

    // Move reminders
    await supabase
      .from('reminders')
      .update({ contact_id: keepId })
      .eq('contact_id', deleteId);

    // Delete the other contact
    await Contacts.delete(deleteId);

    return await Contacts.get(keepId);
  }
};
