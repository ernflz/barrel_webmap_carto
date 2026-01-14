// --- 1. SETUP ---
var width = window.innerWidth;
var height = window.innerHeight;

// Create Tooltip
var tooltip = d3.select("body").append("div").attr("class", "tooltip");

var svg = d3.select("#mapContainer")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

// --- 2. PROJECTION ---
var initialScale = height / 2.5;
var projection = d3.geoOrthographic()
    .scale(initialScale)
    .translate([width / 2, height / 2])
    .clipAngle(90);
var path = d3.geoPath().projection(projection);

// --- 3. GLOBAL VARIABLES ---
var GLOBAL_SHIPPING_DATA = [];
var LAND_CHECKER = null;
var ALL_YEARS = []; // To store unique years for the timeline
var SELECTED_COUNTRIES = new Set(); // Active countries to filter routes

// --- 4. ANIMATION HELPERS ---
function updateRoutes(dataToShow) {
    // We transform the raw data into GeoJSON LineStrings
    var routeFeatures = dataToShow.map(route => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: route.path },
        properties: { 
            name: route.name, 
            color: route.color, 
            info: route.info,
            id: route.name + route.value // Unique ID for D3 updates
        }
    }));
    // We'll draw each route as a group containing a primary path and several sketch strokes
    var groups = svg.selectAll('.shipping-route-group')
        .data(routeFeatures, d => d.properties.id);

    groups.exit().remove();

    var enter = groups.enter().append('g').attr('class', 'shipping-route-group');

    // helper to jitter coordinates a bit (in degrees) to simulate sketchiness
    function jitterCoords(coords, amp) {
        return coords.map(function(c) {
            return [c[0] + (Math.random() - 0.5) * amp, c[1] + (Math.random() - 0.5) * amp];
        });
    }

    // For each entering group, append several path layers (primary + sketches)
    enter.each(function(d) {
        var g = d3.select(this);
        // primary stroke
        g.append('path').attr('class', 'shipping-route primary')
            .datum(d)
            .attr('d', path)
            .attr('fill', 'none')
            .attr('stroke', d.properties.color)
            .attr('stroke-width', 3.5)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .attr('opacity', 0.95);

        // sketch layers: several thinner, dashed or semi-transparent strokes
        for (var i = 0; i < 3; i++) {
            var amp = 0.12 + i * 0.08; // jitter amplitude in degrees
            var strokeW = 1.2 + i * 0.6;
            var op = 0.35 - i * 0.08;
            var dash = (i === 1) ? '6,6' : null;
            var sketchPath = { type: 'LineString', coordinates: jitterCoords(d.geometry.coordinates, amp) };
            g.append('path').attr('class', 'shipping-route sketch sketch-' + i)
                .datum(sketchPath)
                .attr('d', path)
                .attr('fill', 'none')
                .attr('stroke', d.properties.color)
                .attr('stroke-width', strokeW)
                .attr('stroke-linecap', 'round')
                .attr('stroke-linejoin', 'round')
                .attr('stroke-dasharray', dash)
                .attr('opacity', op);
        }

        // add interaction on the primary path
        g.select('.shipping-route.primary')
            .on('mouseover', function(event, dd) {
                var p = d3.select(this);
                p.raise().attr('stroke-width', 6).attr('stroke', '#ffffff');
                tooltip.transition().duration(200).style('opacity', 1);
                tooltip.html('<strong>' + d.properties.name + '</strong><br/>' + d.properties.info)
                       .style('left', (event.pageX + 15) + 'px').style('top', (event.pageY - 28) + 'px');
            })
            .on('mousemove', function(event) { tooltip.style('left', (event.pageX + 15) + 'px').style('top', (event.pageY - 28) + 'px'); })
            .on('mouseout', function(event) {
                var p = d3.select(this);
                p.attr('stroke-width', 3.5).attr('stroke', d.properties.color);
                tooltip.transition().duration(500).style('opacity', 0);
            });
    });

    // Update positions of all groups (for projection changes)
    svg.selectAll('.shipping-route-group').each(function(d) {
        var g = d3.select(this);
        // primary is bound to the full feature
        g.select('.shipping-route.primary').datum(d).attr('d', path).attr('stroke', d.properties.color);
        // sketch layers are bound to LineString datums with jitter; recompute jitter each update
        g.selectAll('.shipping-route.sketch').each(function(sd, idx) {
            var amp = 0.12 + idx * 0.08;
            var sketchPath = { type: 'LineString', coordinates: jitterCoords(d.geometry.coordinates, amp) };
            d3.select(this).datum(sketchPath).attr('d', path).attr('stroke', d.properties.color);
        });
    });
}

