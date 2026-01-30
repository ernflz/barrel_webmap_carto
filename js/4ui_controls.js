// ============================================================================
// INTERACTIVE CONTROLS & UI COMPONENTS
// ============================================================================

// ============================================================================
// SECTION 1: MAP INTERACTION (Drag & Zoom)
// ============================================================================

/**
 * Enable drag rotation of the globe
 */
var isDragging = false;
var dragEndTimer = null;

var drag = d3.drag()
    .on("start", function(event) {
        isDragging = true;
        if (dragEndTimer) clearTimeout(dragEndTimer);
        
        // Reset wine region dropdown when user starts dragging
        var wineRegionDropdown = document.getElementById('wine-region-dropdown');
        if (wineRegionDropdown) {
            wineRegionDropdown.value = '';
        }
        
        // Hide non-essential layers for performance during drag
        svg.selectAll(".lake").style("opacity", 0);
        svg.selectAll(".port").style("opacity", 0);
    })
    .on("drag", function(event) {
        var rotate = projection.rotate ? projection.rotate() : [0, 0, 0];
        var sensitivity = 75;
        var k = sensitivity / projection.scale();
        projection.rotate([rotate[0] + event.dx * k, rotate[1] - event.dy * k]);
        path = d3.geoPath().projection(projection);
        
        // Only update essential layers (countries and shipping routes)
        try {
            svg.selectAll(".sphere").attr("d", path);
            svg.selectAll(".wooden-background").attr("d", path);
            var scaleFactor = initialScale / projection.scale();
            svg.selectAll(".globe-outline").attr("d", path).attr("stroke-width", 2.5 * scaleFactor);
            svg.selectAll(".country").attr("d", path);
            svg.selectAll(".country-hover-outline").attr("d", path);
            // Update route groups properly (preserves multi-layer structure)
            svg.selectAll('.shipping-route-group').each(function(d) {
                d3.select(this).selectAll('.shipping-route').attr('d', path);
            });
            svg.selectAll(".wine-region").attr("d", path);
            if (typeof window.updatePortsAndLabels === 'function') {
                window.updatePortsAndLabels();
            }
        } catch (e) {
            console.warn("Path update error:", e);
        }
        
        // Update distillery positions during drag to prevent them from appearing to move
        if (typeof updateDistilleryPositions === 'function') {
            updateDistilleryPositions();
        }

        // Update port labels during drag
        if (typeof window.updatePortsAndLabels === 'function') {
            window.updatePortsAndLabels();
        } else if (typeof window.updatePortLabelPositions === 'function') {
            window.updatePortLabelPositions();
        }
    })
    .on("end", function(event) {
        isDragging = false;
        
        // Debounce the end to avoid rapid toggling
        if (dragEndTimer) clearTimeout(dragEndTimer);
        dragEndTimer = setTimeout(function() {
            // Restore all layers after drag completes
            path = d3.geoPath().projection(projection);
            
            try {
                svg.selectAll("path").attr("d", path);
            } catch (e) {
                console.warn("Path update error:", e);
            }

            // Refresh port points and labels after drag completes
            try {
                if (typeof window.updatePortsAndLabels === 'function') {
                    window.updatePortsAndLabels();
                }
            } catch (e) {
                console.warn("Port update error:", e);
            }
            
            // Fade layers back in
            svg.selectAll(".lake").transition().duration(200).style("opacity", 1);
            svg.selectAll(".port").transition().duration(200).style("opacity", 1);

            if (typeof applyDistilleryFilterVisibility === 'function') {
                applyDistilleryFilterVisibility();
            } else {
                svg.selectAll(".distillery-point").transition().duration(200).style("opacity", 1);
            }
            
            // Update distillery positions after drag completes
            if (typeof updateDistilleryPositions === 'function') updateDistilleryPositions();
            
            // Update zoom-dependent layer visibility
            if (typeof updateZoomDependentLayers === 'function') updateZoomDependentLayers();
        }, 150);
    });

/**
 * Enable zoom functionality for the globe
 */
var isZooming = false;
var zoomEndTimer = null;

