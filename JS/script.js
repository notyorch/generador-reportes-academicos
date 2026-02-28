// ============================================================================
// GENERADOR DE REPORTES ACADÉMICOS - Script Principal (VERSIÓN SEGURA)
// ============================================================================

// Estado global de la aplicación
let reportData = [];

// Sistema de deshacer/rehacer
let undoStack = [];
let redoStack = [];
const MAX_UNDO_STACK = 50;

// Sistema de control de versiones
let versionHistory = [];
let versionCounter = 1;

// Autoguardado
let autosaveInterval = null;
let lastSaveTime = null;

// Detección de internet
let hasInternet = false;

// Sistema de bibliografía
let citationMode = 'manual'; // 'manual' o 'bibtex'
let bibDatabase = {}; // Almacena las entradas BibTeX { clave: {...datos} }

// Sistema de optimización de rendimiento
let debounceTimers = {};
let previewUpdateTimer = null;
let autoResizeTimer = null;

// ============================================================================
// FUNCIONES DE SEGURIDAD (NUEVAS)
// ============================================================================

/**
 * Detecta si hay conexión a internet
 */
async function checkInternetConnection() {
    try {
        const response = await fetch('https://cdn.jsdelivr.net/', {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-cache',
            timeout: 3000
        });
        hasInternet = true;
    } catch (e) {
        hasInternet = false;
    }
    
    updateCDNDependentButtons();
    console.log(`Conexión a internet: ${hasInternet ? 'SÍ' : 'NO'}`);
}

/**
 * Actualiza el estado de los botones que requieren CDN
 */
function updateCDNDependentButtons() {
    const btnFormula = document.getElementById('btn-formula');
    const btnMermaid = document.getElementById('btn-mermaid');
    
    if (btnFormula) {
        if (hasInternet) {
            btnFormula.disabled = false;
            btnFormula.title = 'Fórmulas matemáticas con LaTeX/KaTeX';
            btnFormula.style.opacity = '1';
        } else {
            btnFormula.disabled = true;
            btnFormula.title = 'Requiere conexión a internet';
            btnFormula.style.opacity = '0.5';
            btnFormula.style.cursor = 'not-allowed';
        }
    }
    
    if (btnMermaid) {
        if (hasInternet) {
            btnMermaid.disabled = false;
            btnMermaid.title = 'Diagramas Mermaid';
            btnMermaid.style.opacity = '1';
        } else {
            btnMermaid.disabled = true;
            btnMermaid.title = 'Requiere conexión a internet';
            btnMermaid.style.opacity = '0.5';
            btnMermaid.style.cursor = 'not-allowed';
        }
    }
}

/**
 * Escapa caracteres HTML para atributos (previene XSS en value="...")
 * @param {string} text - Texto a escapar
 * @returns {string} Texto escapado para atributos HTML
 */
function escapeAttr(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Escapa caracteres HTML para contenido (previene XSS en innerHTML)
 * @param {string} text - Texto a escapar
 * @returns {string} Texto escapado
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Función de debounce para optimizar rendimiento
 * @param {Function} func - Función a ejecutar
 * @param {number} wait - Milisegundos de espera
 * @param {string} key - Identificador único del debounce
 */
function debounce(func, wait, key) {
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(debounceTimers[key]);
            func(...args);
        };
        clearTimeout(debounceTimers[key]);
        debounceTimers[key] = setTimeout(later, wait);
    };
}

/**
 * Auto-ajusta la altura de un textarea según su contenido
 * @param {HTMLTextAreaElement} textarea - El textarea a ajustar
 */
function autoResizeTextarea(textarea) {
    if (!textarea) return;
    
    // Resetear altura para calcular scrollHeight correctamente
    textarea.style.height = 'auto';
    
    // Calcular nueva altura basada en el contenido
    const newHeight = Math.max(textarea.scrollHeight, 60); // Mínimo 60px
    textarea.style.height = newHeight + 'px';
}

/**
 * Auto-ajusta con debounce para mejor rendimiento
 */
const autoResizeTextareaDebounced = function(textarea) {
    if (!textarea) return;
    
    // Ajuste inmediato para retroalimentación visual
    textarea.style.height = 'auto';
    const newHeight = Math.max(textarea.scrollHeight, 60);
    textarea.style.height = newHeight + 'px';
};

/**
 * Inicializa auto-ajuste para todos los textareas existentes
 */
function initAutoResizeTextareas() {
    const textareas = document.querySelectorAll('textarea.editor-input, textarea.code-input');
    textareas.forEach(textarea => {
        autoResizeTextarea(textarea);
    });
}

/**
 * Convierte Markdown a HTML simple (sin librería externa)
 * @param {string} markdown - Texto en Markdown
 * @returns {string} HTML
 */
function markdownToHtml(markdown) {
    if (!markdown) return '';
    
    let html = escapeHtml(markdown);
    
    // Headers
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__  (.*?)__/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Code inline
    html = html.replace(/`(.*?)`/g, '<code style="background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace;">$1</code>');
    
    // Links
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color: var(--primary);">$1</a>');
    
    // Listas con múltiples niveles (procesar por líneas)
    const lines = html.split('\n');
    const processedLines = [];
    let inList = false;
    let currentLevel = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
        
        if (bulletMatch) {
            const indent = bulletMatch[1].length;
            const content = bulletMatch[2];
            const level = indent === 0 ? 0 : (indent <= 2 ? 1 : 2);
            
            if (!inList) {
                processedLines.push('<ul style="margin: 10px 0; padding-left: 20px;">');
                inList = true;
                currentLevel = 0;
            }
            
            // Abrir sublistas si es necesario
            while (currentLevel < level) {
                processedLines.push('<ul style="margin: 5px 0; padding-left: 20px;">');
                currentLevel++;
            }
            
            // Cerrar sublistas si es necesario
            while (currentLevel > level) {
                processedLines.push('</ul>');
                currentLevel--;
            }
            
            processedLines.push(`<li>${content}</li>`);
        } else {
            // Cerrar todas las listas abiertas
            while (currentLevel > 0) {
                processedLines.push('</ul>');
                currentLevel--;
            }
            if (inList) {
                processedLines.push('</ul>');
                inList = false;
            }
            processedLines.push(line);
        }
    }
    
    // Cerrar listas si quedaron abiertas al final
    while (currentLevel > 0) {
        processedLines.push('</ul>');
        currentLevel--;
    }
    if (inList) {
        processedLines.push('</ul>');
    }
    
    html = processedLines.join('\n');
    
    // Saltos de línea
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    
    // Blockquotes
    html = html.replace(/^&gt; (.*?)$/gm, '<blockquote style="border-left: 4px solid #00B8E6; padding-left: 15px; margin: 10px 0; color: #666;">$1</blockquote>');
    
    return html;
}

// ============================================================================
// FUNCIONES DE GESTIÓN DE BLOQUES
// ============================================================================

/**
 * Agrega un nuevo bloque al reporte
 * @param {string} type - Tipo de bloque: header, title, subtitle, text, code, image, ref, list, numbered, formula, mermaid, citation, markdown
 */
function addBlock(type) {
    // Validar disponibilidad de CDN
    if ((type === 'formula' || type === 'mermaid') && !hasInternet) {
        alert('Error: ' + (type === 'formula' ? 'Fórmulas LaTeX' : 'Diagramas Mermaid') + ' requieren conexión a internet.');
        return;
    }
    
    saveStateForUndo(); // Guardar estado antes de modificar
    
    const id = Date.now();
    let newBlock = { id, type, content: "" };
    
    // Determinar la posición de inserción basada en bloques pinned
    let insertIndex = reportData.length; // Por defecto al final
    
    const topPinnedIndex = reportData.findIndex(b => b.pinned === 'top');
    const bottomPinnedIndex = reportData.findIndex(b => b.pinned === 'bottom');
    
    if (bottomPinnedIndex !== -1) {
        // Hay bloques anclados abajo, insertar antes del primero
        insertIndex = bottomPinnedIndex;
    } else if (topPinnedIndex !== -1) {
        // Solo hay bloques anclados arriba, insertar después del último
        let lastTopPinned = topPinnedIndex;
        for (let i = topPinnedIndex + 1; i < reportData.length; i++) {
            if (reportData[i].pinned === 'top') {
                lastTopPinned = i;
            } else {
                break;
            }
        }
        insertIndex = lastTopPinned + 1;
    }
    
    // Inicialización específica según el tipo de bloque
    if (type === 'header') {
        newBlock.hData = { 
            name: '', 
            group: '', 
            subject: '', 
            prof: '', 
            inst: '', 
            term: '', 
            date: '' 
        };
    }
    
    if (type === 'image') {
        newBlock.caption = '';
    }

    if (type === 'markdown') {
        newBlock.content = '# Encabezado\n\n**Texto en negrita** e *itálica*\n\n- Elemento 1\n- Elemento 2';
    }

    if (type === 'subtitle' || type === 'subsubtitle' || type === 'subtitle-italic') {
        newBlock.content = '';
    }
    
    if (type === 'ref') {
        newBlock.refType = 'web';
        newBlock.refData = { 
            author: '', 
            title: '', 
            source: '', 
            year: '', 
            url: '' 
        };
    }

    // Bloque único de citas IEEE
    if (type === 'citation') {
        const existing = reportData.find(b => b.type === 'citations');
        if (existing) {
            if (!existing.items) existing.items = [];
            existing.items.push({
                type: 'article',
                data: {
                    authors: '',
                    title: '',
                    journal: '',
                    volume: '',
                    number: '',
                    pages: '',
                    year: '',
                    doi: '',
                    url: ''
                }
            });
            render();
            return; // No crear un nuevo bloque
        } else {
            newBlock.type = 'citations';
            newBlock.items = [{
                type: 'article',
                data: {
                    authors: '',
                    title: '',
                    journal: '',
                    volume: '',
                    number: '',
                    pages: '',
                    year: '',
                    doi: '',
                    url: ''
                }
            }];
        }
    }

    if (type === 'list') {
        newBlock.items = [''];
    }

    if (type === 'numbered') {
        newBlock.items = [''];
    }

    if (type === 'formula') {
        newBlock.display = 'block'; // 'block' o 'inline'
        newBlock.content = 'E = mc^2';
    }

    if (type === 'mermaid') {
        newBlock.content = 'graph TD\n    A[Start] --> B[End]';
    }

    // Bloque divisor
    if (type === 'divider') {
        newBlock.style = 'solid'; // 'solid' | 'dashed' | 'dotted'
    }
    
    if (type === 'ai') {
        newBlock.aiUsed = 'no'; // Por defecto: NO usó IA
        newBlock.aiData = {
            name: '',
            aiTool: '',
            date: '',
            purpose: '',
            prompt: '',
            attachments: '',
            rawResponse: ''
        };
    }
    
    // Inicialización del bloque de tabla
    if (type === 'table') {
        newBlock.caption = ''; // Descripción de la tabla
        newBlock.columns = 3; // Número de columnas por defecto
        newBlock.tableData = [
            ['', '', ''], // Fila de encabezados
            ['', '', '']  // Primera fila de datos
        ];
    }
    
    // Inicialización del bloque de bibliografía BibTeX
    if (type === 'bibliography') {
        newBlock.bibKey = ''; // Clave única para la cita (ej: smith2024)
        newBlock.bibType = 'article'; // Tipo de entrada BibTeX
        newBlock.bibData = {
            author: '',
            title: '',
            journal: '',
            year: '',
            volume: '',
            number: '',
            pages: '',
            doi: '',
            url: '',
            publisher: '',
            booktitle: '',
            organization: '',
            howpublished: '',
            note: '',
            month: '',
            address: '',
            edition: ''
        };
    }
    
    // Insertar en la posición calculada
    reportData.splice(insertIndex, 0, newBlock);
    render();
}

/**
 * Elimina un bloque del reporte
 * @param {number} id - ID del bloque a eliminar
 */
function deleteBlock(id) {
    saveStateForUndo(); // Guardar estado antes de modificar
    reportData = reportData.filter(block => block.id !== id);
    render();
}

// ============================================================================
// FUNCIONES DE ACTUALIZACIÓN DE CONTENIDO
// ============================================================================

/**
 * Renderiza la vista previa con debounce para mejor rendimiento
 */
function renderPreviewDebounced() {
    clearTimeout(previewUpdateTimer);
    previewUpdateTimer = setTimeout(() => {
        // Si estamos en modo citations, renderizar solo citas
        if (typeof currentLayout !== 'undefined' && currentLayout === 'citations') {
            if (typeof renderCitationsPreview === 'function') {
                renderCitationsPreview();
            } else {
                renderPreview();
            }
        } else {
            renderPreview();
        }
    }, 150); // 150ms de delay
}

/**
 * Actualiza el contenido de un bloque
 * @param {number} id - ID del bloque
 * @param {string} value - Nuevo valor del contenido
 */
function updateContent(id, value) {
    const block = reportData.find(b => b.id === id);
    if (block) {
        block.content = value;
        renderPreviewDebounced();
    }
}

/**
 * Actualiza los datos del encabezado
 * @param {number} id - ID del bloque de encabezado
 * @param {string} field - Campo a actualizar
 * @param {string} value - Nuevo valor
 */
function updateHeader(id, field, value) {
    const block = reportData.find(b => b.id === id);
    if (block && block.hData) {
        block.hData[field] = value;
        renderPreviewDebounced();
    }
}

/**
 * Actualiza el tipo de referencia
 * @param {number} id - ID del bloque de referencia
 * @param {string} type - Nuevo tipo (web, book, article)
 */
function updateRefType(id, type) {
    const block = reportData.find(b => b.id === id);
    if (block) {
        block.refType = type;
        render();
    }
}

/**
 * Actualiza un campo de la referencia
 * @param {number} id - ID del bloque de referencia
 * @param {string} field - Campo a actualizar
 * @param {string} value - Nuevo valor
 */