// SMOOTH TRANSITION FUNCTION
function rotateTo(centroid, scale) {
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
                path = d3.geoPath().projection(projection); // Recalculate Path
                svg.selectAll("path").attr("d", path);       // Redraw everything
            };
        });
}

// Zoom to a country and any connecting routes: compute bounds and pick appropriate scale
function zoomToCountry(countryFeature) {
    var countryName = countryFeature.properties && (countryFeature.properties.NAME || countryFeature.properties.name);

    // Collect relevant routes (LineString coordinates)
    var relevant = GLOBAL_SHIPPING_DATA.filter(function(r) {
        return r.countries && r.countries.includes(countryName) || (r.name && r.name.includes(countryName));
    });

    // Create a feature collection including the country and route lines
    var feats = [countryFeature];
    relevant.forEach(function(r) {
        feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: r.path } });
    });

    var fc = { type: 'FeatureCollection', features: feats };

    // Compute centroid for rotation
    var centroid = d3.geoCentroid(countryFeature);

    // Temporarily set projection to target rotation to measure bounds
    var prevRotate = projection.rotate();
    var prevScale = projection.scale();
    var targetRotate = [-centroid[0], -centroid[1], 0];
    projection.rotate(targetRotate);
    path = d3.geoPath().projection(projection);

    var b = path.bounds(fc);
    var dx = Math.max(1, b[1][0] - b[0][0]);
    var dy = Math.max(1, b[1][1] - b[0][1]);

    // Compute scale factor to fit bounds within viewport with some margin
    var factor = Math.min((width * 0.7) / dx, (height * 0.7) / dy);
    var desiredScale = Math.max(50, Math.min(prevScale * factor, prevScale * 20));

    // Restore previous rotate/scale before animating
    projection.rotate(prevRotate);
    projection.scale(prevScale);

    // Finally animate to the target rotation and scale
    rotateTo(centroid, desiredScale);

    // Update displayed routes (filter to relevant)
    if (relevant.length > 0) updateRoutes(relevant);
}

// NEW FUNCTION: Filter by Year and Update Map
function updateMapByYear(targetYear) {
    if (targetYear === "ALL") {
        updateRoutes(GLOBAL_SHIPPING_DATA);
        console.log("Showing all routes.");
        return;
    }
    
    var targetYearInt = parseInt(targetYear);
    
    var filteredRoutes = GLOBAL_SHIPPING_DATA.filter(function(r) {
        return r.year === targetYearInt;
    });

    // If any countries are selected in the sidebar, further filter by them
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
        console.log("No recorded trade routes for year " + targetYear);
    }
}


