// ============================================================================
// DISTILLERY LAYER & CASK SOURCING VISUALIZATION
// ============================================================================

// Map cask types to their country flag emoji
function getCaskProvenance(caskName) {
    var lower = (caskName || '').toLowerCase();
    
    // Spain - Sherry variants
    if (lower.includes('sherry') || lower.includes('oloroso') || lower.includes('pedro ximenez') || 
        lower.includes('px') || lower.includes('amontillado') || lower.includes('manzanilla') || 
        lower.includes('palo cortado') || lower.includes('montanilla') || lower.includes('malaga') || 
        lower.includes('moscatel')) {
        return '🇪🇸';
    }
    
    // USA - Bourbon and American Oak
    if (lower.includes('bourbon') || lower.includes('american oak') || lower.includes('american white oak') || 
        lower.includes('rye') || lower.includes('virgin oak') || lower.includes('charred oak')) {
        return '🇺🇸';
    }
    
    // France - Wine regions and spirits
    if (lower.includes('bordeaux') || lower.includes('burgundy') || lower.includes('sauternes') || 
        lower.includes('pineau') || lower.includes('cognac') || lower.includes('calvados') || 
        lower.includes('chardonnay') || lower.includes('cabernet') || lower.includes('sauvignon') || 
        lower.includes('cuvee') || lower.includes('armagnac') || lower.includes('bas-armagnac') || 
        lower.includes('champagne')) {
        return '🇫🇷';
    }
    
    // Portugal - Port and Madeira
    if (lower.includes('port') || lower.includes('porto') || lower.includes('tawny') || 
        lower.includes('madeira') || lower.includes('ruby')) {
        return '🇵🇹';
    }
    
    // Jamaica/Caribbean - Rum
    if (lower.includes('rum') || lower.includes('caribbean') || lower.includes('jamaican') || 
        lower.includes('demerara')) {
        return '🇯🇲';
    }
    
    // Italy - Italian wines and spirits
    if (lower.includes('marsala') || lower.includes('amarone')) {
        return '🇮🇹';
    }
    
    // Japan - Japanese Oak
    if (lower.includes('mizunara') || lower.includes('japanese oak')) {
        return '🇯🇵';
    }
    
    // Hungary - Tokaji
    if (lower.includes('tokaji')) {
        return '🇭🇺';
    }
    
    // Generic Oak (origin varies)
    if (lower.includes('european oak') || lower.includes('spanish oak') || lower.includes('french oak')) {
        if (lower.includes('spanish')) return '🇪🇸';
        if (lower.includes('french')) return '🇫🇷';
        return '🇪🇺';
    }
    
    // Generic categories
    if (lower.includes('red wine') || lower.includes('white wine')) {
        return '🌍';
    }
    
    return null; // Unknown origin
}

// Format cask name with provenance
function formatCaskWithProvenance(caskName) {
    var provenance = getCaskProvenance(caskName);
    return provenance ? caskName + ' (' + provenance + ')' : caskName;
}

function initDistilleryLayer() {
    if (!window.GLOBAL_DISTILLERIES) return;

    // Create a group for distilleries if it doesn't exist
    var distilleryGroup = svg.select('.distillery-group');
    if (distilleryGroup.empty()) {
        distilleryGroup = svg.append('g').attr('class', 'distillery-group').attr('z-index', 100);
    }

    // Create a group for distillery flows (put it behind distilleries)
    var flowGroup = svg.select('.distillery-flow-group');
    if (flowGroup.empty()) {
        flowGroup = svg.insert('g', '.distillery-group').attr('class', 'distillery-flow-group');
    }

    drawDistilleries();
    
    // Initialize statistics view
    showCaskStatistics();
}

function getStatsContainer() {
    // Use floating top-right panel for stats
    var container = d3.select('#cask-stats-panel');
    if (container.empty()) {
        container = d3.select('body')
            .append('div')
            .attr('id', 'cask-stats-panel')
            .attr('class', 'info-panel');
    }
    container.classed('cask-stats-container', true);
    return container;
}