function updateRef(id, field, value) {
    const block = reportData.find(b => b.id === id);
    if (block) {
        if (!block.refData) {
            block.refData = { author: '', title: '', source: '', year: '', url: '' };
        }
        block.refData[field] = value;
        renderPreviewDebounced();
    }
}

/**
 * Actualiza el pie de imagen
 * @param {number} id - ID del bloque de imagen
 * @param {string} value - Nuevo texto del pie de imagen
 */
function updateCaption(id, value) {
    const block = reportData.find(b => b.id === id);
    if (block) {
        block.caption = value;
        renderPreviewDebounced();
    }
}

/**
 * Procesa la carga de una imagen
 * @param {number} id - ID del bloque de imagen
 * @param {HTMLInputElement} input - Input file que contiene la imagen
 */
function handleImage(id, input) {
    if (!input.files[0]) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const block = reportData.find(b => b.id === id);
        if (block) {
            block.content = e.target.result;
            renderPreviewDebounced();
        }
    };
    reader.readAsDataURL(input.files[0]);
}

/**
 * Actualiza si se usó IA o no
 * @param {number} id - ID del bloque de IA
 * @param {string} value - 'yes' o 'no'
 */
function updateAIUsed(id, value) {
    const block = reportData.find(b => b.id === id);
    if (block) {
        block.aiUsed = value;
        render(); // Re-renderizar para mostrar/ocultar campos
    }
}

/**
 * Actualiza un campo del bloque de IA
 * @param {number} id - ID del bloque de IA
 * @param {string} field - Campo a actualizar
 * @param {string} value - Nuevo valor
 */
function updateAI(id, field, value) {
    const block = reportData.find(b => b.id === id);
    if (block) {
        if (!block.aiData) {
            block.aiData = {
                name: '',
                aiTool: '',
                date: '',
                purpose: '',
                prompt: '',
                attachments: '',
                rawResponse: ''
            };
        }
        block.aiData[field] = value;
        renderPreviewDebounced();
    }
}

// ============================================================================
// FUNCIONES DE GESTIÓN DE TABLAS
// ============================================================================

/**
 * Actualiza el número de columnas de una tabla
 * @param {number} id - ID del bloque de tabla
 * @param {number} cols - Número de columnas (1-6)
 */
function updateTableColumns(id, cols) {
    const block = reportData.find(b => b.id === id);
    if (!block || block.type !== 'table') return;
    
    // Validar rango
    cols = Math.max(1, Math.min(6, parseInt(cols) || 3));
    block.columns = cols;
    
    // Ajustar datos existentes al nuevo número de columnas
    block.tableData = block.tableData.map(row => {
        if (row.length > cols) {
            // Recortar si hay más columnas
            return row.slice(0, cols);
        } else if (row.length < cols) {
            // Agregar celdas vacías si faltan
            return [...row, ...Array(cols - row.length).fill('')];
        }
        return row;
    });
    
    render();
}

/**
 * Actualiza el contenido de una celda de la tabla
 * @param {number} id - ID del bloque de tabla
 * @param {number} row - Índice de fila
 * @param {number} col - Índice de columna
 * @param {string} value - Nuevo valor
 */
function updateTableCell(id, row, col, value) {
    const block = reportData.find(b => b.id === id);
    if (!block || block.type !== 'table') return;
    
    if (block.tableData[row] && block.tableData[row][col] !== undefined) {
        block.tableData[row][col] = value;
        renderPreviewDebounced();
    }
}

/**
 * Agrega una nueva fila a la tabla
 * @param {number} id - ID del bloque de tabla
 */
function addTableRow(id) {
    const block = reportData.find(b => b.id === id);
    if (!block || block.type !== 'table') return;
    
    // Crear nueva fila con celdas vacías
    const newRow = Array(block.columns).fill('');
    block.tableData.push(newRow);
    render();
}

/**
 * Elimina la última fila de la tabla
 * @param {number} id - ID del bloque de tabla
 */
function removeTableRow(id) {
    const block = reportData.find(b => b.id === id);
    if (!block || block.type !== 'table') return;
    
    // No permitir eliminar si solo queda la fila de encabezados
    if (block.tableData.length <= 1) {
        alert('La tabla debe tener al menos la fila de encabezados.');
        return;
    }
    
    block.tableData.pop();
    render();
}

/**
 * Actualiza la descripción/caption de la tabla
 * @param {number} id - ID del bloque de tabla
 * @param {string} value - Nueva descripción
 */
function updateTableCaption(id, value) {
    const block = reportData.find(b => b.id === id);
    if (block && block.type === 'table') {
        block.caption = value;
        renderPreviewDebounced();
    }
}

// ============================================================================
// FUNCIONES DE GESTIÓN DE LISTAS
// ============================================================================

/**
 * Actualiza un elemento de lista
 */
function updateListItem(id, index, value) {
    const block = reportData.find(b => b.id === id);
    if (block && block.items && block.items[index] !== undefined) {
        block.items[index] = value;
        renderPreviewDebounced();
    }
}

/**
 * Agrega un nuevo elemento a la lista
 */
function addListItem(id) {
    const block = reportData.find(b => b.id === id);
    if (block && block.items) {
        block.items.push('');
        render();
    }
}

/**
 * Elimina un elemento de la lista
 */
function removeListItem(id, index) {
    const block = reportData.find(b => b.id === id);
    if (block && block.items && block.items.length > 1) {
        block.items.splice(index, 1);
        render();
    }
}

// ============================================================================
// FUNCIONES DE GESTIÓN DE CITAS IEEE
// ============================================================================

/**
 * Actualiza el tipo de citación
 */
function updateCitationType(id, type) {
    const block = reportData.find(b => b.id === id);
    if (block && block.type === 'citations') {
        // No se usa en modo block; manejado por item
        render();
    }
}

/**
 * Actualiza un campo de la citación
 */
function updateCitation(id, field, value) {
    const block = reportData.find(b => b.id === id);
    if (block && block.type === 'citations') {
        // No se usa en modo block; manejado por item
        renderPreviewDebounced();
    }
}

// === NUEVAS FUNCIONES DE CITAS UNIFICADAS ===
function addCitationItem(blockId) {
    const block = reportData.find(b => b.id === blockId);
    if (!block || block.type !== 'citations') return;
    saveStateForUndo();
    if (!block.items) block.items = [];
    block.items.push({
        type: 'article',
        data: {
            authors: '', title: '', journal: '', volume: '', number: '', pages: '', year: '', doi: '', url: ''
        }
    });
    render();
}

function removeCitationItem(blockId, index) {
    const block = reportData.find(b => b.id === blockId);
    if (!block || block.type !== 'citations') return;
    saveStateForUndo();
    block.items.splice(index, 1);
    render();
}

function updateCitationItemType(blockId, index, type) {
    const block = reportData.find(b => b.id === blockId);
    if (!block || block.type !== 'citations') return;
    block.items[index].type = type;
    render();
}

function updateCitationItem(blockId, index, field, value) {
    const block = reportData.find(b => b.id === blockId);
    if (!block || block.type !== 'citations') return;
    if (!block.items[index].data) block.items[index].data = {};
    block.items[index].data[field] = value;
    renderPreviewDebounced();
}

// ============================================================================
// FUNCIONES DE GESTIÓN DE BIBLIOGRAFÍA BIBTEX
// ============================================================================

/**
 * Actualiza el tipo de entrada BibTeX
 */
function updateBibType(id, type) {
    const block = reportData.find(b => b.id === id);
    if (block && block.type === 'bibliography') {
        block.bibType = type;
        updateBibDatabase();
        render();
    }
}

/**
 * Actualiza la clave de la entrada BibTeX
 */
function updateBibKey(id, key) {
    const block = reportData.find(b => b.id === id);
    if (block && block.type === 'bibliography') {
        // Eliminar la entrada antigua si existía
        if (block.bibKey && bibDatabase[block.bibKey]) {
            delete bibDatabase[block.bibKey];
        }
        block.bibKey = key;
        updateBibDatabase();
        renderPreviewDebounced();
    }
}

/**
 * Actualiza un campo de la entrada BibTeX
 */
function updateBibData(id, field, value) {
    const block = reportData.find(b => b.id === id);
    if (block && block.bibData) {
        block.bibData[field] = value;
        updateBibDatabase();
        renderPreviewDebounced();
    }
}

/**
 * Actualiza la base de datos de bibliografía
 */
function updateBibDatabase() {
    bibDatabase = {};
    reportData.forEach(block => {
        if (block.type === 'bibliography' && block.bibKey) {
            bibDatabase[block.bibKey] = {
                type: block.bibType,
                ...block.bibData
            };
        }
    });
}

/**
 * Cambia el modo de citación
 */
function switchCitationMode(mode) {
    citationMode = mode;
    localStorage.setItem('citationMode', mode);
    updateBibDatabase();
    renderPreview();
    console.log(`Modo de citación cambiado a: ${mode}`);
}

/**
 * Exporta el archivo .bib
 */