var zoom = d3.zoom()
    // Allow deeper zoom while keeping a reasonable minimum
    .scaleExtent([initialScale * 0.25, initialScale * 8])
    .on("start", function(event) {
        isZooming = true;
        if (zoomEndTimer) clearTimeout(zoomEndTimer);
        
        // Hide non-essential layers for performance during zoom
        svg.selectAll(".lake").style("opacity", 0);
        svg.selectAll(".port").style("opacity", 0);
    })
    .on("zoom", function(event) {
        projection.scale(event.transform.k);
        path = d3.geoPath().projection(projection);

        // Only update essential layers (countries and shipping routes)
        try {
            svg.selectAll(".sphere").attr("d", path);
            svg.selectAll(".wooden-background").attr("d", path);
            var scaleFactor = initialScale / projection.scale();
            svg.selectAll(".globe-outline").attr("d", path).attr("stroke-width", 2.5 * scaleFactor);
            svg.selectAll(".country").attr("d", path);
            svg.selectAll(".country-hover-outline").attr("d", path);
            // Update route groups properly (preserves multi-layer structure)
            svg.selectAll('.shipping-route-group').each(function(d) {
                d3.select(this).selectAll('.shipping-route').attr('d', path);
            });
            svg.selectAll(".wine-region").attr("d", path);
            if (typeof window.updatePortsAndLabels === 'function') {
                window.updatePortsAndLabels();
            } else {
                if (typeof window.updatePortLabelPositions === 'function') {
                    window.updatePortLabelPositions();
                }
            }
            if (typeof updateZoomDependentLayers === 'function') {
                updateZoomDependentLayers();
            }
            // Update distillery positions during zoom
            if (typeof updateDistilleryPositions === 'function') {
                updateDistilleryPositions();
            }
        } catch (e) {
            console.warn("Path update error:", e);
        }
    })
    .on("end", function(event) {
        isZooming = false;
        
        // Debounce the end to avoid rapid toggling
        if (zoomEndTimer) clearTimeout(zoomEndTimer);
        zoomEndTimer = setTimeout(function() {
            // Restore all layers after zoom completes
            path = d3.geoPath().projection(projection);
            
            try {
                svg.selectAll(".sphere").attr("d", path);
                svg.selectAll(".country").attr("d", path);
                svg.selectAll(".country-hover-outline").attr("d", path);
                svg.selectAll(".lake").attr("d", path);
                svg.selectAll(".wine-region").attr("d", path);
                // Update route groups properly (preserves multi-layer structure)
                svg.selectAll('.shipping-route-group').each(function(d) {
                    d3.select(this).selectAll('.shipping-route').attr('d', path);
                });
                if (typeof window.updatePortsAndLabels === 'function') {
                    window.updatePortsAndLabels();
                } else {
                    if (typeof window.updatePortLabelPositions === 'function') {
                        window.updatePortLabelPositions();
                    }
                }
            } catch (e) {
                console.warn("Path update error:", e);
            }

            // Refresh port points and labels after zoom completes
            try {
                if (typeof window.updatePortsAndLabels === 'function') {
                    window.updatePortsAndLabels();
                } else {
                    if (typeof window.updatePortLabelPositions === 'function') {
                        window.updatePortLabelPositions();
                    }
                }
                if (typeof updateZoomDependentLayers === 'function') {
                    updateZoomDependentLayers();
                }
            } catch (e) {
                console.warn("Port update error:", e);
            }
            
            // Fade layers back in
            svg.selectAll(".lake").transition().duration(200).style("opacity", 1);
            svg.selectAll(".port").transition().duration(200).style("opacity", 1);

            if (typeof applyDistilleryFilterVisibility === 'function') {
                applyDistilleryFilterVisibility();
            } else {
                svg.selectAll(".distillery-point").transition().duration(200).style("opacity", 1);
            }
            
            // Update distillery positions after zoom completes
            if (typeof updateDistilleryPositions === 'function') updateDistilleryPositions();
            
            // Update zoom-dependent layer visibility
            if (typeof updateZoomDependentLayers === 'function') updateZoomDependentLayers();
        }, 150);
    });

// Apply drag and zoom to SVG
svg.call(drag);
svg.call(zoom).call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(initialScale));

// ============================================================================
// ZOOM BUTTONS (UI)
// ============================================================================

function applyZoomFactor(factor) {
    svg.transition().duration(200).call(zoom.scaleBy, factor, [width / 2, height / 2]);
}

