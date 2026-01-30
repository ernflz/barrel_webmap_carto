// ============================================================================
// MAP INITIALIZATION & SETUP
// ============================================================================

function getMapDimensions() {
    var mapContainer = d3.select("#mapContainer").node();
    if (mapContainer) {
        return {
            width: mapContainer.clientWidth || window.innerWidth,
            height: mapContainer.clientHeight || window.innerHeight
        };
    }
    return {
        width: window.innerWidth,
        height: window.innerHeight
    };
}

var dims = getMapDimensions();
var width = dims.width;
var height = dims.height;

// Create tooltip element for hover interactions
var tooltip = d3.select("body").append("div").attr("class", "tooltip");

// Create SVG container for the map
var svg = d3.select("#mapContainer")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

// ============================================================================
// PROJECTION SETUP
// ============================================================================

var initialScale = height / 2.5;
var projection = d3.geoOrthographic()
    .scale(initialScale)
    .translate([width / 2, height / 2])
    .clipAngle(90);
var path = d3.geoPath().projection(projection);

// Lightweight debounce helper to avoid calling expensive layout updates every frame
function debounce(fn, wait) {
    var t;
    return function() {
        var ctx = this, args = arguments;
        clearTimeout(t);
        t = setTimeout(function() { fn.apply(ctx, args); }, wait);
    };
}
// Expose a short-debounced port label updater to reduce thrashing during animations
window.updatePortLabelPositionsDebounced = debounce(function() {
    if (typeof window.updatePortLabelPositions === 'function') window.updatePortLabelPositions();
}, 40);

// Zoom thresholds for showing detailed layers
var ZOOM_THRESHOLD_DISTILLERIES = initialScale * 3.0; // Show distilleries at 3x zoom
var ZOOM_THRESHOLD_WINE_REGIONS = initialScale * 2.5; // Show wine regions at 2.5x zoom
var ZOOM_THRESHOLD_PORTS = initialScale * 2.5; // Show ports/labels at ~2.5x zoom

/**
 * Update visibility of zoom-dependent layers based on current scale
 */
function updateZoomDependentLayers() {
    var currentScale = projection.scale();
    
    // Show/hide wine regions based on zoom level
    if (currentScale >= ZOOM_THRESHOLD_WINE_REGIONS) {
        svg.selectAll('.wine-region').style('display', 'block');
    } else {
        svg.selectAll('.wine-region').style('display', 'none');
    }

    // Show/hide ports based on zoom level
    if (currentScale >= ZOOM_THRESHOLD_PORTS) {
        svg.selectAll('.port-node').style('display', 'block');
    } else {
        svg.selectAll('.port-node').style('display', 'none');
    }
    
    // Show/hide distilleries based on zoom level
    if (currentScale >= ZOOM_THRESHOLD_DISTILLERIES || window.DISTILLERY_FILTER_ACTIVE) {
        svg.selectAll('.distillery-point').style('display', 'block');
    } else {
        svg.selectAll('.distillery-point').style('display', 'none');
    }

    if (typeof applyDistilleryFilterVisibility === 'function') {
        applyDistilleryFilterVisibility();
    }
}

// Bring key point layers to the front (ports, labels, distilleries)
function bringForegroundLayers() {
    try {
        svg.selectAll('.country-hover-outline').raise();
        svg.selectAll('.wine-region').raise();
        svg.selectAll('.port-node').raise();
        var distilleryGroup = svg.select('.distillery-group');
        if (!distilleryGroup.empty()) distilleryGroup.raise();
    } catch (e) {
        console.warn('Foreground layer raise error:', e);
    }
}

// ============================================================================
// WINDOW RESIZE HANDLER
// ============================================================================

