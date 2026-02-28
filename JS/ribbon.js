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

// ============================================================================
// DIVISOR REDIMENSIONABLE (RESIZER)
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    const resizer = document.getElementById('resizer');
    const leftPanel = document.getElementById('editor-container');
    const rightPanel = document.getElementById('preview-container');
    
    if (!resizer || !leftPanel || !rightPanel) return;
    
    let isResizing = false;
    let startX = 0;
    let startLeftWidth = 0;
    
    resizer.addEventListener('mousedown', function(e) {
        isResizing = true;
        startX = e.clientX;
        startLeftWidth = leftPanel.offsetWidth;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', function(e) {
        if (!isResizing) return;
        
        const dx = e.clientX - startX;
        const newLeftWidth = startLeftWidth + dx;
        const containerWidth = leftPanel.parentElement.offsetWidth;
        const minWidth = 300;
        const maxWidth = containerWidth - minWidth - 5; // 5px para el resizer
        
        if (newLeftWidth >= minWidth && newLeftWidth <= maxWidth) {
            const leftPercent = (newLeftWidth / containerWidth) * 100;
            const rightPercent = 100 - leftPercent - 0.5; // 0.5% para el resizer
            
            leftPanel.style.flex = `0 0 ${leftPercent}%`;
            rightPanel.style.flex = `0 0 ${rightPercent}%`;
        }
    });
    
    document.addEventListener('mouseup', function() {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
});