function exportBibFile() {
    if (Object.keys(bibDatabase).length === 0) {
        alert('No hay entradas bibliográficas para exportar.');
        return;
    }
    
    let bibContent = '% BibTeX Bibliography File\n';
    bibContent += '% Generated by Generador de Reportes Académicos\n';
    bibContent += `% ${new Date().toLocaleDateString('es-ES')}\n\n`;
    
    reportData.forEach(block => {
        if (block.type === 'bibliography' && block.bibKey) {
            bibContent += generateBibTeXEntry(block);
            bibContent += '\n';
        }
    });
    
    const blob = new Blob([bibContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `bibliografia_${new Date().toISOString().split('T')[0]}.bib`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
    
    alert('¡Archivo .bib exportado exitosamente!');
}

/**
 * Genera una entrada BibTeX formateada
 */
function generateBibTeXEntry(block) {
    let entry = `@${block.bibType}{${block.bibKey},\n`;
    const data = block.bibData;
    
    const fields = {
        article: ['author', 'title', 'journal', 'year', 'volume', 'number', 'pages', 'doi'],
        book: ['author', 'title', 'publisher', 'year', 'address', 'edition'],
        inproceedings: ['author', 'title', 'booktitle', 'year', 'pages', 'organization', 'address'],
        online: ['author', 'title', 'url', 'year', 'note'],
        misc: ['author', 'title', 'howpublished', 'year', 'note']
    };
    
    const relevantFields = fields[block.bibType] || Object.keys(data);
    
    relevantFields.forEach(field => {
        if (data[field] && data[field].trim() !== '') {
            entry += `  ${field} = {${data[field]}},\n`;
        }
    });
    
    entry += '}\n';
    return entry;
}

// ============================================================================
// FUNCIONES DE GESTIÓN DE FÓRMULAS
// ============================================================================

/**
 * Actualiza el modo de visualización de la fórmula
 */
function updateFormulaDisplay(id, displayMode) {
    const block = reportData.find(b => b.id === id);
    if (block && block.type === 'formula') {
        block.display = displayMode;
        renderPreviewDebounced();
    }
}

// ============================================================================
// SISTEMA DE DESHACER/REHACER
// ============================================================================

/**
 * Guarda el estado actual para deshacer
 */
function saveStateForUndo() {
    const state = JSON.stringify(reportData);
    undoStack.push(state);
    
    // Limitar el tamaño del stack
    if (undoStack.length > MAX_UNDO_STACK) {
        undoStack.shift();
    }
    
    // Limpiar el redo stack cuando se hace un cambio nuevo
    redoStack = [];
}

/**
 * Deshace la última acción
 */
function undo() {
    if (undoStack.length === 0) {
        console.log('No hay acciones para deshacer');
        return;
    }
    
    // Guardar estado actual en redo
    const currentState = JSON.stringify(reportData);
    redoStack.push(currentState);
    
    // Restaurar estado anterior
    const previousState = undoStack.pop();
    reportData = JSON.parse(previousState);
    render();
    
    console.log('Acción deshecha');
}

/**
 * Rehace la última acción deshecha
 */
function redo() {
    if (redoStack.length === 0) {
        console.log('No hay acciones para rehacer');
        return;
    }
    
    // Guardar estado actual en undo
    const currentState = JSON.stringify(reportData);
    undoStack.push(currentState);
    
    // Restaurar estado siguiente
    const nextState = redoStack.pop();
    reportData = JSON.parse(nextState);
    render();
    
    console.log('Acción rehecha');
}

// ============================================================================
// SISTEMA DE CONTROL DE VERSIONES
// ============================================================================

/**
 * Guarda una versión del documento
 */
function saveVersion(description = '') {
    const version = {
        id: versionCounter++,
        timestamp: new Date().toISOString(),
        description: description || `Versión ${versionCounter - 1}`,
        data: JSON.stringify(reportData)
    };
    
    versionHistory.push(version);
    saveToLocalStorage(); // Guardar también las versiones
    
    console.log(`Versión guardada: ${version.description}`);
    return version;
}

/**
 * Restaura una versión específica
 */
function restoreVersion(versionId) {
    const version = versionHistory.find(v => v.id === versionId);
    if (!version) {
        alert('Versión no encontrada');
        return;
    }
    
    saveStateForUndo(); // Permitir deshacer la restauración
    reportData = JSON.parse(version.data);
    render();
    
    console.log(`Versión restaurada: ${version.description}`);
}

/**
 * Muestra el historial de versiones
 */
function showVersionHistory() {
    if (versionHistory.length === 0) {
        alert('No hay versiones guardadas aún.\n\nLas versiones se guardan automáticamente cada 5 minutos.');
        return;
    }
    
    let html = '<div style="max-width: 600px; margin: 20px auto; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">';
    html += '<h2 style="color: #333; margin-top: 0;">Historial de Versiones</h2>';
    html += '<p style="color: #666; font-size: 0.9em;">Haz clic en una versión para restaurarla.</p>';
    
    // Mostrar versiones más recientes primero
    const sortedVersions = [...versionHistory].reverse();
    
    sortedVersions.forEach(version => {
        const date = new Date(version.timestamp);
        const formattedDate = date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        html += `
            <div onclick="restoreVersion(${version.id}); closeVersionModal();" 
                 style="padding: 15px; margin: 10px 0; background: #f5f5f5; border-left: 4px solid var(--primary); cursor: pointer; border-radius: 4px; transition: background 0.2s;"
                 onmouseover="this.style.background='#e8e8e8'"
                 onmouseout="this.style.background='#f5f5f5'">
                <div style="font-weight: bold; color: #333;">${escapeHtml(version.description)}</div>
                <div style="font-size: 0.85em; color: #666; margin-top: 5px;">${formattedDate}</div>
            </div>
        `;
    });
    
    html += '<button onclick="closeVersionModal()" style="margin-top: 20px; padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">Cerrar</button>';
    html += '</div>';
    
    // Crear modal
    const modal = document.createElement('div');
    modal.id = 'version-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; overflow: auto; padding: 20px;';
    modal.innerHTML = html;
    document.body.appendChild(modal);
}

/**
 * Cierra el modal de versiones
 */
function closeVersionModal() {
    const modal = document.getElementById('version-modal');
    if (modal) {
        modal.remove();
    }
}

// ============================================================================
// SISTEMA DE AUTOGUARDADO
// ============================================================================

/**
 * Inicia el autoguardado
 */
function startAutosave() {
    // Guardar cada 30 segundos
    autosaveInterval = setInterval(() => {
        saveToLocalStorage();
        updateAutosaveStatus();
    }, 30000);
    
    // Guardar versión cada 5 minutos
    setInterval(() => {
        saveVersion(`Autoguardado - ${new Date().toLocaleTimeString('es-ES')}`);
    }, 300000);
}

/**
 * Actualiza el indicador de autoguardado
 */
function updateAutosaveStatus() {
    const status = document.getElementById('autosave-status');
    if (status) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        status.textContent = `Guardado: ${timeStr}`;
        lastSaveTime = now;
    }
}

// ============================================================================
// FUNCIONES DE RENDERIZADO
// ============================================================================

/**
 * Renderiza todo el editor y la vista previa
 */
function render() {
    renderEditor();
    
    // Si estamos en modo citations, renderizar solo citas en preview
    if (typeof currentLayout !== 'undefined' && currentLayout === 'citations') {
        if (typeof renderCitationsPreview === 'function') {
            renderCitationsPreview();
        } else {
            renderPreview();
        }
    } else {
        renderPreview();
    }
    
    // Actualizar estadísticas si la función existe
    if (typeof updateStatistics === 'function') {
        updateStatistics();
    }
    
    // Actualizar paneles según el layout actual
    if (typeof currentLayout !== 'undefined') {
        if (currentLayout === 'json-editor' && typeof loadJSONEditor === 'function') {
            loadJSONEditor();
        }
    }
}

/**
 * Renderiza solo el panel del editor (lado izquierdo)
 */
function renderEditor() {
    const editor = document.getElementById('editor-container');
    editor.innerHTML = ""; 

    reportData.forEach((block, index) => {
        const div = document.createElement('div');
        div.className = 'block-card-container';
        div.setAttribute('draggable', 'true');
        div.setAttribute('data-block-id', block.id);
        div.setAttribute('data-index', index);
        
        // Agregar clase si el bloque está pinned
        if (block.pinned === 'top') div.classList.add('pinned-top');
        if (block.pinned === 'bottom') div.classList.add('pinned-bottom');
        
        // Eventos de drag and drop
        div.addEventListener('dragstart', handleDragStart);
        div.addEventListener('dragend', handleDragEnd);
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('drop', handleDrop);
        div.addEventListener('dragleave', handleDragLeave);
        
        const dragHandle = `<div class="drag-handle" title="Arrastrar para mover"></div>`;
        
        // Botón de pin (top/bottom/none)
        const pinIcon = block.pinned === 'top' ? '📌' : (block.pinned === 'bottom' ? '📍' : '📍');
        const pinTitle = block.pinned === 'top' ? 'Anclado arriba - Click para anclar abajo' : 
                        (block.pinned === 'bottom' ? 'Anclado abajo - Click para desanclar' : 'Click para anclar arriba');
        const pinBtn = `<button class="pin-btn" onclick="togglePin(${block.id})" title="${pinTitle}">${pinIcon}</button>`;
        
        const deleteBtn = `<button class="delete-btn" onclick="deleteBlock(${block.id})" title="Eliminar bloque">&times;</button>`;
        let blockHTML = "";

        switch(block.type) {
            case 'header':
                blockHTML = renderHeaderEditor(block, deleteBtn);
                break;
            case 'title':
                blockHTML = renderTitleEditor(block, deleteBtn);
                break;
            case 'subtitle':
                blockHTML = renderSubtitleEditor(block, deleteBtn);
                break;
            case 'subsubtitle':
                blockHTML = renderSubsubtitleEditor(block, deleteBtn);
                break;
            case 'subtitle-italic':
                blockHTML = renderSubtitleItalicEditor(block, deleteBtn);
                break;
            case 'text':
                blockHTML = renderTextEditor(block, deleteBtn);
                break;
            case 'markdown':
                blockHTML = renderMarkdownEditor(block, deleteBtn);
                break;
            case 'code':
                blockHTML = renderCodeEditor(block, deleteBtn);
                break;
            case 'image':
                blockHTML = renderImageEditor(block, deleteBtn);
                break;
            case 'table':
                blockHTML = renderTableEditor(block, deleteBtn);
                break;
            case 'ref':
                blockHTML = renderRefEditor(block, deleteBtn);
                break;
            case 'citations':
                blockHTML = renderCitationsEditor(block, deleteBtn);
                break;
            case 'list':
                blockHTML = renderListEditor(block, deleteBtn);
                break;
            case 'numbered':
                blockHTML = renderNumberedListEditor(block, deleteBtn);
                break;
            case 'formula':
                blockHTML = renderFormulaEditor(block, deleteBtn);
                break;
            case 'mermaid':
                blockHTML = renderMermaidEditor(block, deleteBtn);
                break;
            case 'ai':
                blockHTML = renderAIEditor(block, deleteBtn);
                break;
            case 'bibliography':
                blockHTML = renderBibliographyEditor(block, deleteBtn);
                break;
            case 'divider':
                blockHTML = renderDividerEditor(block, deleteBtn);
                break;
        }

        div.innerHTML = dragHandle + pinBtn + blockHTML;
        editor.appendChild(div);
    });
    
    // Configurar event listeners para Markdown smart bullets después del render
    setupMarkdownBullets();
    
    // Inicializar auto-ajuste de altura para todos los textareas
    setTimeout(() => initAutoResizeTextareas(), 0);
}

/**
 * Renderiza el editor de encabezado (AHORA SEGURO)
 */
function renderHeaderEditor(block, deleteBtn) {
    const d = block.hData;
    return `
        <div class="block-card header-card">
            ${deleteBtn}
            <label>Datos del Alumno / Encabezado:</label>
            <div class="grid-inputs">
                <input type="text" placeholder="Nombre del Alumno" value="${escapeAttr(d.name)}" oninput="updateHeader(${block.id}, 'name', this.value)">
                <input type="text" placeholder="Grupo" value="${escapeAttr(d.group)}" oninput="updateHeader(${block.id}, 'group', this.value)">
                <input type="text" placeholder="Materia" value="${escapeAttr(d.subject)}" oninput="updateHeader(${block.id}, 'subject', this.value)">
                <input type="text" placeholder="Profesor" value="${escapeAttr(d.prof)}" oninput="updateHeader(${block.id}, 'prof', this.value)">
                <input type="text" placeholder="Institución" value="${escapeAttr(d.inst)}" oninput="updateHeader(${block.id}, 'inst', this.value)">
                <input type="text" placeholder="Cuatrimestre" value="${escapeAttr(d.term)}" oninput="updateHeader(${block.id}, 'term', this.value)">
                <input type="date" value="${escapeAttr(d.date)}" oninput="updateHeader(${block.id}, 'date', this.value)">
            </div>
        </div>`;
}

/**
 * Renderiza el editor de título (AHORA SEGURO)
 */
function renderTitleEditor(block, deleteBtn) {
    return `
        <div class="block-card title-card">
            ${deleteBtn}
            <label>Título Principal:</label>
            <input type="text" class="editor-input" value="${escapeAttr(block.content)}" placeholder="Ej. Reporte de Práctica 1" oninput="updateContent(${block.id}, this.value)">
        </div>`;
}

/**
 * Renderiza el editor de subtítulo (AHORA SEGURO)
 */
function renderSubtitleEditor(block, deleteBtn) {
    return `
        <div class="block-card subtitle-card">
            ${deleteBtn}
            <label>Subtítulo:</label>
            <input type="text" class="editor-input" value="${escapeAttr(block.content)}" placeholder="Ej. Introducción o Metodología" oninput="updateContent(${block.id}, this.value)">
        </div>`;
}

/**
 * Renderiza el editor de sub-subtítulo
 */
function renderSubsubtitleEditor(block, deleteBtn) {
    return `
        <div class="block-card subtitle-card">
            ${deleteBtn}
            <label>Sub-subtítulo:</label>
            <input type="text" class="editor-input" value="${escapeAttr(block.content)}" placeholder="Ej. Detalle de sección" oninput="updateContent(${block.id}, this.value)">
        </div>`;
}

/**
 * Renderiza el editor de subtítulo centrado en cursiva
 */
function renderSubtitleItalicEditor(block, deleteBtn) {
    return `
        <div class="block-card subtitle-card">
            ${deleteBtn}
            <label>Subtítulo centrado (cursiva):</label>
            <input type="text" class="editor-input" value="${escapeAttr(block.content)}" placeholder="Texto de subtítulo" oninput="updateContent(${block.id}, this.value)">
        </div>`;
}

/**
 * Renderiza el editor de texto (AHORA SEGURO)
 */
function renderTextEditor(block, deleteBtn) {
    return `
        <div class="block-card text-card">
            ${deleteBtn}
            <label>Párrafo de Texto:</label>
            <textarea class="editor-input" placeholder="Escribe tu texto aquí..." oninput="updateContent(${block.id}, this.value); autoResizeTextarea(this);">${escapeHtml(block.content)}</textarea>
        </div>`;
}

/**
 * Renderiza el editor de Markdown
 */
function renderMarkdownEditor(block, deleteBtn) {
    return `
        <div class="block-card markdown-card">
            ${deleteBtn}
            <label>Markdown:</label>
            <textarea 
                class="editor-input markdown-textarea" 
                data-block-id="${block.id}"
                placeholder="Escribe en Markdown. Ej: # Título, **negrita**, [link](url)..." 
                oninput="updateContent(${block.id}, this.value); autoResizeTextarea(this);" 
                style="font-family: monospace; min-height: 100px;">${escapeHtml(block.content)}</textarea>
            <p style="font-size: 0.85em; color: #666; margin-top: 5px;">
                💡 Soporta: # Títulos, **negrita**, *itálica*, [links](url), - listas (Tab/Enter), > citas
            </p>
        </div>`;
}

/**
 * Renderiza el editor de código (AHORA SEGURO)
 */
function renderCodeEditor(block, deleteBtn) {
    return `
        <div class="block-card code-card">
            ${deleteBtn}
            <label>Bloque de Código:</label>
            <textarea class="code-input" placeholder="Pega tu código aquí..." oninput="updateContent(${block.id}, this.value); autoResizeTextarea(this);">${escapeHtml(block.content)}</textarea>
        </div>`;
}

/**
 * Renderiza el editor de imagen (AHORA SEGURO)
 */
function renderImageEditor(block, deleteBtn) {
    return `
        <div class="block-card image-card">
            ${deleteBtn}
            <label>Imagen:</label>
            <input type="file" accept="image/*" onchange="handleImage(${block.id}, this)" style="margin-top: 10px;">
            <input type="text" class="editor-input" placeholder="Descripción de la imagen" value="${escapeAttr(block.caption || '')}" oninput="updateCaption(${block.id}, this.value)">
            ${block.content ? `<img src="${escapeAttr(block.content)}" style="max-width: 100%; margin-top: 10px; border-radius: 4px;">` : ''}
        </div>`;
}

/**
 * Renderiza el editor de tabla con grid visual
 */
function renderTableEditor(block, deleteBtn) {
    const cols = block.columns || 3;
    const tableData = block.tableData || [['', '', ''], ['', '', '']];
    
    // Generar grid de inputs
    let gridHTML = '';
    for (let row = 0; row < tableData.length; row++) {
        for (let col = 0; col < cols; col++) {
            const value = tableData[row] && tableData[row][col] !== undefined ? tableData[row][col] : '';
            const placeholder = row === 0 ? `Encabezado ${col + 1}` : `Fila ${row}, Col ${col + 1}`;
            gridHTML += `<input 
                type="text" 
                placeholder="${placeholder}" 
                value="${escapeAttr(value)}" 
                oninput="updateTableCell(${block.id}, ${row}, ${col}, this.value)"
            >`;
        }
    }
    
    return `
        <div class="block-card table-card">
            ${deleteBtn}
            <label>Tabla</label>
            
            <!-- Controles de la tabla -->
            <div class="table-controls">
                <label>Columnas:</label>
                <input 
                    type="number" 
                    min="1" 
                    max="6" 
                    value="${cols}" 
                    onchange="updateTableColumns(${block.id}, this.value)"
                >
                <button class="btn-add-row" onclick="addTableRow(${block.id})" title="Agregar fila">
                    ➕ Fila
                </button>
                <button class="btn-remove-row" onclick="removeTableRow(${block.id})" title="Eliminar última fila">
                    ➖ Fila
                </button>
            </div>
            
            <!-- Grid de la tabla -->
            <div class="table-grid" style="grid-template-columns: repeat(${cols}, 1fr);">
                ${gridHTML}
            </div>
            
            <!-- Descripción de la tabla -->
            <input 
                type="text" 
                class="editor-input" 
                placeholder="Descripción de la tabla" 
                value="${escapeAttr(block.caption || '')}" 
                oninput="updateTableCaption(${block.id}, this.value)"
            >
        </div>`;
}

/**
 * Renderiza el editor de referencia (AHORA SEGURO)
 */
function renderRefEditor(block, deleteBtn) {
    const r = block.refData || {};
    return `
        <div class="block-card ref-card">
            ${deleteBtn}
            <label>Referencia Bibliográfica (IEEE):</label>
            <select onchange="updateRefType(${block.id}, this.value)" style="margin-top: 10px; padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                <option value="web" ${block.refType === 'web' ? 'selected' : ''}>Página Web</option>
                <option value="book" ${block.refType === 'book' ? 'selected' : ''}>Libro</option>
                <option value="article" ${block.refType === 'article' ? 'selected' : ''}>Artículo</option>
            </select>
            <input type="text" class="editor-input" placeholder="Autor(es)" value="${escapeAttr(r.author)}" oninput="updateRef(${block.id}, 'author', this.value)">
            <input type="text" class="editor-input" placeholder="Título" value="${escapeAttr(r.title)}" oninput="updateRef(${block.id}, 'title', this.value)">
            <input type="text" class="editor-input" placeholder="${block.refType === 'book' ? 'Editorial' : 'Fuente/Revista'}" value="${escapeAttr(r.source)}" oninput="updateRef(${block.id}, 'source', this.value)">
            <input type="text" class="editor-input" placeholder="Año" value="${escapeAttr(r.year)}" oninput="updateRef(${block.id}, 'year', this.value)">
            ${block.refType === 'web' ? `<input type="url" class="editor-input" placeholder="URL completa" value="${escapeAttr(r.url)}" oninput="updateRef(${block.id}, 'url', this.value)">` : ''}
        </div>`;
}

/**
 * Renderiza el editor de cita IEEE
 */
function renderCitationsEditor(block, deleteBtn) {
    const items = block.items || [];
    let itemsHTML = items.map((item, index) => {
        const c = item.data || {};
        return `
            <div style="border:1px solid #eee; padding:10px; border-radius:6px; margin-bottom:12px;">
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
                    <strong style="color:var(--primary)">[${index + 1}]</strong>
                    <select onchange="updateCitationItemType(${block.id}, ${index}, this.value)" style="flex:1; padding: 8px; border-radius: 4px; border: 1px solid #ddd; max-width:340px;">
                        <option value="article" ${item.type === 'article' ? 'selected' : ''}>Artículo de revista</option>
                        <option value="book" ${item.type === 'book' ? 'selected' : ''}>Libro</option>
                        <option value="conference" ${item.type === 'conference' ? 'selected' : ''}>Conferencia</option>
                        <option value="web" ${item.type === 'web' ? 'selected' : ''}>Página web</option>
                    </select>
                    <button onclick="removeCitationItem(${block.id}, ${index})" style="padding:6px 10px; background:#dc3545; color:white; border:none; border-radius:4px; cursor:pointer;">✕</button>
                </div>
                <input type="text" class="editor-input" placeholder="Autor(es) - Ej: J. Smith, M. Doe" value="${escapeAttr(c.authors || '')}" oninput="updateCitationItem(${block.id}, ${index}, 'authors', this.value)">
                <input type="text" class="editor-input" placeholder="Título del artículo/libro" value="${escapeAttr(c.title || '')}" oninput="updateCitationItem(${block.id}, ${index}, 'title', this.value)">
                ${(item.type === 'article' || item.type === 'conference') ? `
                    <input type="text" class="editor-input" placeholder="Nombre de la revista/conferencia" value="${escapeAttr(c.journal || '')}" oninput="updateCitationItem(${block.id}, ${index}, 'journal', this.value)">
                    <input type="text" class="editor-input" placeholder="Volumen" value="${escapeAttr(c.volume || '')}" oninput="updateCitationItem(${block.id}, ${index}, 'volume', this.value)">
                    <input type="text" class="editor-input" placeholder="Número" value="${escapeAttr(c.number || '')}" oninput="updateCitationItem(${block.id}, ${index}, 'number', this.value)">
                    <input type="text" class="editor-input" placeholder="Páginas (Ej: 123-145)" value="${escapeAttr(c.pages || '')}" oninput="updateCitationItem(${block.id}, ${index}, 'pages', this.value)">
                ` : ''}
                <input type="text" class="editor-input" placeholder="Año" value="${escapeAttr(c.year || '')}" oninput="updateCitationItem(${block.id}, ${index}, 'year', this.value)">
                ${item.type === 'web' ? `
                    <input type="url" class="editor-input" placeholder="URL" value="${escapeAttr(c.url || '')}" oninput="updateCitationItem(${block.id}, ${index}, 'url', this.value)">
                ` : ''}
                ${(item.type === 'article' || item.type === 'book') ? `
                    <input type="url" class="editor-input" placeholder="URL (opcional)" value="${escapeAttr(c.url || '')}" oninput="updateCitationItem(${block.id}, ${index}, 'url', this.value)">
                ` : ''}
                <input type="text" class="editor-input" placeholder="DOI (opcional)" value="${escapeAttr(c.doi || '')}" oninput="updateCitationItem(${block.id}, ${index}, 'doi', this.value)">
            </div>
        `;
    }).join('');

    return `
        <div class="block-card citation-card">
            ${deleteBtn}
            <label>Citas IEEE (bloque único):</label>
            <div style="margin-top:10px;">
                ${itemsHTML}
            </div>
            <button onclick="addCitationItem(${block.id})" style="margin-top:10px; padding:8px 15px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">
                ➕ Agregar cita
            </button>
        </div>`;
}

/**
 * Renderiza el editor de entrada bibliográfica BibTeX
 */
function renderBibliographyEditor(block, deleteBtn) {
    const b = block.bibData || {};
    const bibType = block.bibType || 'article';
    
    // Definir campos por tipo de entrada
    const fieldsByType = {
        article: [
            { name: 'author', label: 'Autor(es)', placeholder: 'Smith, J. and Doe, M.' },
            { name: 'title', label: 'Título', placeholder: 'Title of the Article' },
            { name: 'journal', label: 'Revista', placeholder: 'Journal Name' },
            { name: 'year', label: 'Año', placeholder: '2024' },
            { name: 'volume', label: 'Volumen', placeholder: '10' },
            { name: 'number', label: 'Número', placeholder: '3' },
            { name: 'pages', label: 'Páginas', placeholder: '123--145' },
            { name: 'doi', label: 'DOI', placeholder: '10.1234/example' }
        ],
        book: [
            { name: 'author', label: 'Autor(es)', placeholder: 'Smith, John' },
            { name: 'title', label: 'Título', placeholder: 'Book Title' },
            { name: 'publisher', label: 'Editorial', placeholder: 'Publisher Name' },
            { name: 'year', label: 'Año', placeholder: '2024' },
            { name: 'address', label: 'Dirección', placeholder: 'City, Country' },
            { name: 'edition', label: 'Edición', placeholder: '2nd' }
        ],
        inproceedings: [
            { name: 'author', label: 'Autor(es)', placeholder: 'Smith, J.' },
            { name: 'title', label: 'Título', placeholder: 'Paper Title' },
            { name: 'booktitle', label: 'Conferencia', placeholder: 'Conference Name' },
            { name: 'year', label: 'Año', placeholder: '2024' },
            { name: 'pages', label: 'Páginas', placeholder: '1--10' },
            { name: 'organization', label: 'Organización', placeholder: 'IEEE' },
            { name: 'address', label: 'Lugar', placeholder: 'City, Country' },
            { name: 'url', label: 'URL', placeholder: 'https://example.com/paper.pdf' }
        ],
        online: [
            { name: 'author', label: 'Autor(es)', placeholder: 'Smith, John' },
            { name: 'title', label: 'Título', placeholder: 'Web Page Title' },
            { name: 'url', label: 'URL', placeholder: 'https://example.com' },
            { name: 'year', label: 'Año', placeholder: '2024' },
            { name: 'note', label: 'Nota', placeholder: 'Accessed: 2024-01-31' }
        ],
        misc: [
            { name: 'author', label: 'Autor(es)', placeholder: 'Author Name' },
            { name: 'title', label: 'Título', placeholder: 'Title' },
            { name: 'howpublished', label: 'Cómo se publicó', placeholder: 'Technical Report' },
            { name: 'year', label: 'Año', placeholder: '2024' },
            { name: 'note', label: 'Nota', placeholder: 'Additional information' }
        ]
    };
    
    const fields = fieldsByType[bibType] || fieldsByType.article;
    
    let fieldsHTML = fields.map(field => `
        <input type="text" 
            class="editor-input" 
            placeholder="${field.label}: ${field.placeholder}" 
            value="${escapeAttr(b[field.name] || '')}" 
            oninput="updateBibData(${block.id}, '${field.name}', this.value)">
    `).join('');
    
    return `
        <div class="block-card citation-card" style="border-left-color: #9b59b6;">
            ${deleteBtn}
            <label>📚 Entrada Bibliográfica BibTeX:</label>
            <div style="display:flex; gap:8px; align-items:center; margin:6px 0 10px 0;">
                <label style="font-size:0.85em; opacity:0.8;">Vista previa:</label>
                <button onclick="toggleBibPreview(${block.id}, true)" style="padding:4px 8px;">Contraer</button>
                <button onclick="toggleBibPreview(${block.id}, false)" style="padding:4px 8px;">Expandir</button>
            </div>
            
            <div style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                <label style="display: block; margin-bottom: 5px; font-size: 0.9em; font-weight: 600;">Clave de citación:</label>
                <input type="text" 
                    class="editor-input" 
                    placeholder="Ej: smith2024, garcia2023web" 
                    value="${escapeAttr(block.bibKey || '')}" 
                    oninput="updateBibKey(${block.id}, this.value)"
                    style="font-family: monospace; background: white;">
                <small style="color: #666; display: block; margin-top: 5px;">
                    💡 Usa esta clave en el texto como: <code>[smith2024]</code>
                </small>
            </div>
            
            <label style="display: block; margin: 10px 0 5px 0; font-size: 0.9em; font-weight: 600;">Tipo de entrada:</label>
            <select onchange="updateBibType(${block.id}, this.value)" style="margin-bottom: 10px; padding: 8px; border-radius: 4px; border: 1px solid #ddd; width: 100%;">
                <option value="article" ${bibType === 'article' ? 'selected' : ''}>@article (Artículo de revista)</option>
                <option value="book" ${bibType === 'book' ? 'selected' : ''}>@book (Libro)</option>
                <option value="inproceedings" ${bibType === 'inproceedings' ? 'selected' : ''}>@inproceedings (Conferencia)</option>
                <option value="online" ${bibType === 'online' ? 'selected' : ''}>@online (Recurso web)</option>
                <option value="misc" ${bibType === 'misc' ? 'selected' : ''}>@misc (Otros)</option>
            </select>
            
            <label style="display: block; margin: 10px 0 5px 0; font-size: 0.9em; font-weight: 600;">Campos:</label>
            ${fieldsHTML}
        </div>`;
}

function toggleBibPreview(id, collapse) {
    const block = reportData.find(b => b.id === id);
    if (!block) return;
    block._bibCollapsed = collapse ? true : false;
    renderPreview();
}

/**
 * Renderiza el editor de lista con viñetas
 */
function renderListEditor(block, deleteBtn) {
    const items = block.items || [''];
    let itemsHTML = items.map((item, index) => `
        <div style="display: flex; gap: 10px; margin-bottom: 8px;">
            <input type="text" class="editor-input" placeholder="Elemento ${index + 1}" 
                value="${escapeAttr(item)}" 
                oninput="updateListItem(${block.id}, ${index}, this.value)"
                style="flex: 1;">
            ${items.length > 1 ? `<button onclick="removeListItem(${block.id}, ${index})" style="padding: 5px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">✕</button>` : ''}
        </div>
    `).join('');
    
    return `
        <div class="block-card list-card">
            ${deleteBtn}
            <label>Lista con viñetas:</label>
            <div style="margin-top: 10px;">
                ${itemsHTML}
            </div>
            <button onclick="addListItem(${block.id})" style="margin-top: 10px; padding: 8px 15px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">
                ➕ Agregar elemento
            </button>
        </div>`;
}

/**
 * Renderiza el editor de lista numerada
 */
function renderNumberedListEditor(block, deleteBtn) {
    const items = block.items || [''];
    let itemsHTML = items.map((item, index) => `
        <div style="display: flex; gap: 10px; margin-bottom: 8px;">
            <span style="min-width: 30px; font-weight: bold; color: var(--primary);">${index + 1}.</span>
            <input type="text" class="editor-input" placeholder="Elemento ${index + 1}" 
                value="${escapeAttr(item)}" 
                oninput="updateListItem(${block.id}, ${index}, this.value)"
                style="flex: 1;">
            ${items.length > 1 ? `<button onclick="removeListItem(${block.id}, ${index})" style="padding: 5px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">✕</button>` : ''}
        </div>
    `).join('');
    
    return `
        <div class="block-card list-card">
            ${deleteBtn}
            <label>Lista numerada:</label>
            <div style="margin-top: 10px;">
                ${itemsHTML}
            </div>
            <button onclick="addListItem(${block.id})" style="margin-top: 10px; padding: 8px 15px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">
                ➕ Agregar elemento
            </button>
        </div>`;
}

/**
 * Renderiza el editor de fórmula LaTeX
 */
function renderFormulaEditor(block, deleteBtn) {
    return `
        <div class="block-card formula-card">
            ${deleteBtn}
            <label>Fórmula LaTeX:</label>
            <div style="margin-top: 10px; margin-bottom: 10px;">
                <label style="margin-right: 20px; cursor: pointer;">
                    <input type="radio" name="display_${block.id}" value="block"
                        ${block.display === 'block' ? 'checked' : ''}
                        onchange="updateFormulaDisplay(${block.id}, 'block')">
                    Bloque
                </label>
                <label style="cursor: pointer;">
                    <input type="radio" name="display_${block.id}" value="inline"
                        ${block.display === 'inline' ? 'checked' : ''}
                        onchange="updateFormulaDisplay(${block.id}, 'inline')">
                    En línea
                </label>
            </div>
            <textarea class="editor-input" placeholder="Ej: E = mc^2 o \\frac{a}{b}" 
                oninput="updateContent(${block.id}, this.value); autoResizeTextarea(this);"
                style="font-family: monospace; min-height: 80px;">${escapeHtml(block.content)}</textarea>
            <p style="font-size: 0.85em; color: #666; margin-top: 5px;">
                💡 Usa sintaxis LaTeX. Ejemplos: x^2, \\frac{a}{b}, \\sqrt{x}, \\sum_{i=1}^{n}
            </p>
        </div>`;
}

/**
 * Renderiza el editor de diagrama Mermaid
 */
function renderMermaidEditor(block, deleteBtn) {
    return `
        <div class="block-card mermaid-card">
            ${deleteBtn}
            <label>Diagrama Mermaid:</label>
            <textarea class="editor-input" placeholder="Código Mermaid..."
                oninput="updateContent(${block.id}, this.value); autoResizeTextarea(this);"
                style="font-family: monospace; min-height: 150px;">${escapeHtml(block.content)}</textarea>
            <p style="font-size: 0.85em; color: #666; margin-top: 5px;">
                💡 <a href="https://mermaid.js.org/intro/" target="_blank" style="color: var(--primary);">Documentación de Mermaid</a>
            </p>
        </div>`;
}

/**
 * Editor para divisor de sección
 */
function renderDividerEditor(block, deleteBtn) {
    const style = block.style || 'solid';
    return `
        <div class="block-card table-card">
            ${deleteBtn}
            <label>Divisor de sección:</label>
            <select onchange="updateDividerStyle(${block.id}, this.value)" style="margin-top:8px; padding:8px; border-radius:4px; border:1px solid #ddd;">
                <option value="solid" ${style==='solid'?'selected':''}>Línea sólida</option>
                <option value="dashed" ${style==='dashed'?'selected':''}>Línea discontinua</option>
                <option value="dotted" ${style==='dotted'?'selected':''}>Línea punteada</option>
            </select>
            <div style="margin-top:10px;">
                <hr class="p-divider ${escapeAttr(style)}">
            </div>
        </div>`;
}

function updateDividerStyle(id, value) {
    const block = reportData.find(b => b.id === id);
    if (!block) return;
    saveStateForUndo();
    block.style = value;
    render();
}

/**
 * Renderiza el editor de declaración de uso de IA
 */
function renderAIEditor(block, deleteBtn) {
    const ai = block.aiData || {};
    
    // Obtener el nombre del estudiante del header si existe
    const headerBlock = reportData.find(b => b.type === 'header');
    const studentName = headerBlock && headerBlock.hData ? headerBlock.hData.name : '';
    
    return `
        <div class="block-card ai-card">
            ${deleteBtn}
            <label><strong>Declaración de Uso de Inteligencia Artificial</strong></label>

			<div style="margin-top: 15px;">
                <label>¿Utilizaste IA para este trabajo?</label>
                <div style="margin-top: 8px;">
                    <label style="margin-right: 20px; cursor: pointer;">
                        <input type="radio" name="aiUsed_${block.id}" value="no"
                            ${block.aiUsed === 'no' ? 'checked' : ''}
                            onchange="updateAIUsed(${block.id}, 'no')">
                        No
                    </label>
                    <label style="cursor: pointer;">
                        <input type="radio" name="aiUsed_${block.id}" value="yes"
                            ${block.aiUsed === 'yes' ? 'checked' : ''}
                            onchange="updateAIUsed(${block.id}, 'yes')">
                        Sí
                    </label>
                </div>
            </div>
            
            ${block.aiUsed === 'no' ? `
                <div style="margin-top: 15px; padding: 15px; background: #e8f8f5; border-radius: 5px;">
                    <p style="margin: 0 0 10px 0; font-size: 0.9em; color: #555;">
                        <strong>Nombre del estudiante que declara:</strong>
                    </p>
                    <input type="text" class="editor-input" placeholder="Nombre completo del estudiante"
                        value="${escapeAttr(ai.name)}"
                        oninput="updateAI(${block.id}, 'name', this.value)">
                </div>
            ` : ''}
            
            ${block.aiUsed === 'yes' ? `
                <div style="margin-top: 15px; padding: 15px; background: #fff3cd; border-radius: 5px;">
            
                    <p style="margin: 0 0 10px 0; font-size: 0.9em; color: #555;">
                        <strong>Completa los siguientes campos para cada uso de IA:</strong>
                    </p>
                    <input type="text" class="editor-input" placeholder="Nombre del estudiante" value="${escapeAttr(ai.name)}" oninput="updateAI(${block.id}, 'name', this.value)">
                    <input type="text" class="editor-input" placeholder="IA utilizada (ej. ChatGPT, Claude, Gemini)" value="${escapeAttr(ai.aiTool)}" oninput="updateAI(${block.id}, 'aiTool', this.value)">
                    <input type="date" class="editor-input" placeholder="Fecha de uso" value="${escapeAttr(ai.date)}" oninput="updateAI(${block.id}, 'date', this.value)">
                    <input type="text" class="editor-input" placeholder="Propósito (ej. depuración, investigación, redacción)" value="${escapeAttr(ai.purpose)}" oninput="updateAI(${block.id}, 'purpose', this.value)">
                    <textarea class="editor-input" placeholder="Prompt utilizado" oninput="updateAI(${block.id}, 'prompt', this.value); autoResizeTextarea(this);">${escapeHtml(ai.prompt)}</textarea>
                    <input type="text" class="editor-input" placeholder="Archivos adjuntos suministrados (ej. reporte.docx, libro.pdf, www.link.com)" value="${escapeAttr(ai.attachments)}" oninput="updateAI(${block.id}, 'attachments', this.value)">
                    <textarea class="editor-input" placeholder="Respuesta en crudo (raw response)" style="min-height: 120px;" oninput="updateAI(${block.id}, 'rawResponse', this.value); autoResizeTextarea(this);">${escapeHtml(ai.rawResponse)}</textarea>
                </div>
            ` : ''}
        </div>`;
}

/**
 * Renderiza solo la vista previa (lado derecho)
 */
function renderPreview() {
    const preview = document.getElementById('preview-container');
    let figureCounter = 0;
    let tableCounter = 0;  // Contador para tablas
    let refCounter = 0;

    preview.innerHTML = reportData.map(block => {
        switch(block.type) {
            case 'title':
                return `<h1 class="p-title">${escapeHtml(block.content)}</h1>`;
            
            case 'subtitle':
                return `<h2 class="p-subtitle">${escapeHtml(block.content)}</h2>`;
            
            case 'subsubtitle':
                return `<h3 class="p-subsubtitle">${escapeHtml(block.content)}</h3>`;
            
            case 'subtitle-italic':
                return `<h2 class="p-subtitle-italic">${escapeHtml(block.content)}</h2>`;
            
            case 'text':
                return renderTextWithEnumerations(block.content);
            
            case 'markdown':
                return `<div class="p-markdown">${processCitations(markdownToHtml(block.content))}</div>`;
            
            case 'image':
                figureCounter++;
                return `
                    <div class="preview-image-container">
                        ${block.content ? `<img src="${escapeAttr(block.content)}" alt="Figura ${figureCounter}">` : '<div class="placeholder">Imagen no seleccionada</div>'}
                        <p class="figure-caption"><strong>Figura ${figureCounter}:</strong> <em>${escapeHtml(block.caption || '')}</em></p>
                    </div>`;
            
            case 'table':
                tableCounter++;
                if (!block.tableData || block.tableData.length === 0) return '';
                
                // Generar HTML de la tabla
                let tableHTML = '<table><thead><tr>';
                
                // Encabezados (primera fila)
                const headers = block.tableData[0] || [];
                headers.forEach(cell => {
                    tableHTML += `<th>${escapeHtml(cell)}</th>`;
                });
                tableHTML += '</tr></thead><tbody>';
                
                // Filas de datos (resto de filas)
                for (let i = 1; i < block.tableData.length; i++) {
                    tableHTML += '<tr>';
                    const row = block.tableData[i] || [];
                    row.forEach(cell => {
                        tableHTML += `<td>${escapeHtml(cell)}</td>`;
                    });
                    tableHTML += '</tr>';
                }
                
                tableHTML += '</tbody></table>';
                
                return `
                    <div class="preview-table-container">
                        ${tableHTML}
                        <p class="table-caption"><strong>Tabla ${tableCounter}:</strong> <em>${escapeHtml(block.caption || '')}</em></p>
                    </div>`;
            
            case 'code':
                return `<pre class="code-preview"><code>${escapeHtml(block.content)}</code></pre>`;
            
            case 'header':
                if (!block.hData) return '';
                const d = block.hData;
                // Detectar si hay múltiples alumnos (por comas)
                const hasMultipleStudents = d.name && d.name.includes(',');
                const studentLabel = hasMultipleStudents ? 'Alumnos:' : 'Alumno:';
                return `
                    <div class="p-header">
                        <p><strong>Institución:</strong> ${escapeHtml(d.inst)}</p>
                        <p><strong>Materia:</strong> ${escapeHtml(d.subject)} ${d.term ? `(${escapeHtml(d.term)}° Cuatrimestre)` : ''}</p>
                        <p><strong>Profesor:</strong> ${escapeHtml(d.prof)}</p>
                        <p><strong>${studentLabel}</strong> ${escapeHtml(d.name)} ${d.group ? `| <strong>Grupo:</strong> ${escapeHtml(d.group)}` : ''}</p>
                        <p><strong>Fecha:</strong> ${escapeHtml(d.date)}</p>
                        <hr>
                    </div>`;
            
            case 'ref':
                if (!block.refData) return '';
                refCounter++;
                const { author, title, source, year, url } = block.refData;
                let refText = formatIEEEReference(block.refType, author, title, source, year, url);
                return `
                    <div class="p-ref-ieee">
                        <div class="ref-num">[${refCounter}]</div>
                        <div class="ref-content">${refText}</div>
                    </div>`;
            
            case 'ai':
                if (!block.aiData) return '';
                const ai = block.aiData;
                
                // Obtener el nombre del estudiante del header
                const headerBlock = reportData.find(b => b.type === 'header');
                const studentName = headerBlock && headerBlock.hData ? headerBlock.hData.name : '[Nombre del estudiante]';

				if (block.aiUsed === 'no') {
                    // Usar el nombre ingresado en el bloque, o el del header como fallback
                    const declarantName = ai.name || studentName;
                
                    return `
                        <div class="p-ai-declaration">
                            <p class="p-text" style="text-align: justify;">
                                Yo, <strong>${escapeHtml(declarantName)}</strong>, declaro que <strong>NO</strong> he utilizado herramientas de Inteligencia Artificial para la elaboración de este trabajo académico.
                                Afirmo que cuento con evidencias físicas y/o digitales que demuestran mi autoría, incluyendo pero no limitándose a:
                                documentos manuscritos, materiales impresos con anotaciones o subrayado, historial de versiones de documentos electrónicos, o commits en repositorios de código.
                                <br><br>
                                Reconozco y acepto que el profesor se reserva el derecho de solicitar dichas evidencias en cualquier momento,
                                especialmente cuando existan sospechas o se detecten conductas que atenten contra la integridad académica,
                                tales como plagio o uso no reportado de herramientas de IA.
                            </p>
                        </div>`;
                } else {
                    return `
                        <div class="p-ai-declaration">
                            <div style="margin: 20px 0;">
                                <p style="margin: 5px 0;"><strong>Nombre del estudiante:</strong> ${escapeHtml(ai.name || studentName)}</p>
                                <p style="margin: 5px 0;"><strong>IA utilizada:</strong> ${escapeHtml(ai.aiTool)}</p>
                                <p style="margin: 5px 0;"><strong>Fecha de uso:</strong> ${escapeHtml(ai.date)}</p>
                                <p style="margin: 5px 0;"><strong>Propósito:</strong> ${escapeHtml(ai.purpose)}</p>
                                
                                <p style="margin: 15px 0 5px 0;"><strong>Prompt utilizado:</strong></p>
                                <pre style="background: #f4f4f4; padding: 10px; border-radius: 4px; white-space: pre-wrap; font-size: 0.9em;">${escapeHtml(ai.prompt)}</pre>
                                
                                ${ai.attachments ? `<p style="margin: 10px 0 5px 0;"><strong>Archivos suministrados:</strong> ${escapeHtml(ai.attachments)}</p>` : ''}
                                
                                <p style="margin: 15px 0 5px 0;"><strong>Respuesta en crudo (raw):</strong></p>
                                <pre style="background: #f4f4f4; padding: 10px; border-radius: 4px; white-space: pre-wrap; font-size: 0.85em; max-height: 300px; overflow-y: auto;">${escapeHtml(ai.rawResponse)}</pre>
                            </div>
                        </div>`;
                }
            
            case 'list':
                if (!block.items || block.items.length === 0) return '';
                return `
                    <ul class="p-list">
                        ${block.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>`;

            case 'numbered':
                if (!block.items || block.items.length === 0) return '';
                return `
                    <ol class="p-list">
                        ${block.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ol>`;

            case 'citations':
                if (!block.items || block.items.length === 0) return '';
                return block.items.map(item => {
                    const c = item.data || {};
                    const citationText = formatIEEECitation(item.type, c);
                    refCounter++;
                    return `
                        <div class="p-ref-ieee">
                            <div class="ref-num">[${refCounter}]</div>
                            <div class="ref-content">${citationText}</div>
                        </div>`;
                }).join('');

            case 'divider':
                const style = block.style || 'solid';
                return `<hr class="p-divider ${escapeAttr(style)}">`;
            
            case 'bibliography':
                if (citationMode !== 'bibtex' || !block.bibKey) return '';
                const bib = block.bibData || {};
                const bibText = formatBibTeXCitation(block.bibType, bib);
                const summaryLabel = `[${escapeHtml(block.bibKey)}] ${escapeHtml(bib.title || '(sin título)')}`;
                // Usar <details> para colapsar/expandir
                const openAttr = block._bibCollapsed ? '' : ' open';
                return `
                    <details class="bib-entry" id="bib-${escapeAttr(block.bibKey)}"${openAttr}>
                        <summary class="bib-summary">${summaryLabel}</summary>
                        <div class="p-ref-ieee">
                            <div class="ref-num">[${escapeHtml(block.bibKey)}]</div>
                            <div class="ref-content">${bibText}</div>
                        </div>
                    </details>`;

            case 'formula':
                if (!block.content) return '';
                const formulaId = `formula-${block.id}`;
                const displayMode = block.display === 'block';
                // Renderizar fórmula usando KaTeX
                setTimeout(() => {
                    const elem = document.getElementById(formulaId);
                    if (elem && window.katex) {
                        try {
                            katex.render(block.content, elem, {
                                displayMode: displayMode,
                                throwOnError: false
                            });
                        } catch (e) {
                            elem.textContent = 'Error en fórmula: ' + e.message;
                            elem.style.color = 'red';
                        }
                    }
                }, 100);
                return `<div id="${formulaId}" class="p-formula ${displayMode ? 'formula-block' : 'formula-inline'}"></div>`;

            case 'mermaid':
                if (!block.content) return '';
                const mermaidId = `mermaid-${block.id}`;
                // Renderizar diagrama Mermaid
                setTimeout(async () => {
                    const elem = document.getElementById(mermaidId);
                    if (elem && window.mermaid) {
                        try {
                            // Limpiar el elemento antes de renderizar
                            elem.innerHTML = '';
                            // Inicializar mermaid si no está inicializado
                            if (!window.mermaidInitialized) {
                                await window.mermaid.initialize({ 
                                    startOnLoad: false, 
                                    theme: 'default',
                                    securityLevel: 'loose'
                                });
                                window.mermaidInitialized = true;
                            }
                            const { svg } = await window.mermaid.render(`diagram-${block.id}-${Date.now()}`, block.content);
                            elem.innerHTML = svg;
                        } catch (e) {
                            console.error('Error en Mermaid:', e);
                            elem.innerHTML = `<div style="color: red; padding: 10px; border: 1px solid red; border-radius: 4px;">Error en diagrama Mermaid: ${escapeHtml(e.message)}<br><small>Verifica la sintaxis del diagrama</small></div>`;
                        }
                    } else if (!window.mermaid) {
                        elem.innerHTML = `<div style="color: orange; padding: 10px; border: 1px solid orange; border-radius: 4px;">⚠️ Mermaid no está disponible. Verifica tu conexión a internet.</div>`;
                    }
                }, 100);
                return `<div id="${mermaidId}" class="p-mermaid"></div>`;
            
            default:
                return "";
        }
    }).join('');
}

// ============================================================================
// FUNCIONES DE EXPORTACIÓN
// ============================================================================

/**
 * Exporta el reporte como archivo de texto plano
 */
function exportTXT() {
    let textContent = "";
    let figureCount = 0;
    let tableCount = 0;  // Contador de tablas
    let refCount = 0;

    textContent += "=".repeat(60) + "\n";
    textContent += "REPORTE ACADÉMICO - EXPORTACIÓN TXT\n";
    textContent += "=".repeat(60) + "\n\n";

    reportData.forEach(block => {
        switch(block.type) {
            case 'header':
                if (block.hData) {
                    const d = block.hData;
                    textContent += `DATOS DEL ESTUDIANTE\n`;
                    textContent += `-`.repeat(40) + "\n";
                    textContent += `Institución: ${d.inst}\n`;
                    textContent += `Materia: ${d.subject} (${d.term}° Cuatrimestre)\n`;
                    textContent += `Profesor: ${d.prof}\n`;
                    textContent += `Alumno: ${d.name} | Grupo: ${d.group}\n`;
                    textContent += `Fecha: ${d.date}\n`;
                    textContent += `\n`;
                }
                break;
            
            case 'title':
                textContent += `\n${"=".repeat(60)}\n`;
                textContent += `${block.content.toUpperCase()}\n`;
                textContent += `${"=".repeat(60)}\n\n`;
                break;
            
            case 'subtitle':
                textContent += `\n${"-".repeat(40)}\n`;
                textContent += `${block.content}\n`;
                textContent += `${"-".repeat(40)}\n\n`;
                break;
            
            case 'text':
                textContent += `${block.content}\n\n`;
                break;

            case 'markdown':
                textContent += `\n[MARKDOWN]\n`;
                textContent += `${block.content}\n\n`;
                break;
            
            case 'code':
                textContent += `\n[INICIO DE CÓDIGO]\n`;
                textContent += `${"-".repeat(40)}\n`;
                textContent += `${block.content}\n`;
                textContent += `${"-".repeat(40)}\n`;
                textContent += `[FIN DE CÓDIGO]\n\n`;
                break;
            
            case 'image':
                figureCount++;
                textContent += `\n[FIGURA ${figureCount}]\n`;
                textContent += `Descripción: ${block.caption || 'Sin descripción'}\n`;
                textContent += `(La imagen no puede ser exportada a formato TXT)\n\n`;
                break;
            
            case 'table':
                tableCount++;
                textContent += `\n[TABLA ${tableCount}]\n`;
                textContent += `${"-".repeat(60)}\n`;
                
				if (block.tableData && block.tableData.length > 0) {
                    const cols = block.columns || block.tableData[0].length;
                    const colWidths = [];
                    const MAX_COL_WIDTH = 30;
                
                    // 1. Calcular anchos de columna
                    for (let col = 0; col < cols; col++) {
                        let maxWidth = 10;
                        for (let row = 0; row < block.tableData.length; row++) {
                            const cellContent = String(block.tableData[row][col] || '');
                            // Si el texto es corto, usamos su longitud; si es largo, limitamos a MAX_COL_WIDTH
                            maxWidth = Math.max(maxWidth, Math.min(cellContent.length, MAX_COL_WIDTH));
                        }
                        colWidths.push(maxWidth);
                    }
                
                    // Función auxiliar para dividir texto en fragmentos (Word Wrap)
                    const wrapText = (text, width) => {
                        const lines = [];
                        const str = String(text || '');
                        for (let i = 0; i < str.length; i += width) {
                            lines.push(str.substring(i, i + width));
                        }
                        return lines.length > 0 ? lines : [''];
                    };
                
                    // Función para rellenar con espacios
                    const pad = (str, width) => {
                        return str + ' '.repeat(Math.max(0, width - str.length));
                    };
                
                    // 2. Renderizar cada fila del tableData
                    for (let row = 0; row < block.tableData.length; row++) {
                        // Convertimos cada celda de esta fila en un array de líneas envueltas
                        const cellLines = [];
                        let maxLinesInRow = 1;
                
                        for (let col = 0; col < cols; col++) {
                            const wrapped = wrapText(block.tableData[row][col], colWidths[col]);
                            cellLines.push(wrapped);
                            maxLinesInRow = Math.max(maxLinesInRow, wrapped.length);
                        }
                
                        // Renderizamos las sub-líneas para que la fila crezca verticalmente
                        for (let l = 0; l < maxLinesInRow; l++) {
                            let line = '| ';
                            for (let col = 0; col < cols; col++) {
                                const content = cellLines[col][l] || ''; // Si no hay más texto en esta col, celda vacía
                                line += pad(content, colWidths[col]) + ' | ';
                            }
                            textContent += line + '\n';
                        }

                        let separator = '+-';
                        for (let col = 0; col < cols; col++) {
                            separator += '-'.repeat(colWidths[col]) + '-+-';
                        }
                        textContent += separator + '\n';
                    }
                }
				// =====================================================================
                
                textContent += `${"-".repeat(60)}\n`;
                textContent += `Descripción: ${block.caption || 'Sin descripción'}\n\n`;
                break;
            
            case 'list':
                if (block.items && block.items.length > 0) {
                    textContent += '\n';
                    block.items.forEach(item => {
                        textContent += `• ${item}\n`;
                    });
                    textContent += '\n';
                }
                break;

            case 'numbered':
                if (block.items && block.items.length > 0) {
                    textContent += '\n';
                    block.items.forEach((item, index) => {
                        textContent += `${index + 1}. ${item}\n`;
                    });
                    textContent += '\n';
                }
                break;

            case 'formula':
                textContent += `\n[FÓRMULA MATEMÁTICA]\n`;
                textContent += `${block.content}\n\n`;
                break;

            case 'mermaid':
                textContent += `\n[DIAGRAMA MERMAID]\n`;
                textContent += `${"-".repeat(40)}\n`;
                textContent += `${block.content}\n`;
                textContent += `${"-".repeat(40)}\n\n`;
                break;

            case 'divider':
                textContent += `${"-".repeat(60)}\n`;
                break;

            case 'citations':
                if (block.items && block.items.length > 0) {
                    block.items.forEach(item => {
                        const c = item.data || {};
                        refCount++;
                        textContent += `\n[${refCount}] `;
                        if (item.type === 'article') {
                            textContent += `${c.authors}, "${c.title}", ${c.journal}`;
                            if (c.volume) textContent += `, vol. ${c.volume}`;
                            if (c.number) textContent += `, no. ${c.number}`;
                            if (c.pages) textContent += `, pp. ${c.pages}`;
                            if (c.year) textContent += `, ${c.year}`;
                            if (c.doi) textContent += `, doi: ${c.doi}`;
                            textContent += '.';
                            if (c.url) textContent += ` [En línea]. Disponible: ${c.url}`;
                            textContent += '\n';
                        } else if (item.type === 'book') {
                            textContent += `${c.authors}, "${c.title}". ${c.journal || ''} ${c.year || ''}.`;
                            if (c.url) textContent += ` [En línea]. Disponible: ${c.url}`;
                            textContent += '\n';
                        } else if (item.type === 'conference') {
                            textContent += `${c.authors}, "${c.title}", in ${c.journal}, ${c.year}`;
                            if (c.pages) textContent += `, pp. ${c.pages}`;
                            if (c.doi) textContent += `, doi: ${c.doi}`;
                            textContent += '.\n';
                        } else if (item.type === 'web') {
                            textContent += `${c.authors}, "${c.title}", ${c.journal || ''} ${c.year || ''}. [En línea]. Disponible: ${c.url}\n`;
                        }
                    });
                    textContent += '\n';
                }
                break;
            
            case 'ref':
                if (block.refData) {
                    refCount++;
                    const { author, title, source, year, url } = block.refData;
                    textContent += `\n[${refCount}] `;
                    
                    if (block.refType === 'book') {
                        textContent += `${author}, "${title}". ${source}, ${year}.`;
                    } else if (block.refType === 'web') {
                        textContent += `${author}, "${title}", ${source}, ${year}. [En línea]. Disponible: ${url}`;
                    } else {
                        textContent += `${author}, "${title}", ${source}, ${year}.`;
                    }
                    textContent += `\n`;
                }
                break;
            
            case 'ai':
                if (block.aiData) {
					const ai = block.aiData;  // Definir ai aquí para usarlo en ambos casos
                    const headerBlock = reportData.find(b => b.type === 'header');
                    const studentName = headerBlock && headerBlock.hData ? headerBlock.hData.name : '[Nombre del estudiante]';
                    
                    textContent += `\n${"=".repeat(60)}\n`;
                    textContent += `DECLARACIÓN DE USO DE INTELIGENCIA ARTIFICIAL\n`;
                    textContent += `${"=".repeat(60)}\n\n`;
                    
                    if (block.aiUsed === 'no') {
						const declarantName = ai.name || studentName;
						textContent += `Yo, ${declarantName}, declaro que NO he utilizado herramientas de\n`;
                        textContent += `Inteligencia Artificial para la elaboración de este trabajo académico.\n\n`;
                        textContent += `Afirmo que cuento con evidencias físicas y/o digitales que demuestran\n`;
                        textContent += `mi autoría, incluyendo: documentos manuscritos, materiales impresos con\n`;
                        textContent += `anotaciones o subrayado, historial de versiones de documentos electrónicos,\n`;
                        textContent += `o commits en repositorios de código.\n\n`;
                        textContent += `Reconozco que el profesor se reserva el derecho de solicitar dichas\n`;
                        textContent += `evidencias cuando existan sospechas o se detecten conductas que atenten\n`;
                        textContent += `contra la integridad académica.\n\n`;
                    } else {
                        const ai = block.aiData;
                        textContent += `Estudiante: ${ai.name || studentName}\n`;
                        textContent += `IA utilizada: ${ai.aiTool}\n`;
                        textContent += `Fecha: ${ai.date}\n`;
                        textContent += `Propósito: ${ai.purpose}\n\n`;
                        textContent += `Prompt utilizado:\n`;
                        textContent += `${"-".repeat(40)}\n`;
                        textContent += `${ai.prompt}\n`;
                        textContent += `${"-".repeat(40)}\n\n`;
                        if (ai.attachments) {
                            textContent += `Archivos suministrados: ${ai.attachments}\n\n`;
                        }
                        textContent += `Respuesta en crudo:\n`;
                        textContent += `${"-".repeat(40)}\n`;
                        textContent += `${ai.rawResponse}\n`;
                        textContent += `${"-".repeat(40)}\n\n`;
                    }
                }
                break;
        }
    });

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "reporte_academico.txt";
    link.click();
    
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
}

/**
 * Guarda el reporte como archivo JSON (con toda la información)
 * Este formato preserva perfectamente todos los datos sin cambios de formato
 */
function saveJSON() {
    try {
        const saveData = {
            version: "2.3.0",
            timestamp: new Date().toISOString(),
            reportData: reportData,
            versionHistory: versionHistory,
            versionCounter: versionCounter,
            citationMode: citationMode,
            bibDatabase: bibDatabase
        };
        
        const jsonString = JSON.stringify(saveData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        
        // Nombre del archivo con timestamp
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.getHours().toString().padStart(2, '0') + 
                       now.getMinutes().toString().padStart(2, '0');
        link.download = `reporte_${dateStr}_${timeStr}.json`;
        
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 100);
        
        console.log('Reporte guardado como JSON exitosamente');
        alert('¡Reporte guardado como JSON!');
    } catch (e) {
        console.error('Error al guardar JSON:', e);
        alert('Error al guardar el archivo JSON');
    }
}

/**
 * Importa un reporte desde un archivo JSON previamente guardado
 * Restaura todos los datos sin cambios de formato
 */
function importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const content = event.target.result;
                const importedData = JSON.parse(content);
                
                // Validar que sea un formato válido
                if (!importedData.reportData || !Array.isArray(importedData.reportData)) {
                    throw new Error('Formato de archivo JSON inválido');
                }
                
                // Preguntar si desea reemplazar o agregar
                const userChoice = confirm(
                    '¿Cómo deseas importar estos bloques?\n\n' +
                    'OK = Reemplazar todo el contenido actual\n' +
                    'Cancelar = Agregar bloques al trabajo actual'
                );
                
                // Guardar el estado actual para poder deshacer la importación
                saveStateForUndo();
                
                if (userChoice) {
                    // REEMPLAZAR: Cargar los datos importados completamente
                    reportData = importedData.reportData;
                    versionHistory = importedData.versionHistory || [];
                    versionCounter = importedData.versionCounter || 1;
                    citationMode = importedData.citationMode || 'manual';
                    bibDatabase = importedData.bibDatabase || {};
                    
                    // Actualizar selector de modo
                    const selector = document.getElementById('citationModeSelect');
                    if (selector) {
                        selector.value = citationMode;
                    }
                    
                    console.log('Reporte reemplazado exitosamente');
                    alert(`¡Reporte importado exitosamente!\n\nArchivo: ${file.name}\nBloques: ${reportData.length}`);
                } else {
                    // AGREGAR: Combinar bloques al contenido actual
                    const newBlocks = importedData.reportData.map(block => {
                        // Generar nuevo ID para evitar conflictos
                        return { ...block, id: Date.now() + Math.random() };
                    });
                    
                    // Agregar bloques al final del documento actual
                    reportData.push(...newBlocks);
                    
                    // Combinar base de datos de bibliografía si existe
                    if (importedData.bibDatabase) {
                        bibDatabase = { ...bibDatabase, ...importedData.bibDatabase };
                    }
                    
                    console.log(`${newBlocks.length} bloques agregados exitosamente`);
                    alert(
                        `¡Bloques agregados exitosamente!\n\n` +
                        `Archivo: ${file.name}\n` +
                        `Bloques agregados: ${newBlocks.length}\n` +
                        `Total de bloques: ${reportData.length}`
                    );
                }
                
                // Actualizar base de datos de bibliografía
                updateBibDatabase();

                // Migrar citas antiguas (bloques 'citation' sueltos) al bloque único 'citations'
                migrateOldCitations();
                
                // Crear una versión con la importación
                saveVersion(`Importado: ${file.name}`);
                
                // Guardar en localStorage
                saveToLocalStorage();
                
                // Renderizar
                render();
                
            } catch (error) {
                console.error('Error al importar JSON:', error);
                alert(`Error al importar: ${error.message}`);
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Formatea una referencia según el estilo IEEE
 */
function formatIEEEReference(type, author, title, source, year, url) {
    let refText = "";
    
    if (type === 'book') {
        refText = `${escapeHtml(author)}, <em>${escapeHtml(title)}</em>. ${escapeHtml(source)}, ${escapeHtml(year)}.`;
    } else if (type === 'web') {
        refText = `${escapeHtml(author)}, "${escapeHtml(title)}," <em>${escapeHtml(source)}</em>, ${escapeHtml(year)}. [En línea]. Disponible: ${escapeHtml(url)}`;
    } else if (type === 'article') {
        refText = `${escapeHtml(author)}, "${escapeHtml(title)}," <em>${escapeHtml(source)}</em>, ${escapeHtml(year)}.`;
    }
    
    return refText;
}

/**
 * Formatea una cita completa según el estilo IEEE
 */
function formatIEEECitation(type, data) {
    let citation = "";
    const { authors, title, journal, volume, number, pages, year, doi, url } = data;
    
    if (type === 'article') {
        citation = `${escapeHtml(authors)}, "${escapeHtml(title)}," <em>${escapeHtml(journal)}</em>`;
        if (volume) citation += `, vol. ${escapeHtml(volume)}`;
        if (number) citation += `, no. ${escapeHtml(number)}`;
        if (pages) citation += `, pp. ${escapeHtml(pages)}`;
        if (year) citation += `, ${escapeHtml(year)}`;
        if (doi) citation += `, doi: ${escapeHtml(doi)}`;
        citation += '.';
        if (url) citation += ' [En línea]. Disponible: ' + escapeHtml(url);
    } else if (type === 'book') {
        citation = `${escapeHtml(authors)}, <em>${escapeHtml(title)}</em>`;
        if (journal) citation += `. ${escapeHtml(journal)}`; // journal aquí actúa como editorial
        if (year) citation += `, ${escapeHtml(year)}`;
        citation += '.';
        if (url) citation += ' [En línea]. Disponible: ' + escapeHtml(url);
    } else if (type === 'conference') {
        citation = `${escapeHtml(authors)}, "${escapeHtml(title)}," in <em>${escapeHtml(journal)}</em>`;
        if (year) citation += `, ${escapeHtml(year)}`;
        if (pages) citation += `, pp. ${escapeHtml(pages)}`;
        if (doi) citation += `, doi: ${escapeHtml(doi)}`;
        citation += '.';
    } else if (type === 'web') {
        citation = `${escapeHtml(authors)}, "${escapeHtml(title)}," ${escapeHtml(journal)}`;
        if (year) citation += `, ${escapeHtml(year)}`;
        citation += '. [En línea]. Disponible: ' + escapeHtml(url);
    }
    
    return citation;
}

/**
 * Formatea una entrada BibTeX como citación IEEE
 */
function formatBibTeXCitation(type, data) {
    let citation = "";
    const { author, title, journal, volume, number, pages, year, doi, url, publisher, booktitle, organization, howpublished } = data;
    
    if (type === 'article') {
        citation = `${escapeHtml(author)}, "${escapeHtml(title)}," <em>${escapeHtml(journal)}</em>`;
        if (volume) citation += `, vol. ${escapeHtml(volume)}`;
        if (number) citation += `, no. ${escapeHtml(number)}`;
        if (pages) citation += `, pp. ${escapeHtml(pages)}`;
        if (year) citation += `, ${escapeHtml(year)}`;
        if (doi) citation += `, doi: ${escapeHtml(doi)}`;
        citation += '.';
    } else if (type === 'book') {
        citation = `${escapeHtml(author)}, <em>${escapeHtml(title)}</em>`;
        if (publisher) citation += `. ${escapeHtml(publisher)}`;
        if (year) citation += `, ${escapeHtml(year)}`;
        citation += '.';
    } else if (type === 'inproceedings') {
        citation = `${escapeHtml(author)}, "${escapeHtml(title)}," in <em>${escapeHtml(booktitle)}</em>`;
        if (year) citation += `, ${escapeHtml(year)}`;
        if (pages) citation += `, pp. ${escapeHtml(pages)}`;
        if (organization) citation += `. ${escapeHtml(organization)}`;
        citation += '.';
    } else if (type === 'online') {
        citation = `${escapeHtml(author)}, "${escapeHtml(title)}," ${escapeHtml(year)}. [En línea]. Disponible: ${escapeHtml(url)}`;
    } else if (type === 'misc') {
        citation = `${escapeHtml(author)}, "${escapeHtml(title)},"`;
        if (howpublished) citation += ` ${escapeHtml(howpublished)},`;
        if (year) citation += ` ${escapeHtml(year)}`;
        citation += '.';
    }
    
    return citation;
}

/**
 * Procesa las citas en el texto cuando está en modo BibTeX
 * Convierte [clave] en enlaces a las referencias
 */
function processCitations(text) {
    if (citationMode !== 'bibtex') {
        return text;
    }
    
    // Buscar patrones [clave] en el texto
    return text.replace(/\[([a-zA-Z0-9_-]+)\]/g, (match, key) => {
        if (bibDatabase[key]) {
            return `<a href="#bib-${key}" class="citation-link" title="Ver referencia">[${key}]</a>`;
        }
        return match; // Si no existe la referencia, dejar como está
    });
}

/**
 * Renderiza texto simple soportando listas numeradas del estilo "1. elemento"
 * - Agrupa líneas consecutivas con patrón N. <espacio> en <ol>
 * - No inicia listas automáticamente al saltar la enumeración
 * - Conserva números originales usando <li value="N">
 */
function renderTextWithEnumerations(rawText) {
    const lines = String(rawText || '').split('\n');
    let html = '';
    let inList = false;
    
    const closeList = () => {
        if (inList) {
            html += '</ol>';
            inList = false;
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const escaped = escapeHtml(line);
        const m = escaped.match(/^\s*(\d+)\.\s+(.*)$/);
        if (m) {
            const num = parseInt(m[1], 10);
            const content = m[2];
            if (!inList) {
                html += '<ol class="p-list">';
                inList = true;
            }
            html += `<li value="${num}">${processCitations(content)}</li>`;
        } else {
            // Línea normal: cerrar lista si estaba abierta y renderizar como párrafo
            closeList();
            const trimmed = escaped.trim();
            if (trimmed.length > 0) {
                html += `<p class="p-text">${processCitations(escaped)}</p>`;
            } else {
                // Línea vacía: insertar un pequeño espacio
                html += '<br />';
            }
        }
    }
    closeList();
    return html || '<p class="p-text"></p>';
}

/**
 * Guarda el estado actual en localStorage
 */
function saveToLocalStorage() {
    try {
        const saveData = {
            reportData: reportData,
            versionHistory: versionHistory,
            versionCounter: versionCounter,
            citationMode: citationMode,
            bibDatabase: bibDatabase
        };
        localStorage.setItem('reportData', JSON.stringify(saveData));
        console.log('Reporte guardado automáticamente');
    } catch (e) {
        console.error('Error al guardar en localStorage:', e);
    }
}

/**
 * Carga el estado desde localStorage
 */
function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('reportData');
        if (saved) {
            const saveData = JSON.parse(saved);
            reportData = saveData.reportData || saveData; // Compatibilidad con versión anterior
            versionHistory = saveData.versionHistory || [];
            versionCounter = saveData.versionCounter || 1;
            citationMode = saveData.citationMode || 'manual';
            bibDatabase = saveData.bibDatabase || {};
            
            // Actualizar selector de modo
            const selector = document.getElementById('citationModeSelect');
            if (selector) {
                selector.value = citationMode;
            }
            
            // Actualizar base de datos de bibliografía
            updateBibDatabase();

            // Migrar citas antiguas (bloques 'citation' sueltos) al bloque único 'citations'
            migrateOldCitations();
            
            render();
            console.log('Reporte recuperado');
        }
    } catch (e) {
        console.error('Error al cargar desde localStorage:', e);
    }
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

// Cargar datos guardados y configurar autoguardado al iniciar
document.addEventListener('DOMContentLoaded', function() {
    loadSavedTheme();
    loadDarkModePreference();
    loadFromLocalStorage();
    startAutosave();
    setupKeyboardShortcuts();
    checkInternetConnection();
    
    // Inicializar layouts después de que todo esté cargado
    setTimeout(() => {
        if (typeof loadSavedLayout === 'function') {
            loadSavedLayout();
        }
        if (typeof updateStatistics === 'function') {
            updateStatistics();
        }
    }, 200);
});

/**
 * Migra bloques antiguos 'citation' independientes a un único bloque 'citations' con items
 * Preserva el orden original de aparición de las citas
 */
function migrateOldCitations() {
    try {
        if (!Array.isArray(reportData) || reportData.length === 0) return;

        const newReport = [];
        const migratedItems = [];
        let firstCitationIndex = -1;

        // Extraer todos los bloques antiguos 'citation' y mapearlos a items
        reportData.forEach((block, idx) => {
            if (block.type === 'citation' && block.citationData) {
                if (firstCitationIndex === -1) firstCitationIndex = idx;
                migratedItems.push({
                    type: block.citationType || 'article',
                    data: {
                        authors: block.citationData.authors || '',
                        title: block.citationData.title || '',
                        journal: block.citationData.journal || '',
                        volume: block.citationData.volume || '',
                        number: block.citationData.number || '',
                        pages: block.citationData.pages || '',
                        year: block.citationData.year || '',
                        doi: block.citationData.doi || '',
                        url: block.citationData.url || ''
                    }
                });
                // No añadir este bloque antiguo al nuevo arreglo
            } else {
                newReport.push(block);
            }
        });

        if (migratedItems.length === 0) {
            // Nada que migrar
            return;
        }

        // Si ya existe un bloque 'citations', anexar
        const existing = newReport.find(b => b.type === 'citations');
        if (existing) {
            if (!Array.isArray(existing.items)) existing.items = [];
            existing.items = existing.items.concat(migratedItems);
        } else {
            // Crear un nuevo bloque 'citations' en la posición del primer 'citation' encontrado
            const newBlock = {
                id: Date.now(),
                type: 'citations',
                items: migratedItems
            };
            if (firstCitationIndex >= 0 && firstCitationIndex <= newReport.length) {
                newReport.splice(firstCitationIndex, 0, newBlock);
            } else {
                newReport.push(newBlock);
            }
        }

        // Reemplazar el arreglo
        reportData = newReport;
    } catch (e) {
        console.warn('No se pudo migrar citas antiguas:', e);
    }
}

/**
 * Configura los atajos de teclado
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl+Z o Cmd+Z - Deshacer
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        // Ctrl+Y o Cmd+Shift+Z - Rehacer
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            redo();
        }
        // Ctrl+S o Cmd+S - Guardar manualmente
        else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveToLocalStorage();
            saveVersion(`Guardado manual - ${new Date().toLocaleTimeString('es-ES')}`);
            updateAutosaveStatus();
            alert('¡Documento guardado!');
        }
    });
}

// ============================================================================
// MARKDOWN SMART BULLETS
// ============================================================================

/**
 * Configura el manejo inteligente de bullets en Markdown
 */
function setupMarkdownBullets() {
    document.querySelectorAll('.markdown-textarea').forEach(textarea => {
        textarea.addEventListener('keydown', handleMarkdownKeydown);
    });
}

/**
 * Maneja eventos de teclado en el editor Markdown para bullets inteligentes
 */
function handleMarkdownKeydown(e) {
    const textarea = e.target;
    const { selectionStart, selectionEnd, value } = textarea;
    
    // Enter: Auto-continuar bullet o terminar lista
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        
        // Encontrar la línea actual
        const beforeCursor = value.substring(0, selectionStart);
        const lineStart = beforeCursor.lastIndexOf('\n') + 1;
        const currentLine = beforeCursor.substring(lineStart);
        
        // Detectar bullets: -, nivel 2: espacio+espacio+-, nivel 3: espacio*4+-
        const bulletMatch = currentLine.match(/^(\s*)(-\s+)(.*)$/);
        
        if (bulletMatch) {
            const indent = bulletMatch[1];
            const bullet = bulletMatch[2];
            const content = bulletMatch[3];
            
            if (content.trim() === '') {
                // Bullet vacía: bajar nivel o terminar lista
                if (indent.length >= 4) {
                    // Nivel 3 -> Nivel 2
                    const newIndent = indent.substring(0, indent.length - 4);
                    const replacement = '\n' + newIndent + '- ';
                    textarea.setRangeText(replacement, lineStart, selectionStart, 'end');
                } else if (indent.length >= 2) {
                    // Nivel 2 -> Nivel 1
                    const replacement = '\n- ';
                    textarea.setRangeText(replacement, lineStart, selectionStart, 'end');
                } else {
                    // Nivel 1 -> Terminar lista (eliminar bullet vacía)
                    textarea.setRangeText('', lineStart, selectionStart, 'end');
                }
            } else {
                // Continuar con bullet en el mismo nivel
                const replacement = '\n' + indent + '- ';
                textarea.setRangeText(replacement, selectionStart, selectionEnd, 'end');
            }
            
            // Actualizar contenido del bloque
            const blockId = parseInt(textarea.getAttribute('data-block-id'));
            updateContent(blockId, textarea.value);
            return;
        }
        
        // Si no es bullet, comportamiento normal
        textarea.setRangeText('\n', selectionStart, selectionEnd, 'end');
        const blockId = parseInt(textarea.getAttribute('data-block-id'));
        updateContent(blockId, textarea.value);
    }
    
    // Tab: Incrementar nivel de bullet
    else if (e.key === 'Tab' && !e.shiftKey) {
        const beforeCursor = value.substring(0, selectionStart);
        const lineStart = beforeCursor.lastIndexOf('\n') + 1;
        const lineEnd = value.indexOf('\n', selectionStart);
        const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
        const currentLine = value.substring(lineStart, actualLineEnd);
        
        const bulletMatch = currentLine.match(/^(\s*)(-\s+)(.*)$/);
        
        if (bulletMatch) {
            e.preventDefault();
            const indent = bulletMatch[1];
            const bullet = bulletMatch[2];
            const content = bulletMatch[3];
            
            // Máximo 3 niveles (0, 2, 4 espacios)
            if (indent.length < 4) {
                const newIndent = indent.length === 0 ? '  ' : '    ';
                const replacement = newIndent + bullet + content;
                
                // Calcular nueva posición del cursor
                const cursorOffset = selectionStart - lineStart;
                const newCursorPos = lineStart + newIndent.length + bullet.length;
                
                textarea.setRangeText(replacement, lineStart, actualLineEnd, 'select');
                textarea.setSelectionRange(newCursorPos, newCursorPos);
                
                // Actualizar contenido del bloque
                const blockId = parseInt(textarea.getAttribute('data-block-id'));
                updateContent(blockId, textarea.value);
            }
        }
    }
    
    // Backspace: Reducir nivel de bullet o eliminar
    else if (e.key === 'Backspace') {
        const beforeCursor = value.substring(0, selectionStart);
        const lineStart = beforeCursor.lastIndexOf('\n') + 1;
        const currentLine = beforeCursor.substring(lineStart, selectionStart);
        
        // Solo actuar si el cursor está justo después del bullet (espacio)
        const bulletMatch = currentLine.match(/^(\s*)(-\s+)$/);
        
        if (bulletMatch && selectionStart === selectionEnd) {
            e.preventDefault();
            const indent = bulletMatch[1];
            
            if (indent.length >= 4) {
                // Nivel 3 -> Nivel 2
                const newIndent = indent.substring(0, indent.length - 2);
                const replacement = newIndent + '- ';
                textarea.setRangeText(replacement, lineStart, selectionStart, 'end');
            } else if (indent.length >= 2) {
                // Nivel 2 -> Nivel 1
                const replacement = '- ';
                textarea.setRangeText(replacement, lineStart, selectionStart, 'end');
            } else {
                // Nivel 1 -> Eliminar bullet
                textarea.setRangeText('', lineStart, selectionStart, 'end');
            }
            
            // Actualizar contenido del bloque
            const blockId = parseInt(textarea.getAttribute('data-block-id'));
            updateContent(blockId, textarea.value);
        }
    }
}

