/**
 * AnnoyBlock - Options Page Logic
 *
 * Full settings management: domain configuration, Focus Mode
 * scheduling, effect previews, import/export, and reset.
 */

/* global
  AnnoyBlockConstants, AnnoyBlockStorage, AnnoyBlockUtils
*/

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  const { STORAGE, LEVEL, EFFECTS, THRESHOLD, LEVEL_NAMES } = AnnoyBlockConstants;

  // ── Toast helper ───────────────────────────────────────────
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  function showToast(message) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add('visible');
    toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2500);
  }

  // ── Tab Navigation ─────────────────────────────────────────
  const tabButtons = document.querySelectorAll('.tab');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      tabButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById('panel-' + tabId).classList.add('active');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // GENERAL TAB
  // ══════════════════════════════════════════════════════════════

  const settingEnabled = document.getElementById('setting-enabled');
  const settingBadge = document.getElementById('setting-badge');
  const settingReducedMotion = document.getElementById('setting-reduced-motion');
  const btnReset = document.getElementById('btn-reset');
  const btnExport = document.getElementById('btn-export');
  const btnImport = document.getElementById('btn-import');
  const importFile = document.getElementById('import-file');

  async function loadGeneralSettings() {
    const settings = await AnnoyBlockStorage.getLocal(STORAGE.GLOBAL_SETTINGS);
    settingEnabled.checked = settings.extensionEnabled;
    settingBadge.checked = settings.showBadge;
    settingReducedMotion.checked = settings.respectReducedMotion;
  }

  async function saveGeneralSetting(key, value) {
    const settings = await AnnoyBlockStorage.getLocal(STORAGE.GLOBAL_SETTINGS);
    settings[key] = value;
    await AnnoyBlockStorage.setLocal(STORAGE.GLOBAL_SETTINGS, settings);
  }

  settingEnabled.addEventListener('change', () => {
    saveGeneralSetting('extensionEnabled', settingEnabled.checked);
    showToast(settingEnabled.checked ? 'AnnoyBlock enabled' : 'AnnoyBlock disabled');
  });

  settingBadge.addEventListener('change', () => {
    saveGeneralSetting('showBadge', settingBadge.checked);
  });

  settingReducedMotion.addEventListener('change', () => {
    saveGeneralSetting('respectReducedMotion', settingReducedMotion.checked);
  });

  // Reset
  btnReset.addEventListener('click', async () => {
    if (confirm('Reset all AnnoyBlock settings to defaults? This cannot be undone.')) {
      await AnnoyBlockStorage.clearAll();
      showToast('All settings reset to defaults');
      await loadAll();
    }
  });

  // Export
  btnExport.addEventListener('click', async () => {
    try {
      const [configs, focusMode, settings] = await Promise.all([
        AnnoyBlockStorage.getSync(STORAGE.DOMAIN_CONFIGS),
        AnnoyBlockStorage.getLocal(STORAGE.FOCUS_MODE),
        AnnoyBlockStorage.getLocal(STORAGE.GLOBAL_SETTINGS),
      ]);
      const data = { version: '1.0.0', exportedAt: new Date().toISOString(), configs, focusMode, settings };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'annoyblock-config.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Configuration exported');
    } catch (err) {
      showToast('Export failed: ' + err.message);
    }
  });

  // Import
  btnImport.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.configs) throw new Error('Invalid config file');
      await AnnoyBlockStorage.setSync(STORAGE.DOMAIN_CONFIGS, data.configs);
      if (data.focusMode) await AnnoyBlockStorage.setLocal(STORAGE.FOCUS_MODE, data.focusMode);
      if (data.settings) await AnnoyBlockStorage.setLocal(STORAGE.GLOBAL_SETTINGS, data.settings);
      showToast('Configuration imported successfully');
      await loadAll();
    } catch (err) {
      showToast('Import failed: ' + err.message);
    }
    importFile.value = '';
  });

  // ══════════════════════════════════════════════════════════════
  // DOMAINS TAB
  // ══════════════════════════════════════════════════════════════

  const domainList = document.getElementById('domain-list');
  const domainInputRow = document.getElementById('domain-input-row');
  const newDomainInput = document.getElementById('new-domain-input');
  const btnAddDomain = document.getElementById('btn-add-domain');
  const btnSaveDomain = document.getElementById('btn-save-domain');
  const btnCancelDomain = document.getElementById('btn-cancel-domain');

  async function loadDomains() {
    const configs = await AnnoyBlockStorage.getSync(STORAGE.DOMAIN_CONFIGS);
    const domains = Object.keys(configs).sort();

    if (domains.length === 0) {
      domainList.innerHTML = '<p class="empty-state">No domains configured yet. Click "+ Add Domain" to get started.</p>';
      return;
    }

    domainList.innerHTML = '';
    for (const domain of domains) {
      const config = configs[domain];
      const item = document.createElement('div');
      item.className = 'domain-item';
      item.innerHTML = `
        <div class="domain-item-info">
          <div class="domain-item-domain">${escapeHtml(domain)}</div>
          <div class="domain-item-level">Level: ${AnnoyBlockUtils.getLevelName(config.level || 0)} ${config.whitelisted ? '(Whitelisted)' : ''}</div>
        </div>
        <div class="domain-item-controls">
          <input type="range" min="0" max="9" value="${config.level || 0}"
                 data-domain="${escapeHtml(domain)}" class="domain-level-slider">
          <span class="domain-item-whitelist">
            <button type="button" class="btn btn-sm btn-secondary domain-wl-btn"
                    data-domain="${escapeHtml(domain)}">
              ${config.whitelisted ? 'Unwhitelist' : 'Whitelist'}
            </button>
          </span>
          <button type="button" class="btn-icon domain-delete-btn"
                  data-domain="${escapeHtml(domain)}" title="Remove domain">&times;</button>
        </div>
      `;
      domainList.appendChild(item);
    }

    // Event delegation for domain list
    domainList.querySelectorAll('.domain-level-slider').forEach(slider => {
      slider.addEventListener('change', async (e) => {
        const domain = e.target.dataset.domain;
        const level = AnnoyBlockUtils.clampLevel(parseInt(e.target.value, 10));
        const configs = await AnnoyBlockStorage.getSync(STORAGE.DOMAIN_CONFIGS);
        if (configs[domain]) {
          configs[domain].level = level;
          await AnnoyBlockStorage.setSync(STORAGE.DOMAIN_CONFIGS, configs);
          // Update display text
          const levelDiv = e.target.closest('.domain-item').querySelector('.domain-item-level');
          levelDiv.textContent = `Level: ${AnnoyBlockUtils.getLevelName(level)} ${configs[domain].whitelisted ? '(Whitelisted)' : ''}`;
          showToast(`${domain}: level set to ${AnnoyBlockUtils.getLevelName(level)}`);
        }
      });
    });

    domainList.querySelectorAll('.domain-wl-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const domain = e.target.dataset.domain;
        const configs = await AnnoyBlockStorage.getSync(STORAGE.DOMAIN_CONFIGS);
        if (configs[domain]) {
          configs[domain].whitelisted = !configs[domain].whitelisted;
          await AnnoyBlockStorage.setSync(STORAGE.DOMAIN_CONFIGS, configs);
          showToast(configs[domain].whitelisted ? `${domain} whitelisted` : `${domain} removed from whitelist`);
          loadDomains();
        }
      });
    });

    domainList.querySelectorAll('.domain-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const domain = e.target.dataset.domain;
        if (confirm(`Remove ${domain} from AnnoyBlock?`)) {
          const configs = await AnnoyBlockStorage.getSync(STORAGE.DOMAIN_CONFIGS);
          delete configs[domain];
          await AnnoyBlockStorage.setSync(STORAGE.DOMAIN_CONFIGS, configs);
          showToast(`${domain} removed`);
          loadDomains();
        }
      });
    });
  }

  btnAddDomain.addEventListener('click', () => {
    domainInputRow.style.display = 'flex';
    newDomainInput.focus();
  });

  btnCancelDomain.addEventListener('click', () => {
    domainInputRow.style.display = 'none';
    newDomainInput.value = '';
  });

  btnSaveDomain.addEventListener('click', async () => {
    let domain = newDomainInput.value.trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (!domain || domain.includes(' ')) {
      showToast('Please enter a valid domain (e.g., twitter.com)');
      return;
    }

    const configs = await AnnoyBlockStorage.getSync(STORAGE.DOMAIN_CONFIGS);
    if (configs[domain]) {
      showToast(`${domain} is already configured`);
      return;
    }

    configs[domain] = { level: 3, whitelisted: false };
    await AnnoyBlockStorage.setSync(STORAGE.DOMAIN_CONFIGS, configs);
    newDomainInput.value = '';
    domainInputRow.style.display = 'none';
    showToast(`${domain} added with level 3 (Moderate)`);
    loadDomains();
  });

  newDomainInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSaveDomain.click();
    if (e.key === 'Escape') btnCancelDomain.click();
  });

  // ══════════════════════════════════════════════════════════════
  // FOCUS MODE TAB
  // ══════════════════════════════════════════════════════════════

  const focusEnabled = document.getElementById('focus-enabled');
  const scheduleList = document.getElementById('schedule-list');
  const btnAddSchedule = document.getElementById('btn-add-schedule');
  const focusStatus = document.getElementById('focus-status');

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  async function loadFocusMode() {
    const focusMode = await AnnoyBlockStorage.getLocal(STORAGE.FOCUS_MODE);
    focusEnabled.checked = focusMode.enabled;
    renderSchedules(focusMode.schedules || []);
    updateFocusStatus(focusMode);
  }

  function updateFocusStatus(focusMode) {
    if (!focusMode.enabled) {
      focusStatus.innerHTML = '<p class="focus-status-inactive">Focus Mode is disabled.</p>';
      return;
    }

    const active = AnnoyBlockUtils.getActiveSchedule(focusMode.schedules);
    if (active) {
      focusStatus.innerHTML = `
        <div class="focus-status-active">
          <span class="focus-status-dot"></span>
          Focus Mode is currently ACTIVE at level ${AnnoyBlockUtils.getLevelName(active.level || 5)}
        </div>
      `;
    } else {
      focusStatus.innerHTML = '<p class="focus-status-inactive">Focus Mode is enabled but not currently active (outside scheduled hours).</p>';
    }
  }

  function renderSchedules(schedules) {
    if (!schedules || schedules.length === 0) {
      scheduleList.innerHTML = '<p class="empty-state">No schedules configured. Click "+ Add Schedule" to create one.</p>';
      return;
    }

    scheduleList.innerHTML = '';
    schedules.forEach((schedule, index) => {
      const item = document.createElement('div');
      item.className = 'schedule-item';

      const daysHtml = DAY_NAMES.map((d, i) =>
        `<span class="day-chip ${schedule.days.includes(i) ? 'active' : ''}">${d}</span>`
      ).join('');

      const startH = String(schedule.startHour || 9).padStart(2, '0');
      const startM = String(schedule.startMin || 0).padStart(2, '0');
      const endH = String(schedule.endHour || 17).padStart(2, '0');
      const endM = String(schedule.endMin || 0).padStart(2, '0');

      item.innerHTML = `
        <div class="schedule-item-header">
          <span class="schedule-item-name">Schedule ${index + 1}</span>
          <button type="button" class="btn-icon schedule-delete-btn" data-index="${index}" title="Delete schedule">&times;</button>
        </div>
        <div class="schedule-days">${daysHtml}</div>
        <div class="schedule-times">
          <label>Start: <input type="time" value="${startH}:${startM}" data-index="${index}" data-field="start"></label>
          <label>End: <input type="time" value="${endH}:${endM}" data-index="${index}" data-field="end"></label>
        </div>
        <div class="schedule-level-row">
          <span>Level:</span>
          <input type="range" min="1" max="9" value="${schedule.level || 5}" data-index="${index}" data-field="level" class="schedule-level-slider">
          <span class="schedule-level-label">${AnnoyBlockUtils.getLevelName(schedule.level || 5)}</span>
        </div>
      `;
      scheduleList.appendChild(item);
    });

    // Event delegation for schedule changes
    scheduleList.querySelectorAll('.schedule-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const focusMode = await AnnoyBlockStorage.getLocal(STORAGE.FOCUS_MODE);
        focusMode.schedules.splice(idx, 1);
        await AnnoyBlockStorage.setLocal(STORAGE.FOCUS_MODE, focusMode);
        showToast('Schedule deleted');
        loadFocusMode();
      });
    });

    scheduleList.querySelectorAll('input[data-field="start"], input[data-field="end"]').forEach(input => {
      input.addEventListener('change', async (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const field = e.target.dataset.field;
        const [h, m] = e.target.value.split(':').map(Number);
        const focusMode = await AnnoyBlockStorage.getLocal(STORAGE.FOCUS_MODE);
        if (field === 'start') {
          focusMode.schedules[idx].startHour = h;
          focusMode.schedules[idx].startMin = m;
        } else {
          focusMode.schedules[idx].endHour = h;
          focusMode.schedules[idx].endMin = m;
        }
        await AnnoyBlockStorage.setLocal(STORAGE.FOCUS_MODE, focusMode);
        showToast('Schedule updated');
      });
    });

    scheduleList.querySelectorAll('.schedule-level-slider').forEach(slider => {
      slider.addEventListener('input', async (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const level = AnnoyBlockUtils.clampLevel(parseInt(e.target.value, 10));
        const label = e.target.parentElement.querySelector('.schedule-level-label');
        label.textContent = AnnoyBlockUtils.getLevelName(level);
        const focusMode = await AnnoyBlockStorage.getLocal(STORAGE.FOCUS_MODE);
        focusMode.schedules[idx].level = level;
        await AnnoyBlockStorage.setLocal(STORAGE.FOCUS_MODE, focusMode);
      });
    });
  }

  focusEnabled.addEventListener('change', async () => {
    const focusMode = await AnnoyBlockStorage.getLocal(STORAGE.FOCUS_MODE);
    focusMode.enabled = focusEnabled.checked;
    if (!focusEnabled.checked) focusMode.activeLevel = null;
    await AnnoyBlockStorage.setLocal(STORAGE.FOCUS_MODE, focusMode);
    showToast(focusEnabled.checked ? 'Focus Mode enabled' : 'Focus Mode disabled');
    updateFocusStatus(focusMode);
  });

  btnAddSchedule.addEventListener('click', async () => {
    const focusMode = await AnnoyBlockStorage.getLocal(STORAGE.FOCUS_MODE);
    focusMode.schedules.push({
      days: [1, 2, 3, 4, 5], // Mon-Fri
      startHour: 9,
      startMin: 0,
      endHour: 17,
      endMin: 0,
      level: 5,
    });
    await AnnoyBlockStorage.setLocal(STORAGE.FOCUS_MODE, focusMode);
    showToast('New schedule added (Mon-Fri, 9:00-17:00)');
    loadFocusMode();
  });

  // ══════════════════════════════════════════════════════════════
  // EFFECTS TAB
  // ══════════════════════════════════════════════════════════════

  const effectGrid = document.getElementById('effect-grid');

  function renderEffects() {
    const effectInfo = {
      SATURATION_REDUCE: {
        title: 'Saturation Reduce',
        desc: 'Gradually desaturates page colors, making content feel dull and less engaging.',
      },
      CLICK_DELAY: {
        title: 'Click Delay',
        desc: 'Adds an artificial delay (100-1500ms) to clicks on links, buttons, and interactive elements.',
      },
      FONT_WEIGHT: {
        title: 'Font Weight',
        desc: 'Increases font weight, making text appear bolder, heavier, and harder to skim.',
      },
      IMAGE_ROTATE: {
        title: 'Image Rotation',
        desc: 'Slightly tilts images off-axis. They straighten on hover for basic usability.',
      },
      TEXT_BLUR: {
        title: 'Text Blur',
        desc: 'Applies Gaussian blur to text elements, causing eye strain and reduced readability.',
      },
      CURSOR_JITTER: {
        title: 'Cursor Jitter',
        desc: 'Creates subtle page vibration on mouse movement. Auto-disabled with reduced motion.',
      },
    };

    effectGrid.innerHTML = '';
    for (const [key, info] of Object.entries(effectInfo)) {
      const effect = EFFECTS[key];
      const card = document.createElement('div');
      card.className = 'effect-card';
      card.innerHTML = `
        <h3>${info.title}</h3>
        <span class="effect-threshold">Activates at Level ${effect.minLevel}</span>
        <p>${info.desc}</p>
      `;
      effectGrid.appendChild(card);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Utilities
  // ══════════════════════════════════════════════════════════════

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Master Load ────────────────────────────────────────────
  async function loadAll() {
    await Promise.all([
      loadGeneralSettings(),
      loadDomains(),
      loadFocusMode(),
    ]);
    renderEffects();
  }

  await loadAll();
});
