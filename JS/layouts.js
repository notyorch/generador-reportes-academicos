// ============================================================================
// SISTEMA DE VISTAS/LAYOUTS
// ============================================================================

let currentLayout = 'default';

/**
 * Cambia el layout de la aplicación
 */
function setLayout(layoutName) {
    const workspace = document.getElementById('workspace');
    if (!workspace) return;
    
    // Remover todas las clases de layout
    workspace.className = 'workspace';
    
    // Agregar la nueva clase de layout
    workspace.classList.add(`layout-${layoutName}`);
    
    // Guardar el layout actual
    currentLayout = layoutName;
    localStorage.setItem('selectedLayout', layoutName);
    
    // Resetear zoom al cambiar de layout
    if (layoutName !== 'preview-only') {
        currentZoom = 1.0;
        const preview = document.getElementById('preview-container');
        if (preview) {
            preview.style.transform = '';
        }
    }
    
    // Ejecutar acciones específicas según el layout
    switch(layoutName) {
        case 'json-editor':
            loadJSONEditor();
            break;
        case 'citations':
            // Renderizar editor completo y preview solo con citas
            if (typeof renderEditor === 'function') {
                renderEditor();
            }
            renderCitationsPreview();
            break;
        case 'vertical':
            // Forzar render completo
            if (typeof render === 'function') {
                render();
            }
            // Configurar resizer vertical
            setTimeout(() => setupVerticalResizer(), 100);
            break;
        case 'editor-only':
            // Forzar render del editor
            if (typeof renderEditor === 'function') {
                renderEditor();
            }
            break;
        case 'preview-only':
            // Forzar render del preview
            if (typeof renderPreview === 'function') {
                renderPreview();
            }
            // Resetear zoom
            resetZoom();
            break;
        default:
            setupHorizontalResizer();
            // Forzar render completo en layout por defecto
            if (typeof render === 'function') {
                render();
            }
            break;
    }
    
    // Actualizar estadísticas si estamos en la pestaña Vista
    updateStatistics();
    
    console.log(`Layout cambiado a: ${layoutName}`);
}

/**
 * Carga el editor JSON con el contenido actual
 */
function loadJSONEditor() {
    const jsonEditor = document.getElementById('json-editor');
    if (!jsonEditor) return;
    
    // Verificar que reportData exista
    if (typeof reportData === 'undefined') {
        jsonEditor.value = '[]';
        return;
    }
    
    try {
        // Convertir reportData a JSON formateado
        const jsonString = JSON.stringify(reportData, null, 2);
        jsonEditor.value = jsonString;
    } catch (e) {
        console.error('Error al cargar JSON:', e);
        jsonEditor.value = '[]';
    }
}

/**
 * Aplica los cambios del editor JSON
 */
function applyJSONChanges() {
    const jsonEditor = document.getElementById('json-editor');
    if (!jsonEditor) return;
    
    try {
        // Parsear el JSON
        const newData = JSON.parse(jsonEditor.value);
        
        // Validar que sea un array
        if (!Array.isArray(newData)) {
            alert('Error: El JSON debe ser un array de bloques');
            return;
        }
        
        // Guardar estado para deshacer
        saveStateForUndo();
        
        // Actualizar reportData
        reportData = newData;
        
        // Re-renderizar
        render();
        
        alert('¡Cambios aplicados correctamente!');
        
        // Volver al layout por defecto
        setLayout('default');
        
    } catch (e) {
        alert('Error al parsear JSON: ' + e.message);
        console.error('Error al aplicar cambios JSON:', e);
    }
}

/**
 * Carga el panel de citas con todas las referencias
 */
function loadCitationsPanel() {
    const citationsContent = document.getElementById('citations-content');
    if (!citationsContent) return;
    
    // Verificar que reportData exista
    if (typeof reportData === 'undefined' || !Array.isArray(reportData)) {
        citationsContent.innerHTML = '<div class="citation-empty">No hay datos disponibles</div>';
        return;
    }
    
    // Filtrar solo bloques de tipo citation y bibliography
    const citations = reportData.filter(block => 
        block.type === 'citation' || block.type === 'citations' || block.type === 'bibliography'
    );
    
    if (citations.length === 0) {
        citationsContent.innerHTML = '<div class="citation-empty">No hay citas o referencias en el documento</div>';
        return;
    }
    
    // Generar HTML para las citas
    let html = '';
    let citationNumber = 1;
    
    citations.forEach(block => {
        if (block.type === 'citation') {
            html += `
                <div class="citation-item">
                    <div class="citation-number">[${citationNumber}]</div>
                    <div class="citation-text">
                        ${escapeHtml(block.authors || '')}. 
                        "${escapeHtml(block.title || '')}"
                        ${block.journal ? ', <em>' + escapeHtml(block.journal) + '</em>' : ''}
                        ${block.year ? ', ' + escapeHtml(block.year) : ''}
                        ${block.doi ? ', DOI: ' + escapeHtml(block.doi) : ''}
                    </div>
                </div>
            `;
            citationNumber++;
        } else if (block.type === 'citations' && block.items) {
            block.items.forEach(item => {
                html += `
                    <div class="citation-item">
                        <div class="citation-number">[${citationNumber}]</div>
                        <div class="citation-text">
                            ${escapeHtml(item.authors || '')}. 
                            "${escapeHtml(item.title || '')}"
                            ${item.journal ? ', <em>' + escapeHtml(item.journal) + '</em>' : ''}
                            ${item.year ? ', ' + escapeHtml(item.year) : ''}
                            ${item.doi ? ', DOI: ' + escapeHtml(item.doi) : ''}
                        </div>
                    </div>
                `;
                citationNumber++;
            });
        } else if (block.type === 'bibliography') {
            html += `
                <div class="citation-item">
                    <div class="citation-number">[${citationNumber}]</div>
                    <div class="citation-text">
                        <strong>@${escapeHtml(block.entryType || 'article')}</strong>
                        {${escapeHtml(block.citationKey || '')}}
                        <br>
                        ${block.author ? escapeHtml(block.author) : ''}
                        ${block.title ? ' - ' + escapeHtml(block.title) : ''}
                    </div>
                </div>
            `;
            citationNumber++;
        }
    });
    
    citationsContent.innerHTML = html;
}

