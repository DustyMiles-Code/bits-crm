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
    customFields: []
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
        this.state.searchQuery = e.target.value;
        this.loadContacts().then(() => this.renderTable());
      }, 300);
    });

    // Sidebar toggle (mobile)
    this.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
    this.sidebarOverlay.addEventListener('click', () => this.toggleSidebar(false));

    // All contacts
    this.allContactsBtn.addEventListener('click', () => {
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

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
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
        Fields.list()
      ]);
      this.state.groups = groups;
      this.state.customFields = customFields;
      await this.loadContacts();
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

    // Group click handlers
    this.groupsList.querySelectorAll('.sidebar-item').forEach(el => {
      el.addEventListener('click', () => {
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
        this.state.view = 'table';
        this.state.currentContactId = null;
        this.loadContacts().then(() => this.render());
      });
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
              <th class="${sorted('first_name')}" data-sort="first_name">Name ${sortIcon('first_name')}</th>
              <th class="${sorted('email')}" data-sort="email">Email ${sortIcon('email')}</th>
              <th class="${sorted('company')}" data-sort="company">Company ${sortIcon('company')}</th>
              <th>Last Interaction</th>
              <th>Goal Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${this.state.contacts.map(c => `
              <tr data-contact-id="${c.id}">
                <td>
                  <div class="contact-name-cell">
                    <div class="contact-avatar">${Contacts.getInitials(c)}</div>
                    <div>
                      <div class="contact-name-text">${this.esc(Contacts.getFullName(c))}</div>
                      ${c.title ? `<div class="contact-company-text">${this.esc(c.title)}</div>` : ''}
                    </div>
                  </div>
                </td>
                <td class="contact-email-text">${this.esc(c.email || '—')}</td>
                <td>${this.esc(c.company || '—')}</td>
                <td>${this.renderLastInteraction(c)}</td>
                <td>${this.renderKitStatus(c)}</td>
                <td><div class="notes-preview">${this.esc(c.notes || '—')}</div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

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

    // Row click to profile
    this.mainBody.querySelectorAll('tr[data-contact-id]').forEach(tr => {
      tr.addEventListener('click', () => {
        this.state.currentContactId = tr.dataset.contactId;
        this.state.view = 'profile';
        this.renderHeader();
        this.renderProfile();
      });
    });
  },

  renderLastInteraction(contact) {
    // We'll show placeholder — full data loaded on profile
    return `<span class="text-secondary text-sm">—</span>`;
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
        Fields.getValuesForContact(id)
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
                ${contact.email ? `
                  <div class="profile-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    ${this.esc(contact.email)}
                  </div>
                ` : ''}
                ${contact.phone ? `
                  <div class="profile-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    ${this.esc(contact.phone)}
                  </div>
                ` : ''}
                ${contact.birthday ? `
                  <div class="profile-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    ${new Date(contact.birthday + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                  </div>
                ` : ''}
              </div>
            </div>
            <div class="profile-actions">
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
    await Promise.all([this.loadGroups(), this.loadContacts()]);
    this.renderSidebar();
    this.renderProfile();
  },

  async loadGroups() {
    this.state.groups = await Groups.list();
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
            <label class="form-label">Email</label>
            <input class="form-input" type="email" name="email" value="${this.esc(contact?.email || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input class="form-input" name="phone" value="${this.esc(contact?.phone || '')}">
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
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary modal-close">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Add Contact'}</button>
        </div>
      </form>
    `;

    const overlay = this.showModal(html);
    const form = overlay.querySelector('#contact-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd);
      // Clean empty strings
      Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        if (isEdit) {
          await Contacts.update(contact.id, data);
          this.toast('Contact updated');
        } else {
          const newContact = await Contacts.create(data);
          // If we're viewing a group, add to that group
          if (this.state.currentGroupId) {
            await Contacts.addToGroup(newContact.id, this.state.currentGroupId);
          }
          this.toast('Contact added');
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
          options: JSON.stringify(options)
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
  async handleExport() {
    try {
      const contacts = await Contacts.list({
        groupId: this.state.currentGroupId,
        sortBy: this.state.sortBy,
        sortDir: this.state.sortDir
      });
      await ImportExport.exportContacts(contacts);
      this.toast('Contacts exported');
    } catch (err) {
      this.toast(err.message, 'error');
    }
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
        <div class="text-sm text-secondary mb-4">Found ${pairs.length} potential duplicate${pairs.length > 1 ? 's' : ''}. Click "Merge" to combine them.</div>
        ${pairs.map((p, i) => `
          <div class="merge-pair" data-pair-index="${i}">
            <div class="merge-pair-header">
              <span class="badge badge-warning">${Math.round(p.score * 100)}% match</span>
              <button class="btn btn-sm btn-primary merge-btn" data-primary="${p.a.id}" data-secondary="${p.b.id}">Merge → Keep Left</button>
            </div>
            <div class="merge-contacts">
              <div class="merge-contact">
                <div class="font-medium">${this.esc(Contacts.getFullName(p.a))}</div>
                <div class="text-sm text-secondary">${this.esc(p.a.email || '—')}</div>
                <div class="text-sm text-secondary">${this.esc(p.a.phone || '—')}</div>
                <div class="text-sm text-secondary">${this.esc(p.a.company || '—')}</div>
              </div>
              <div class="merge-contact">
                <div class="font-medium">${this.esc(Contacts.getFullName(p.b))}</div>
                <div class="text-sm text-secondary">${this.esc(p.b.email || '—')}</div>
                <div class="text-sm text-secondary">${this.esc(p.b.phone || '—')}</div>
                <div class="text-sm text-secondary">${this.esc(p.b.company || '—')}</div>
              </div>
            </div>
          </div>
        `).join('')}
      `;

      body.querySelectorAll('.merge-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Merging...';
          try {
            await ImportExport.mergeContacts(btn.dataset.primary, btn.dataset.secondary);
            this.toast('Contacts merged');
            btn.closest('.merge-pair').remove();
            await this.loadData();
            this.renderSidebar();
            if (this.state.view === 'table') this.renderTable();
          } catch (err) {
            this.toast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Merge → Keep Left';
          }
        });
      });
    } catch (err) {
      this.toast(err.message, 'error');
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