window.addEventListener('resize', function() {
    var newDims = getMapDimensions();
    width = newDims.width;
    height = newDims.height;

    // Update SVG dimensions
    svg.attr("width", width).attr("height", height);

    // Update projection scale and translation
    var newScale = height / 2.5;
    initialScale = newScale;
    projection.scale(newScale).translate([width / 2, height / 2]);
    
    // Recalculate zoom thresholds
    ZOOM_THRESHOLD_DISTILLERIES = initialScale * 3.0;
    ZOOM_THRESHOLD_WINE_REGIONS = initialScale * 2.5;
    ZOOM_THRESHOLD_PORTS = initialScale * 2.5;

    // Recalculate path and redraw all elements
    path = d3.geoPath().projection(projection);
    svg.selectAll("path").attr("d", path);

    // Update port icons/labels on resize
    try {
        if (typeof window.updatePortsAndLabels === 'function') {
            window.updatePortsAndLabels();
        } else if (typeof window.updatePortLabelPositions === 'function') {
            window.updatePortLabelPositions();
        }
    } catch (e) {
        console.warn('Port update error on resize:', e);
    }

    // Update distillery points
    if (typeof updateDistilleryPositions === 'function') {
        updateDistilleryPositions();
    }
    
    // Update zoom-dependent layer visibility
    if (typeof updateZoomDependentLayers === 'function') {
        updateZoomDependentLayers();
    }
});

// ============================================================================
// GLOBAL STATE VARIABLES
// ============================================================================

var GLOBAL_SHIPPING_DATA = [];
var ALL_YEARS = []; // Unique years extracted from trade data for the timeline slider
var SELECTED_COUNTRIES = new Set(); // Active countries selected for filtering routes

// ============================================================================
// ROUTE RENDERING & INTERACTION
// ============================================================================

/**
 * Transform raw route data into GeoJSON and render on map with interactive features
 */