(function initZoomButtons() {
    var zoomInBtn = document.getElementById('zoom-in');
    var zoomOutBtn = document.getElementById('zoom-out');
    if (!zoomInBtn || !zoomOutBtn) return;

    zoomInBtn.addEventListener('click', function() { applyZoomFactor(1.2); });
    zoomOutBtn.addEventListener('click', function() { applyZoomFactor(0.8); });
})();

// ============================================================================
// SECTION 2: COUNTRY SELECTION UI
// ============================================================================

/**
 * Build and render the country list UI with checkboxes and selection controls
 */
function buildCountryList(countries) {
    // Get the container element
    var container = document.getElementById('tab-controls-content');

    // Extract unique country codes from shipping data
    var countrySet = new Set();
    GLOBAL_SHIPPING_DATA.forEach(function(r) {
        if (r.countries && Array.isArray(r.countries)) {
            r.countries.forEach(function(c) {
                if (c) countrySet.add(c);
            });
        }
    });

    var countriesArr = Array.from(countrySet).sort();

    // Remove existing list if present
    var existing = container.querySelector('.country-list-inner');
    if (existing) existing.remove();

    var list = document.createElement('div');
    list.className = 'country-list-inner';

    // Handle empty data case
    if (countriesArr.length === 0) {
        list.textContent = 'No country route data available.';
        container.appendChild(list);
        return;
    }

    // ========================================================================
    // Create header with title and selection counter
    // ========================================================================

    var header = document.createElement('div');
    header.style.display = 'none';
    header.style.marginBottom = '10px';
    header.style.borderBottom = '2px solid #007acc';
    header.style.paddingBottom = '8px';

    var title = document.createElement('div');
    title.style.fontWeight = 'bold';
    title.style.fontSize = '14px';
    title.style.color = '#333';
    title.style.marginBottom = '4px';
    title.textContent = 'Select Countries';

    var counter = document.createElement('div');
    counter.id = 'country-counter';
    counter.style.fontSize = '12px';
    counter.style.color = '#666';
    counter.textContent = SELECTED_COUNTRIES.size + ' / ' + countriesArr.length + ' selected';

    header.appendChild(title);
    header.appendChild(counter);
    list.appendChild(header);

    // ========================================================================
    // Create control buttons (Select All / Clear)
    // ========================================================================

    var ctrlRow = document.createElement('div');
    ctrlRow.style.display = 'flex';
    ctrlRow.style.gap = '6px';
    ctrlRow.style.marginBottom = '8px';

    var selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.className = 'country-btn';
    selectAllBtn.onclick = function() {
        countriesArr.forEach(c => SELECTED_COUNTRIES.add(c));
        var currentYear = document.getElementById('current-year-display') ? document.getElementById('current-year-display').textContent.split(': ')[1] : 'ALL';
        updateMapByYear(currentYear);
        buildCountryList(countries);
    };

    var clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.className = 'country-btn';
    clearBtn.onclick = function() {
        SELECTED_COUNTRIES.clear();
        var currentYear = document.getElementById('current-year-display') ? document.getElementById('current-year-display').textContent.split(': ')[1] : 'ALL';
        updateMapByYear(currentYear);
        buildCountryList(countries);
    };

    ctrlRow.appendChild(selectAllBtn);
    ctrlRow.appendChild(clearBtn);
    list.appendChild(ctrlRow);

    // ========================================================================
    // Create scrollable country items with checkboxes
    // ========================================================================

    var itemsContainer = document.createElement('div');
    itemsContainer.className = 'country-items-container';

    countriesArr.forEach(function(cn) {
        var item = document.createElement('div');
        item.className = 'country-item';
        item.setAttribute('data-country', cn.toLowerCase());

        // Create checkbox
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'country-checkbox';
        cb.value = cn;
        cb.checked = SELECTED_COUNTRIES.has(cn);

        cb.addEventListener('change', function(ev) {
            if (ev.target.checked) {
                SELECTED_COUNTRIES.add(cn);
            } else {
                SELECTED_COUNTRIES.delete(cn);
            }

            // Update map with current year selection
            var currentYearText = document.getElementById('current-year-display') ? document.getElementById('current-year-display').textContent.split(': ')[1] : null;
            var yearToUse = currentYearText || 'ALL';
            updateMapByYear(yearToUse);

            // Update counter
            var counter = document.getElementById('country-counter');
            if (counter) counter.textContent = SELECTED_COUNTRIES.size + ' / ' + countriesArr.length + ' selected';
        });

        // Create label
        var label = document.createElement('div');
        label.className = 'country-label';
        label.textContent = cn;
        label.addEventListener('click', function() {
            // Ensure country is selected when label is clicked
            if (!SELECTED_COUNTRIES.has(cn)) {
                cb.checked = true;
                SELECTED_COUNTRIES.add(cn);
            }

            // Find and zoom to the country feature
            var cf = countries.features.find(function(f) {
                return f.properties && f.properties.ADM0_A3 === cn;
            });
            if (cf) zoomToCountry(cf);

            // Update map with current year
            var currentYearText = document.getElementById('current-year-display') ? document.getElementById('current-year-display').textContent.split(': ')[1] : null;
            var yearToUse = currentYearText || 'ALL';
            updateMapByYear(yearToUse);

            // Update counter
            var counter = document.getElementById('country-counter');
            if (counter) counter.textContent = SELECTED_COUNTRIES.size + ' / ' + countriesArr.length + ' selected';
        });

        item.appendChild(cb);
        item.appendChild(label);
        itemsContainer.appendChild(item);
    });

    list.appendChild(itemsContainer);
    container.appendChild(list);
}

