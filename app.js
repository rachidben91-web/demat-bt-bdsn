// ============================================================
// DEMAT-BT-BDSN - Application JavaScript
// ============================================================

let currentFilters = {
    type: 'all',
    status: 'all',
    site: 'all',
    search: '',
    managerId: null
};

let currentView = 'grid';
let selectedBtId = null;

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);
    
    updateStats();
    renderManagersList();
    renderBTGrid();
    renderTimelineHeader();
    renderTimeline();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
});

function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('clock').textContent = `${hours}:${minutes}`;
}

// ============================================================
// STATS
// ============================================================

function updateStats() {
    const stats = getStats();
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statPending').textContent = stats.pending;
    document.getElementById('statInProgress').textContent = stats.inprogress;
    document.getElementById('statCompleted').textContent = stats.completed;
    document.getElementById('statActiveTechs').textContent = stats.activeTechs;
    
    document.getElementById('pageSubtitle').textContent = 
        `Planification du 19/01/2026 - ${stats.total} interventions`;
}

// ============================================================
// MANAGERS LIST
// ============================================================

function renderManagersList() {
    const container = document.getElementById('managersList');
    const managersWithTeams = MANAGERS.filter(m => m.role === 'Manager équipe');
    
    container.innerHTML = managersWithTeams.map(manager => {
        const teamCount = getTechniciansByManager(manager.id).length;
        const btCount = BT_DATA.filter(bt => {
            return bt.assignedTo.some(techId => {
                const tech = getTechnicianById(techId);
                return tech && tech.managerId === manager.id;
            });
        }).length;
        
        return `
            <div class="tech-item manager ${currentFilters.managerId === manager.id ? 'active' : ''}" 
                 onclick="filterByManager('${manager.id}')">
                <div class="tech-avatar" style="background: ${manager.color};">
                    ${getInitials(manager.name)}
                </div>
                <div class="tech-info">
                    <div class="tech-name">${manager.name}</div>
                    <div class="tech-meta">${manager.site} • ${teamCount} TG</div>
                </div>
                <div class="tech-count">${btCount}</div>
            </div>
        `;
    }).join('');
}

// ============================================================
// BT GRID
// ============================================================