function updateRoutes(dataToShow) {
    // Transform the raw data into GeoJSON LineString features
    var routeFeatures = dataToShow.map(route => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: route.path },
        properties: {
            name: route.name,
            color: route.color,
            info: route.info,
            id: route.name + route.value, // Unique ID for D3 updates
            tradeData: route.tradeData, // Include trade data in properties
            importerISO: route.countries && route.countries[0],
            exporterISO: route.countries && route.countries[1]
        }
    }));

    // Helper to restore a route group's styling
    function restoreRouteStyle(routeGroup) {
        var opacityMult = parseFloat(routeGroup.attr('data-opacity-mult')) || 1;
        routeGroup.select('.shipping-route.outer')
            .attr('stroke-width', 12).attr('opacity', 0.04 * opacityMult);
        routeGroup.select('.shipping-route.middle')
            .attr('stroke-width', 7).attr('opacity', 0.08 * opacityMult);
        routeGroup.select('.shipping-route.primary')
            .attr('stroke-width', 4).attr('opacity', 0.15 * opacityMult);
        tooltip.transition().duration(300).style('opacity', 0);
    }
    var groups = svg.selectAll('.shipping-route-group')
        .data(routeFeatures, d => d.properties.id);

    groups.exit().remove();

    var enter = groups.enter().append('g').attr('class', 'shipping-route-group');

    // Append path and interaction handlers to each route group
    enter.each(function(d) {
        var g = d3.select(this);
        var strokeColor = d.properties.color || '#1f6b18';
        
        // Calculate opacity intensity based on trade data
        var trade = d.properties.tradeData || { qty: 0, value: 0 };
        var tradeIntensity = Math.min(1, (trade.value || 0) / 500000); // Normalize to 0-1 range
        var baseOpacityMultiplier = Math.max(0.4, tradeIntensity); // Min 0.4x, max 1.0x

        // Create tapered effect with multiple overlapping paths
        // Outer layer (widest, most transparent) - for tips
        g.append('path').attr('class', 'shipping-route outer')
            .datum(d)
            .attr('d', path)
            .attr('fill', 'none')
            .attr('stroke', strokeColor)
            .attr('stroke-width', 18)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .attr('opacity', 0.20 * baseOpacityMultiplier)
            .style('pointer-events', 'stroke');

        // Middle layer - creates taper
        g.append('path').attr('class', 'shipping-route middle')
            .datum(d)
            .attr('d', path)
            .attr('fill', 'none')
            .attr('stroke', strokeColor)
            .attr('stroke-width', 12)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .attr('opacity', 0.20 * baseOpacityMultiplier)
            .style('pointer-events', 'stroke');

        // Inner layer (thickest in middle)
        g.append('path').attr('class', 'shipping-route primary')
            .datum(d)
            .attr('d', path)
            .attr('fill', 'none')
            .attr('stroke', strokeColor)
            .attr('stroke-width', 8)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .attr('opacity', 0.10 * baseOpacityMultiplier)
            .style('pointer-events', 'stroke');

        g.append('path').attr('class', 'shipping-route dotted')
            .datum(d)
            .attr('d', path)
            .attr('fill', 'none')
            .attr('stroke', '#d4c6b7')
            .attr('stroke-width', 3)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .attr('opacity', 0.5 * baseOpacityMultiplier)
            .attr('stroke-dasharray', '4 8')
            .style('pointer-events', 'stroke');
        
        // Store the base opacity multiplier for hover/restore operations
        g.attr('data-opacity-mult', baseOpacityMultiplier);

        // Ensure the group itself can restore on pointer leave (covers fast moves)
        g.on('mouseleave', function() { restoreRouteStyle(d3.select(this)); })
         .on('touchend', function() { restoreRouteStyle(d3.select(this)); })
         .on('touchcancel', function() { restoreRouteStyle(d3.select(this)); });

        // Add interaction handlers to all route layers
        g.selectAll('.shipping-route')
            .on('mouseover', function(event, dd) {
                var routeGroup = d3.select(this.parentNode);
                var opacityMult = parseFloat(routeGroup.attr('data-opacity-mult')) || 1;
                routeGroup.raise();
                
                // Enhance all layers on hover
                routeGroup.select('.shipping-route.outer')
                    .attr('stroke-width', 20).attr('opacity', 0.12 * opacityMult);
                routeGroup.select('.shipping-route.middle')
                    .attr('stroke-width', 14).attr('opacity', 0.24 * opacityMult);
                routeGroup.select('.shipping-route.primary')
                    .attr('stroke-width', 9).attr('opacity', 0.40 * opacityMult);
                
                tooltip.transition().duration(200).style('opacity', 1);

                // Format trade data for display
                var trade = d.properties.tradeData || { qty: 0, value: 0 };
                var importerISO = d.properties.importerISO || null;
                var exporterISO = d.properties.exporterISO || null;

                // Extract country names from ISO codes (format: "ISO1 - ISO2")
                var routeParts = d.properties.name.split(' - ');
                var isoA = importerISO || (routeParts[0] ? routeParts[0].trim() : null);
                var isoB = exporterISO || (routeParts[1] ? routeParts[1].trim() : null);
                var importerName = isoA ? ((window.ISO_TO_COUNTRY && window.ISO_TO_COUNTRY[isoA]) || isoA) : 'Unknown importer';
                var exporterName = isoB ? ((window.ISO_TO_COUNTRY && window.ISO_TO_COUNTRY[isoB]) || isoB) : 'Unknown exporter';
                var displayName = importerName + ' - ' + exporterName;

                // Title: "Importer imports casks from Exporter"
                var tooltipHTML = '<strong>' + importerName + ' imports casks from ' + exporterName + '</strong><br/>';

                // Format value: millions if >= 1M, otherwise regular number
                if (trade.value && trade.value > 0) {
                    if (trade.value >= 1000000) {
                        tooltipHTML += 'Value: $' + (trade.value / 1000000).toFixed(2) + 'M<br/>';
                    } else {
                        tooltipHTML += 'Value: $' + Math.round(trade.value) + '<br/>';
                    }
                }

                // Format amount: tons if >= 1000kg (1 ton), otherwise kilograms
                if (trade.qty && trade.qty > 0) {
                    if (trade.qty >= 1000) {
                        tooltipHTML += 'Amount: ' + (trade.qty / 1000).toFixed(2) + ' tons';
                    } else {
                        tooltipHTML += 'Amount: ' + trade.qty.toFixed(0) + ' kg';
                    }
                }

                tooltip.html(tooltipHTML)
                    .style('left', (event.pageX + 15) + 'px').style('top', (event.pageY - 28) + 'px');
            })
            .on('mousemove', function(event) {
                tooltip.style('left', (event.pageX + 15) + 'px').style('top', (event.pageY - 28) + 'px');
            })
            .on('mouseout', function(event) {
                restoreRouteStyle(d3.select(this.parentNode));
            });
    });

    // Update positions of all groups for projection changes
    svg.selectAll('.shipping-route-group').each(function(d) {
        var g = d3.select(this);
        // Update path geometry but preserve all styling
        g.selectAll('.shipping-route.outer')
            .datum(d)
            .attr('d', path);
        g.selectAll('.shipping-route.middle')
            .datum(d)
            .attr('d', path);
        g.selectAll('.shipping-route.primary')
            .datum(d)
            .attr('d', path);
    });
}