// ============================================================================
// SECTION 3: ATMOSPHERE EFFECTS (Textures & Gradients)
// ============================================================================

var defs = svg.append("defs");

/**
 * Create ocean texture pattern with multiple stroke layers
 */
var pattern = defs.append("pattern")
    .attr("id", "ocean-texture")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 400)
    .attr("height", 400);

// Base color
pattern.append("rect").attr("width", 400).attr("height", 400).attr("fill", "#89a8c6");

// Primary bold brush strokes
var strokes = pattern.append("g").attr("transform", "rotate(-18)").attr("fill", "none").attr("stroke", "#6f98b0").attr("stroke-width", 28).attr("stroke-linecap", "round").attr("opacity", 0.18);
for (var yy = -400; yy < 800; yy += 36) {
    strokes.append("line").attr("x1", -400).attr("y1", yy).attr("x2", 1200).attr("y2", yy + 8);
}

// Secondary medium brush strokes
var strokes2 = pattern.append("g").attr("transform", "rotate(-12)").attr("fill", "none").attr("stroke", "#9fc3dd").attr("stroke-width", 14).attr("stroke-linecap", "round").attr("opacity", 0.12);
for (var yy2 = -400; yy2 < 800; yy2 += 48) {
    strokes2.append("line").attr("x1", -400).attr("y1", yy2).attr("x2", 1200).attr("y2", yy2 + 4);
}

// Tertiary highlight streaks
var strokes3 = pattern.append("g").attr("transform", "rotate(-28)").attr("fill", "none").attr("stroke", "#ffffff").attr("stroke-width", 6).attr("stroke-linecap", "round").attr("opacity", 0.08);
for (var yy3 = -400; yy3 < 800; yy3 += 72) {
    strokes3.append("line").attr("x1", -400).attr("y1", yy3).attr("x2", 1200).attr("y2", yy3 + 2);
}

/**
 * Create radial gradient for globe shadow/shading effect
 */
var gradient = defs.append("radialGradient").attr("id", "globe-shadow").attr("cx", "60%").attr("cy", "20%");
gradient.append("stop").attr("offset", "10%").attr("stop-color", "white").attr("stop-opacity", 0.1);
gradient.append("stop").attr("offset", "100%").attr("stop-color", "black").attr("stop-opacity", 0.4);

// ============================================================================
// SECTION 4: TIMELINE SLIDER
// ============================================================================

var timelineWidth = 600;
var timelineHeight = 100;
var margin = { top: 30, right: 30, bottom: 30, left: 30 };
var innerWidth = timelineWidth - margin.left - margin.right;

/**
 * Create slider container and year display
 */
var sliderContainer = d3.select("body").append("div")
    .attr("id", "slider-container")
    .style("width", timelineWidth + "px")
    .style("position", "absolute")
    .style("left", (width / 2 - timelineWidth / 2) + "px")
    .style("top", "10px")
    .style("display", "none");

/**
 * Create SVG timeline with year markers and slider handle
 */