// ============================================================================
// DRAG AND DROP FUNCTIONALITY
// ============================================================================

let draggedElement = null;
let draggedIndex = null;
let dropIndicator = null;

/**
 * Maneja el inicio del arrastre
 */
function handleDragStart(e) {
    const block = reportData[parseInt(this.getAttribute('data-index'))];
    if (block && block.pinned) {
        e.preventDefault();
        return; // No permitir arrastrar bloques anclados
    }
    
    draggedElement = this;
    draggedIndex = parseInt(this.getAttribute('data-index'));
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

/**
 * Maneja el final del arrastre
 */
function handleDragEnd(e) {
    this.classList.remove('dragging');
    
    // Remover la clase drag-over y el indicador de todos los elementos
    document.querySelectorAll('.block-card-container').forEach(item => {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
    });
}

/**
 * Maneja cuando se arrastra sobre un elemento
 */
function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    
    const targetBlock = reportData[parseInt(this.getAttribute('data-index'))];
    if (targetBlock && targetBlock.pinned) {
        e.dataTransfer.dropEffect = 'none';
        return false; // No permitir drop en bloques anclados
    }
    
    e.dataTransfer.dropEffect = 'move';
    
    // Determinar si el cursor está en la mitad superior o inferior
    const rect = this.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const isTop = e.clientY < midpoint;
    
    // Remover clases previas
    this.classList.remove('drag-over-top', 'drag-over-bottom');
    
    // Agregar clase según posición
    if (isTop) {
        this.classList.add('drag-over-top');
    } else {
        this.classList.add('drag-over-bottom');
    }
    
    return false;
}

