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
// We removed the fake data. This array will be filled by the CSV file.
var GLOBAL_SHIPPING_DATA = [];
var LAND_CHECKER = null;

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

    var lines = svg.selectAll(".shipping-route")
        .data(routeFeatures, d => d.properties.id);

    lines.exit().remove();

    var enterLines = lines.enter().append("path")
        .attr("class", "shipping-route")
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", d => d.properties.color)
        .attr("stroke-width", 3)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("opacity", 0.8);
        
    // Add Interaction to new lines
    enterLines
        .on("mouseover", function(event, d) {
            d3.select(this).raise().attr("stroke-width", 6).attr("stroke", "white");
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html("<strong>" + d.properties.name + "</strong><br/>" + d.properties.info)
                   .style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 28) + "px");
        })
        .on("mousemove", function(event) {
            tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function(event, d) {
            d3.select(this).attr("stroke-width", 3).attr("stroke", d.properties.color);
            tooltip.transition().duration(500).style("opacity", 0);
        });

    // Update positions of existing lines (important for spinning)
    svg.selectAll(".shipping-route").attr("d", path);
}

// SMOOTH TRANSITION FUNCTION
function rotateTo(centroid, scale) {
    var rotate = projection.rotate();
    var currentScale = projection.scale();

    // In D3, rotation is [-Long, -Lat]
    var targetRotate = [-centroid[0], -centroid[1]];
    
    // Create a transition for the projection math
    d3.transition()
        .duration(1500) // 1.5 Seconds animation
        .tween("rotate", function() {
            var r = d3.interpolate(rotate, targetRotate);
            var s = d3.interpolate(currentScale, scale);
            return function(t) {
                projection.rotate(r(t));
                projection.scale(s(t));
                path = d3.geoPath().projection(projection); // Recalculate Path
                svg.selectAll("path").attr("d", path);      // Redraw everything
            };
        });
}

// --- 5. LOAD & DRAW ---
Promise.all([
    d3.json("dbs/ne_10m_admin_0_countries.json"),
    d3.json("dbs/ne_10m_rivers_lake_centerlines.json"),
    d3.json("dbs/ne_10m_lakes.json"),
    d3.json("dbs/ne_10m_coastline.json"),
    // ⬇ CRITICAL: dsv(";") tells D3 to read Semicolons!
    d3.dsv(";", "dbs/trade_data.csv"),
    d3.dsv(";", "dbs/ports.csv")
]).then(function(files) {

    var countries = files[0];
    function isLand(coords, countriesGeoJSON) {
    return false;
}
    var rivers = files[1];
    var lakes = files[2];
    var coastlines = files[3];
    var tradeData = files[4];
    var portData = files[5] // Your new CSV data

    // --- STEP A: MAP ISO CODES TO COORDINATES ---
    var countryCoords = {};
    

    // Loop through the map features to find the center of every country
    portData.forEach(function(row) {
        var lon = parseFloat(row.Longitude);
        var lat = parseFloat(row.Latitude);
        countryCoords[row.ISO_Code] = [lon, lat];
});
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

    // --- STEP B: PROCESS THE CSV INTO ROUTES ---
    tradeData.forEach(function(row) {
        // 1. Determine Start & End based on Flow (Import vs Export)
        var startCode, endCode;

        // Based on your CSV header: 'flowDesc', 'partnerISO', 'reporterISO'
        if (row.flowDesc === "Import") {
            startCode = row.partnerISO;   // Goods come FROM Partner
            endCode = row.reporterISO;    // Goods go TO Reporter
        } else {
            startCode = row.reporterISO;  // Goods leave Reporter
            endCode = row.partnerISO;     // Goods go TO Partner
        }

        // 2. Look up Coordinates in our map dictionary
        var startCoord = countryCoords[startCode];
        var endCoord = countryCoords[endCode];

        // 3. If we found both locations, create the route object
        if (startCoord && endCoord) {
            GLOBAL_SHIPPING_DATA.push({
                name: row.reporterDesc + " <-> " + row.partnerDesc,
                info: row.flowDesc + " Value: $" + parseInt(row.primaryValue).toLocaleString(),
                value: row.primaryValue,
                // Color: Red (#ff4d4d) for Import, Green (#00cc66) for Export
                color: row.flowDesc === "Import" ? "#ff4d4d" : "#00cc66", 
                path: [startCoord, endCoord],
                countries: [row.reporterDesc, row.partnerDesc] // Used for filtering clicks
            });
        }
    });

    console.log("Successfully loaded " + GLOBAL_SHIPPING_DATA.length + " routes from CSV.");


    // --- DRAW LAYERS ---

    // LAYER 1: OCEAN (Reset on Click)
    svg.append("path")
       .datum({type: "Sphere"})
       .attr("class", "sphere")
       .attr("d", path)
       .attr("fill", "#a5bfdd")
       .on("click", function() {
           console.log("Resetting map...");
           updateRoutes(GLOBAL_SHIPPING_DATA); // Show ALL routes
           rotateTo([0, 0], initialScale);
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

            // Filter logic: Check if route involves this country
            var relevantRoutes = GLOBAL_SHIPPING_DATA.filter(function(r) {
                // Check if country name is in the route's country list
                return r.countries.includes(countryName) || r.name.includes(countryName);
            });

            if (relevantRoutes.length > 0) {
                updateRoutes(relevantRoutes);
            } else {
                alert("No recorded trade routes for " + countryName);
            }
            var centroid = d3.geoCentroid(d);
            
            // Zoom in! (Scale x 2.5)
            rotateTo(centroid, initialScale * 2.5);
    // If we couldn't find the pre-calculated centroid, use the default D3 calculation
               rotateTo(d3.geoCentroid(d), initialScale * 2.5);
        
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

    // LAYER 5: DRAW ROUTES FROM CSV
    updateRoutes(GLOBAL_SHIPPING_DATA);

    // LAYER 6: ATMOSPHERE
    var defs = svg.append("defs");
    var gradient = defs.append("radialGradient").attr("id", "globe-shadow").attr("cx", "60%").attr("cy", "20%");
    gradient.append("stop").attr("offset", "10%").attr("stop-color", "white").attr("stop-opacity", 0.1);
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "black").attr("stop-opacity", 0.4);
    svg.append("path").datum({type: "Sphere"}).attr("class", "shading").attr("d", path).attr("fill", "url(#globe-shadow)").attr("pointer-events", "none");

    // --- INTERACTION: SPIN ---
    var sensitivity = 75;
    var drag = d3.drag().on("drag", function(event) {
        var rotate = projection.rotate();
        var k = sensitivity / projection.scale();
        projection.rotate([rotate[0] + event.dx * k, rotate[1] - event.dy * k]);
        path = d3.geoPath().projection(projection);
        svg.selectAll("path").attr("d", path);
    });

    var zoom = d3.zoom().scaleExtent([200, 2000]).on("zoom", function(event) {
        projection.scale(event.transform.k);
        path = d3.geoPath().projection(projection);
        svg.selectAll("path").attr("d", path);
    });

    svg.call(drag);
    svg.call(zoom).call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(initialScale));

}).catch(function(error) {
    console.error("Error:", error);
});