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
                svg.selectAll("path").attr("d", path);       // Redraw everything
            };
        });
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
    var portData = files[5]

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
    tradeData.forEach(function(row) {
        // 1. Determine Start & End based on Flow (Import vs Export)
        var startCode, endCode;

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
                info: row.flowDesc + " Value: $" + parseInt(row.primaryValue.replace(',', '')).toLocaleString(),
                value: row.primaryValue,
                // Color: Red (#ff4d4d) for Import, Green (#00cc66) for Export
                color: row.flowDesc === "Import" ? "#ff4d4d" : "#00cc66", 
                path: [startCoord, endCoord],
                countries: [row.reporterDesc, row.partnerDesc], // Used for filtering clicks
                year: parseInt(row.refYear) // <-- CRITICAL: Store the year!
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

            // Filter logic: Filter by country AND current year selected by the slider
            var currentYear = parseInt(d3.select("#current-year-display").text().split(": ")[1]);
            
            var relevantRoutes = GLOBAL_SHIPPING_DATA.filter(function(r) {
                // Filter by year OR show all if currentYear is NaN (error state)
                var yearMatch = isNaN(currentYear) || r.year === currentYear;
                // Filter by country name
                var countryMatch = r.countries.includes(countryName) || r.name.includes(countryName);

                return yearMatch && countryMatch;
            });

            if (relevantRoutes.length > 0) {
                updateRoutes(relevantRoutes);
            } else {
                alert("No recorded trade routes for " + countryName + " in the year " + currentYear);
            }
            
            var centroid = d3.geoCentroid(d);
            
            // Zoom in! (Scale x 2.5)
            rotateTo(centroid, initialScale * 2.5);
        
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
    updateMapByYear(initialYear);

    // LAYER 6: ATMOSPHERE
    var defs = svg.append("defs");
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
    console.error("Error:", error);
});