// ============================================================================
// MAP ROTATION & ZOOM ANIMATION
// ============================================================================

/**
 * Animate rotation to a new centroid with optional scale change
 */
function rotateTo(centroid, scale, onEnd) {
    var rotate = projection.rotate();
    var currentScale = projection.scale();

    // In D3, rotation is [-Long, -Lat]
    var targetRotate = [-centroid[0], -centroid[1], 0];

    // Create a transition for the projection math
    d3.transition()
        .duration(1000)
        .tween("rotate", function() {
            var r = d3.interpolate(rotate, targetRotate);
            var s = d3.interpolate(currentScale, scale || currentScale);
            return function(t) {
                projection.rotate(r(t));
                projection.scale(s(t));
                path = d3.geoPath().projection(projection); // Recalculate path

                // Update only the essential path layers each frame to reduce DOM cost
                try {
                    svg.selectAll('.sphere').attr('d', path);
                    svg.selectAll('.wooden-background').attr('d', path);
                    var scaleFactor = initialScale / projection.scale();
                    svg.selectAll('.globe-outline').attr('d', path).attr('stroke-width', 2.5 * scaleFactor);
                    svg.selectAll('.country').attr('d', path);
                    svg.selectAll('.country-hover-outline').attr('d', path);
                    svg.selectAll('.wine-region').attr('d', path);
                    svg.selectAll('.lake').attr('d', path);
                    if (typeof window.updatePortsAndLabels === 'function') {
                        window.updatePortsAndLabels();
                    } else if (typeof window.updatePortLabelPositions === 'function') {
                        window.updatePortLabelPositions();
                    }
                    // Update shipping route groups while preserving structure
                    svg.selectAll('.shipping-route-group').each(function(d) {
                        d3.select(this).selectAll('.shipping-route').attr('d', path);
                    });
                    // Update distillery flows (path elements)
                    svg.selectAll('.distillery-flow-path').attr('d', path);
                } catch (e) {
                    // Fallback to a full redraw if something unexpected fails
                    svg.selectAll('path').attr('d', path);
                }

                // Keep port labels aligned during animation
                if (typeof window.updatePortsAndLabels === 'function') {
                    window.updatePortsAndLabels();
                } else if (typeof window.updatePortLabelPositionsDebounced === 'function') {
                    window.updatePortLabelPositionsDebounced();
                }

                // Update distillery points during animation
                if (typeof updateDistilleryPositions === 'function') {
                    updateDistilleryPositions();
                }
            };
        })
        .on('end', function() {
            if (typeof onEnd === 'function') onEnd();
        });
}

/**
 * Zoom to a country and show any connecting routes
 * Computes appropriate bounds and scale for the view
 */