/**
 * Renderiza solo los bloques de citas en el preview
 */
function renderCitationsPreview() {
    const preview = document.getElementById('preview-container');
    if (!preview) return;
    
    // Verificar que reportData exista
    if (typeof reportData === 'undefined' || !Array.isArray(reportData)) {
        preview.innerHTML = '<div style="padding: 20px; color: #666;">No hay datos disponibles</div>';
        return;
    }
    
    // Filtrar solo bloques de tipo citation, citations y bibliography
    const citationBlocks = reportData.filter(block => 
        block.type === 'citation' || 
        block.type === 'citations' || 
        block.type === 'bibliography'
    );
    
    if (citationBlocks.length === 0) {
        preview.innerHTML = '<div style="padding: 20px; color: #666; text-align: center;">No hay citas o referencias en el documento<br><br>Agrega citas desde la pestaña <strong>Bibliografía</strong></div>';
        return;
    }
    
    // Renderizar cada bloque de cita
    let html = '';
    let refCounter = 0;
    
    citationBlocks.forEach(block => {
        switch(block.type) {
            case 'citation':
                refCounter++;
                html += `
                    <div class="preview-citation">
                        <p class="citation-number">[${refCounter}]</p>
                        <p class="citation-authors">${escapeHtml(block.citationData?.authors || '')}</p>
                        <p class="citation-title"><em>${escapeHtml(block.citationData?.title || '')}</em></p>
                        <p class="citation-journal">${escapeHtml(block.citationData?.journal || '')} ${escapeHtml(block.citationData?.year || '')}</p>
                        ${block.citationData?.doi ? '<p class="citation-doi">DOI: ' + escapeHtml(block.citationData.doi) + '</p>' : ''}
                    </div>
                `;
                break;
            
            case 'citations':
                if (block.items && Array.isArray(block.items)) {
                    block.items.forEach(item => {
                        refCounter++;
                        html += `
                            <div class="preview-citation">
                                <p class="citation-number">[${refCounter}]</p>
                                <p class="citation-authors">${escapeHtml(item.data?.authors || '')}</p>
                                <p class="citation-title"><em>${escapeHtml(item.data?.title || '')}</em></p>
                                <p class="citation-journal">${escapeHtml(item.data?.journal || '')} ${escapeHtml(item.data?.year || '')}</p>
                                ${item.data?.doi ? '<p class="citation-doi">DOI: ' + escapeHtml(item.data.doi) + '</p>' : ''}
                            </div>
                        `;
                    });
                }
                break;
            
            case 'bibliography':
                refCounter++;
                html += `
                    <div class="preview-bibliography">
                        <p class="bib-number">[${refCounter}]</p>
                        <p class="bib-type"><strong>@${escapeHtml(block.entryType || 'article')}</strong> {${escapeHtml(block.citationKey || '')}}</p>
                        ${block.author ? '<p class="bib-author">' + escapeHtml(block.author) + '</p>' : ''}
                        ${block.title ? '<p class="bib-title"><em>' + escapeHtml(block.title) + '</em></p>' : ''}
                        ${block.journal ? '<p class="bib-journal">' + escapeHtml(block.journal) + '</p>' : ''}
                        ${block.year ? '<p class="bib-year">' + escapeHtml(block.year) + '</p>' : ''}
                        ${block.doi ? '<p class="bib-doi">DOI: ' + escapeHtml(block.doi) + '</p>' : ''}
                    </div>
                `;
                break;
        }
    });
    
    preview.innerHTML = html;
}

/**
 * Configura el resizer para layout vertical
 */
