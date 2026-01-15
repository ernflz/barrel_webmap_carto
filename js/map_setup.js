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