var timelineSVG = sliderContainer.append("svg")
    .attr("width", timelineWidth)
    .attr("height", timelineHeight);

var timelineGroup = timelineSVG.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// Scale for positioning year markers
var x = d3.scalePoint()
    .domain(ALL_YEARS)
    .range([0, innerWidth]);

/**
 * Find the closest year marker to a given pixel position
 */
function getClosestYear(px) {
    var domain = x.domain();
    var minDistance = Infinity;
    var closestYear = domain[0];

    domain.forEach(year => {
        var yearPosition = x(year);
        var distance = Math.abs(yearPosition - px);
        if (distance < minDistance) {
            minDistance = distance;
            closestYear = year;
        }
    });
    return closestYear;
}

// Draw timeline track
timelineGroup.append("line")
    .attr("class", "track-line")
    .attr("x1", x.range()[0])
    .attr("x2", x.range()[1])
    .attr("y1", 0)
    .attr("y2", 0)
    .attr("stroke", "#0099ff")
    .attr("stroke-width", "8px")
    .attr("stroke-linecap", "round");

// Draw year marker ticks
timelineGroup.selectAll(".year-marker")
    .data(ALL_YEARS)
    .enter().append("line")
    .attr("class", "year-marker")
    .attr("x1", d => x(d))
    .attr("x2", d => x(d))
    .attr("y1", -5)
    .attr("y2", 5)
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

// Draw year labels
timelineGroup.selectAll(".year-label")
    .data(ALL_YEARS)
    .enter().append("text")
    .attr("class", "year-label")
    .attr("x", d => x(d))
    .attr("y", 25)
    .attr("text-anchor", "middle")
    .attr("fill", "white")
    .style("font-size", "14px")
    .text(d => d);

// Create slider handle circle
var handle = timelineGroup.append("circle")
    .attr("class", "slider-handle")
    .attr("r", 10)
    .attr("cy", 0)
    .attr("fill", "white")
    .attr("stroke", "#0099ff")
    .attr("stroke-width", 4)
    .style("cursor", "ew-resize");

/**
 * Update slider handle position and trigger map update
 */
function updateSliderPosition(year, scale) {
    var xPos = scale(year);
    handle.attr("cx", xPos);
    updateMapByYear(year);
}

/**
 * Handle slider drag interactions
 */
var dragHandler = d3.drag()
    .on("start", function() {
        d3.select(this).raise().attr("r", 12);
    })
    .on("drag", function(event) {
        // Constrain drag to track limits
        var newX = Math.min(innerWidth, Math.max(0, event.x));
        d3.select(this).attr("cx", newX);

        // Show closest year while dragging
        var closestYear = getClosestYear(newX);
        d3.select("#current-year-display").text("Current Year: " + closestYear);
    })
    .on("end", function(event) {
        d3.select(this).attr("r", 10);

        // Snap to nearest year marker
        var finalX = Math.min(innerWidth, Math.max(0, event.x));
        var snappedYear = getClosestYear(finalX);
        updateSliderPosition(snappedYear, x);
    });

dragHandler(handle);

// Set initial slider position
updateSliderPosition(initialYear, x);

// ============================================================================
// SECTION 5: SIDEBAR & TAB NAVIGATION
// ============================================================================

/**
 * Minimize/hide the sidebar
 */
function minimizeSidebar() {
    var legend = document.getElementById('legend');
    if (!legend || legend.style.display === 'none') return;
    
    legend.style.display = 'none';
    document.body.classList.add('sidebar-hidden');
    
    if (!document.getElementById('sidebar-show')) {
        var showBtn = document.createElement('button');
        showBtn.id = 'sidebar-show';
        showBtn.className = 'sidebar-show-button';
        showBtn.textContent = 'Show';
        document.body.appendChild(showBtn);

        showBtn.addEventListener('click', function() {
            legend.style.display = '';
            document.body.classList.remove('sidebar-hidden');
            showBtn.remove();
        });
    }
}

/**
 * Handle sidebar toggle (show/hide legend)
 */
