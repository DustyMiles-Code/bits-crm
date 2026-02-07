// Main App Controller
const App = {
  state: {
    view: 'table', // 'table' | 'profile'
    currentContactId: null,
    currentGroupId: null,
    searchQuery: '',
    sortBy: 'first_name',
    sortDir: 'asc',
    groups: [],
    contacts: [],
    customFields: [],
    selectedContactIds: new Set(),
    isDragging: false,
    visibleColumns: new Set(['name', 'email', 'company', 'last_interaction', 'goal_status', 'notes']),
    contactFieldValues: {}, // { contactId: { fieldId: value } }
    lastInteractions: {} // { contactId: { type, interaction_date } }
  },

  // ── Init ──────────────────────────────────────────
  async init() {
    const session = await Auth.requireAuth();
    if (!session) return;

    this.cacheElements();
    this.bindEvents();
    await this.loadData();
    this.render();
  },

  cacheElements() {
    // Sidebar
    this.sidebarEl = document.getElementById('sidebar');
    this.sidebarOverlay = document.getElementById('sidebar-overlay');
    this.sidebarToggle = document.getElementById('sidebar-toggle');
    this.searchInput = document.getElementById('search-input');
    this.groupsList = document.getElementById('groups-list');
    this.allContactsBtn = document.getElementById('all-contacts-btn');
    this.addGroupBtn = document.getElementById('add-group-btn');
    this.userNameEl = document.getElementById('user-name');
    this.userEmailEl = document.getElementById('user-email');
    this.userAvatarEl = document.getElementById('user-avatar');
    this.userMenuBtn = document.getElementById('user-menu-btn');
    this.userDropdown = document.getElementById('user-dropdown');

    // Main
    this.mainTitle = document.getElementById('main-title');
    this.mainCount = document.getElementById('main-count');
    this.mainActions = document.getElementById('main-actions');
    this.mainBody = document.getElementById('main-body');

    // Toast
    this.toastContainer = document.getElementById('toast-container');
  },

  bindEvents() {
    // Search with debounce
    let searchTimer;
    this.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.clearSelection();
        this.state.searchQuery = e.target.value;
        this.loadContacts().then(() => this.renderTable());
      }, 300);
    });

    // Sidebar toggle (mobile)
    this.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
    this.sidebarOverlay.addEventListener('click', () => this.toggleSidebar(false));

    // Logo home link
    const logoLink = document.getElementById('logo-home-link');
    if (logoLink) {
      logoLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.clearSelection();
        this.state.currentGroupId = null;
        this.state.view = 'table';
        this.state.currentContactId = null;
        this.updateSidebarActive();
        this.loadContacts().then(() => {
          this.renderHeader();
          this.renderTable();
        });
        this.toggleSidebar(false);
      });
    }

    // All contacts
    this.allContactsBtn.addEventListener('click', () => {
      this.clearSelection();
      this.state.currentGroupId = null;
      this.state.view = 'table';
      this.state.currentContactId = null;
      this.updateSidebarActive();
      this.loadContacts().then(() => {
        this.renderHeader();
        this.renderTable();
      });
    });

    // Add group
    this.addGroupBtn.addEventListener('click', () => this.showGroupModal());

    // User menu
    this.userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.userDropdown.hidden = !this.userDropdown.hidden;
    });

    document.addEventListener('click', () => {
      this.userDropdown.hidden = true;
      // Close any open dropdown
      document.querySelectorAll('.dropdown-menu:not([hidden])').forEach(d => d.hidden = true);
    });

    // Dark mode toggle
    const darkModeBtn = document.getElementById('btn-dark-mode');
    if (darkModeBtn) {
      this.updateDarkModeLabel();
      darkModeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('darkMode', isDark);
        this.updateDarkModeLabel();
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.state.selectedContactIds.size > 0) {
          this.clearSelection();
          return;
        }
        this.closeAllModals();
      }
      // Ctrl/Cmd + K for search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.searchInput.focus();
      }
    });
  },

  // ── Data Loading ─────────────────────────────────
  async loadData() {
    try {
      const [groups, customFields] = await Promise.all([
        Groups.list(),
        Fields.list().catch(err => {
          console.warn('Custom fields not available:', err.message);
          return [];
        })
      ]);
      this.state.groups = groups;
      this.state.customFields = customFields;
      await this.loadContacts();
      await Promise.all([this.loadFieldValues(), this.loadLastInteractions()]);
      this.setUserInfo();
    } catch (err) {
      this.toast('Failed to load data: ' + err.message, 'error');
    }
  },

  async loadContacts() {
    try {
      if (this.state.searchQuery) {
        this.state.contacts = await Contacts.searchAcrossFields(this.state.searchQuery);
      } else {
        this.state.contacts = await Contacts.list({
          groupId: this.state.currentGroupId,
          sortBy: this.state.sortBy,
          sortDir: this.state.sortDir
        });
      }
    } catch (err) {
      this.toast('Failed to load contacts: ' + err.message, 'error');
    }
  },

  async setUserInfo() {
    const user = await Auth.getUser();
    if (user) {
      const email = user.email || '';
      this.userEmailEl.textContent = email;
      this.userNameEl.textContent = email.split('@')[0];
      this.userAvatarEl.textContent = email[0]?.toUpperCase() || '?';
    }
  },

  // ── Rendering ────────────────────────────────────
  render() {
    this.renderSidebar();
    this.renderHeader();
    if (this.state.view === 'table') {
      this.renderTable();
    } else {
      this.renderProfile();
    }
  },

  renderSidebar() {
    // Groups
    this.groupsList.innerHTML = this.state.groups.map(g => `
      <button class="sidebar-item ${this.state.currentGroupId === g.id ? 'active' : ''}"
              data-group-id="${g.id}">
        <span class="sidebar-item-icon">${g.emoji}</span>
        <span class="sidebar-item-label">${this.esc(g.name)}</span>
        <span class="sidebar-item-count">${g.contact_count}</span>
      </button>
    `).join('');

    // Group click handlers + drop targets
    this.groupsList.querySelectorAll('.sidebar-item').forEach(el => {
      el.addEventListener('click', () => {
        this.clearSelection();
        this.state.currentGroupId = el.dataset.groupId;
        this.state.view = 'table';
        this.state.currentContactId = null;
        this.updateSidebarActive();
        this.loadContacts().then(() => {
          this.renderHeader();
          this.renderTable();
        });
        this.toggleSidebar(false);
      });

      // Right-click for edit/delete
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showGroupContextMenu(e, el.dataset.groupId);
      });

      // Drop target handlers
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        el.classList.add('drop-target-over');
      });

      el.addEventListener('dragleave', () => {
        el.classList.remove('drop-target-over');
      });

      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        el.classList.remove('drop-target-over', 'drop-target-ready');
        const groupId = el.dataset.groupId;
        let contactIds;
        try {
          contactIds = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch { return; }
        if (!Array.isArray(contactIds) || contactIds.length === 0) return;

        try {
          await Promise.all(contactIds.map(id => Contacts.addToGroup(id, groupId)));
          const group = this.state.groups.find(g => g.id === groupId);
          this.toast(`Added ${contactIds.length} contact${contactIds.length > 1 ? 's' : ''} to ${group?.name || 'group'}`);
          this.clearSelection();
          this.state.groups = await Groups.list();
          this.renderSidebar();
        } catch (err) {
          this.toast(err.message, 'error');
        }
      });
    });

    this.updateSidebarActive();
  },

  updateSidebarActive() {
    // All contacts button
    this.allContactsBtn.classList.toggle('active', !this.state.currentGroupId);
    // Group buttons
    this.groupsList.querySelectorAll('.sidebar-item').forEach(el => {
      el.classList.toggle('active', el.dataset.groupId === this.state.currentGroupId);
    });
  },

  renderHeader() {
    if (this.state.view === 'table') {
      const group = this.state.currentGroupId
        ? this.state.groups.find(g => g.id === this.state.currentGroupId)
        : null;
      this.mainTitle.textContent = group ? `${group.emoji} ${group.name}` : 'All Contacts';
      this.mainCount.textContent = this.state.contacts.length;
      this.mainCount.hidden = false;

      this.mainActions.innerHTML = `
        <button class="btn btn-ghost btn-sm" id="btn-import" title="Import CSV">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Import
        </button>
        <button class="btn btn-ghost btn-sm" id="btn-export" title="Export CSV">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Export
        </button>
        <button class="btn btn-ghost btn-sm" id="btn-merge" title="Find duplicates">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>
          Merge
        </button>
        <button class="btn btn-ghost btn-sm" id="btn-custom-fields" title="Manage fields">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m8.66-13l-5.2 3m-6.92 4l-5.2 3M1.34 8l5.2 3m6.92 4l5.2 3"/></svg>
          Fields
        </button>
        <div class="dropdown" id="column-filter-wrapper">
          <button class="btn btn-ghost btn-sm" id="btn-columns" title="Toggle columns">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Columns
          </button>
          <div class="dropdown-menu column-filter-dropdown" id="column-filter-dropdown" hidden></div>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-add-contact">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Contact
        </button>
      `;

      document.getElementById('btn-add-contact').addEventListener('click', () => this.showContactModal());
      document.getElementById('btn-import').addEventListener('click', () => this.showImportModal());
      document.getElementById('btn-export').addEventListener('click', () => this.handleExport());
      document.getElementById('btn-merge').addEventListener('click', () => this.showMergeModal());
      document.getElementById('btn-custom-fields').addEventListener('click', () => this.showFieldsModal());
      this.bindColumnFilter();
    } else {
      this.mainTitle.innerHTML = `
        <button class="btn btn-ghost btn-sm" id="btn-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
      `;
      this.mainCount.hidden = true;
      this.mainActions.innerHTML = '';
      document.getElementById('btn-back').addEventListener('click', () => {
        this.clearSelection();
        this.state.view = 'table';
        this.state.currentContactId = null;
        this.loadContacts().then(() => this.render());
      });
    }
  },

  // Column definitions for table
  TABLE_COLUMNS: [
    { key: 'name', label: 'Name', sortKey: 'first_name' },
    { key: 'email', label: 'Email', sortKey: 'email' },
    { key: 'phone', label: 'Phone', sortKey: null },
    { key: 'company', label: 'Company', sortKey: 'company' },
    { key: 'title', label: 'Title', sortKey: null },
    { key: 'last_interaction', label: 'Last Interaction', sortKey: null },
    { key: 'goal_status', label: 'Goal Status', sortKey: null },
    { key: 'birthday', label: 'Birthday', sortKey: null },
    { key: 'notes', label: 'Notes', sortKey: null }
  ],

  getAllColumns() {
    const cfCols = this.state.customFields.map(f => ({
      key: `cf_${f.id}`,
      label: f.name,
      sortKey: null,
      isCustomField: true,
      fieldId: f.id
    }));
    return [...this.TABLE_COLUMNS, ...cfCols];
  },

  bindColumnFilter() {
    const btn = document.getElementById('btn-columns');
    const dropdown = document.getElementById('column-filter-dropdown');
    if (!btn || !dropdown) return;

    const renderDropdown = () => {
      const allCols = this.getAllColumns();
      const hasCf = allCols.some(c => c.isCustomField);
      dropdown.innerHTML = this.TABLE_COLUMNS.map(col => `
        <label class="column-filter-item">
          <input type="checkbox" value="${col.key}" ${this.state.visibleColumns.has(col.key) ? 'checked' : ''}>
          <span>${col.label}</span>
        </label>
      `).join('')
      + (hasCf ? `<div class="column-filter-divider"></div>` : '')
      + allCols.filter(c => c.isCustomField).map(col => `
        <label class="column-filter-item">
          <input type="checkbox" value="${col.key}" ${this.state.visibleColumns.has(col.key) ? 'checked' : ''}>
          <span>${this.esc(col.label)}</span>
        </label>
      `).join('');

      dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
          e.stopPropagation();
          if (cb.checked) {
            this.state.visibleColumns.add(cb.value);
          } else {
            this.state.visibleColumns.delete(cb.value);
          }
          this.renderTable();
        });
      });
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasHidden = dropdown.hidden;
      // Close all other dropdowns
      document.querySelectorAll('.dropdown-menu:not([hidden])').forEach(d => d.hidden = true);
      if (wasHidden) {
        renderDropdown();
        dropdown.hidden = false;
      }
    });

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  },

  renderColumnCell(col, contact) {
    switch (col.key) {
      case 'name':
        return `
          <div class="contact-name-cell">
            <div class="contact-avatar">${Contacts.getInitials(contact)}</div>
            <div>
              <div class="contact-name-text">${this.esc(Contacts.getFullName(contact))}</div>
              ${contact.title ? `<div class="contact-company-text">${this.esc(contact.title)}</div>` : ''}
            </div>
          </div>`;
      case 'email':
        return `<span class="contact-email-text">${this.esc(Contacts.getPrimaryEmail(contact) || '—')}</span>`;
      case 'phone': {
        const phones = Contacts.getPhones(contact);
        return this.esc(phones.length > 0 ? phones[0].value : '—');
      }
      case 'company':
        return this.esc(contact.company || '—');
      case 'title':
        return this.esc(contact.title || '—');
      case 'last_interaction':
        return this.renderLastInteraction(contact);
      case 'goal_status':
        return this.renderKitStatus(contact);
      case 'birthday':
        return contact.birthday
          ? new Date(contact.birthday + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '—';
      case 'notes':
        return `<div class="notes-preview">${this.esc(contact.notes || '—')}</div>`;
      default:
        // Custom field columns (cf_<id>)
        if (col.isCustomField) {
          const vals = this.state.contactFieldValues[contact.id];
          const val = vals ? vals[col.fieldId] : null;
          return `<span class="${val ? '' : 'text-tertiary'}">${this.esc(val || '—')}</span>`;
        }
        return '—';
    }
  },

  renderTable() {
    if (this.state.contacts.length === 0) {
      this.mainBody.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div class="empty-state-title">${this.state.searchQuery ? 'No results found' : 'No contacts yet'}</div>
          <div class="empty-state-text">${this.state.searchQuery ? 'Try a different search term' : 'Add your first contact to get started'}</div>
          ${!this.state.searchQuery ? '<button class="btn btn-primary" id="empty-add-contact">Add Contact</button>' : ''}
        </div>
      `;
      document.getElementById('empty-add-contact')?.addEventListener('click', () => this.showContactModal());
      return;
    }

    const visibleCols = this.getAllColumns().filter(col => this.state.visibleColumns.has(col.key));

    const sortIcon = (col) => {
      if (this.state.sortBy !== col) return '<span class="sort-icon">↕</span>';
      return `<span class="sort-icon">${this.state.sortDir === 'asc' ? '↑' : '↓'}</span>`;
    };

    const sorted = (col) => this.state.sortBy === col ? 'sorted' : '';

    this.mainBody.innerHTML = `
      <div class="contacts-table-wrapper">
        <table class="contacts-table">
          <thead>
            <tr>
              <th class="th-select"><input type="checkbox" title="Select all"></th>
              ${visibleCols.map(col => col.sortKey
                ? `<th class="${sorted(col.sortKey)}" data-sort="${col.sortKey}" data-col="${col.key}">${col.label} ${sortIcon(col.sortKey)}</th>`
                : `<th data-col="${col.key}">${col.label}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${this.state.contacts.map(c => `
              <tr data-contact-id="${c.id}" draggable="true" class="${this.state.selectedContactIds.has(c.id) ? 'row-selected' : ''}">
                <td class="td-select"><input type="checkbox" ${this.state.selectedContactIds.has(c.id) ? 'checked' : ''}></td>
                ${visibleCols.map(col => `<td data-col="${col.key}">${this.renderColumnCell(col, c)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Select All checkbox
    const selectAllCheckbox = this.mainBody.querySelector('.th-select input[type="checkbox"]');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectAllCheckbox.checked) {
          this.state.contacts.forEach(c => this.state.selectedContactIds.add(c.id));
        } else {
          this.state.selectedContactIds.clear();
        }
        this.mainBody.querySelectorAll('tr[data-contact-id]').forEach(tr => {
          const id = tr.dataset.contactId;
          const cb = tr.querySelector('.td-select input[type="checkbox"]');
          const isSelected = this.state.selectedContactIds.has(id);
          tr.classList.toggle('row-selected', isSelected);
          if (cb) cb.checked = isSelected;
        });
        this.updateBulkActionBar();
      });
    }

    // Sort handlers
    this.mainBody.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (this.state.sortBy === col) {
          this.state.sortDir = this.state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.state.sortBy = col;
          this.state.sortDir = 'asc';
        }
        this.loadContacts().then(() => this.renderTable());
      });
    });

    // Row checkbox + click + drag handlers
    this.mainBody.querySelectorAll('tr[data-contact-id]').forEach(tr => {
      const contactId = tr.dataset.contactId;
      const checkbox = tr.querySelector('.td-select input[type="checkbox"]');

      // Checkbox click
      if (checkbox) {
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
          if (checkbox.checked) {
            this.state.selectedContactIds.add(contactId);
          } else {
            this.state.selectedContactIds.delete(contactId);
          }
          tr.classList.toggle('row-selected', checkbox.checked);
          this.syncSelectAllCheckbox();
          this.updateBulkActionBar();
        });
      }

      // Row click to profile (not on checkbox)
      tr.addEventListener('click', (e) => {
        if (e.target.closest('.td-select')) return;
        this.clearSelection();
        this.state.currentContactId = contactId;
        this.state.view = 'profile';
        this.renderHeader();
        this.renderProfile();
      });

      // Drag start
      tr.addEventListener('dragstart', (e) => {
        this.state.isDragging = true;
        let dragIds;
        if (this.state.selectedContactIds.has(contactId)) {
          dragIds = Array.from(this.state.selectedContactIds);
        } else {
          dragIds = [contactId];
        }
        e.dataTransfer.setData('text/plain', JSON.stringify(dragIds));
        e.dataTransfer.effectAllowed = 'copy';

        // Create ghost badge
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.textContent = dragIds.length === 1
          ? (this.state.contacts.find(c => c.id === dragIds[0])?.first_name || '1 contact')
          : `${dragIds.length} contacts`;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 0, 0);
        setTimeout(() => ghost.remove(), 0);

        tr.classList.add('dragging');
        // Mark sidebar groups as drop targets
        document.querySelectorAll('#groups-list .sidebar-item').forEach(el => {
          el.classList.add('drop-target-ready');
        });
      });

      tr.addEventListener('dragend', () => {
        this.state.isDragging = false;
        tr.classList.remove('dragging');
        document.querySelectorAll('.drop-target-ready, .drop-target-over').forEach(el => {
          el.classList.remove('drop-target-ready', 'drop-target-over');
        });
      });
    });

    this.syncSelectAllCheckbox();
  },

  renderLastInteraction(contact) {
    const li = this.state.lastInteractions[contact.id];
    if (!li) return `<span class="text-tertiary text-sm">—</span>`;
    const icon = Interactions.TYPE_ICONS[li.type] || '📝';
    return `<span class="text-sm">${icon} ${Interactions.formatDate(li.interaction_date)}</span>`;
  },

  renderKitStatus(contact) {
    const kit = Contacts.getKitStatus(contact);
    if (kit.status === 'none') return '<span class="kit-status no-goal">—</span>';
    return `<span class="kit-status ${kit.status === 'on-track' ? 'on-track' : kit.status === 'due-soon' ? 'due-soon' : 'overdue'}">${this.esc(kit.label)}</span>`;
  },

  // ── Contact Profile ──────────────────────────────
  async renderProfile() {
    const id = this.state.currentContactId;
    if (!id) return;

    this.mainBody.innerHTML = '<div style="display:flex;justify-content:center;padding:48px"><div class="loading-spinner"></div></div>';

    try {
      const [contact, interactions, reminders, fieldValues] = await Promise.all([
        Contacts.get(id),
        Interactions.listForContact(id),
        Reminders.listForContact(id),
        Fields.getValuesForContact(id).catch(() => [])
      ]);

      const groups = contact.contact_groups?.map(cg => cg.groups).filter(Boolean) || [];
      const allFields = this.state.customFields;

      // Build field values map
      const fieldMap = {};
      fieldValues.forEach(fv => { fieldMap[fv.custom_field_id] = fv.value; });

      this.mainBody.innerHTML = `
        <div class="profile-view">
          <!-- Header -->
          <div class="profile-header">
            <div class="profile-avatar">${Contacts.getInitials(contact)}</div>
            <div class="profile-info">
              <div class="profile-name">${this.esc(Contacts.getFullName(contact))}</div>
              ${contact.title || contact.company ? `
                <div class="profile-title-company">
                  ${this.esc([contact.title, contact.company].filter(Boolean).join(' at '))}
                </div>
              ` : ''}
              <div class="profile-meta">
                ${Contacts.getEmails(contact).map(e => `
                  <div class="profile-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    ${this.esc(e.value)}<span class="profile-meta-label">(${this.esc(e.label)})</span>
                  </div>
                `).join('')}
                ${Contacts.getPhones(contact).map(p => `
                  <div class="profile-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    ${this.esc(p.value)}<span class="profile-meta-label">(${this.esc(p.label)})</span>
                  </div>
                `).join('')}
                ${contact.birthday ? `
                  <div class="profile-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    ${new Date(contact.birthday + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                  </div>
                ` : ''}
              </div>
            </div>
            <div class="profile-actions">
              <button class="btn btn-ghost btn-sm" id="profile-export-btn" title="Export contact">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Export
              </button>
              <button class="btn btn-secondary btn-sm" id="profile-edit-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
              <button class="btn btn-danger btn-sm" id="profile-delete-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </button>
            </div>
          </div>

          <div class="profile-grid">
            <!-- Groups -->
            <div class="profile-section">
              <div class="profile-section-header">
                <div class="profile-section-title">Groups</div>
                <button class="btn btn-ghost btn-sm" id="profile-add-group-btn">+ Add</button>
              </div>
              <div class="group-tags" id="profile-groups">
                ${groups.length > 0 ? groups.map(g => `
                  <span class="group-tag" data-group-id="${g.id}">
                    ${g.emoji} ${this.esc(g.name)}
                    <span class="group-tag-remove" data-group-id="${g.id}">&times;</span>
                  </span>
                `).join('') : '<span class="text-tertiary text-sm">No groups</span>'}
              </div>
            </div>

            <!-- Keep in Touch -->
            <div class="profile-section">
              <div class="profile-section-header">
                <div class="profile-section-title">Keep in Touch</div>
                <button class="btn btn-ghost btn-sm" id="profile-kit-btn">Set Goal</button>
              </div>
              <div id="profile-kit-status">
                ${this.renderProfileKitStatus(contact)}
              </div>
            </div>

            <!-- Notes -->
            <div class="profile-section full-width">
              <div class="profile-section-header">
                <div class="profile-section-title">Notes</div>
                <button class="btn btn-ghost btn-sm" id="profile-edit-notes-btn">Edit</button>
              </div>
              <div class="text-secondary" style="white-space: pre-wrap; font-size: var(--font-size-sm);">${contact.notes ? this.esc(contact.notes) : '<em class="text-tertiary">No notes</em>'}</div>
            </div>

            <!-- Custom Fields -->
            ${allFields.length > 0 ? `
              <div class="profile-section full-width">
                <div class="profile-section-header">
                  <div class="profile-section-title">Custom Fields</div>
                </div>
                ${allFields.map(f => `
                  <div class="detail-row">
                    <span class="detail-label">${this.esc(f.name)}</span>
                    <span class="detail-value ${fieldMap[f.id] ? '' : 'empty'}"
                          data-field-id="${f.id}"
                          data-field-type="${f.field_type}"
                          data-field-options='${JSON.stringify(f.options || [])}'
                          style="cursor:pointer"
                          title="Click to edit">
                      ${this.esc(fieldMap[f.id] || 'Not set')}
                    </span>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <!-- Interactions -->
            <div class="profile-section full-width">
              <div class="profile-section-header">
                <div class="profile-section-title">Interactions</div>
                <button class="btn btn-primary btn-sm" id="profile-add-interaction-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Log Interaction
                </button>
              </div>
              <div class="timeline" id="profile-interactions">
                ${interactions.length > 0 ? interactions.map(i => `
                  <div class="timeline-item" data-interaction-id="${i.id}">
                    <div class="timeline-icon ${i.type}">${Interactions.TYPE_ICONS[i.type] || '📝'}</div>
                    <div class="timeline-content">
                      <div class="timeline-header">
                        <span class="timeline-type">${this.esc(i.type)}</span>
                        <span class="timeline-date">${Interactions.formatFullDate(i.interaction_date)}</span>
                      </div>
                      ${i.notes ? `<div class="timeline-notes">${this.esc(i.notes)}</div>` : ''}
                    </div>
                    <div class="timeline-actions">
                      <button class="btn-icon interaction-delete" data-id="${i.id}" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                `).join('') : '<div class="text-tertiary text-sm" style="padding: 12px 0">No interactions logged yet</div>'}
              </div>
            </div>

            <!-- Reminders -->
            <div class="profile-section full-width">
              <div class="profile-section-header">
                <div class="profile-section-title">Reminders</div>
                <button class="btn btn-ghost btn-sm" id="profile-add-reminder-btn">+ Add</button>
              </div>
              <div id="profile-reminders">
                ${reminders.length > 0 ? reminders.map(r => `
                  <div class="reminder-item ${r.completed ? 'completed' : ''}" data-reminder-id="${r.id}">
                    <div class="reminder-checkbox ${r.completed ? 'completed' : ''}" data-id="${r.id}">
                      ${r.completed ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                    </div>
                    <div class="reminder-content">
                      <div class="reminder-title">${this.esc(r.title)}</div>
                      <div class="reminder-due ${Reminders.isOverdue(r) ? 'overdue' : ''}">${Reminders.formatDueDate(r.due_date)}</div>
                      ${r.is_recurring ? `<div class="reminder-recurring">Repeats every ${r.recurrence_interval}d</div>` : ''}
                    </div>
                    <button class="btn-icon reminder-delete" data-id="${r.id}" title="Delete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                `).join('') : '<div class="text-tertiary text-sm" style="padding: 12px 0">No reminders</div>'}
              </div>
            </div>
          </div>
        </div>
      `;

      // Bind profile events
      this.bindProfileEvents(contact, groups);
    } catch (err) {
      this.mainBody.innerHTML = `<div class="empty-state"><div class="empty-state-title">Error loading contact</div><div class="empty-state-text">${this.esc(err.message)}</div></div>`;
    }
  },

  renderProfileKitStatus(contact) {
    const goal = contact.keep_in_touch_goals?.[0];
    if (!goal) return '<span class="text-tertiary text-sm">No goal set</span>';

    const kit = Contacts.getKitStatus(contact);
    const freq = Reminders.FREQUENCY_OPTIONS.find(f => f.value === goal.frequency_days);
    return `
      <div style="display:flex;align-items:center;gap:12px">
        <span class="kit-status ${kit.status === 'on-track' ? 'on-track' : kit.status === 'due-soon' ? 'due-soon' : 'overdue'}">
          ${this.esc(kit.label)}
        </span>
        <span class="text-sm text-secondary">Goal: ${freq ? freq.label : `Every ${goal.frequency_days}d`}</span>
        <button class="btn btn-ghost btn-sm" id="profile-kit-remove">Remove</button>
      </div>
    `;
  },

  bindProfileEvents(contact, groups) {
    // Export contact
    document.getElementById('profile-export-btn')?.addEventListener('click', () => {
      this.handleExport([contact]);
    });

    // Edit contact
    document.getElementById('profile-edit-btn')?.addEventListener('click', () => {
      this.showContactModal(contact);
    });

    // Delete contact
    document.getElementById('profile-delete-btn')?.addEventListener('click', async () => {
      if (!confirm(`Delete ${Contacts.getFullName(contact)}? This cannot be undone.`)) return;
      try {
        await Contacts.delete(contact.id);
        this.toast('Contact deleted');
        this.state.view = 'table';
        this.state.currentContactId = null;
        await this.loadContacts();
        this.render();
      } catch (err) {
        this.toast('Failed to delete: ' + err.message, 'error');
      }
    });

    // Add to group
    document.getElementById('profile-add-group-btn')?.addEventListener('click', () => {
      this.showAddToGroupModal(contact.id, groups.map(g => g.id));
    });

    // Remove from group
    document.querySelectorAll('.group-tag-remove').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await Contacts.removeFromGroup(contact.id, el.dataset.groupId);
          this.toast('Removed from group');
          await this.refreshProfile();
        } catch (err) {
          this.toast(err.message, 'error');
        }
      });
    });

    // Keep in touch
    document.getElementById('profile-kit-btn')?.addEventListener('click', () => {
      this.showKitModal(contact.id);
    });

    document.getElementById('profile-kit-remove')?.addEventListener('click', async () => {
      try {
        await Reminders.removeGoal(contact.id);
        this.toast('Goal removed');
        await this.refreshProfile();
      } catch (err) {
        this.toast(err.message, 'error');
      }
    });

    // Edit notes
    document.getElementById('profile-edit-notes-btn')?.addEventListener('click', () => {
      this.showNotesModal(contact);
    });

    // Custom field inline edit
    document.querySelectorAll('.detail-value[data-field-id]').forEach(el => {
      el.addEventListener('click', () => {
        this.showFieldEditModal(contact.id, el.dataset.fieldId, el.dataset.fieldType, el.textContent.trim(), JSON.parse(el.dataset.fieldOptions || '[]'));
      });
    });

    // Add interaction
    document.getElementById('profile-add-interaction-btn')?.addEventListener('click', () => {
      this.showInteractionModal(contact.id);
    });

    // Delete interaction
    document.querySelectorAll('.interaction-delete').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this interaction?')) return;
        try {
          await Interactions.delete(el.dataset.id);
          this.toast('Interaction deleted');
          await this.refreshProfile();
        } catch (err) {
          this.toast(err.message, 'error');
        }
      });
    });

    // Add reminder
    document.getElementById('profile-add-reminder-btn')?.addEventListener('click', () => {
      this.showReminderModal(contact.id);
    });

    // Toggle reminder
    document.querySelectorAll('.reminder-checkbox').forEach(el => {
      el.addEventListener('click', async () => {
        try {
          await Reminders.toggleComplete(el.dataset.id);
          await this.refreshProfile();
        } catch (err) {
          this.toast(err.message, 'error');
        }
      });
    });

    // Delete reminder
    document.querySelectorAll('.reminder-delete').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await Reminders.delete(el.dataset.id);
          this.toast('Reminder deleted');
          await this.refreshProfile();
        } catch (err) {
          this.toast(err.message, 'error');
        }
      });
    });
  },

  async refreshProfile() {
    await Promise.all([this.loadGroups(), this.loadContacts(), this.loadCustomFields(), this.loadFieldValues(), this.loadLastInteractions()]);
    this.renderSidebar();
    this.renderProfile();
  },

  async loadCustomFields() {
    this.state.customFields = await Fields.list();
  },

  async loadFieldValues() {
    if (this.state.customFields.length === 0) {
      this.state.contactFieldValues = {};
      return;
    }
    try {
      const allValues = await Fields.getAllValues();
      const map = {};
      allValues.forEach(v => {
        if (!map[v.contact_id]) map[v.contact_id] = {};
        map[v.contact_id][v.custom_field_id] = v.value;
      });
      this.state.contactFieldValues = map;
    } catch (err) {
      console.warn('Failed to load field values:', err);
      this.state.contactFieldValues = {};
    }
  },

  async loadLastInteractions() {
    try {
      this.state.lastInteractions = await Interactions.getLastInteractions();
    } catch (err) {
      console.warn('Failed to load last interactions:', err);
      this.state.lastInteractions = {};
    }
  },

  async loadGroups() {
    this.state.groups = await Groups.list();
  },

  // ── Selection & Bulk Actions ─────────────────────
  clearSelection() {
    this.state.selectedContactIds.clear();
    document.querySelectorAll('.row-selected').forEach(el => el.classList.remove('row-selected'));
    const selectAll = document.querySelector('.th-select input[type="checkbox"]');
    if (selectAll) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }
    this.removeBulkActionBar();
  },

  syncSelectAllCheckbox() {
    const selectAll = document.querySelector('.th-select input[type="checkbox"]');
    if (!selectAll) return;
    const total = this.state.contacts.length;
    const selected = this.state.selectedContactIds.size;
    selectAll.checked = total > 0 && selected === total;
    selectAll.indeterminate = selected > 0 && selected < total;
  },

  updateBulkActionBar() {
    const count = this.state.selectedContactIds.size;
    if (count === 0) {
      this.removeBulkActionBar();
      return;
    }
    let bar = document.querySelector('.bulk-action-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'bulk-action-bar';
      document.body.appendChild(bar);
    }
    bar.innerHTML = `
      <span class="bulk-action-bar-count">${count} selected</span>
      <button class="btn btn-sm btn-bulk-group" id="bulk-add-group-btn">Add to Group</button>
      <button class="btn btn-sm btn-bulk-export" id="bulk-export-btn">Export</button>
      <button class="btn btn-sm btn-bulk-delete" id="bulk-delete-btn">Delete</button>
      <button class="btn btn-sm btn-bulk-clear" id="bulk-clear-btn">Clear</button>
    `;
    bar.querySelector('#bulk-add-group-btn').addEventListener('click', () => this.showBulkAddToGroupModal());
    bar.querySelector('#bulk-export-btn').addEventListener('click', () => this.handleExport());
    bar.querySelector('#bulk-delete-btn').addEventListener('click', () => this.handleBulkDelete());
    bar.querySelector('#bulk-clear-btn').addEventListener('click', () => this.clearSelection());
  },

  removeBulkActionBar() {
    const bar = document.querySelector('.bulk-action-bar');
    if (bar) bar.remove();
  },

  async handleBulkDelete() {
    const count = this.state.selectedContactIds.size;
    if (!confirm(`Delete ${count} contact${count > 1 ? 's' : ''}? This cannot be undone.`)) return;
    const ids = Array.from(this.state.selectedContactIds);
    try {
      await Promise.all(ids.map(id => Contacts.delete(id)));
      this.toast(`Deleted ${count} contact${count > 1 ? 's' : ''}`);
      this.clearSelection();
      await this.loadData();
      this.renderSidebar();
      this.renderTable();
    } catch (err) {
      this.toast('Failed to delete: ' + err.message, 'error');
    }
  },

  showBulkAddToGroupModal() {
    if (this.state.groups.length === 0) {
      this.toast('No groups available. Create a group first.');
      return;
    }

    const html = `
      <div class="modal-header">
        <div class="modal-title">Add ${this.state.selectedContactIds.size} contacts to group</div>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        ${this.state.groups.map(g => `
          <button class="sidebar-item" data-group-id="${g.id}" style="width:100%">
            <span class="sidebar-item-icon">${g.emoji}</span>
            <span class="sidebar-item-label">${this.esc(g.name)}</span>
          </button>
        `).join('')}
      </div>
    `;

    const overlay = this.showModal(html);
    overlay.querySelectorAll('[data-group-id]').forEach(el => {
      el.addEventListener('click', async () => {
        const groupId = el.dataset.groupId;
        const ids = Array.from(this.state.selectedContactIds);
        try {
          await Promise.all(ids.map(id => Contacts.addToGroup(id, groupId)));
          const group = this.state.groups.find(g => g.id === groupId);
          this.toast(`Added ${ids.length} contact${ids.length > 1 ? 's' : ''} to ${group?.name || 'group'}`);
          this.closeModal(overlay);
          this.clearSelection();
          this.state.groups = await Groups.list();
          this.renderSidebar();
        } catch (err) {
          this.toast(err.message, 'error');
        }
      });
    });
  },

  // ── Modals ───────────────────────────────────────
  showModal(html, { className = '', onOpen } = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `<div class="modal ${className}">${html}</div>`;

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal(overlay);
    });

    // Close button
    overlay.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => this.closeModal(overlay));
    });

    document.body.appendChild(overlay);
    if (onOpen) onOpen(overlay);
    return overlay;
  },

  closeModal(overlay) {
    if (overlay) {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 200);
    }
  },

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(o => this.closeModal(o));
  },

  // Contact Modal
  showContactModal(contact = null) {
    const isEdit = !!contact;
    const existingEmails = contact ? Contacts.getEmails(contact) : [];
    const existingPhones = contact ? Contacts.getPhones(contact) : [];

    const labelOptions = ['personal', 'work', 'other'];
    const buildLabelSelect = (selected) => labelOptions.map(l =>
      `<option value="${l}" ${l === selected ? 'selected' : ''}>${l.charAt(0).toUpperCase() + l.slice(1)}</option>`
    ).join('');

    const buildEmailRow = (email = { value: '', label: 'personal' }) => `
      <div class="multi-value-row">
        <input class="form-input" type="email" placeholder="email@example.com" value="${this.esc(email.value)}">
        <select class="form-select multi-value-label">${buildLabelSelect(email.label)}</select>
        <button type="button" class="btn btn-ghost btn-sm btn-remove" title="Remove">&times;</button>
      </div>
    `;

    const buildPhoneRow = (phone = { value: '', label: 'personal' }) => `
      <div class="multi-value-row">
        <input class="form-input" type="tel" placeholder="555-0100" value="${this.esc(phone.value)}">
        <select class="form-select multi-value-label">${buildLabelSelect(phone.label)}</select>
        <button type="button" class="btn btn-ghost btn-sm btn-remove" title="Remove">&times;</button>
      </div>
    `;

    const emailRows = existingEmails.length > 0 ? existingEmails.map(e => buildEmailRow(e)).join('') : buildEmailRow();
    const phoneRows = existingPhones.length > 0 ? existingPhones.map(p => buildPhoneRow(p)).join('') : buildPhoneRow();

    const html = `
      <div class="modal-header">
        <div class="modal-title">${isEdit ? 'Edit Contact' : 'New Contact'}</div>
        <button class="modal-close">&times;</button>
      </div>
      <form id="contact-form">
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">First Name *</label>
              <input class="form-input" name="first_name" value="${this.esc(contact?.first_name || '')}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Last Name</label>
              <input class="form-input" name="last_name" value="${this.esc(contact?.last_name || '')}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Emails</label>
            <div id="emails-container">${emailRows}</div>
            <button type="button" class="multi-value-add" id="add-email-btn">+ Add Email</button>
          </div>
          <div class="form-group">
            <label class="form-label">Phones</label>
            <div id="phones-container">${phoneRows}</div>
            <button type="button" class="multi-value-add" id="add-phone-btn">+ Add Phone</button>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Company</label>
              <input class="form-input" name="company" value="${this.esc(contact?.company || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Title</label>
              <input class="form-input" name="title" value="${this.esc(contact?.title || '')}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Birthday</label>
            <input class="form-input" type="date" name="birthday" value="${contact?.birthday || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea class="form-textarea" name="notes" rows="3">${this.esc(contact?.notes || '')}</textarea>
          </div>
          ${this.state.customFields.length > 0 ? `
            <button type="button" class="custom-fields-toggle" id="custom-fields-toggle">+ Custom Fields</button>
            <div class="custom-fields-section" id="custom-fields-section" hidden>
              ${this.state.customFields.map(f => `
                <div class="form-group" data-custom-field-id="${f.id}">
                  <label class="form-label">${this.esc(f.name)}</label>
                  ${f.field_type === 'textarea'
                    ? `<textarea class="form-textarea custom-field-input" data-field-id="${f.id}" rows="2"></textarea>`
                    : f.field_type === 'dropdown'
                    ? `<select class="form-select custom-field-input" data-field-id="${f.id}">
                        <option value="">— Select —</option>
                        ${(f.options || []).map(o => `<option value="${this.esc(o)}">${this.esc(o)}</option>`).join('')}
                      </select>`
                    : f.field_type === 'date'
                    ? `<input class="form-input custom-field-input" type="date" data-field-id="${f.id}">`
                    : `<input class="form-input custom-field-input" data-field-id="${f.id}">`
                  }
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary modal-close">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Add Contact'}</button>
        </div>
      </form>
    `;

    const overlay = this.showModal(html, {
      onOpen: async (ol) => {
        const emailsContainer = ol.querySelector('#emails-container');
        const phonesContainer = ol.querySelector('#phones-container');

        ol.querySelector('#add-email-btn').addEventListener('click', () => {
          emailsContainer.insertAdjacentHTML('beforeend', buildEmailRow());
          this.bindMultiValueRemove(emailsContainer);
        });

        ol.querySelector('#add-phone-btn').addEventListener('click', () => {
          phonesContainer.insertAdjacentHTML('beforeend', buildPhoneRow());
          this.bindMultiValueRemove(phonesContainer);
        });

        this.bindMultiValueRemove(emailsContainer);
        this.bindMultiValueRemove(phonesContainer);

        // Custom fields toggle
        const cfToggle = ol.querySelector('#custom-fields-toggle');
        const cfSection = ol.querySelector('#custom-fields-section');
        if (cfToggle && cfSection) {
          cfToggle.addEventListener('click', () => {
            const isHidden = cfSection.hidden;
            cfSection.hidden = !isHidden;
            cfToggle.textContent = isHidden ? '− Custom Fields' : '+ Custom Fields';
          });

          // Pre-fill custom field values when editing
          if (isEdit) {
            try {
              const fieldValues = await Fields.getValuesForContact(contact.id);
              fieldValues.forEach(fv => {
                const input = cfSection.querySelector(`[data-field-id="${fv.custom_field_id}"]`);
                if (input) input.value = fv.value || '';
              });
              // Auto-expand if any values exist
              if (fieldValues.some(fv => fv.value)) {
                cfSection.hidden = false;
                cfToggle.textContent = '− Custom Fields';
              }
            } catch (err) {
              console.warn('Failed to load custom field values:', err);
            }
          }
        }
      }
    });

    const form = overlay.querySelector('#contact-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd);
      // Clean empty strings
      Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });

      // Build emails JSONB array from repeater
      const emailsContainer = overlay.querySelector('#emails-container');
      const emails = [];
      emailsContainer.querySelectorAll('.multi-value-row').forEach(row => {
        const value = row.querySelector('input').value.trim();
        const label = row.querySelector('select').value;
        if (value) emails.push({ value, label });
      });
      data.emails = JSON.stringify(emails);
      data.email = emails.length > 0 ? emails[0].value : null;

      // Build phones JSONB array from repeater
      const phonesContainer = overlay.querySelector('#phones-container');
      const phones = [];
      phonesContainer.querySelectorAll('.multi-value-row').forEach(row => {
        const value = row.querySelector('input').value.trim();
        const label = row.querySelector('select').value;
        if (value) phones.push({ value, label });
      });
      data.phones = JSON.stringify(phones);
      data.phone = phones.length > 0 ? phones[0].value : null;

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        let contactId;
        if (isEdit) {
          await Contacts.update(contact.id, data);
          contactId = contact.id;
          this.toast('Contact updated');
        } else {
          const newContact = await Contacts.create(data);
          contactId = newContact.id;
          // If we're viewing a group, add to that group
          if (this.state.currentGroupId) {
            await Contacts.addToGroup(newContact.id, this.state.currentGroupId);
          }
          this.toast('Contact added');
        }

        // Save custom field values
        const cfInputs = overlay.querySelectorAll('.custom-field-input');
        if (cfInputs.length > 0) {
          const existingValues = isEdit ? await Fields.getValuesForContact(contactId).catch(() => []) : [];
          const existingMap = {};
          existingValues.forEach(fv => { existingMap[fv.custom_field_id] = fv.value; });

          const promises = [];
          cfInputs.forEach(input => {
            const fieldId = input.dataset.fieldId;
            const value = input.value.trim();
            if (value) {
              promises.push(Fields.setValueForContact(contactId, fieldId, value));
            } else if (isEdit && existingMap[fieldId]) {
              promises.push(Fields.deleteValueForContact(contactId, fieldId));
            }
          });
          if (promises.length > 0) await Promise.all(promises);
        }

        this.closeModal(overlay);
        await this.loadData();
        this.render();
        if (isEdit && this.state.view === 'profile') {
          this.renderProfile();
        }
      } catch (err) {
        this.toast(err.message, 'error');
        btn.disabled = false;
      }
    });
  },

  bindMultiValueRemove(container) {
    container.querySelectorAll('.btn-remove').forEach(btn => {
      btn.onclick = () => {
        // Keep at least one row
        if (container.querySelectorAll('.multi-value-row').length > 1) {
          btn.closest('.multi-value-row').remove();
        } else {
          // Clear the input instead of removing
          btn.closest('.multi-value-row').querySelector('input').value = '';
        }
      };
    });
  },

  // Group Modal
  showGroupModal(group = null) {
    const isEdit = !!group;
    let selectedEmoji = group?.emoji || '📁';

    const html = `
      <div class="modal-header">
        <div class="modal-title">${isEdit ? 'Edit Group' : 'New Group'}</div>
        <button class="modal-close">&times;</button>
      </div>
      <form id="group-form">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Emoji</label>
            <div style="position:relative">
              <button type="button" class="emoji-picker-trigger" id="emoji-trigger">${selectedEmoji}</button>
              <div class="emoji-picker-dropdown" hidden id="emoji-dropdown">
                ${Groups.COMMON_EMOJIS.map(e => `<button type="button" class="emoji-option" data-emoji="${e}">${e}</button>`).join('')}
              </div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Name *</label>
            <input class="form-input" name="name" value="${this.esc(group?.name || '')}" required placeholder="e.g. Hot Leads">
          </div>
        </div>
        <div class="modal-footer">
          ${isEdit ? '<button type="button" class="btn btn-danger" id="group-delete-btn">Delete Group</button>' : ''}
          <div style="flex:1"></div>
          <button type="button" class="btn btn-secondary modal-close">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Create Group'}</button>
        </div>
      </form>
    `;

    const overlay = this.showModal(html, {
      onOpen: (ol) => {
        const trigger = ol.querySelector('#emoji-trigger');
        const dropdown = ol.querySelector('#emoji-dropdown');

        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.hidden = !dropdown.hidden;
        });

        dropdown.querySelectorAll('.emoji-option').forEach(btn => {
          btn.addEventListener('click', () => {
            selectedEmoji = btn.dataset.emoji;
            trigger.textContent = selectedEmoji;
            dropdown.hidden = true;
          });
        });

        ol.addEventListener('click', () => { dropdown.hidden = true; });
      }
    });

    const form = overlay.querySelector('#group-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = form.querySelector('[name="name"]').value;
      try {
        if (isEdit) {
          await Groups.update(group.id, { name, emoji: selectedEmoji });
          this.toast('Group updated');
        } else {
          await Groups.create({ name, emoji: selectedEmoji });
          this.toast('Group created');
        }
        this.closeModal(overlay);
        this.state.groups = await Groups.list();
        this.renderSidebar();
      } catch (err) {
        this.toast(err.message, 'error');
      }
    });

    // Delete
    overlay.querySelector('#group-delete-btn')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${group.name}"? Contacts won't be deleted.`)) return;
      try {
        await Groups.delete(group.id);
        this.toast('Group deleted');
        this.closeModal(overlay);
        if (this.state.currentGroupId === group.id) {
          this.state.currentGroupId = null;
        }
        this.state.groups = await Groups.list();
        await this.loadContacts();
        this.render();
      } catch (err) {
        this.toast(err.message, 'error');
      }
    });
  },

  showGroupContextMenu(e, groupId) {
    const group = this.state.groups.find(g => g.id === groupId);
    if (!group) return;
    this.showGroupModal(group);
  },

  // Add to Group Modal
  showAddToGroupModal(contactId, existingGroupIds) {
    const available = this.state.groups.filter(g => !existingGroupIds.includes(g.id));
    if (available.length === 0) {
      this.toast('Contact is in all groups');
      return;
    }

    const html = `
      <div class="modal-header">
        <div class="modal-title">Add to Group</div>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        ${available.map(g => `
          <button class="sidebar-item" data-group-id="${g.id}" style="width:100%">
            <span class="sidebar-item-icon">${g.emoji}</span>
            <span class="sidebar-item-label">${this.esc(g.name)}</span>
          </button>
        `).join('')}
      </div>
    `;

    const overlay = this.showModal(html);
    overlay.querySelectorAll('[data-group-id]').forEach(el => {
      el.addEventListener('click', async () => {
        try {
          await Contacts.addToGroup(contactId, el.dataset.groupId);
          this.toast('Added to group');
          this.closeModal(overlay);
          await this.refreshProfile();
        } catch (err) {
          this.toast(err.message, 'error');
        }
      });
    });
  },

  // Interaction Modal
  showInteractionModal(contactId) {
    const now = new Date();
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    const html = `
      <div class="modal-header">
        <div class="modal-title">Log Interaction</div>
        <button class="modal-close">&times;</button>
      </div>
      <form id="interaction-form">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Type</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${Interactions.TYPES.map(t => `
                <label style="display:flex;align-items:center;gap:4px;padding:6px 12px;border:1px solid var(--border);border-radius:var(--radius-pill);cursor:pointer;font-size:var(--font-size-sm)">
                  <input type="radio" name="type" value="${t}" ${t === 'call' ? 'checked' : ''} style="display:none">
                  <span>${Interactions.TYPE_ICONS[t]} ${t}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Date</label>
            <input class="form-input" type="datetime-local" name="interaction_date" value="${localIso}">
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea class="form-textarea" name="notes" rows="3" placeholder="What happened?"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary modal-close">Cancel</button>
          <button type="submit" class="btn btn-primary">Log Interaction</button>
        </div>
      </form>
    `;

    const overlay = this.showModal(html, {
      onOpen: (ol) => {
        // Style radio buttons as pills
        ol.querySelectorAll('label:has(input[type="radio"])').forEach(label => {
          const radio = label.querySelector('input');
          if (radio.checked) label.style.borderColor = 'var(--accent)';
          label.addEventListener('click', () => {
            ol.querySelectorAll('label:has(input[type="radio"])').forEach(l => l.style.borderColor = 'var(--border)');
            label.style.borderColor = 'var(--accent)';
          });
        });
      }
    });

    const form = overlay.querySelector('#interaction-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        await Interactions.create({
          contact_id: contactId,
          type: fd.get('type'),
          interaction_date: new Date(fd.get('interaction_date')).toISOString(),
          notes: fd.get('notes') || null
        });
        this.toast('Interaction logged');
        this.closeModal(overlay);
        await this.refreshProfile();
      } catch (err) {
        this.toast(err.message, 'error');
      }
    });
  },

  // Reminder Modal
  showReminderModal(contactId) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const html = `
      <div class="modal-header">
        <div class="modal-title">New Reminder</div>
        <button class="modal-close">&times;</button>
      </div>
      <form id="reminder-form">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Title *</label>
            <input class="form-input" name="title" required placeholder="e.g. Follow up on proposal">
          </div>
          <div class="form-group">
            <label class="form-label">Due Date</label>
            <input class="form-input" type="date" name="due_date" value="${tomorrowStr}" required>
          </div>
          <div class="form-group">
            <label class="form-label" style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" name="is_recurring" id="recurring-check">
              Recurring
            </label>
          </div>
          <div class="form-group" id="recurrence-group" hidden>
            <label class="form-label">Repeat every (days)</label>
            <input class="form-input" type="number" name="recurrence_interval" min="1" value="7">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary modal-close">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Reminder</button>
        </div>
      </form>
    `;

    const overlay = this.showModal(html, {
      onOpen: (ol) => {
        const check = ol.querySelector('#recurring-check');
        const group = ol.querySelector('#recurrence-group');
        check.addEventListener('change', () => { group.hidden = !check.checked; });
      }
    });

    const form = overlay.querySelector('#reminder-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        await Reminders.create({
          contact_id: contactId,
          title: fd.get('title'),
          due_date: new Date(fd.get('due_date')).toISOString(),
          is_recurring: !!fd.get('is_recurring'),
          recurrence_interval: fd.get('is_recurring') ? parseInt(fd.get('recurrence_interval')) : null
        });
        this.toast('Reminder created');
        this.closeModal(overlay);
        await this.refreshProfile();
      } catch (err) {
        this.toast(err.message, 'error');
      }
    });
  },

  // Keep in Touch Modal
  showKitModal(contactId) {
    const html = `
      <div class="modal-header">
        <div class="modal-title">Keep in Touch Goal</div>
        <button class="modal-close">&times;</button>
      </div>
      <form id="kit-form">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">How often do you want to reach out?</label>
            <select class="form-select" name="frequency">
              ${Reminders.FREQUENCY_OPTIONS.map(f => `<option value="${f.value}">${f.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary modal-close">Cancel</button>
          <button type="submit" class="btn btn-primary">Set Goal</button>
        </div>
      </form>
    `;

    const overlay = this.showModal(html);
    const form = overlay.querySelector('#kit-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Reminders.setGoal(contactId, parseInt(form.querySelector('[name="frequency"]').value));
        this.toast('Goal set');
        this.closeModal(overlay);
        await this.refreshProfile();
      } catch (err) {
        this.toast(err.message, 'error');
      }
    });
  },

  // Notes Modal
  showNotesModal(contact) {
    const html = `
      <div class="modal-header">
        <div class="modal-title">Edit Notes</div>
        <button class="modal-close">&times;</button>
      </div>
      <form id="notes-form">
        <div class="modal-body">
          <div class="form-group">
            <textarea class="form-textarea" name="notes" rows="8" placeholder="Add notes...">${this.esc(contact.notes || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary modal-close">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    `;

    const overlay = this.showModal(html);
    const form = overlay.querySelector('#notes-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Contacts.update(contact.id, { notes: form.querySelector('[name="notes"]').value });
        this.toast('Notes saved');
        this.closeModal(overlay);
        await this.refreshProfile();
      } catch (err) {
        this.toast(err.message, 'error');
      }
    });
  },

  // Custom Field Edit Modal
  showFieldEditModal(contactId, fieldId, fieldType, currentValue, options) {
    if (currentValue === 'Not set') currentValue = '';
    let inputHtml;
    if (fieldType === 'textarea') {
      inputHtml = `<textarea class="form-textarea" name="value" rows="3">${this.esc(currentValue)}</textarea>`;
    } else if (fieldType === 'dropdown') {
      inputHtml = `<select class="form-select" name="value">
        <option value="">Not set</option>
        ${(options || []).map(o => `<option value="${this.esc(o)}" ${o === currentValue ? 'selected' : ''}>${this.esc(o)}</option>`).join('')}
      </select>`;
    } else if (fieldType === 'date') {
      inputHtml = `<input class="form-input" type="date" name="value" value="${this.esc(currentValue)}">`;
    } else {
      inputHtml = `<input class="form-input" name="value" value="${this.esc(currentValue)}">`;
    }

    const html = `
      <div class="modal-header">
        <div class="modal-title">Edit Field</div>
        <button class="modal-close">&times;</button>
      </div>
      <form id="field-edit-form">
        <div class="modal-body">
          <div class="form-group">
            ${inputHtml}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary modal-close">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    `;

    const overlay = this.showModal(html);
    const form = overlay.querySelector('#field-edit-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = form.querySelector('[name="value"]').value;
      try {
        if (value) {
          await Fields.setValueForContact(contactId, fieldId, value);
        } else {
          await Fields.deleteValueForContact(contactId, fieldId);
        }
        this.toast('Field updated');
        this.closeModal(overlay);
        await this.refreshProfile();
      } catch (err) {
        this.toast(err.message, 'error');
      }
    });
  },

  // Custom Fields Management Modal
  showFieldsModal() {
    const renderFields = (ol) => {
      const listEl = ol.querySelector('#fields-list');
      listEl.innerHTML = this.state.customFields.length > 0
        ? this.state.customFields.map(f => `
          <div class="custom-field-item" data-field-id="${f.id}">
            <span class="field-name">${this.esc(f.name)}</span>
            <span class="field-type">${f.field_type}</span>
            <button class="btn-icon field-delete" data-id="${f.id}" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        `).join('')
        : '<div class="text-tertiary text-sm">No custom fields yet</div>';

      listEl.querySelectorAll('.field-delete').forEach(el => {
        el.addEventListener('click', async () => {
          if (!confirm('Delete this field? Values will be lost.')) return;
          try {
            await Fields.delete(el.dataset.id);
            this.state.customFields = await Fields.list();
            this.toast('Field deleted');
            renderFields(ol);
          } catch (err) {
            this.toast(err.message, 'error');
          }
        });
      });
    };

    const html = `
      <div class="modal-header">
        <div class="modal-title">Custom Fields</div>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div id="fields-list" class="custom-fields-list mb-4"></div>
        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <div class="profile-section-title mb-4">Add New Field</div>
        <form id="add-field-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Name</label>
              <input class="form-input" name="name" required placeholder="e.g. LinkedIn">
            </div>
            <div class="form-group">
              <label class="form-label">Type</label>
              <select class="form-select" name="field_type">
                <option value="text">Text</option>
                <option value="textarea">Textarea</option>
                <option value="dropdown">Dropdown</option>
                <option value="date">Date</option>
              </select>
            </div>
          </div>
          <div class="form-group" id="dropdown-options-group" hidden>
            <label class="form-label">Options (comma-separated)</label>
            <input class="form-input" name="options" placeholder="Option 1, Option 2, Option 3">
          </div>
          <button type="submit" class="btn btn-secondary btn-sm mt-4">Add Field</button>
        </form>
      </div>
    `;

    const overlay = this.showModal(html, {
      onOpen: (ol) => {
        renderFields(ol);
        const typeSelect = ol.querySelector('[name="field_type"]');
        const optionsGroup = ol.querySelector('#dropdown-options-group');
        typeSelect.addEventListener('change', () => {
          optionsGroup.hidden = typeSelect.value !== 'dropdown';
        });
      }
    });

    const form = overlay.querySelector('#add-field-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const fieldType = fd.get('field_type');
      const options = fieldType === 'dropdown'
        ? fd.get('options').split(',').map(s => s.trim()).filter(Boolean)
        : [];

      try {
        await Fields.create({
          name: fd.get('name'),
          field_type: fieldType,
          options: options
        });
        this.state.customFields = await Fields.list();
        this.toast('Field added');
        form.reset();
        renderFields(overlay);
      } catch (err) {
        this.toast(err.message, 'error');
      }
    });
  },

  // Import Modal
  showImportModal() {
    let parsedData = null;
    let mapping = {};

    const html = `
      <div class="modal-header">
        <div class="modal-title">Import Contacts</div>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div id="import-step-1">
          <div class="import-dropzone" id="import-dropzone">
            <div class="import-dropzone-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </div>
            <div class="import-dropzone-text">Drop a CSV file here or click to browse</div>
            <div class="import-dropzone-hint">Supports standard CSV format</div>
            <input type="file" accept=".csv" hidden id="import-file-input">
          </div>
        </div>
        <div id="import-step-2" hidden>
          <div class="profile-section-title mb-4">Map columns to fields</div>
          <div id="import-mapping"></div>
          <div class="profile-section-title mt-6 mb-4">Preview (first 3 rows)</div>
          <div style="overflow-x:auto"><table class="import-preview-table" id="import-preview"></table></div>
        </div>
        <div id="import-step-3" hidden>
          <div id="import-results"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary modal-close">Cancel</button>
        <button type="button" class="btn btn-primary" id="import-btn" hidden>Import</button>
      </div>
    `;

    const overlay = this.showModal(html, { className: 'modal-lg' });

    const dropzone = overlay.querySelector('#import-dropzone');
    const fileInput = overlay.querySelector('#import-file-input');
    const step1 = overlay.querySelector('#import-step-1');
    const step2 = overlay.querySelector('#import-step-2');
    const step3 = overlay.querySelector('#import-step-3');
    const importBtn = overlay.querySelector('#import-btn');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });

    const handleFile = (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        parsedData = ImportExport.parseCSV(e.target.result);
        if (parsedData.length < 2) {
          this.toast('CSV must have a header row and at least one data row', 'error');
          return;
        }
        mapping = ImportExport.detectMapping(parsedData[0]);
        showMapping();
      };
      reader.readAsText(file);
    };

    const crmFields = [
      { value: '', label: 'Skip' },
      { value: 'first_name', label: 'First Name' },
      { value: 'last_name', label: 'Last Name' },
      { value: 'full_name', label: 'Full Name' },
      { value: 'email', label: 'Email' },
      { value: 'phone', label: 'Phone' },
      { value: 'company', label: 'Company' },
      { value: 'title', label: 'Title' },
      { value: 'birthday', label: 'Birthday' },
      { value: 'notes', label: 'Notes' }
    ];

    const showMapping = () => {
      step1.hidden = true;
      step2.hidden = false;
      importBtn.hidden = false;

      const headers = parsedData[0];
      const mappingEl = overlay.querySelector('#import-mapping');
      mappingEl.innerHTML = headers.map((h, i) => `
        <div class="import-mapping-row">
          <div class="text-sm font-medium">${this.esc(h)}</div>
          <div class="import-mapping-arrow">→</div>
          <select class="form-select" data-col="${i}">
            ${crmFields.map(f => `<option value="${f.value}" ${mapping[i] === f.value ? 'selected' : ''}>${f.label}</option>`).join('')}
          </select>
        </div>
      `).join('');

      mappingEl.querySelectorAll('select').forEach(sel => {
        sel.addEventListener('change', () => {
          const col = parseInt(sel.dataset.col);
          if (sel.value) mapping[col] = sel.value;
          else delete mapping[col];
        });
      });

      // Preview
      const previewEl = overlay.querySelector('#import-preview');
      const previewRows = parsedData.slice(0, 4);
      previewEl.innerHTML = `
        <thead><tr>${previewRows[0].map(h => `<th>${this.esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${previewRows.slice(1).map(row => `<tr>${row.map(cell => `<td>${this.esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
      `;
    };

    importBtn.addEventListener('click', async () => {
      importBtn.disabled = true;
      importBtn.textContent = 'Importing...';
      try {
        const results = await ImportExport.importContacts(parsedData, mapping);
        step2.hidden = true;
        step3.hidden = false;
        importBtn.hidden = true;
        overlay.querySelector('#import-results').innerHTML = `
          <div class="empty-state" style="padding:24px">
            <div class="empty-state-icon" style="background:var(--success-light)">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="empty-state-title">${results.imported} contacts imported</div>
            ${results.errors.length > 0 ? `
              <div class="text-sm text-danger mt-4">${results.errors.length} errors:<br>${results.errors.slice(0, 5).map(e => this.esc(e)).join('<br>')}</div>
            ` : ''}
          </div>
        `;
        await this.loadData();
        this.renderSidebar();
        this.renderTable();
      } catch (err) {
        this.toast(err.message, 'error');
        importBtn.disabled = false;
        importBtn.textContent = 'Import';
      }
    });
  },

  // Export
  async handleExport(contactsOverride = null) {
    let contacts;
    let label;
    if (contactsOverride) {
      contacts = contactsOverride;
      label = contacts.length === 1 ? Contacts.getFullName(contacts[0]) : `${contacts.length} contacts`;
    } else if (this.state.selectedContactIds.size > 0) {
      contacts = this.state.contacts.filter(c => this.state.selectedContactIds.has(c.id));
      label = `${contacts.length} selected contact${contacts.length > 1 ? 's' : ''}`;
    } else {
      contacts = this.state.contacts;
      label = `${contacts.length} contact${contacts.length > 1 ? 's' : ''}`;
    }

    if (!contacts || contacts.length === 0) {
      this.toast('No contacts to export', 'error');
      return;
    }

    this.showExportModal(contacts, label);
  },

  showExportModal(contacts, label) {
    const backArrow = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';

    const buildFieldsStep = (id, fields, defaults, exportBtnLabel) => `
      <div class="export-fields-step" id="${id}" hidden>
        <div class="export-fields-header">
          <button class="export-back-btn" data-back>${backArrow} Back</button>
          <div class="export-fields-actions">
            <button class="btn-link text-sm" data-select-all>Select All</button>
            <span class="text-tertiary text-sm">/</span>
            <button class="btn-link text-sm" data-select-none>None</button>
          </div>
        </div>
        <div class="export-fields-list">
          ${fields.map(f => `
            <label class="export-field-item">
              <input type="checkbox" value="${f.key}" ${defaults.includes(f.key) ? 'checked' : ''}>
              <span>${this.esc(f.label)}</span>
            </label>
          `).join('')}
        </div>
        <button class="btn btn-primary btn-block" data-export>${exportBtnLabel}</button>
      </div>
    `;

    const html = `
      <div class="modal-header">
        <div class="modal-title">Export ${this.esc(label)}</div>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="export-options" id="export-format-step">
          <button class="export-option" data-format="vcard">
            <div class="export-option-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div>
              <div class="export-option-title">vCard (.vcf)</div>
              <div class="export-option-desc">For Outlook, Google Contacts, Apple, Android</div>
            </div>
          </button>
          <button class="export-option" data-format="csv">
            <div class="export-option-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div>
              <div class="export-option-title">Contacts CSV (.csv)</div>
              <div class="export-option-desc">For Excel, Google Sheets, spreadsheets</div>
            </div>
          </button>
          <button class="export-option" data-format="interactions">
            <div class="export-option-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <div>
              <div class="export-option-title">Interactions CSV (.csv)</div>
              <div class="export-option-desc">Export call, email, meeting, and text logs</div>
            </div>
          </button>
        </div>
        ${buildFieldsStep('export-csv-fields', ImportExport.CSV_FIELDS, ImportExport.CSV_DEFAULT_FIELDS, 'Export Contacts CSV')}
        ${buildFieldsStep('export-int-fields', ImportExport.INTERACTION_FIELDS, ImportExport.INTERACTION_DEFAULT_FIELDS, 'Export Interactions CSV')}
      </div>
    `;

    const overlay = this.showModal(html);
    const formatStep = overlay.querySelector('#export-format-step');
    const csvFieldsStep = overlay.querySelector('#export-csv-fields');
    const intFieldsStep = overlay.querySelector('#export-int-fields');

    const showStep = (step) => {
      formatStep.hidden = true;
      csvFieldsStep.hidden = true;
      intFieldsStep.hidden = true;
      step.hidden = false;
    };

    // vCard: export immediately
    overlay.querySelector('[data-format="vcard"]').addEventListener('click', () => {
      try {
        ImportExport.exportAsVCard(contacts);
        this.toast(`Exported ${contacts.length} contact${contacts.length > 1 ? 's' : ''}`);
        this.closeModal(overlay);
      } catch (err) {
        this.toast(err.message, 'error');
      }
    });

    // CSV: show contact field picker
    overlay.querySelector('[data-format="csv"]').addEventListener('click', () => showStep(csvFieldsStep));

    // Interactions: show interaction field picker
    overlay.querySelector('[data-format="interactions"]').addEventListener('click', () => showStep(intFieldsStep));

    // Wire up both field steps (back, select all/none, export)
    [csvFieldsStep, intFieldsStep].forEach(step => {
      step.querySelector('[data-back]').addEventListener('click', () => showStep(formatStep));
      step.querySelector('[data-select-all]').addEventListener('click', () => {
        step.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
      });
      step.querySelector('[data-select-none]').addEventListener('click', () => {
        step.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      });
    });

    // Export contacts CSV
    csvFieldsStep.querySelector('[data-export]').addEventListener('click', () => {
      const selected = [...csvFieldsStep.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);
      if (selected.length === 0) { this.toast('Select at least one field', 'error'); return; }
      try {
        ImportExport.exportContacts(contacts, selected);
        this.toast(`Exported ${contacts.length} contact${contacts.length > 1 ? 's' : ''}`);
        this.closeModal(overlay);
      } catch (err) {
        this.toast(err.message, 'error');
      }
    });

    // Export interactions CSV
    intFieldsStep.querySelector('[data-export]').addEventListener('click', async () => {
      const selected = [...intFieldsStep.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);
      if (selected.length === 0) { this.toast('Select at least one field', 'error'); return; }
      const btn = intFieldsStep.querySelector('[data-export]');
      btn.disabled = true;
      btn.textContent = 'Exporting...';
      try {
        const count = await ImportExport.exportInteractions(contacts, selected);
        this.toast(`Exported ${count} interaction${count > 1 ? 's' : ''}`);
        this.closeModal(overlay);
      } catch (err) {
        this.toast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Export Interactions CSV';
      }
    });
  },

  // Merge Modal
  async showMergeModal() {
    const html = `
      <div class="modal-header">
        <div class="modal-title">Find Duplicates</div>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;justify-content:center;padding:24px"><div class="loading-spinner"></div></div>
      </div>
    `;

    const overlay = this.showModal(html, { className: 'modal-lg' });

    try {
      const pairs = await ImportExport.findDuplicates();
      const body = overlay.querySelector('.modal-body');

      if (pairs.length === 0) {
        body.innerHTML = `
          <div class="empty-state" style="padding:24px">
            <div class="empty-state-title">No duplicates found</div>
            <div class="empty-state-text">Your contacts look clean!</div>
          </div>
        `;
        return;
      }

      body.innerHTML = `
        <div class="text-sm text-secondary mb-4">Found ${pairs.length} potential duplicate${pairs.length > 1 ? 's' : ''}. Click "Review & Merge" to choose which data to keep.</div>
        ${pairs.map((p, i) => {
          const renderContactEmails = (c) => Contacts.getEmails(c).map(e =>
            `<div class="text-sm text-secondary">${this.esc(e.value)} <span class="profile-meta-label">(${this.esc(e.label)})</span></div>`
          ).join('') || '<div class="text-sm text-secondary">—</div>';
          const renderContactPhones = (c) => Contacts.getPhones(c).map(ph =>
            `<div class="text-sm text-secondary">${this.esc(ph.value)} <span class="profile-meta-label">(${this.esc(ph.label)})</span></div>`
          ).join('') || '';
          return `
          <div class="merge-pair" data-pair-index="${i}">
            <div class="merge-pair-header">
              <span class="badge badge-warning">${Math.round(p.score * 100)}% match</span>
              <button class="btn btn-sm btn-primary merge-review-btn" data-a-id="${p.a.id}" data-b-id="${p.b.id}">Review & Merge</button>
            </div>
            <div class="merge-contacts">
              <div class="merge-contact">
                <div class="font-medium">${this.esc(Contacts.getFullName(p.a))}</div>
                ${renderContactEmails(p.a)}
                ${renderContactPhones(p.a)}
                <div class="text-sm text-secondary">${this.esc(p.a.company || '—')}</div>
              </div>
              <div class="merge-contact">
                <div class="font-medium">${this.esc(Contacts.getFullName(p.b))}</div>
                ${renderContactEmails(p.b)}
                ${renderContactPhones(p.b)}
                <div class="text-sm text-secondary">${this.esc(p.b.company || '—')}</div>
              </div>
            </div>
          </div>
        `}).join('')}
      `;

      body.querySelectorAll('.merge-review-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.closeModal(overlay);
          this.showMergeDetailModal(btn.dataset.aId, btn.dataset.bId);
        });
      });
    } catch (err) {
      this.toast(err.message, 'error');
    }
  },

  // Merge Detail Modal — field-by-field selection
  async showMergeDetailModal(aId, bId) {
    const loadingHtml = `
      <div class="modal-header">
        <div class="modal-title">Merge Contacts</div>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;justify-content:center;padding:24px"><div class="loading-spinner"></div></div>
      </div>
    `;

    const overlay = this.showModal(loadingHtml, { className: 'modal-lg' });

    try {
      const [contactA, contactB] = await Promise.all([
        Contacts.get(aId),
        Contacts.get(bId)
      ]);

      const emailsA = Contacts.getEmails(contactA);
      const emailsB = Contacts.getEmails(contactB);
      const phonesA = Contacts.getPhones(contactA);
      const phonesB = Contacts.getPhones(contactB);

      // Build radio field rows for single-value fields
      const radioField = (label, fieldName, valA, valB) => {
        const aDisplay = valA || '(empty)';
        const bDisplay = valB || '(empty)';
        const aEmpty = !valA;
        const bEmpty = !valB;
        // Skip row if both empty
        if (aEmpty && bEmpty) return '';
        return `
          <div class="merge-detail-field">
            <div class="merge-detail-label">${this.esc(label)}</div>
            <div class="merge-detail-options">
              <label class="merge-detail-radio ${aEmpty ? 'empty' : ''}">
                <input type="radio" name="merge_${fieldName}" value="a" checked>
                <span>${this.esc(aDisplay)}</span>
              </label>
              <label class="merge-detail-radio ${bEmpty ? 'empty' : ''}">
                <input type="radio" name="merge_${fieldName}" value="b">
                <span>${this.esc(bDisplay)}</span>
              </label>
            </div>
          </div>
        `;
      };

      // Build checkbox rows for multi-value fields (emails/phones)
      const checkboxField = (label, itemsA, itemsB, fieldName) => {
        const allItems = [];
        itemsA.forEach(item => allItems.push({ ...item, source: 'a' }));
        itemsB.forEach(item => {
          // Avoid exact duplicate entries
          const normalized = item.value.toLowerCase().trim().replace(/\D/g, fieldName === 'phones' ? '' : item.value.toLowerCase().trim());
          const isDup = itemsA.some(ai => {
            const aiNorm = ai.value.toLowerCase().trim().replace(/\D/g, fieldName === 'phones' ? '' : ai.value.toLowerCase().trim());
            return fieldName === 'phones'
              ? ai.value.replace(/\D/g, '') === item.value.replace(/\D/g, '')
              : ai.value.toLowerCase().trim() === item.value.toLowerCase().trim();
          });
          if (!isDup) allItems.push({ ...item, source: 'b' });
        });
        if (allItems.length === 0) return '';
        return `
          <div class="merge-detail-field">
            <div class="merge-detail-label">${this.esc(label)}</div>
            <div class="merge-detail-checkboxes">
              ${allItems.map((item, idx) => `
                <label class="merge-detail-checkbox">
                  <input type="checkbox" name="merge_${fieldName}" value="${idx}" data-value="${this.esc(item.value)}" data-label="${this.esc(item.label)}" checked>
                  <span>${this.esc(item.value)} <span class="profile-meta-label">(${this.esc(item.label)})</span></span>
                </label>
              `).join('')}
            </div>
          </div>
        `;
      };

      // Notes field with "Combine both" option
      const notesField = () => {
        const notesA = contactA.notes || '';
        const notesB = contactB.notes || '';
        if (!notesA && !notesB) return '';
        const bothHaveNotes = notesA && notesB && notesA !== notesB;
        return `
          <div class="merge-detail-field">
            <div class="merge-detail-label">Notes</div>
            <div class="merge-detail-options merge-detail-notes-options">
              <label class="merge-detail-radio ${!notesA ? 'empty' : ''}">
                <input type="radio" name="merge_notes" value="a" checked>
                <span class="merge-notes-preview">${this.esc(notesA || '(empty)')}</span>
              </label>
              <label class="merge-detail-radio ${!notesB ? 'empty' : ''}">
                <input type="radio" name="merge_notes" value="b">
                <span class="merge-notes-preview">${this.esc(notesB || '(empty)')}</span>
              </label>
              ${bothHaveNotes ? `
                <label class="merge-detail-radio">
                  <input type="radio" name="merge_notes" value="combine">
                  <span>Combine both notes</span>
                </label>
              ` : ''}
            </div>
          </div>
        `;
      };

      const modalContent = `
        <div class="modal-header">
          <div class="modal-title">Merge Contacts</div>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="text-sm text-secondary mb-4">For each field, select which value to keep:</div>
          <div class="merge-detail-fields">
            ${radioField('Name', 'name',
              Contacts.getFullName(contactA),
              Contacts.getFullName(contactB)
            )}
            ${checkboxField('Emails', emailsA, emailsB, 'emails')}
            ${checkboxField('Phones', phonesA, phonesB, 'phones')}
            ${radioField('Company', 'company', contactA.company, contactB.company)}
            ${radioField('Title', 'title', contactA.title, contactB.title)}
            ${radioField('Birthday', 'birthday', contactA.birthday, contactB.birthday)}
            ${notesField()}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary modal-close">Cancel</button>
          <button type="button" class="btn btn-primary" id="merge-confirm-btn">Merge & Save</button>
        </div>
      `;

      // Replace modal content
      const modal = overlay.querySelector('.modal');
      modal.innerHTML = modalContent;

      // Re-bind close buttons
      modal.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => this.closeModal(overlay));
      });

      // Merge & Save handler
      modal.querySelector('#merge-confirm-btn').addEventListener('click', async () => {
        const btn = modal.querySelector('#merge-confirm-btn');
        btn.disabled = true;
        btn.textContent = 'Merging...';

        try {
          const selectedData = {};

          // Name (radio)
          const nameChoice = modal.querySelector('input[name="merge_name"]:checked')?.value;
          const nameSource = nameChoice === 'b' ? contactB : contactA;
          selectedData.first_name = nameSource.first_name || '';
          selectedData.last_name = nameSource.last_name || '';

          // Company (radio)
          const companyRadio = modal.querySelector('input[name="merge_company"]:checked');
          if (companyRadio) {
            selectedData.company = companyRadio.value === 'b' ? (contactB.company || '') : (contactA.company || '');
          }

          // Title (radio)
          const titleRadio = modal.querySelector('input[name="merge_title"]:checked');
          if (titleRadio) {
            selectedData.title = titleRadio.value === 'b' ? (contactB.title || '') : (contactA.title || '');
          }

          // Birthday (radio)
          const birthdayRadio = modal.querySelector('input[name="merge_birthday"]:checked');
          if (birthdayRadio) {
            selectedData.birthday = birthdayRadio.value === 'b' ? (contactB.birthday || '') : (contactA.birthday || '');
          }

          // Notes (radio with combine option)
          const notesRadio = modal.querySelector('input[name="merge_notes"]:checked');
          if (notesRadio) {
            if (notesRadio.value === 'combine') {
              selectedData.notes = `${contactA.notes || ''}\n\n--- Merged ---\n${contactB.notes || ''}`;
            } else if (notesRadio.value === 'b') {
              selectedData.notes = contactB.notes || '';
            } else {
              selectedData.notes = contactA.notes || '';
            }
          }

          // Emails (checkboxes)
          const emailCheckboxes = modal.querySelectorAll('input[name="merge_emails"]:checked');
          selectedData.emails = Array.from(emailCheckboxes).map(cb => ({
            value: cb.dataset.value,
            label: cb.dataset.label
          }));

          // Phones (checkboxes)
          const phoneCheckboxes = modal.querySelectorAll('input[name="merge_phones"]:checked');
          selectedData.phones = Array.from(phoneCheckboxes).map(cb => ({
            value: cb.dataset.value,
            label: cb.dataset.label
          }));

          await ImportExport.mergeContactsWithSelections(aId, bId, selectedData);
          this.toast('Contacts merged');
          this.closeModal(overlay);
          await this.loadData();
          this.renderSidebar();
          if (this.state.view === 'table') this.renderTable();
        } catch (err) {
          this.toast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Merge & Save';
        }
      });
    } catch (err) {
      this.toast('Failed to load contacts: ' + err.message, 'error');
      this.closeModal(overlay);
    }
  },

  // ── Sidebar Toggle ────────────────────────────────
  toggleSidebar(open) {
    const isOpen = this.sidebarEl.classList.contains('open');
    const shouldOpen = open !== undefined ? open : !isOpen;
    this.sidebarEl.classList.toggle('open', shouldOpen);
    this.sidebarOverlay.classList.toggle('open', shouldOpen);
  },

  // ── Toast ─────────────────────────────────────────
  toast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${this.esc(message)}</span>
      <button class="toast-close">&times;</button>
    `;
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    this.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  },

  // ── Utilities ─────────────────────────────────────
  updateDarkModeLabel() {
    const label = document.getElementById('dark-mode-label');
    if (label) {
      label.textContent = document.documentElement.classList.contains('dark') ? 'Light Mode' : 'Dark Mode';
    }
  },

  esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// Boot — DOM is already loaded when this script runs (loaded dynamically by module)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