function setupVerticalResizer() {
    const resizer = document.getElementById('resizer');
    const topPanel = document.getElementById('preview-container');
    const bottomPanel = document.getElementById('editor-container');
    
    if (!resizer || !topPanel || !bottomPanel) return;
    
    let isResizing = false;
    let startY = 0;
    let startTopHeight = 0;
    
    // Remover listeners anteriores
    resizer.replaceWith(resizer.cloneNode(true));
    const newResizer = document.getElementById('resizer');
    
    newResizer.addEventListener('mousedown', function(e) {
        isResizing = true;
        startY = e.clientY;
        startTopHeight = topPanel.offsetHeight;
        newResizer.classList.add('resizing');
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', function(e) {
        if (!isResizing) return;
        
        const dy = e.clientY - startY;
        const newTopHeight = startTopHeight + dy;
        const containerHeight = topPanel.parentElement.offsetHeight;
        const minHeight = 200;
        const maxHeight = containerHeight - minHeight - 5;
        
        if (newTopHeight >= minHeight && newTopHeight <= maxHeight) {
            const topPercent = (newTopHeight / containerHeight) * 100;
            const bottomPercent = 100 - topPercent - 0.5;
            
            topPanel.style.flex = `0 0 ${topPercent}%`;
            bottomPanel.style.flex = `0 0 ${bottomPercent}%`;
        }
    });
    
    document.addEventListener('mouseup', function() {
        if (isResizing) {
            isResizing = false;
            newResizer.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

/**
 * Configura el resizer para layout horizontal (por defecto)
 */
function setupHorizontalResizer() {
    // La configuración horizontal ya existe en ribbon.js
    // Solo necesitamos asegurarnos de que esté activa
}

/**
 * Actualiza las estadísticas del documento
 */
function updateStatistics() {
    // Verificar que reportData exista
    if (typeof reportData === 'undefined' || !Array.isArray(reportData)) {
        return;
    }
    
    // Contar palabras
    let wordCount = 0;
    let charCount = 0;
    
    reportData.forEach(block => {
        if (block.type === 'text' || block.type === 'markdown') {
            const text = block.content || '';
            wordCount += text.split(/\s+/).filter(w => w.length > 0).length;
            charCount += text.length;
        } else if (block.type === 'list' || block.type === 'numbered') {
            const text = block.items ? block.items.join(' ') : '';
            wordCount += text.split(/\s+/).filter(w => w.length > 0).length;
            charCount += text.length;
        } else if (block.type === 'title' || block.type === 'subtitle' || block.type === 'subsubtitle') {
            const text = block.text || '';
            wordCount += text.split(/\s+/).filter(w => w.length > 0).length;
            charCount += text.length;
        }
    });
    
    // Actualizar UI
    const wordCountEl = document.getElementById('word-count');
    const charCountEl = document.getElementById('char-count');
    const blockCountEl = document.getElementById('block-count');
    
    if (wordCountEl) wordCountEl.textContent = `Palabras: ${wordCount}`;
    if (charCountEl) charCountEl.textContent = `Caracteres: ${charCount}`;
    if (blockCountEl) blockCountEl.textContent = `Bloques: ${reportData.length}`;
}

/**
 * Carga el layout guardado al iniciar
 */
function loadSavedLayout() {
    const savedLayout = localStorage.getItem('selectedLayout');
    
    // Solo aplicar si hay un layout guardado y es válido
    if (savedLayout && savedLayout !== 'default') {
        const validLayouts = ['default', 'editor-only', 'preview-only', 'vertical', 'json-editor', 'citations'];
        if (validLayouts.includes(savedLayout)) {
            setLayout(savedLayout);
        } else {
            // Si el layout guardado no es válido, usar el por defecto
            setLayout('default');
        }
    } else {
        // Asegurar que el layout por defecto se renderice correctamente
        if (typeof render === 'function') {
            render();
        }
    }
}

/**
 * Función helper para escapar HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// FUNCIONES DE ZOOM PARA PREVIEW
// ============================================================================

let currentZoom = 1.0;

/**
 * Acerca el zoom del preview
 */
function zoomIn() {
    if (currentZoom < 3.0) {
        currentZoom += 0.1;
        applyZoom();
    }
}

/**
 * Aleja el zoom del preview
 */
function zoomOut() {
    if (currentZoom > 0.5) {
        currentZoom -= 0.1;
        applyZoom();
    }
}

/**
 * Restablece el zoom al 100%
 */
function resetZoom() {
    currentZoom = 1.0;
    applyZoom();
}

/**
 * Aplica el nivel de zoom actual
 */
function applyZoom() {
    const preview = document.getElementById('preview-container');
    const zoomLevel = document.getElementById('zoom-level');
    
    if (preview) {
        preview.style.transform = `scale(${currentZoom})`;
    }
    
    if (zoomLevel) {
        zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`;
    }
}

// Atajos de teclado para zoom
document.addEventListener('keydown', function(e) {
    // Solo funciona en layout preview-only
    if (currentLayout !== 'preview-only') return;
    
    // Ctrl/Cmd + para zoom in
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        zoomIn();
    }
    
    // Ctrl/Cmd - para zoom out
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        zoomOut();
    }
    
    // Ctrl/Cmd 0 para reset
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        resetZoom();
    }
});

// NO inicializar automáticamente, esperar a que script.js cargue primero
// La inicialización se hará manualmente desde script.js