// Normalize a cask label and check if it matches a target (with aliases)
function matchesCaskToTarget(caskName, targetLower) {
    var cLower = (caskName || '').toLowerCase();
    var aliasMap = {
        'sherry': ['sherry', 'oloroso', 'pedro ximenez', 'px', 'ex-sherry', 'spanish sherry'],
        'port': ['port', 'porto', 'port wine', 'tawny', 'ruby port'],
        'madeira': ['madeira'],
        'wine': ['red wine', 'white wine'],
        // Group all French wine-related casks under Bordeaux
        'bordeaux': [
            'bordeaux',
            'burgundy',
            'sauternes',
            'pineau',
            'chardonnay',
            'cabernet',
            'sauvignon blanc',
            'cuvee'
        ]
    };

    var candidates = aliasMap[targetLower] || [targetLower];
    return candidates.some(function(alias) {
        return cLower.indexOf(alias) !== -1;
    });
}

// Return true if the cask is a French wine type to be grouped as Bordeaux
function isFrenchWineCask(name) {
    var lower = (name || '').toLowerCase();
    var frenchWineTerms = [
        'bordeaux',
        'burgundy',
        'sauternes',
        'pineau',
        'chardonnay',
        'cabernet',
        'sauvignon blanc',
        'cuvee'
    ];
    return frenchWineTerms.some(function(term) { return lower.indexOf(term) !== -1; });
}

function findDistilleriesByCask(caskName, useFuzzyMatch) {
    var target = (caskName || '').trim().toLowerCase();
    if (!target || !window.GLOBAL_DISTILLERIES) return [];

    return window.GLOBAL_DISTILLERIES.filter(function(d) {
        if (!d.cask_types || !d.cask_types.length) return false;
        return d.cask_types.some(function(c) {
            if (useFuzzyMatch) return matchesCaskToTarget(c, target);
            return c && c.trim().toLowerCase() === target;
        });
    });
}

function showCaskStatistics() {
    var container = getStatsContainer();
    
    // 1. Calculate Statistics
    var caskCounts = {};
    window.GLOBAL_DISTILLERIES.forEach(d => {
        if (!d.cask_types) return;
        d.cask_types.forEach(cask => {
            // Clean up name (basic normalization)
            var name = cask.trim();
            // Group French wine casks under a single category without changing source data
            var displayName = isFrenchWineCask(name) ? 'Bordeaux' : name;
            caskCounts[displayName] = (caskCounts[displayName] || 0) + 1;
        });
    });

    // Convert to array and sort
    var sortedCasks = Object.entries(caskCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15); // Top 15

    // 2. Render List
    var html = `
        <h2>Cask Statistics</h2>
        <p>Most used cask types across all distilleries:</p>
        <div class="stats-list">
            ${sortedCasks.map((item, index) => {
                var displayName = formatCaskWithProvenance(item[0]);
                return `
                <div class="stat-item" data-cask="${item[0].replace(/"/g, '&quot;')}" style="cursor:pointer; padding:5px; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
                    <span>${index + 1}. ${displayName}</span>
                    <span style="font-weight:bold;">${item[1]}</span>
                </div>`;
            }).join('')}
        </div>
        <div style="margin-top:20px; font-size:0.9em; color:#666;">
            Click a cask type to see which distilleries use it.
        </div>
    `;
    
    container.html(html);

    // 3. Add Interaction
    container.selectAll('.stat-item').on('click', function() {
        var caskName = this.getAttribute('data-cask');
        // Use fuzzy matching when clicking the grouped Bordeaux category
        var useFuzzy = (caskName || '').toLowerCase() === 'bordeaux';
        filterDistilleriesByCask(caskName, { fuzzyMatch: useFuzzy });
    });
}