/**
 * Maneja cuando se suelta el elemento
 */
function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    if (draggedElement !== this) {
        const targetIndex = parseInt(this.getAttribute('data-index'));
        const targetBlock = reportData[targetIndex];
        
        if (targetBlock && targetBlock.pinned) {
            return false; // No permitir drop en bloques anclados
        }
        
        if (draggedIndex !== targetIndex) {
            saveStateForUndo();
            
            // Determinar si insertar antes o después
            const rect = this.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const isTop = e.clientY < midpoint;
            
            // Mover el bloque en el array
            const movedBlock = reportData.splice(draggedIndex, 1)[0];
            
            // Calcular nueva posición
            let newIndex = targetIndex;
            if (draggedIndex < targetIndex) {
                newIndex = isTop ? targetIndex - 1 : targetIndex;
            } else {
                newIndex = isTop ? targetIndex : targetIndex + 1;
            }
            
            reportData.splice(newIndex, 0, movedBlock);
            
            // Re-renderizar
            render();
        }
    }
    
    return false;
}

/**
 * Maneja cuando el elemento sale del área de drop
 */
function handleDragLeave(e) {
    this.classList.remove('drag-over-top', 'drag-over-bottom');
}

/**
 * Obtiene el elemento después del cual se debe insertar
 */