// --- 5. LOAD & DRAW ---
Promise.all([
    d3.json("dbs/ne_10m_admin_0_countries.json"),
    d3.json("dbs/ne_10m_rivers_lake_centerlines.json"),
    d3.json("dbs/ne_10m_lakes.json"),
    d3.json("dbs/ne_10m_coastline.json"),
    d3.json("dbs/ne_10m_ports.json"),
    // ⬇ CRITICAL: dsv(";") tells D3 to read Semicolons!
    d3.dsv(";", "dbs/trade_data.csv"),
    d3.dsv(";", "dbs/ports.csv"),
    // Shipping routes file requested by user
    d3.json("dbs/shipping_routes.json")
]).then(function(files) {

    var countries = files[0];
    function isLand(coords, countriesGeoJSON) {
        return false;
    }
    var rivers = files[1];
    var lakes = files[2];
    var coastlines = files[3];
    var portsGeo = files[4];
    var tradeData = files[5];
    var portData = files[6];
    var shippingRoutesFile = files[7];

    // --- STEP A: MAP ISO CODES TO COORDINATES ---
    var countryCoords = {};
    
    portData.forEach(function(row) {
        var lon = parseFloat(row.Longitude);
        var lat = parseFloat(row.Latitude);
        countryCoords[row.ISO_Code] = [lon, lat];
    });

    // Extract all unique years from the trade data for the slider domain
    ALL_YEARS = Array.from(new Set(tradeData.map(d => parseInt(d.refYear)))).sort(d3.ascending);


    var centroidCoords = {};
    countries.features.forEach(function(f) {
      if(f.properties && f.properties.ADM0_A3 && f.geometry) {
        // We still use the GeoJSON to get the actual country center for ZOOM/ROTATION
        centroidCoords[f.properties.ADM0_A3] = d3.geoCentroid(f);
    }       
        // Fix geometry orientation (Standard fix for Natural Earth data)
        if(!f.geometry) return;
        if(f.geometry.type === "Polygon") f.geometry.coordinates.forEach(r => r.reverse());
        if(f.geometry.type === "MultiPolygon") f.geometry.coordinates.forEach(p => p.forEach(r => r.reverse()));
        
        // Add random population for the tooltip (optional)
        f.properties.population = Math.floor(Math.random() * 50000000);
    });

    // --- STEP B: PROCESS THE CSV INTO ROUTES (MODIFIED) ---
    
    

    // --- STEP C: LOAD ROUTES FROM shipping_routes.json (if present) ---
    try {
        var defaultYear = (ALL_YEARS && ALL_YEARS.length) ? ALL_YEARS[ALL_YEARS.length - 1] : null;
        if (shippingRoutesFile) {
            // Support both GeoJSON-like and Esri JSON (paths) formats
            if (shippingRoutesFile.features && Array.isArray(shippingRoutesFile.features)) {
                shippingRoutesFile.features.forEach(function(feat) {
                    if (!feat.geometry) return;
                    var coords = [];
                    if (feat.geometry.type === 'LineString') coords = feat.geometry.coordinates;
                    else if (feat.geometry.type === 'MultiLineString') coords = [].concat.apply([], feat.geometry.coordinates);
                    else if (feat.geometry.paths) {
                        // Esri-style paths: detect Web Mercator (large values) and convert
                        feat.geometry.paths.forEach(function(p) {
                            p.forEach(function(c) {
                                if (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) coords.push(mercatorToLatLon(c[0], c[1]));
                                else coords.push([c[0], c[1]]);
                            });
                        });
                    }

                    GLOBAL_SHIPPING_DATA.push({
                        name: (feat.properties && (feat.properties.name || feat.properties.route || (feat.properties.reporterISO + ' - ' + feat.properties.partnerISO))) || 'Route',
                        info: feat.properties && JSON.stringify(feat.properties) || '',
                        value: feat.properties && (feat.properties.Shape_Length || feat.properties.Shape_Length) || 0,
                        color: '#0099ff',
                        path: coords,
                        countries: [(feat.properties && feat.properties.reporterISO) || '', (feat.properties && feat.properties.partnerISO) || ''],
                        year: defaultYear
                    });
                });
            }
        }
    } catch (e) { console.warn('Error loading shipping routes:', e); }

    console.log("Successfully loaded " + GLOBAL_SHIPPING_DATA.length + " routes (CSV + shipping_routes.json).");


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

    // --- 9. INTERACTION: SPIN & ZOOM (Globe) ---
    var sensitivity = 75;
    var drag = d3.drag().on("drag", function(event) {
        var rotate = projection.rotate ? projection.rotate() : [0,0,0];
        var k = sensitivity / projection.scale();
        projection.rotate([rotate[0] + event.dx * k, rotate[1] - event.dy * k]);
        path = d3.geoPath().projection(projection);
        svg.selectAll("path").attr("d", path);
    });

    var zoom = d3.zoom().scaleExtent([initialScale * 0.25, initialScale * 4]).on("zoom", function(event) {
        projection.scale(event.transform.k);
        path = d3.geoPath().projection(projection);
        svg.selectAll("path").attr("d", path);
    });

    svg.call(drag);
    svg.call(zoom).call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(initialScale));

    // --- COUNTRY LIST UI: build list of countries that have associated routes ---
    (function buildCountryList() {
        // Append the list to the Controls tab
        var container = document.getElementById('tab-controls-content');

        // Compute unique country names from the shipping data
        var countrySet = new Set();
        GLOBAL_SHIPPING_DATA.forEach(function(r) {
            if (r.countries && Array.isArray(r.countries)) r.countries.forEach(function(c) { if (c) countrySet.add(c); });
        });

        var countriesArr = Array.from(countrySet).sort();

        // Remove existing list if present
        var existing = container.querySelector('.country-list-inner');
        if (existing) existing.remove();

        var list = document.createElement('div');
        list.className = 'country-list-inner';

        if (countriesArr.length === 0) {
            list.textContent = 'No country route data available.';
            container.appendChild(list);
            return;
        }

        // Add header with title and counter
        var header = document.createElement('div');
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

        // Add quick controls
        var ctrlRow = document.createElement('div');
        ctrlRow.style.display = 'flex';
        ctrlRow.style.gap = '6px';
        ctrlRow.style.marginBottom = '8px';

        var selectAllBtn = document.createElement('button');
        selectAllBtn.textContent = 'Select All';
        selectAllBtn.className = 'country-btn';
        selectAllBtn.onclick = function() { countriesArr.forEach(c => SELECTED_COUNTRIES.add(c)); updateMapByYear(document.getElementById('current-year-display') ? document.getElementById('current-year-display').textContent.split(': ')[1] : 'ALL'); buildCountryList(); };
        
        var clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        clearBtn.className = 'country-btn';
        clearBtn.onclick = function() { SELECTED_COUNTRIES.clear(); updateMapByYear(document.getElementById('current-year-display') ? document.getElementById('current-year-display').textContent.split(': ')[1] : 'ALL'); buildCountryList(); };

        ctrlRow.appendChild(selectAllBtn);
        ctrlRow.appendChild(clearBtn);
        list.appendChild(ctrlRow);

        // Container for country items with scroll
        var itemsContainer = document.createElement('div');
        itemsContainer.className = 'country-items-container';

        countriesArr.forEach(function(cn) {
            var item = document.createElement('div');
            item.className = 'country-item';
            item.setAttribute('data-country', cn.toLowerCase());

            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'country-checkbox';
            cb.value = cn;

            // default checked if previously selected
            cb.checked = SELECTED_COUNTRIES.has(cn);

            cb.addEventListener('change', function(ev) {
                if (ev.target.checked) SELECTED_COUNTRIES.add(cn); else SELECTED_COUNTRIES.delete(cn);
                // Respect current year selection
                var currentYearText = document.getElementById('current-year-display') ? document.getElementById('current-year-display').textContent.split(': ')[1] : null;
                var yearToUse = currentYearText || 'ALL';
                updateMapByYear(yearToUse);
                // Update counter
                var counter = document.getElementById('country-counter');
                if (counter) counter.textContent = SELECTED_COUNTRIES.size + ' / ' + countriesArr.length + ' selected';
            });

            var label = document.createElement('div');
            label.className = 'country-label';
            label.textContent = cn;
            label.addEventListener('click', function() {
                // When clicking the name, zoom to the country and ensure it's selected
                if (!SELECTED_COUNTRIES.has(cn)) { cb.checked = true; SELECTED_COUNTRIES.add(cn); }
                // Find the country feature
                var cf = countries.features.find(function(f) { var n = f.properties && (f.properties.NAME || f.properties.name); return n === cn; });
                if (cf) zoomToCountry(cf);
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
    })();
    // LAYER 6: ATMOSPHERE
    var defs = svg.append("defs");

    // Ocean brushstroke texture pattern
    var pattern = defs.append("pattern")
        .attr("id", "ocean-texture")
        .attr("patternUnits", "userSpaceOnUse")
        .attr("width", 400)
        .attr("height", 400);

    // darker base for more visible texture
    pattern.append("rect").attr("width", 400).attr("height", 400).attr("fill", "#89a8c6");

    // primary bold brush strokes
    var strokes = pattern.append("g").attr("transform", "rotate(-18)").attr("fill", "none").attr("stroke", "#6f98b0").attr("stroke-width", 28).attr("stroke-linecap", "round").attr("opacity", 0.18);
    for (var yy = -400; yy < 800; yy += 36) {
        strokes.append("line").attr("x1", -400).attr("y1", yy).attr("x2", 1200).attr("y2", yy + 8);
    }

    // secondary medium strokes
    var strokes2 = pattern.append("g").attr("transform", "rotate(-12)").attr("fill", "none").attr("stroke", "#9fc3dd").attr("stroke-width", 14).attr("stroke-linecap", "round").attr("opacity", 0.12);
    for (var yy2 = -400; yy2 < 800; yy2 += 48) {
        strokes2.append("line").attr("x1", -400).attr("y1", yy2).attr("x2", 1200).attr("y2", yy2 + 4);
    }

    // delicate highlight streaks to add 'brush' feel
    var strokes3 = pattern.append("g").attr("transform", "rotate(-28)").attr("fill", "none").attr("stroke", "#ffffff").attr("stroke-width", 6).attr("stroke-linecap", "round").attr("opacity", 0.08);
    for (var yy3 = -400; yy3 < 800; yy3 += 72) {
        strokes3.append("line").attr("x1", -400).attr("y1", yy3).attr("x2", 1200).attr("y2", yy3 + 2);
    }

    var gradient = defs.append("radialGradient").attr("id", "globe-shadow").attr("cx", "60%").attr("cy", "20%");
    gradient.append("stop").attr("offset", "10%").attr("stop-color", "white").attr("stop-opacity", 0.1);
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "black").attr("stop-opacity", 0.4);
    svg.append("path").datum({type: "Sphere"}).attr("class", "shading").attr("d", path).attr("fill", "url(#globe-shadow)").attr("pointer-events", "none");

    // --- 7. INTERACTIVE TIMELINE SLIDER ---

    var timelineWidth = 600;
    var timelineHeight = 100;
    var margin = { top: 30, right: 30, bottom: 30, left: 30 };
    var innerWidth = timelineWidth - margin.left - margin.right;

    // Create a container for the slider UI (HTML div)
    var sliderContainer = d3.select("body").append("div")
        .attr("id", "slider-container")
        .style("width", timelineWidth + "px")
        .style("position", "absolute")
        .style("left", (width / 2 - timelineWidth / 2) + "px") // Center it horizontally
        .style("top", "10px"); // Position it at the top of the viewport

    // Display for the current year
    sliderContainer.append("div")
        .attr("id", "current-year-display")
        .style("text-align", "center")
        .style("color", "white")
        .style("font-size", "20px")
        .style("margin-bottom", "10px")
        .text("Current Year: " + initialYear);

    // Create a new SVG for the timeline bar
    var timelineSVG = sliderContainer.append("svg")
        .attr("width", timelineWidth)
        .attr("height", timelineHeight);

    var timelineGroup = timelineSVG.append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    // Define the scale for the discrete years
    var x = d3.scalePoint()
        .domain(ALL_YEARS)
        .range([0, innerWidth]);

    // Function to find the closest year based on x-position
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

    // Draw the horizontal line (the track)
    timelineGroup.append("line")
        .attr("class", "track-line")
        .attr("x1", x.range()[0])
        .attr("x2", x.range()[1])
        .attr("y1", 0)
        .attr("y2", 0)
        .attr("stroke", "#0099ff")
        .attr("stroke-width", "8px")
        .attr("stroke-linecap", "round");

    // Draw the year markers (ticks)
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

    // Draw the year labels
    timelineGroup.selectAll(".year-label")
        .data(ALL_YEARS)
        .enter().append("text")
        .attr("class", "year-label")
        .attr("x", d => x(d))
        .attr("y", 25) // Offset below the line
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .style("font-size", "14px")
        .text(d => d);

    // Create the moveable handle/slider circle
    var handle = timelineGroup.append("circle")
        .attr("class", "slider-handle")
        .attr("r", 10)
        .attr("cy", 0)
        .attr("fill", "white")
        .attr("stroke", "#0099ff")
        .attr("stroke-width", 4)
        .style("cursor", "ew-resize");

    // Function to snap the handle and update the map
    function updateSliderPosition(year, scale) {
        var xPos = scale(year);
        handle.attr("cx", xPos);
        updateMapByYear(year);
    }

    // 8. Add Drag Behavior to the Handle
    var dragHandler = d3.drag()
        .on("start", function() {
            d3.select(this).raise().attr("r", 12);
        })
        .on("drag", function(event) {
            // Constrain the drag to the track limits
            var newX = Math.min(innerWidth, Math.max(0, event.x));
            d3.select(this).attr("cx", newX);

            // Calculate the closest year while dragging
            var closestYear = getClosestYear(newX);
            d3.select("#current-year-display").text("Current Year: " + closestYear);
        })
        .on("end", function(event) {
            d3.select(this).attr("r", 10);
            
            // Snap the handle to the closest tick mark and update the map
            var finalX = Math.min(innerWidth, Math.max(0, event.x));
            var snappedYear = getClosestYear(finalX);
            updateSliderPosition(snappedYear, x);
        });

    dragHandler(handle);

    // Set initial position of the handle to the last year
    updateSliderPosition(initialYear, x);


    // --- 9. INTERACTION: SPIN & ZOOM ---
    var sensitivity = 75;
    // Interaction disabled: static Equal Earth projection (no drag/zoom)

}).catch(function(error) {
    console.error("Error:", error);
});

// --- Sidebar toggle (connects HTML sidebar with JS) ---
;(function() {
    var sidebarToggle = document.getElementById('sidebar-toggle');
    var legend = document.getElementById('legend');
    if (!sidebarToggle || !legend) return;

    sidebarToggle.addEventListener('click', function() {
        var isHidden = legend.style.display === 'none';
        if (isHidden) {
            legend.style.display = '';
            sidebarToggle.textContent = 'Hide';
            var existingShow = document.getElementById('sidebar-show');
            if (existingShow) existingShow.remove();
        } else {
            // Hide the legend and create a floating "Show" button so it can be restored
            legend.style.display = 'none';
            // Create floating show button if not present
            if (!document.getElementById('sidebar-show')) {
                var showBtn = document.createElement('button');
                showBtn.id = 'sidebar-show';
                showBtn.className = 'sidebar-show-button';
                showBtn.textContent = 'Show';
                document.body.appendChild(showBtn);

                showBtn.addEventListener('click', function() {
                    legend.style.display = '';
                    // ensure internal toggle text is correct
                    var internalToggle = document.getElementById('sidebar-toggle');
                    if (internalToggle) internalToggle.textContent = 'Hide';
                    showBtn.remove();
                });
            }
        }
    });
})();

// --- Tab switching (Legend vs Controls) ---
;(function() {
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