(function() {
    var sidebarToggle = document.getElementById('sidebar-toggle');
    var legend = document.getElementById('legend');
    if (!sidebarToggle || !legend) return;

    sidebarToggle.addEventListener('click', function() {
        var isHidden = legend.style.display === 'none';
        if (isHidden) {
            // Show legend
            legend.style.display = '';
            sidebarToggle.textContent = 'Hide';
            var existingShow = document.getElementById('sidebar-show');
            if (existingShow) existingShow.remove();
        } else {
            // Hide legend and create floating "Show" button
            legend.style.display = 'none';
            if (!document.getElementById('sidebar-show')) {
                var showBtn = document.createElement('button');
                showBtn.id = 'sidebar-show';
                showBtn.className = 'sidebar-show-button';
                showBtn.textContent = 'Show';
                document.body.appendChild(showBtn);

                showBtn.addEventListener('click', function() {
                    legend.style.display = '';
                    var internalToggle = document.getElementById('sidebar-toggle');
                    if (internalToggle) internalToggle.textContent = 'Hide';
                    showBtn.remove();
                });
            }
        }
    });
})();

/**
 * Handle tab switching between Legend and Controls
 */
/**
 * Build and display the list of countries with routes as an interactive dropdown with checkboxes
 */
function buildCountriesWithRoutesList() {
    // Insert after the sidebar description paragraph if available
    var sidebarPara = document.querySelector('#legend .sidebar-desc');
    var insertParent = sidebarPara ? sidebarPara.parentNode : document.getElementById('tab-legend-content');
    if (!insertParent) return;

    // Extract unique country codes from shipping data
    var countrySet = new Set();
    GLOBAL_SHIPPING_DATA.forEach(function(r) {
        if (r.countries && Array.isArray(r.countries)) {
            r.countries.forEach(function(c) {
                if (c) countrySet.add(c);
            });
        }
    });

    var countriesArr = Array.from(countrySet).sort();

    // Remove existing list if present
    var existing = document.querySelector('.countries-routes-list');
    if (existing) existing.remove();

    var listDiv = document.createElement('div');
    listDiv.className = 'countries-routes-list';

    // Create content container (no dropdown button, always visible)
    var dropdownContent = document.createElement('div');
    dropdownContent.className = 'countries-dropdown-content';
    dropdownContent.style.display = 'block';
    dropdownContent.style.overflowY = 'auto';

    // Create table grid
    var table = document.createElement('div');
    table.style.display = 'grid';
    table.style.gridTemplateColumns = 'auto 1fr';
    table.style.gap = '8px 12px';
    table.style.width = '100%';

    // Store country code to checkbox mapping
    var countryCheckboxes = {};

    // Create Select/Deselect All row
    var selectAllCheckbox = document.createElement('input');
    selectAllCheckbox.type = 'checkbox';
    selectAllCheckbox.checked = true;
    selectAllCheckbox.style.cursor = 'pointer';
    selectAllCheckbox.style.width = '16px';
    selectAllCheckbox.style.height = '16px';
    selectAllCheckbox.style.margin = '0';

    var selectAllLabel = document.createElement('div');
    selectAllLabel.style.padding = '8px 8px';
    selectAllLabel.style.backgroundColor = '#e8f4f8';
    selectAllLabel.style.borderRadius = '3px';
    selectAllLabel.style.fontSize = '12px';
    selectAllLabel.style.color = '#333';
    selectAllLabel.style.fontWeight = 'bold';
    selectAllLabel.style.display = 'flex';
    selectAllLabel.style.alignItems = 'center';
    selectAllLabel.style.borderBottom = '2px solid #a89378';
    selectAllLabel.style.marginBottom = '8px';
    selectAllLabel.textContent = 'Select All / Deselect All';

    table.appendChild(selectAllCheckbox);
    table.appendChild(selectAllLabel);

    // Add country items with checkboxes
    countriesArr.forEach(function(countryCode) {
        var countryName = window.ISO_TO_COUNTRY[countryCode] || countryCode;
        
        // Checkbox cell
        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.style.cursor = 'pointer';
        checkbox.style.width = '16px';
        checkbox.style.height = '16px';
        checkbox.style.margin = '0';
        checkbox.setAttribute('data-country', countryCode);

        countryCheckboxes[countryCode] = checkbox;

        // Label cell (clickable)
        var label = document.createElement('div');
        label.style.padding = '6px 8px';
        label.style.backgroundColor = '#ffffff';
        label.style.borderRadius = '3px';
        label.style.fontSize = '12px';
        label.style.color = '#333';
        label.style.cursor = 'pointer';
        label.style.fontWeight = '500';
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.transition = 'all 0.2s ease';
        label.textContent = countryName + ' (' + countryCode + ')';

        // Hover effect
        label.addEventListener('mouseover', function() {
            label.style.backgroundColor = '#e3f2fd';
            label.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            label.style.fontWeight = 'bold';
        });

        label.addEventListener('mouseout', function() {
            label.style.backgroundColor = '#ffffff';
            label.style.boxShadow = 'none';
            label.style.fontWeight = '500';
        });

        // Handle checkbox change
        checkbox.addEventListener('change', function() {
            updateVisibleRoutes();
            updateSelectAllCheckbox();
        });

        // Handle click on label to zoom to country
        label.addEventListener('click', function(e) {
            // Find the country feature to zoom to
            var countryFeature = window.COUNTRY_FEATURES_MAP && window.COUNTRY_FEATURES_MAP[countryCode];
            if (countryFeature) {
                zoomToCountry(countryFeature);
                // Minimize sidebar after clicking
                if (typeof minimizeSidebar === 'function') {
                    minimizeSidebar();
                }
            }
        });

        table.appendChild(checkbox);
        table.appendChild(label);
    });

    // Handle Select All checkbox
    selectAllCheckbox.addEventListener('change', function() {
        var isChecked = selectAllCheckbox.checked;
        Object.keys(countryCheckboxes).forEach(function(code) {
            countryCheckboxes[code].checked = isChecked;
        });
        updateVisibleRoutes();
    });

    // Function to update Select All checkbox state
    var updateSelectAllCheckbox = function() {
        var allChecked = Object.keys(countryCheckboxes).every(function(code) {
            return countryCheckboxes[code].checked;
        });
        var someChecked = Object.keys(countryCheckboxes).some(function(code) {
            return countryCheckboxes[code].checked;
        });
        selectAllCheckbox.checked = allChecked;
        selectAllCheckbox.indeterminate = someChecked && !allChecked;
    };
    window.UPDATE_SELECT_ALL = updateSelectAllCheckbox;

    dropdownContent.appendChild(table);
    listDiv.appendChild(dropdownContent);

    // Toggle dropdown on button click
    var isOpen = false;
    listDiv.appendChild(dropdownContent);

    // Append to the countries tab container
    var countriesTab = document.getElementById('countries-tab');
    if (countriesTab) {
        countriesTab.appendChild(listDiv);
    }
    
    window.COUNTRY_CHECKBOXES = countryCheckboxes;
}