function zoomToCountry(countryFeature) {
    var countryName = countryFeature.properties && (countryFeature.properties.NAME || countryFeature.properties.name);
    var countryISO = countryFeature.properties && (countryFeature.properties.ADM0_A3 || countryFeature.properties.ISO_A3 || countryFeature.properties.iso_a3);

    // Use mainland polygon for France (exclude overseas territories)
    function getMainlandFeature(feature) {
        if (!feature || !feature.geometry) return feature;
        if (feature.geometry.type === 'MultiPolygon') {
            var polys = feature.geometry.coordinates || [];
            if (!polys.length) return feature;
            var bestIndex = 0;
            var bestArea = -Infinity;
            polys.forEach(function(coords, i) {
                var polyFeature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: coords } };
                var area = d3.geoArea(polyFeature);
                if (area > bestArea) {
                    bestArea = area;
                    bestIndex = i;
                }
            });
            return {
                type: 'Feature',
                properties: feature.properties,
                geometry: { type: 'Polygon', coordinates: polys[bestIndex] }
            };
        }
        return feature;
    }

    var zoomFeature = (countryISO === 'FRA' || countryName === 'France')
        ? getMainlandFeature(countryFeature)
        : countryFeature;

    // Collect relevant routes - match by country name or ISO code
    var relevant = GLOBAL_SHIPPING_DATA.filter(function(r) {
        if (!r.countries) return false;
        // Check if this route involves the clicked country
        return r.countries.some(function(c) {
            // Match by name or ISO code
            return c === countryName ||
                   (countryFeature.properties.ADM0_A3 && c === countryFeature.properties.ADM0_A3);
        });
    });

    // Create a feature collection including the country and route lines
    var feats = [zoomFeature];
    relevant.forEach(function(r) {
        if (r.path && r.path.length > 0) {
            feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: r.path } });
        }
    });

    var fc = { type: 'FeatureCollection', features: feats };

    // Compute centroid for rotation
    var centroid = d3.geoCentroid(zoomFeature);
    // Temporarily set projection to target rotation to measure bounds
    var prevRotate = projection.rotate();
    var prevScale = projection.scale();
    var targetRotate = [-centroid[0], -centroid[1], 0];
    projection.rotate(targetRotate);
    path = d3.geoPath().projection(projection);

    var b = path.bounds(fc);
    var dx = Math.max(1, b[1][0] - b[0][0]);
    var dy = Math.max(1, b[1][1] - b[0][1]);

    // Compute scale factor to fit bounds within viewport with margin
    var factor = Math.min((width * 0.7) / dx, (height * 0.7) / dy);
    var desiredScale = Math.max(50, Math.min(prevScale * factor, prevScale * 20));

    // Restore previous rotate/scale before animating
    projection.rotate(prevRotate);
    projection.scale(prevScale);

    // Center the country in the middle of the screen
    var targetCentroid = centroid;

    // Animate to the target rotation and scale
    rotateTo(targetCentroid, desiredScale);

    // Update the checkbox for this country if it exists
    if (countryISO && window.COUNTRY_CHECKBOXES && window.COUNTRY_CHECKBOXES[countryISO]) {
        // Uncheck all other countries
        Object.keys(window.COUNTRY_CHECKBOXES).forEach(function(code) {
            window.COUNTRY_CHECKBOXES[code].checked = false;
        });
        // Check only this country
        window.COUNTRY_CHECKBOXES[countryISO].checked = true;
        
        // Update the select all checkbox state
        if (typeof window.UPDATE_SELECT_ALL === 'function') {
            window.UPDATE_SELECT_ALL();
        }
    }

    // Update displayed routes (show only relevant routes for this country)
    if (relevant.length > 0) {
        updateRoutes(relevant);
    } else {
        updateRoutes([]);
    }

    // Ensure ports, labels, and distilleries are on top after routes update
    bringForegroundLayers();
}

/**
 * Zoom to a wine region using an existing vertex from its geometry (no centroids)
 */