function filterDistilleriesByCask(caskName, options) {
    var opts = options || {};
    // Ensure fuzzy matching is enabled for grouped categories like Bordeaux
    var useFuzzy = !!opts.fuzzyMatch || ((caskName || '').toLowerCase() === 'bordeaux');
    var matches = findDistilleriesByCask(caskName, useFuzzy);

    // Update Sidebar
    var container = getStatsContainer();
    var title = opts.customTitle || (caskName + ' Casks');
    var intro = opts.customIntro || ('Used by <strong>' + matches.length + '</strong> distilleries:');
    
    var displayTitle = title;
    // Add provenance to title if it's a single cask type
    if (!opts.customTitle && caskName) {
        var provenance = getCaskProvenance(caskName);
        displayTitle = provenance ? caskName + ' (' + provenance + ') Casks' : title;
    }
    
    var html = `
        <div style="margin-bottom:10px; cursor:pointer; color:#d4af37;" id="back-to-stats">← Back to Statistics</div>
        <h2>${displayTitle}</h2>
        <p>${intro}</p>
        <ul style="max-height: 400px; overflow-y: auto;">
            ${matches.length ? matches.map(d => `
                <li style="margin-bottom:5px; cursor:pointer;" class="distillery-link" data-name="${d.name.replace(/"/g, '&quot;')}" data-region="${(d.region || '').replace(/"/g, '&quot;')}">
                    <strong>${d.name}</strong> (${d.region})
                </li>
            `).join('') : '<li style="color:#666;">No distilleries found for this cask type.</li>'}
        </ul>
    `;
    
    container.html(html);

    // Back button
    container.select('#back-to-stats').on('click', function() {
        // Reset map highlights
        d3.selectAll('.distillery-point')
            .transition().duration(200)
            .attr('opacity', 0.9)
            .attr('r', 3.5)
            .attr('fill', '#d4af37');
            
        showCaskStatistics();
    });

    // Distillery links
    container.selectAll('.distillery-link').on('click', function() {
        var dName = this.getAttribute('data-name');
        var d = window.GLOBAL_DISTILLERIES.find(x => x.name === dName);
        if (d) {
            // Trigger map click behavior
            // We need to find the node and trigger event, or just call logic directly
            // Calling logic directly is safer
            showDistilleryInfo(d);
            drawDistilleryFlows(d);
            
            // Highlight specific node
            d3.selectAll('.distillery-point')
                .filter(p => p.name === d.name)
                .transition().duration(200)
                .attr('r', 8).attr('stroke-width', 2);
        }
    });

    // Update Map visualization to highlight these
    highlightDistilleries(matches.map(d => d.name));
}

function highlightDistilleriesForWineRegion(regionName) {
    var regionLabel = regionName || 'Wine Region';
    filterDistilleriesByCask(regionLabel, {
        fuzzyMatch: true,
        customTitle: regionLabel + ' wine region casks'
    });
}

function highlightDistilleries(names) {
    if (!names || !names.length) {
        d3.selectAll('.distillery-point')
            .transition().duration(300)
            .attr('opacity', 0.9)
            .attr('r', 3.5)
            .attr('fill', '#d4af37');
        return;
    }

    var nameSet = new Set(names);
    
    d3.selectAll('.distillery-point')
        .transition().duration(300)
        .attr('opacity', function(d) { return nameSet.has(d.name) ? 1 : 0.1; })
        .attr('r', function(d) { return nameSet.has(d.name) ? 6 : 3.5; })
        .attr('fill', function(d) { return nameSet.has(d.name) ? '#FF4500' : '#d4af37'; }); // Orange-Red for selection
    
    // Raise matched distilleries to the top so they appear over others
    d3.selectAll('.distillery-point').each(function(d) {
        if (nameSet.has(d.name)) {
            d3.select(this).raise();
        }
    });
}

function drawDistilleries() {
    var g = svg.select('.distillery-group');

    // Filter valid coords
    var validData = window.GLOBAL_DISTILLERIES.filter(d => d.coords && d.coords.length === 2);

    // Initial projection update to ensure visibility is correct
    updateDistilleryPositions();

    var circles = g.selectAll('.distillery-point')
        .data(validData, d => d.name);

    circles.exit().remove();

    var enter = circles.enter().append('circle')
        .attr('class', 'distillery-point')
        .attr('r', 3.5)
        .attr('fill', '#d4af37') // Gold color
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .attr('cursor', 'pointer')
        .attr('opacity', 0.9);

    // Merge and update positions
    circles.merge(enter)
        .on('mouseover', function(event, d) {
            d3.select(this).transition().duration(200).attr('r', 8).attr('stroke-width', 2);
            
            // Tooltip
            tooltip.transition().duration(200).style('opacity', 1);
            tooltip.html("<strong>" + d.name + "</strong><br/>" + d.region + "<br/><span style='font-size:0.8em'>Click for details</span>")
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 28) + "px");

            // Preview flows
            drawDistilleryFlows(d);
        })
        .on('mousemove', function(event) {
             tooltip.style("left", (event.pageX + 15) + "px")
                    .style("top", (event.pageY - 28) + "px");
        })
        .on('mouseout', function(event, d) {
             d3.select(this).transition().duration(200).attr('r', 3.5).attr('stroke-width', 0.5);
             tooltip.transition().duration(500).style('opacity', 0);
             
             // Clear flows
             svg.select('.distillery-flow-group').selectAll('*').remove();
        })
        .on('click', function(event, d) {
            showDistilleryInfo(d);
            // Re-draw flows to keep them persistent (optional, or just rely on the hover/sidebar state)
            drawDistilleryFlows(d);
            
            // Stop propagation so we don't zoom to country if that logic exists on background
            event.stopPropagation();
        });
    
    // Initial position update
    updateDistilleryPositions();
}

