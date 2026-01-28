// ============================================================================
// WINE REGIONS LIST
// ============================================================================

/**
 * Build and display the list of wine regions as clickable items
 */
function buildWineRegionsList() {
    var wineRegions = ['Madeira', 'Port', 'Sherry', 'Marsala', 'Bordeaux'];
    
    // Remove existing list if present
    var existing = document.querySelector('.wine-regions-list');
    if (existing) existing.remove();

    var listDiv = document.createElement('div');
    listDiv.className = 'wine-regions-list';

    // Create content container
    var content = document.createElement('div');
    content.className = 'wine-regions-content';
    content.style.display = 'block';
    content.style.overflowY = 'auto';

    // Create table grid
    var table = document.createElement('div');
    table.style.display = 'grid';
    table.style.gridTemplateColumns = '1fr';
    table.style.gap = '8px';
    table.style.width = '100%';

    // Add header
    var header = document.createElement('div');
    header.style.padding = '8px';
    header.style.backgroundColor = '#e8f4f8';
    header.style.borderRadius = '3px';
    header.style.fontSize = '13px';
    header.style.color = '#333';
    header.style.fontWeight = 'bold';
    header.style.borderBottom = '2px solid #a89378';
    header.style.marginBottom = '8px';
    header.textContent = 'Select a wine region to zoom and view distilleries';
    table.appendChild(header);

    // Add wine region items
    wineRegions.forEach(function(regionName) {
        var item = document.createElement('div');
        item.style.padding = '10px 12px';
        item.style.backgroundColor = '#ffffff';
        item.style.borderRadius = '3px';
        item.style.fontSize = '13px';
        item.style.color = '#333';
        item.style.cursor = 'pointer';
        item.style.fontWeight = '500';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.transition = 'all 0.2s ease';
        item.style.border = '1px solid #ddd';
        item.textContent = regionName;

        // Hover effect
        item.addEventListener('mouseover', function() {
            item.style.backgroundColor = '#f0e6d8';
            item.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            item.style.fontWeight = 'bold';
            item.style.borderColor = '#a89378';
        });

        item.addEventListener('mouseout', function() {
            item.style.backgroundColor = '#ffffff';
            item.style.boxShadow = 'none';
            item.style.fontWeight = '500';
            item.style.borderColor = '#ddd';
        });

        // Click handler to zoom to wine region
        item.addEventListener('click', function() {
            if (typeof zoomToWineRegion === 'function') {
                console.log("Selected wine region:", regionName);
                zoomToWineRegion(regionName);
                
                // Visual feedback
                item.style.backgroundColor = '#a89378';
                item.style.color = 'white';
                setTimeout(function() {
                    item.style.backgroundColor = '#ffffff';
                    item.style.color = '#333';
                }, 300);
            }
        });

        table.appendChild(item);
    });

    content.appendChild(table);
    listDiv.appendChild(content);

    // Append to the wine regions tab container
    var wineRegionsTab = document.getElementById('wine-regions-tab');
    if (wineRegionsTab) {
        wineRegionsTab.appendChild(listDiv);
    }
}