function zoomToWineRegion(regionName) {
    if (!window.WINE_REGIONS_GEOJSON || !regionName) return;

    // Find the feature by Region property
    var feature = window.WINE_REGIONS_GEOJSON.features.find(function(f) {
        return f.properties && f.properties.Region === regionName;
    });
    if (!feature || !feature.geometry) return;

    // Use the first coordinate in the geometry as the anchor point
    function getAnchor(geom) {
        if (!geom || !geom.coordinates) return null;
        if (geom.type === 'Polygon' && geom.coordinates[0] && geom.coordinates[0][0]) {
            return geom.coordinates[0][0];
        }
        if (geom.type === 'MultiPolygon' && geom.coordinates[0] && geom.coordinates[0][0] && geom.coordinates[0][0][0]) {
            return geom.coordinates[0][0][0];
        }
        return null;
    }

    var anchor = getAnchor(feature.geometry);
    if (!anchor) return;

    // Temporarily rotate to the anchor point to measure bounds for scaling
    var prevRotate = projection.rotate();
    var prevScale = projection.scale();
    var targetRotate = [-anchor[0], -anchor[1], 0];
    projection.rotate(targetRotate);
    path = d3.geoPath().projection(projection);

    var fc = { type: 'FeatureCollection', features: [feature] };
    var b = path.bounds(fc);
    var dx = Math.max(1, b[1][0] - b[0][0]);
    var dy = Math.max(1, b[1][1] - b[0][1]);
    var factor = Math.min((width * 0.7) / dx, (height * 0.7) / dy);
    // Enforce a moderate zoom for wine regions - reduced for less zoom
    var minRegionScale = initialScale * 3.5;
    var desiredScale = Math.max(minRegionScale, Math.max(100, Math.min(prevScale * factor, initialScale * 9)));

    // Restore before animating
    projection.rotate(prevRotate);
    projection.scale(prevScale);

    // Ensure regions are visible during zoom animation
    svg.selectAll('.wine-region').style('display', 'block');

    // Compute horizontal offset to center the region in the visible map area
    // accounting for both the sidebar on the left and stats panel on the right
    try {
        var legend = document.getElementById('legend');
        var statsPanel = document.getElementById('cask-stats-panel');
        
        // Get widths of sidebar and stats panel
        var legendWidth = (legend && legend.style.display !== 'none') ? (legend.offsetWidth || 0) : 0;
        var statsPanelWidth = statsPanel ? (statsPanel.offsetWidth || 0) : 0;
        
        // Calculate the center of the visible area between the panels
        var totalOffset = (statsPanelWidth - legendWidth) / 2;
        var offsetPx = totalOffset;

        // Convert pixel offset to radians using scale (orthographic approx)
        var scaleForCalc = Math.max(1, desiredScale || projection.scale());
        var offsetRad = offsetPx / scaleForCalc; // ~ radians
        var offsetDeg = (offsetRad * 180) / Math.PI;

        // Adjust longitude to center in visible area
        var adjustedAnchor = [anchor[0] + offsetDeg, anchor[1]];

        rotateTo(adjustedAnchor, desiredScale, function() {
            if (typeof updateZoomDependentLayers === 'function') {
                updateZoomDependentLayers();
            }
            // Show distilleries and cask statistics for this region
            if (typeof highlightDistilleriesForWineRegion === 'function') {
                highlightDistilleriesForWineRegion(regionName);
            }
        });
    } catch (e) {
        // Fallback to default centering if anything fails
        rotateTo(anchor, desiredScale, function() {
            if (typeof updateZoomDependentLayers === 'function') {
                updateZoomDependentLayers();
            }
            if (typeof highlightDistilleriesForWineRegion === 'function') {
                highlightDistilleriesForWineRegion(regionName);
            }
        });
    }
}

/**
 * Filter routes by year and optionally by selected countries
 */
function updateMapByYear(targetYear) {
    if (targetYear === "ALL") {
        updateRoutes(GLOBAL_SHIPPING_DATA);
        return;
    }

    var targetYearInt = parseInt(targetYear);

    var filteredRoutes = GLOBAL_SHIPPING_DATA.filter(function(r) {
        return r.year === targetYearInt;
    });

    // If any countries are selected, further filter by them
    if (SELECTED_COUNTRIES && SELECTED_COUNTRIES.size > 0) {
        filteredRoutes = filteredRoutes.filter(function(r) {
            return r.countries && r.countries.some(function(c) { return SELECTED_COUNTRIES.has(c); });
        });
    }

    // Update the displayed year text
    d3.select("#current-year-display").text("Current Year: " + targetYear);

    if (filteredRoutes.length > 0) {
        updateRoutes(filteredRoutes);
    } else {
        updateRoutes([]);
    }
}

