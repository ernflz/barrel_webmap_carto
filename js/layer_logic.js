    // --- DRAW LAYERS ---

    // LAYER 1: OCEAN (Reset on Click)
    svg.append("path")
       .datum({type: "Sphere"})
       .attr("class", "sphere")
       .attr("d", path)
       .attr("fill", "url(#ocean-texture)")
       .on("click", function() {
            console.log("Resetting map...");
            updateRoutes(GLOBAL_SHIPPING_DATA); // Show ALL routes
            rotateTo([0, 0], initialScale);

            // Also reset the slider to the latest year (or just show all)
            var lastYear = ALL_YEARS[ALL_YEARS.length - 1];
            updateSliderPosition(lastYear, x);
       });

    // LAYER 2: GRID
    var graticule = d3.geoGraticule();
    svg.append("path").datum(graticule).attr("class", "graticule").attr("d", path)
       .attr("fill", "none").attr("stroke", "white").attr("stroke-width", 0.5).attr("stroke-opacity", 0.3);

    // LAYER 3: COUNTRIES (Filter & Zoom on Click)
    svg.selectAll(".country")
        .data(countries.features).enter().append("path")
        .attr("class", "country")
        .attr("d", path)
        .attr("fill", "#f2f0e6")
        .attr("stroke", "#999")
        .attr("stroke-width", 0.5)
        .on("click", function(event, d) {
            event.stopPropagation();
            
            var countryName = d.properties.NAME;
            console.log("Clicked: " + countryName);
            // Ensure the clicked country is selected in the sidebar list
            if (!SELECTED_COUNTRIES.has(countryName)) {
                SELECTED_COUNTRIES.add(countryName);
                // If a checkbox exists in the sidebar, check it
                var cb = document.querySelector('#country-list input.country-checkbox[value="' + countryName + '"]');
                if (cb) cb.checked = true;
            }

            // Use the selected-country filter and current year to update visible routes
            var currentYearText = d3.select("#current-year-display").text().split(": ")[1];
            var yearToUse = currentYearText || 'ALL';
            updateMapByYear(yearToUse);

            // Zoom to the country extents and its connection lines
            zoomToCountry(d);
        
        })
        .on("mouseover", function(event, d) {
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html("<strong>" + d.properties.NAME + "</strong>")
                    .style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 28) + "px");
        })
        .on("mousemove", function(event) {
            tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            tooltip.transition().duration(500).style("opacity", 0);
        });

    // LAYER 4: WATER
    svg.selectAll(".lake").data(lakes.features).enter().append("path").attr("class", "lake").attr("d", path);
    svg.selectAll(".river").data(rivers.features).enter().append("path").attr("class", "river").attr("d", path);

    // LAYER 5: DRAW INITIAL ROUTES (Set to latest year)
    var initialYear = ALL_YEARS[ALL_YEARS.length - 1];

    // Spain–UK auto-route removed per request: no yellow ocean-routed lines
    updateMapByYear(initialYear);

    // --- Draw one ocean-avoiding polyline between Algeciras (Spain) and Portsmouth (UK) ---
    (function drawOnePortConnection() {
        if (!portsGeo || !portsGeo.features) return;

        // Find port by name (Algeciras)
        var algeciras = portsGeo.features.find(f => f.properties && f.properties.name === 'Algeciras');

        // Find Portsmouth (choose the UK one near lat ~50.8)
        var possiblePorts = portsGeo.features.filter(f => f.properties && f.properties.name === 'Portsmouth');
        var portsmouth = null;
        if (possiblePorts.length === 1) portsmouth = possiblePorts[0];
        else if (possiblePorts.length > 1) {
            // pick the one with latitude around 50.8 (UK)
            portsmouth = possiblePorts.reduce(function(best, f) {
                var lat = f.geometry && f.geometry.coordinates ? f.geometry.coordinates[1] : 0;
                return (best === null || Math.abs(lat - 50.8) < Math.abs((best.geometry.coordinates[1] || 0) - 50.8)) ? f : best;
            }, null);
        }

        if (!algeciras || !portsmouth) {
            console.log('Could not find Algeciras or Portsmouth ports to draw connection.');
            return;
        }

        var start = algeciras.geometry.coordinates;
        var end = portsmouth.geometry.coordinates;

        // Build polyline using offshore waypoint insertion to avoid land runs
        function pointInLand(pt) {
            for (var i = 0; i < countries.features.length; i++) {
                try { if (d3.geoContains(countries.features[i], pt)) return true; } catch(e) {}
            }
            return false;
        }

        // Normalize lon to [-180,180]
        function normalizeLon(lon) {
            var l = lon;
            while (l > 180) l -= 360;
            while (l < -180) l += 360;
            return l;
        }

        // Try to find a nearby ocean waypoint around a midpoint by searching circular offsets
        function findWaypointAround(mid) {
            var midLon = mid[0], midLat = mid[1];
            var radii = [1, 2, 4, 8, 12]; // degrees
            var stepAngle = 30 * Math.PI/180;
            for (var ri = 0; ri < radii.length; ri++) {
                var r = radii[ri];
                for (var a = 0; a < 2*Math.PI; a += stepAngle) {
                    var candLon = normalizeLon(midLon + r * Math.cos(a));
                    var candLat = midLat + r * Math.sin(a);
                    if (candLat > 89.9) candLat = 89.9; if (candLat < -89.9) candLat = -89.9;
                    var cand = [candLon, candLat];
                    if (!pointInLand(cand)) return cand;
                }
            }
            return null;
        }

        // Use explicit manual offshore waypoints (approx. 10 points) to force an ocean-only path.
        // These are placed progressively west then north of Iberia into the Bay of Biscay,
        // then east toward the English Channel, keeping clear of the coastline.
        

       
    })();
    // --- 9. INTERACTION: SPIN & ZOOM ---
    var sensitivity = 75;
    // Interaction disabled: static Equal Earth projection (no drag/zoom)

}).catch(function(error) {
    console.error("Error:", error);
});