function renderBTGrid() {
    const container = document.getElementById('btGrid');
    const filteredBTs = filterBTs(currentFilters);
    
    if (filteredBTs.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
                <div style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">
                    Aucun BT trouvé
                </div>
                <div>Modifiez vos filtres pour voir plus de résultats</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredBTs.map(bt => {
        const teamHtml = bt.assignedTo.slice(0, 3).map(techId => {
            const tech = getTechnicianById(techId);
            if (!tech) return '';
            return `<div class="bt-team-avatar" style="background: ${tech.color};" title="${tech.name}">${getInitials(tech.name)}</div>`;
        }).join('');
        
        const primaryTech = getTechnicianById(bt.assignedTo[0]);
        
        return `
            <div class="bt-card ${bt.priority === 'high' ? 'priority-high' : ''}" 
                 data-type="${bt.type}" 
                 onclick="openBTModal('${bt.id}')">
                <div class="bt-card-header">
                    <span class="bt-number">${bt.id}</span>
                    <span class="bt-type" data-type="${bt.type}">${bt.typeLabel}</span>
                </div>
                <div class="bt-card-body">
                    <div class="bt-title">${bt.title}</div>
                    <div class="bt-details">
                        ${bt.client ? `
                        <div class="bt-detail">
                            <span class="bt-detail-icon">👤</span>
                            <span class="bt-detail-text">${bt.client}</span>
                        </div>` : ''}
                        <div class="bt-detail">
                            <span class="bt-detail-icon">📍</span>
                            <span class="bt-detail-text">${bt.address}</span>
                        </div>
                        <div class="bt-detail">
                            <span class="bt-detail-icon">⏱️</span>
                            <span class="bt-detail-text">${formatTime(bt.timeStart)} - ${formatTime(bt.timeEnd)}</span>
                        </div>
                    </div>
                </div>
                <div class="bt-card-footer">
                    <div class="bt-team">${teamHtml}</div>
                    <span class="bt-status" data-status="${bt.status}">${getStatusLabel(bt.status)}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// TIMELINE
// ============================================================

function renderTimelineHeader() {
    const container = document.getElementById('timelineHeader');
    let html = '<div class="timeline-header-cell">👤 Technicien</div>';
    for (let h = 7; h <= 18; h++) {
        html += `<div class="timeline-header-cell">${String(h).padStart(2, '0')}h</div>`;
    }
    container.innerHTML = html;
}

function renderTimeline() {
    const container = document.getElementById('timelineBody');
    const activeTechs = getActiveTechnicians();
    
    // Apply site filter
    let filteredTechs = activeTechs;
    if (currentFilters.site !== 'all') {
        filteredTechs = filteredTechs.filter(t => t.site === currentFilters.site);
    }
    if (currentFilters.managerId) {
        filteredTechs = filteredTechs.filter(t => t.managerId === currentFilters.managerId);
    }
    
    // Sort by manager
    filteredTechs.sort((a, b) => {
        if (a.managerId !== b.managerId) return a.managerId.localeCompare(b.managerId);
        return a.name.localeCompare(b.name);
    });
    
    container.innerHTML = filteredTechs.map(tech => {
        const techBTs = getBTsByTechnician(tech.id);
        
        // Filter BTs based on current filters
        let filteredBTs = techBTs;
        if (currentFilters.type !== 'all') {
            filteredBTs = filteredBTs.filter(bt => bt.type === currentFilters.type);
        }
        if (currentFilters.status !== 'all') {
            filteredBTs = filteredBTs.filter(bt => bt.status === currentFilters.status);
        }
        
        const blocks = filteredBTs.map(bt => {
            const left = timeToPercent(bt.timeStart);
            const width = timeToPercent(bt.timeEnd) - left;
            return `
                <div class="timeline-block" 
                     data-type="${bt.type}"
                     style="left: ${left}%; width: ${width}%;"
                     onclick="event.stopPropagation(); openBTModal('${bt.id}')"
                     title="${bt.title}">
                    ${bt.typeLabel}
                </div>
            `;
        }).join('');
        
        return `
            <div class="timeline-row">
                <div class="timeline-agent" onclick="filterByTechnician('${tech.id}')">
                    <div class="tech-avatar" style="background: ${tech.color};">${getInitials(tech.name)}</div>
                    <div class="agent-info">
                        <div class="agent-name">${tech.name}</div>
                        <div class="agent-meta">${tech.role} • ${tech.nni}</div>
                    </div>
                </div>
                <div class="timeline-slots">
                    ${Array(12).fill('<div class="timeline-slot"></div>').join('')}
                    ${blocks}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// MODAL
// ============================================================

function openBTModal(btId) {
    const bt = getBTById(btId);
    if (!bt) return;
    
    selectedBtId = btId;
    
    document.getElementById('modalBtNumber').textContent = bt.id;
    document.getElementById('modalTitle').textContent = bt.title;
    document.getElementById('modalStatusSelect').value = bt.status;
    
    const teamHtml = bt.team.map(member => {
        const tech = getTechnicianById(member.techId);
        if (!tech) return '';
        return `
            <div class="modal-team-member">
                <div class="modal-team-avatar" style="background: ${tech.color};">${getInitials(tech.name)}</div>
                <div>
                    <div class="modal-team-name">${tech.name}</div>
                    <div class="modal-team-role">${member.role} • ${tech.nni}</div>
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('modalBody').innerHTML = `
        <div class="modal-section">
            <div class="modal-section-title">Informations générales</div>
            <div class="modal-grid">
                <div class="modal-item">
                    <span class="modal-label">Type</span>
                    <span class="modal-value">
                        <span class="bt-type" data-type="${bt.type}">${bt.typeLabel}</span>
                    </span>
                </div>
                <div class="modal-item">
                    <span class="modal-label">Horaire</span>
                    <span class="modal-value">${formatTime(bt.timeStart)} - ${formatTime(bt.timeEnd)}</span>
                </div>
                ${bt.client ? `
                <div class="modal-item">
                    <span class="modal-label">Client</span>
                    <span class="modal-value">${bt.client}</span>
                </div>
                <div class="modal-item">
                    <span class="modal-label">Téléphone</span>
                    <span class="modal-value">${formatPhone(bt.phone)}</span>
                </div>
                ` : ''}
                <div class="modal-item full">
                    <span class="modal-label">Adresse</span>
                    <span class="modal-value">${bt.address}</span>
                </div>
                ${bt.pdl ? `
                <div class="modal-item">
                    <span class="modal-label">PDL / Référence</span>
                    <span class="modal-value">${bt.pdl}</span>
                </div>
                ` : ''}
                ${bt.compteur ? `
                <div class="modal-item">
                    <span class="modal-label">Compteur</span>
                    <span class="modal-value">${bt.compteur}</span>
                </div>
                ` : ''}
                <div class="modal-item">
                    <span class="modal-label">EOTP</span>
                    <span class="modal-value">${bt.eotp}</span>
                </div>
            </div>
        </div>
        
        <div class="modal-section">
            <div class="modal-section-title">Équipe assignée (${bt.team.length})</div>
            ${teamHtml}
        </div>
        
        <div class="modal-section">
            <div class="modal-section-title">Observations</div>
            <div class="modal-observations">${bt.observations}</div>
        </div>
        
        ${bt.documents.length > 0 ? `
        <div class="modal-section">
            <div class="modal-section-title">Documents</div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                ${bt.documents.map(doc => `
                    <span style="background: var(--bg-tertiary); padding: 6px 12px; border-radius: 4px; font-size: 12px;">
                        📄 ${doc}
                    </span>
                `).join('')}
            </div>
        </div>
        ` : ''}
    `;
    
    document.getElementById('modalOverlay').classList.add('active');
}

function closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modalOverlay').classList.remove('active');
    selectedBtId = null;
}

function updateStatus() {
    if (!selectedBtId) return;
    const newStatus = document.getElementById('modalStatusSelect').value;
    updateBTStatus(selectedBtId, newStatus);
    updateStats();
    renderBTGrid();
    renderTimeline();
    renderManagersList();
}

// ============================================================
// FILTERS
// ============================================================

function applyFilters() {
    currentFilters.type = document.getElementById('filterType').value;
    currentFilters.site = document.getElementById('filterSite').value;
    currentFilters.search = document.getElementById('searchInput').value;
    
    renderBTGrid();
    renderTimeline();
    updatePageSubtitle();
}

function applyFilter(filterType, value) {
    if (filterType === 'status') {
        currentFilters.status = value;
    }
    applyFilters();
}

function filterByManager(managerId) {
    if (currentFilters.managerId === managerId) {
        currentFilters.managerId = null;
    } else {
        currentFilters.managerId = managerId;
    }
    renderManagersList();
    renderBTGrid();
    renderTimeline();
    updatePageSubtitle();
}

function filterByTechnician(techId) {
    const tech = getTechnicianById(techId);
    if (tech) {
        document.getElementById('searchInput').value = tech.name;
        currentFilters.search = tech.name;
        applyFilters();
    }
}

function updatePageSubtitle() {
    const filteredBTs = filterBTs(currentFilters);
    let subtitle = `Planification du 19/01/2026 - ${filteredBTs.length} intervention${filteredBTs.length > 1 ? 's' : ''}`;
    
    if (currentFilters.managerId) {
        const manager = getManagerById(currentFilters.managerId);
        if (manager) subtitle += ` • Équipe ${manager.name.split(' ')[0]}`;
    }
    
    document.getElementById('pageSubtitle').textContent = subtitle;
}

// ============================================================
// VIEW TOGGLE
// ============================================================

function setView(view) {
    currentView = view;
    
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    document.querySelector('.bt-grid').classList.toggle('active', view === 'grid');
    document.querySelector('.timeline-view').classList.toggle('active', view === 'timeline');
}

// ============================================================
// ACTIONS
// ============================================================

function exportPDF() {
    alert('Export PDF en cours de développement...\n\nCette fonctionnalité permettra d\'exporter la liste des BT au format PDF.');
}

function openNewBT() {
    alert('Création de BT en cours de développement...\n\nCette fonctionnalité permettra de créer un nouveau Bon de Travail.');
}