/**
 * Update visible routes based on checked countries
 */
function updateVisibleRoutes() {
    var checkboxes = window.COUNTRY_CHECKBOXES;
    if (!checkboxes) return;

    // Get all checked countries
    var visibleCountries = new Set();
    Object.keys(checkboxes).forEach(function(countryCode) {
        if (checkboxes[countryCode].checked) {
            visibleCountries.add(countryCode);
        }
    });

    // Filter routes to show only those with both countries checked
    var routesToShow = GLOBAL_SHIPPING_DATA.filter(function(route) {
        if (!route.countries) return false;
        // Show route if ANY of its countries are visible
        return route.countries.some(function(c) {
            return visibleCountries.has(c);
        });
    });

    // Update the routes displayed on map
    updateRoutes(routesToShow);
}

(function() {
    var tabLegendBtn = document.getElementById('tab-legend');
    var tabControlsBtn = document.getElementById('tab-controls');
    var tabLegendContent = document.getElementById('tab-legend-content');
    var tabControlsContent = document.getElementById('tab-controls-content');

    if (!tabLegendBtn || !tabControlsBtn || !tabLegendContent || !tabControlsContent) return;

    function switchTab(tabName) {
        if (tabName === 'legend') {
            tabLegendBtn.classList.add('active');
            tabControlsBtn.classList.remove('active');
            tabLegendContent.classList.add('active');
            tabControlsContent.classList.remove('active');
        } else if (tabName === 'controls') {
            tabLegendBtn.classList.remove('active');
            tabControlsBtn.classList.add('active');
            tabLegendContent.classList.remove('active');
            tabControlsContent.classList.add('active');
        }
    }

    tabLegendBtn.addEventListener('click', function() {
        switchTab('legend');
    });

    tabControlsBtn.addEventListener('click', function() {
        switchTab('controls');
    });
})();