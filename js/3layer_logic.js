// ============================================================================
// MAP LAYER DRAWING & INTERACTIONS
// ============================================================================

/**
 * Initialize and draw all map layers (ocean, grid, countries, water bodies, routes)
 */
function drawLayers(countries, lakes, rivers, wineRegions) {
    // ========================================================================
    // LAYER 1: OCEAN BACKGROUND
    // ========================================================================

    // Ocean layer resets map when clicked
    svg.append("path")
        .datum({ type: "Sphere" })
        .attr("class", "sphere")
        .attr("d", path)
        .attr("fill", "#b1b4b3")
        .on("click", function() {
            updateRoutes(GLOBAL_SHIPPING_DATA); // Show ALL routes
            rotateTo([0, 0], initialScale);

            // Reset slider to the latest year
            var lastYear = ALL_YEARS[ALL_YEARS.length - 1];
            updateSliderPosition(lastYear, x);
        });

    // ========================================================================
    // LAYER 2: GRATICULE (Grid)
    // ========================================================================

    var graticule = d3.geoGraticule();
    svg.append("path").datum(graticule).attr("class", "graticule").attr("d", path)
        .attr("fill", "none").attr("stroke", "white").attr("stroke-width", 0.5).attr("stroke-opacity", 0.3);

    // ========================================================================
    // LAYER 3: COUNTRIES
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
    svg.selectAll(".river").data(rivers.features).enter().append("path").attr("class", "river").attr("d", path);

    // ========================================================================
    // LAYER 5: WINE REGIONS
    // ========================================================================

    svg.selectAll(".wine-region")
        .data(wineRegions.features)
        .enter()
        .append("path")
        .attr("class", "wine-region")
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", "#8B4513")
        .attr("stroke-width", 1.5)
        .on("mouseover", function(event, d) {
            d3.select(this).attr("stroke-width", 2.5).attr("stroke", "#D2691E");
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
            d3.select(this).attr("stroke-width", 1.5).attr("stroke", "#8B4513");
            tooltip.transition().duration(500).style("opacity", 0);
        });

    // ========================================================================
    // LAYER 6: SHIPPING ROUTES
    // ========================================================================

    // Set initial routes to the latest year
    var initialYear = ALL_YEARS[ALL_YEARS.length - 1];
    updateMapByYear(initialYear);

    // Build country selection list after data is loaded
    buildCountryList(countries);
}