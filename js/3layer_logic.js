// ============================================================================
// MAP LAYER DRAWING & INTERACTIONS
// ============================================================================

/**
 * Initialize and draw all map layers (ocean, grid, countries, water bodies, ports, routes)
 */
function drawLayers(countries, lakes, wineRegions, portFeatures) {
    // ========================================================================
    // LAYER 1: WOODEN TEXTURE BACKGROUND
    // ========================================================================

    // Wooden texture pattern definition
    svg.append("defs")
        .append("pattern")
        .attr("id", "woodenTexture")
        .attr("patternUnits", "userSpaceOnUse")
        .attr("width", width)
        .attr("height", height)
        .append("image")
        .attr("href", "symbol/wooden-floor-background.jpg")
        .attr("width", width)
        .attr("height", height)
        .attr("preserveAspectRatio", "xMidYMid slice");

    // Wooden background sphere (clickable to reset)
    svg.append("path")
        .datum({ type: "Sphere" })
        .attr("class", "wooden-background")
        .attr("d", path)
        .attr("fill", "url(#woodenTexture)")
        .attr("stroke", "none")
        .on("click", function() {
            updateRoutes(GLOBAL_SHIPPING_DATA); // Show ALL routes
            rotateTo([0, 0], initialScale);

            // Reset slider to the latest year
            var lastYear = ALL_YEARS[ALL_YEARS.length - 1];
            updateSliderPosition(lastYear, x);
        });

    // Globe edge outline (on top of texture)
    svg.append("path")
        .datum({ type: "Sphere" })
        .attr("class", "globe-outline")
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", "#574c3b")
        .attr("stroke-width", 2.5)
        .style("pointer-events", "none");

    // Country hover outline (kept above other layers)
    var countryHoverOutline = svg.append("path")
        .attr("class", "country-hover-outline")
        .attr("d", path)
        .style("display", "none")
        .style("pointer-events", "none");

    // ========================================================================
    // LAYER 2: COUNTRIES
    // ========================================================================

    // Countries layer with click-to-zoom and hover tooltips
    svg.selectAll(".country")
        .data(countries.features).enter().append("path")
        .attr("class", "country")
        .attr("d", path)
        .attr("fill", "#ada096")
        .attr("stroke", "#999")
        .attr("stroke-width", 0.5)
        .on("click", function(event, d) {
            event.stopPropagation();

            var countryName = d.properties.NAME;

            // Zoom to the country and show its connecting routes
            zoomToCountry(d);
        })
        .on("mouseover", function(event, d) {
            var sel = d3.select(this);
            var origStroke = sel.attr("stroke");
            var origStrokeWidth = sel.attr("stroke-width");
            sel.attr("data-orig-stroke", origStroke || "#574c3b")
               .attr("data-orig-stroke-width", origStrokeWidth || 1)
               .attr("stroke", "#ffd166")
                    .attr("stroke-width", 2);
            if (countryHoverOutline) {
                countryHoverOutline.datum(d)
                    .attr("d", path)
                    .style("display", "block");
            }
            if (typeof bringForegroundLayers === 'function') {
                bringForegroundLayers();
            }
            if (typeof applyDistilleryFilterVisibility === 'function') {
                applyDistilleryFilterVisibility();
            }
            tooltip.transition().duration(200).style("opacity", 1);
            var countryISO = d.properties.ADM0_A3;
            var countryName = d.properties.NAME;
            // Find all routes involving this country
            var routes = (window.GLOBAL_SHIPPING_DATA || []).filter(function(r) {
                return r.countries && r.countries.includes(countryISO);
            });
            var tooltipHTML = "<strong>" + countryName + "</strong>";
            if (routes.length > 0) {
                // Aggregate trade by partner
                var partnerTotals = {};
                routes.forEach(function(r) {
                    var partners = r.countries.filter(function(c) { return c !== countryISO; });
                    var partner = partners[0] || countryISO;
                    if (!partnerTotals[partner]) partnerTotals[partner] = { qty: 0, value: 0 };
                    if (r.tradeData) {
                        partnerTotals[partner].qty += r.tradeData.qty || 0;
                        partnerTotals[partner].value += r.tradeData.value || 0;
                    }
                });
                // Find top partner by value
                var topPartner = Object.entries(partnerTotals).sort(function(a, b) { return b[1].value - a[1].value; })[0];
                if (topPartner) {
                    var partnerISO = topPartner[0];
                    var partnerName = (window.ISO_TO_COUNTRY && window.ISO_TO_COUNTRY[partnerISO]) || partnerISO;
                    var value = topPartner[1].value;
                    var qty = topPartner[1].qty;
                    tooltipHTML += '<br/><span style="color:#888">Top Trade Partner:</span> ' + partnerName;
                    tooltipHTML += '<br/><span style="color:#888">Total Trade Value:</span> $' + (value >= 1000000 ? (value/1000000).toFixed(2) + 'M' : Math.round(value));
                    tooltipHTML += '<br/><span style="color:#888">Total Quantity:</span> ' + (qty >= 1000 ? (qty/1000).toFixed(2) + ' tons' : Math.round(qty) + ' kg');
                }
            }
            tooltip.html(tooltipHTML)
                .style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 28) + "px");
        })
        .on("mousemove", function(event) {
            tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            var sel = d3.select(this);
            var origStroke = sel.attr("data-orig-stroke") || "#574c3b";
            var origStrokeWidth = sel.attr("data-orig-stroke-width") || 1;
            sel.attr("stroke", origStroke)
               .attr("stroke-width", origStrokeWidth);
            if (countryHoverOutline) {
                countryHoverOutline.style("display", "none");
            }
            if (typeof applyDistilleryFilterVisibility === 'function') {
                applyDistilleryFilterVisibility();
            }
            tooltip.transition().duration(500).style("opacity", 0);
        });

    // Highlight countries that appear in the shipping dataset
    try {
        var countryCodesWithData = new Set();
        (window.GLOBAL_SHIPPING_DATA || []).forEach(function(r) {
            if (r.countries && Array.isArray(r.countries)) {
                r.countries.forEach(function(c) { if (c) countryCodesWithData.add(c); });
            }
        });

        svg.selectAll('.country').each(function(d) {
            var props = d && d.properties;
            var iso = props && (props.ADM0_A3 || props.iso_a3 || props.ISO_A3);
            var name = props && (props.NAME || props.name);
            var has = false;
            if (iso && countryCodesWithData.has(iso)) has = true;
            if (!has && name && countryCodesWithData.has(name)) has = true;
            d3.select(this)
                .classed('has-data', has)
                .attr('fill', has ? '#8f8072' : '#ada096')
                .attr('stroke', '#999');
        });
    } catch (e) {
        console.warn('Country highlight error:', e);
    }

    // ========================================================================
    // LAYER 4: WATER BODIES (Lakes & Rivers)
    // ========================================================================

    svg.selectAll(".lake").data(lakes.features).enter().append("path").attr("class", "lake").attr("d", path);

    // ========================================================================
    // LAYER 5: PORTS (from CSV)
    // ========================================================================

    portFeatures = portFeatures || [];

    // Port symbols with labels inside the SVG icon
    var PORT_ICON_SIZE = 70;

    var portNodes = svg.selectAll('.port-node')
        .data(portFeatures)
        .enter()
        .append('g')
        .attr('class', 'port-node')
        .attr('pointer-events', 'none')
        .style('display', 'none');

    portNodes.append('image')
        .attr('class', 'port-icon')
        .attr('href', 'symbol/slice4.svg')
        .attr('width', PORT_ICON_SIZE)
        .attr('height', PORT_ICON_SIZE)
        .attr('x', -PORT_ICON_SIZE / 2)
        .attr('y', -PORT_ICON_SIZE / 2)
        .attr('opacity', 0.95);

    portNodes.append('text')
        .attr('class', 'port-label')
        .text(function(d){
            var name = d.properties && d.properties.name ? d.properties.name : '';
            return name
                .replace(/^\s*Port of\s+/i, '')
                .replace(/\s+Port\s*$/i, '');
        })
        .attr('font-size', '9px')
        .attr('font-family', 'Lora, serif')
        .attr('fill', '#ffffff')
        .attr('text-anchor', 'middle')
        .attr('alignment-baseline', 'middle')
        .attr('dy', '0.35em');

    // Helper to update port symbol positions on projection changes
    window.updatePortLabelPositions = function() {
        var nodes = svg.selectAll('.port-node').nodes();
        if (!nodes || nodes.length === 0) return;

        var currentScale = projection.scale();
        var shouldShow = currentScale >= ZOOM_THRESHOLD_PORTS;

        // Get the current view center (where the projection points to)
        var rot = projection.rotate ? projection.rotate() : [0, 0, 0];
        var viewCenter = [-rot[0], -rot[1]]; // Point at center of map view

        nodes.forEach(function(node) {
            var d = d3.select(node).datum();
            var coords = d && d.geometry && d.geometry.coordinates;
            var rawName = d && d.properties && d.properties.name ? d.properties.name : '';
            var dx = 0;
            var dy = 0;
            if (/Dublin/i.test(rawName)) {
                dx = PORT_ICON_SIZE * 0.3;
                dy = -PORT_ICON_SIZE * 0.1;
            }

            // Hide if zoomed out or no coordinates
            if (!shouldShow || !coords) {
                node.style.display = 'none';
                return;
            }

            // Project the point to screen coordinates
            var c = projection(coords);
            if (!c) {
                node.style.display = 'none';
                return;
            }

            // Only show on front of globe
            var visible = d3.geoDistance(coords, viewCenter) < Math.PI / 2;
            if (!visible) {
                node.style.display = 'none';
                return;
            }

            node.style.display = 'block';
            node.setAttribute('transform', 'translate(' + (c[0] + dx) + ',' + (c[1] + dy) + ')');
        });
    };
    if (typeof window.updatePortLabelPositions === 'function') {
        window.updatePortLabelPositions();
    }

    // Helper to update both port points and labels together
    window.updatePortsAndLabels = function() {
        try {
            if (typeof window.updatePortLabelPositions === 'function') {
                window.updatePortLabelPositions();
            }
        } catch (e) {
            console.warn('Port update error:', e);
        }
    };

    // ========================================================================
    // LAYER 6: WINE REGIONS
    // ========================================================================

    svg.selectAll(".wine-region")
        .data(wineRegions.features)
        .enter()
        .append("path")
        .attr("class", "wine-region")
        .attr("d", path)
        .attr("fill", "#C8956B")
        .attr("fill-opacity", 0.50)
        .attr("stroke", "#704214")
        .attr("stroke-width", 2)
        .style("display", "none") // Initially hidden, will show on zoom
        .on("mouseover", function(event, d) {
            d3.select(this).attr("stroke-width", 3.5).attr("stroke", "#8B5A2B").attr("fill-opacity", 0.5);
            tooltip.transition().duration(200).style("opacity", 1);
            var regionName = d.properties.Region || "Wine Region";
            tooltip.html("<strong>" + regionName + "</strong>")
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mousemove", function(event) {
            tooltip.style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("stroke-width", 2).attr("stroke", "#704214").attr("fill-opacity", 0.35);
            tooltip.transition().duration(500).style("opacity", 0);
        })
        .on("click", function(event, d) {
            event.stopPropagation();
            var regionName = d.properties.Region || "Wine Region";
            if (typeof zoomToWineRegion === 'function') {
                zoomToWineRegion(regionName);
            } else if (typeof highlightDistilleriesForWineRegion === 'function') {
                // Fallback: highlight without zoom
                highlightDistilleriesForWineRegion(regionName);
            }
        });

    // ========================================================================
    // LAYER 7: SHIPPING ROUTES
    // ========================================================================

    // Set initial routes to the latest year
    var initialYear = ALL_YEARS[ALL_YEARS.length - 1];
    updateMapByYear(initialYear);

    // Build country selection list after data is loaded
    buildCountryList(countries);
    
    // Set initial visibility for zoom-dependent layers
    if (typeof updateZoomDependentLayers === 'function') {
        updateZoomDependentLayers();
    }
}