// ============================================================================
// DISTILLERY LAYER & CASK SOURCING VISUALIZATION
// ============================================================================

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
    var sidebar = d3.select("#tab-legend-content");
    var container = sidebar.select('.cask-stats-container');
    if (container.empty()) {
        // Insert at the top, leaving other content (like the routes list) alone
        // If there's a P (note), we can put it after or before. 
        // Let's put it at the top so stats are prominent.
        container = sidebar.insert('div', ':first-child').attr('class', 'cask-stats-container');
    }
    return container;
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
            caskCounts[name] = (caskCounts[name] || 0) + 1;
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
                return `
                <div class="stat-item" data-cask="${item[0].replace(/"/g, '&quot;')}" style="cursor:pointer; padding:5px; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
                    <span>${index + 1}. ${item[0]}</span>
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
        filterDistilleriesByCask(caskName);
    });
}

function filterDistilleriesByCask(caskName) {
    // Find matching distilleries
    var matches = window.GLOBAL_DISTILLERIES.filter(d => 
        d.cask_types && d.cask_types.some(c => c.trim() === caskName)
    );

    // Update Sidebar
    var container = getStatsContainer();
    
    var html = `
        <div style="margin-bottom:10px; cursor:pointer; color:#d4af37;" id="back-to-stats">← Back to Statistics</div>
        <h2>${caskName} Casks</h2>
        <p>Used by <strong>${matches.length}</strong> distilleries:</p>
        <ul style="max-height: 400px; overflow-y: auto;">
            ${matches.map(d => `
                <li style="margin-bottom:5px; cursor:pointer;" class="distillery-link" data-name="${d.name.replace(/"/g, '&quot;')}">
                    <strong>${d.name}</strong> (${d.region})
                </li>
            `).join('')}
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

function highlightDistilleries(names) {
    var nameSet = new Set(names);
    
    d3.selectAll('.distillery-point')
        .transition().duration(300)
        .attr('opacity', d => nameSet.has(d.name) ? 1 : 0.1)
        .attr('r', d => nameSet.has(d.name) ? 6 : 3.5)
        .attr('fill', d => nameSet.has(d.name) ? '#FF4500' : '#d4af37'); // Orange-Red for selection
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
            ${d.cask_types.map(c => `<li>${c}</li>`).join('')}
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