// Function to update positions during map rotation/zoom
function updateDistilleryPositions() {
    var g = svg.select('.distillery-group');
    if (g.empty()) return;
    
    var center = projection.invert([width/2, height/2]);
    if (!center) return;

    // Iterate existing elements
    g.selectAll('.distillery-point')
        .each(function(d) {
             if (!d || !d.coords) return;
             
             var coords = projection(d.coords);
             var distance = d3.geoDistance(d.coords, center);
             
             // Hide if on the back side of the globe
             if (distance > Math.PI / 2 || !coords) {
                 d3.select(this).style('display', 'none');
             } else {
                 d3.select(this)
                    .attr('cx', coords[0])
                    .attr('cy', coords[1])
                    .style('display', 'block');
             }
        });

    // Also update flow paths - these are paths so d3.geoPath handles them, 
    // EXCEPT we need to regenerate the path string if the projection changed.
    // Actually, svg.selectAll('path') in the main loop updates ALL paths including these.
    // So we just need to make sure these are paths. Yes they are.
    // So 4ui_controls.js loop `svg.selectAll("path").attr("d", path)` will handle the flows.
}

function drawDistilleryFlows(distillery) {
    var g = svg.select('.distillery-flow-group');
    g.selectAll('*').remove();

    if (!distillery.sources || distillery.sources.length === 0) return;

    var flows = [];
    distillery.sources.forEach(function(iso) {
        var targetFeature = window.COUNTRY_FEATURES_MAP && window.COUNTRY_FEATURES_MAP[iso];
        // Special case fallback for some codes
        if (!targetFeature && iso === 'JAM') {
             // Approximate Jamaica if not in map (it usually is)
             // Or find closest.
        }
        
        if (targetFeature) {
            var centroid = d3.geoCentroid(targetFeature);
            if (centroid && !isNaN(centroid[0]) && !isNaN(centroid[1])) {
                flows.push({
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: [distillery.coords, centroid]
                    },
                    properties: {
                        target: iso
                    }
                });
            }
        }
    });

    // We must ensure 'path' is available. It is global from 1map_setup.js
    // but just in case, we can recreate it if missing.
    var currentPath = (typeof path !== 'undefined') ? path : d3.geoPath().projection(projection);

    var paths = g.selectAll('.distillery-flow-path')
        .data(flows)
        .enter()
        .append('path')
        .attr('class', 'distillery-flow-path')
        .attr('d', currentPath)
        .attr('fill', 'none')
        .attr('stroke', '#d4af37') // Gold
        .attr('stroke-width', 4)
        .attr('stroke-dasharray', '5,5')
        .attr('opacity', 0.8)
        .attr('pointer-events', 'none'); // CRITICAL: Don't block map interactions
        
    // Animate dash
    // Note: Creating a continuous animation might be heavy, just static dashed line is fine for now
}

function showDistilleryInfo(d) {
    var container = getStatsContainer();
    
    var html = `
        <div style="margin-bottom:10px; cursor:pointer; color:#d4af37;" id="back-to-stats-from-info">← Back to Statistics</div>
        <h2>${d.name}</h2>
        <p><strong>Region:</strong> ${d.region}</p>
        <p><strong>Location:</strong> ${d.location}</p>
        <hr>
        <h3>Cask Sourcing</h3>
        <p>This distillery sources casks from:</p>
        <ul>
            ${d.cask_types.map(c => `<li>${formatCaskWithProvenance(c)}</li>`).join('')}
        </ul>
        <p><strong>Source Countries:</strong> ${d.sources.map(s => {
            return (window.ISO_TO_COUNTRY && window.ISO_TO_COUNTRY[s]) || s;
        }).join(', ')}</p>
        
        ${d.website ? `<a href="${d.website}" target="_blank" style="display:inline-block; margin-top:10px; padding:8px 15px; background:#d4af37; color:white; text-decoration:none; border-radius:4px;">Visit Website</a>` : ''}
    `;
    
    container.html(html);

    // Back button
    container.select('#back-to-stats-from-info').on('click', function() {
        // Reset map highlights
        d3.selectAll('.distillery-point')
            .transition().duration(200)
            .attr('opacity', 0.9)
            .attr('r', 3.5)
            .attr('fill', '#d4af37');
        
        svg.select('.distillery-flow-group').selectAll('*').remove();
            
        showCaskStatistics();
    });
}