function getDragAfterElement(container, y) {
    const draggableElements = [...container.parentElement.querySelectorAll('.block-card-container:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/**
 * Alterna el estado de anclaje de un bloque (none -> top -> bottom -> none)
 */
function togglePin(id) {
    const block = reportData.find(b => b.id === id);
    if (!block) return;
    
    saveStateForUndo();
    
    if (!block.pinned || block.pinned === 'none') {
        block.pinned = 'top';
        // Mover al principio
        const index = reportData.findIndex(b => b.id === id);
        if (index !== -1) {
            const removed = reportData.splice(index, 1)[0];
            // Encontrar la posición después del último bloque pinned top
            let insertPos = 0;
            for (let i = 0; i < reportData.length; i++) {
                if (reportData[i].pinned === 'top') {
                    insertPos = i + 1;
                } else {
                    break;
                }
            }
            reportData.splice(insertPos, 0, removed);
        }
    } else if (block.pinned === 'top') {
        block.pinned = 'bottom';
        // Mover al final
        const index = reportData.findIndex(b => b.id === id);
        if (index !== -1) {
            const removed = reportData.splice(index, 1)[0];
            reportData.push(removed);
        }
    } else {
        block.pinned = undefined;
    }
    
    render();
}

// ============================================================================
// GESTIÓN DE TEMAS
// ============================================================================

/**
 * Cambia el tema visual de la aplicación
 * @param {string} theme - 'tsw', 'upy', o 'upp'
 */
function changeTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('selectedTheme', theme);
    console.log(`Tema cambiado a: ${theme}`);
}

/**
 * Carga el tema guardado al iniciar
 */
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('selectedTheme') || 'tsw';
    document.body.setAttribute('data-theme', savedTheme);
    const selector = document.getElementById('themeSelector');
    if (selector) {
        selector.value = savedTheme;
    }
}
// ============================================================================
// MODO OSCURO
// ============================================================================

/**
 * Alterna el modo oscuro
 */
function toggleDarkMode() {
    const body = document.body;
    const isDarkMode = body.classList.toggle('dark-mode');
    
    // Guardar preferencia en localStorage
    localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');
    
    // Actualizar icono del botón
    updateDarkModeButton(isDarkMode);
    
    console.log(`Modo oscuro: ${isDarkMode ? 'activado' : 'desactivado'}`);
}

/**
 * Actualiza el icono del botón de modo oscuro
 */
function updateDarkModeButton(isDarkMode) {
    const btn = document.getElementById('darkModeBtn');
    if (!btn) return;
    
    const icon = btn.querySelector('.material-symbols-outlined');
    
    if (isDarkMode) {
        icon.textContent = 'light_mode'; // Sol para modo claro
        btn.title = 'Cambiar a modo claro';
    } else {
        icon.textContent = 'dark_mode'; // Luna para modo oscuro
        btn.title = 'Cambiar a modo oscuro';
    }
}

/**
 * Carga la preferencia de modo oscuro al iniciar
 */
function loadDarkModePreference() {
    const darkMode = localStorage.getItem('darkMode');
    
    // Si hay preferencia guardada, aplicarla
    if (darkMode === 'enabled') {
        document.body.classList.add('dark-mode');
        updateDarkModeButton(true);
    } else if (darkMode === 'disabled') {
        document.body.classList.remove('dark-mode');
        updateDarkModeButton(false);
    } else {
        // Si no hay preferencia, detectar preferencia del sistema
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark-mode');
            updateDarkModeButton(true);
            localStorage.setItem('darkMode', 'enabled');
        }
    }
}

// ============================================================================
// RIBBON - CONTROL DE PESTAÑAS
// ============================================================================

/**
 * Cambia entre pestañas del ribbon
 */
function switchTab(tabName) {
    // Desactivar todas las pestañas y paneles
    document.querySelectorAll('.ribbon-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.ribbon-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    // Activar la pestaña seleccionada
    const activeTab = Array.from(document.querySelectorAll('.ribbon-tab')).find(
        tab => tab.textContent.toLowerCase() === tabName.toLowerCase()
    );
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Activar el panel correspondiente
    const activePanel = document.getElementById(`tab-${tabName}`);
    if (activePanel) {
        activePanel.classList.add('active');
    }
}
