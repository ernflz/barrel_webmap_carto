// ============================================================================
// MAP LAYER DRAWING & INTERACTIONS
// ============================================================================

/**
 * Initialize and draw all map layers (ocean, grid, countries, water bodies, ports, routes)
 */
function drawLayers(countries, lakes, wineRegions, portFeatures) {
    // ========================================================================
    // LAYER 1: OCEAN BACKGROUND
    // ========================================================================

    // Ocean layer resets map when clicked
    svg.append("path")
        .datum({ type: "Sphere" })
        .attr("class", "sphere")
        .attr("d", path)
        .attr("fill", "#b1b4b3")
        .attr("stroke", "none")
        .on("click", function() {
            updateRoutes(GLOBAL_SHIPPING_DATA); // Show ALL routes
            rotateTo([0, 0], initialScale);

            // Reset slider to the latest year
            var lastYear = ALL_YEARS[ALL_YEARS.length - 1];
            updateSliderPosition(lastYear, x);
        });

    // ========================================================================
    // LAYER 2: COUNTRIES
    // ========================================================================

    // Countries layer with click-to-zoom and hover tooltips
    svg.selectAll(".country")
        .data(countries.features).enter().append("path")
        .attr("class", "country")
        .attr("d", path)
        .attr("fill", "#625e4c")
        .attr("stroke", "#999")
        .attr("stroke-width", 0.5)
        .on("click", function(event, d) {
            event.stopPropagation();

            var countryName = d.properties.NAME;

            // Zoom to the country and show its connecting routes
            zoomToCountry(d);
        })
        .on("mouseover", function(event, d) {
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
            tooltip.transition().duration(500).style("opacity", 0);
        });

    // ========================================================================
    // LAYER 4: WATER BODIES (Lakes & Rivers)
    // ========================================================================

    svg.selectAll(".lake").data(lakes.features).enter().append("path").attr("class", "lake").attr("d", path);

    // ========================================================================
    // LAYER 5: PORTS (from CSV)
    // ========================================================================

    portFeatures = portFeatures || [];

    // Draw port points as projected circles
    svg.selectAll('.port-point')
        .data(portFeatures)
        .enter()
        .append('path')
        .attr('class', 'port-point')
        .attr('d', path.pointRadius(4))
        .attr('fill', '#1976d2')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.2)
        .attr('opacity', 0.9)
        .attr('pointer-events', 'none')
        .style('display', 'none');

    // Port labels
    svg.selectAll('.port-label')
        .data(portFeatures)
        .enter()
        .append('text')
        .attr('class', 'port-label')
        .text(function(d){ return d.properties && d.properties.name ? d.properties.name : ''; })
        .attr('font-size', '10.5px')
        .attr('font-family', 'Lora, serif')
        .attr('fill', '#0f3057')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.6)
        .attr('paint-order', 'stroke')
        .attr('text-anchor', 'start')
        .attr('alignment-baseline', 'middle')
        .style('display', 'none');

    // Helper to update label positions on projection changes with simple search
    window.updatePortLabelPositions = function() {
        var labels = svg.selectAll('.port-label').nodes();
        var points = svg.selectAll('.port-point').nodes();
        if (!labels || labels.length === 0) return;

        var placedBoxes = [];
        var currentScale = projection.scale();
        var shouldShow = currentScale >= ZOOM_THRESHOLD_PORTS;
        
        // Get the current view center (where the projection points to)
        var rot = projection.rotate ? projection.rotate() : [0, 0, 0];
        var viewCenter = [-rot[0], -rot[1]]; // Point at center of map view

        // Candidate offsets radiating from the port point
        var candidates = [
            { dx: 16, dy: -14 },
            { dx: 16, dy: 14 },
            { dx: -16, dy: -14 },
            { dx: -16, dy: 14 },
            { dx: 0, dy: -18 },
            { dx: 0, dy: 18 },
            { dx: 20, dy: 0 },
            { dx: -20, dy: 0 }
        ];

        labels.forEach(function(node, idx) {
            var d = d3.select(node).datum();
            var coords = d && d.geometry && d.geometry.coordinates;
            var pointNode = points[idx];

            // Hide if zoomed out or no coordinates
            if (!shouldShow || !coords) {
                node.style.display = 'none';
                if (pointNode) pointNode.style.display = 'none';
                return;
            }

            // Check if the port is visible on the front of the globe
            // Project the point to screen coordinates
            var c = projection(coords);
            
            // If projection returns null, the point is not visible (clipped)
            if (!c) {
                node.style.display = 'none';
                if (pointNode) pointNode.style.display = 'none';
                return;
            }
            
            // Double-check: port should be less than 90 degrees away from view center
            var visible = d3.geoDistance(coords, viewCenter) < Math.PI / 2;
            if (!visible) {
                node.style.display = 'none';
                if (pointNode) pointNode.style.display = 'none';
                return;
            }

            node.style.display = 'block';
            if (pointNode) pointNode.style.display = 'block';

            var bbox = node.getBBox();
            var best = null;

            candidates.forEach(function(pos) {
                var x = c[0] + pos.dx;
                var y = c[1] + pos.dy;
                // Align bbox top-left for overlap math (baseline is middle)
                var box = {
                    x: x,
                    y: y - bbox.height * 0.5,
                    width: bbox.width,
                    height: bbox.height
                };

                var overlapArea = 0;
                for (var i = 0; i < placedBoxes.length; i++) {
                    var pb = placedBoxes[i];
                    var ox = Math.max(0, Math.min(box.x + box.width, pb.x + pb.width) - Math.max(box.x, pb.x));
                    var oy = Math.max(0, Math.min(box.y + box.height, pb.y + pb.height) - Math.max(box.y, pb.y));
                    overlapArea += (ox * oy);
                }

                // Favor positions closer to the point when overlaps tie
                var distancePenalty = Math.abs(pos.dx) * 0.12 + Math.abs(pos.dy) * 0.16;
                var score = overlapArea + distancePenalty;

                if (best === null || score < best.score) {
                    best = { x: x, y: y, box: box, score: score };
                }
            });

            // Fallback to default if something went wrong
            if (!best) {
                best = { x: c[0] + 16, y: c[1] - 14, box: { x: c[0] + 16, y: c[1] - 14 - bbox.height * 0.5, width: bbox.width, height: bbox.height } };
            }

            node.setAttribute('transform', 'translate(' + best.x + ',' + best.y + ')');
            placedBoxes.push(best.box);
        });
    };
    if (typeof window.updatePortLabelPositions === 'function') {
        window.updatePortLabelPositions();
    }

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
            if (typeof highlightDistilleriesForWineRegion === 'function') {
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