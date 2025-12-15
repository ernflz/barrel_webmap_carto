// --- 1. SETUP ---
var width = window.innerWidth;
var height = window.innerHeight;

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

// --- 3. STYLE DEFINITIONS ---
// A. Ocean Texture
var oceanTexture = textures.paths()
    .d("waves")
    .thicker()
    .stroke("#8da3ba") 
    .background("#eef2f5"); 
svg.call(oceanTexture);

// B. "Hand-Drawn" Filter
var defs = svg.append("defs");
var filter = defs.append("filter").attr("id", "hand-drawn");
filter.append("feTurbulence")
    .attr("type", "fractalNoise")
    .attr("baseFrequency", "0.015") 
    .attr("numOctaves", "3")
    .attr("result", "noise");
filter.append("feDisplacementMap")
    .attr("in", "SourceGraphic")
    .attr("in2", "noise")
    .attr("scale", "4");


// --- 4. HELPER FUNCTIONS ---
function updateRoutes(dataToShow) {
    // We bind data by a unique key (Name + Value) to handle updates correctly
    var lines = svg.selectAll(".shipping-route")
        .data(dataToShow, d => d.name + d.value);

    lines.exit().remove();

    var enterLines = lines.enter().append("path")
        .attr("class", "shipping-route")
        .attr("fill", "none")
        .attr("stroke", d => d.color)
        .attr("stroke-width", 2)
        .attr("opacity", 0.8)
        .attr("stroke-linecap", "round");

    // Merge and Update positions
    lines.merge(enterLines)
        .attr("d", d => {
            // Create a GeoJSON LineString on the fly
            return path({
                type: "Feature",
                geometry: { type: "LineString", coordinates: d.path }
            });
        });

    // Add Interaction
    enterLines
        .on("mouseover", function(event, d) {
            d3.select(this).raise().attr("stroke-width", 4).attr("stroke", "#fff");
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(
                "<strong>" + d.name + "</strong><br/>" +
                "Value: $" + parseInt(d.value).toLocaleString()
            )
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mousemove", function(event) {
            tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function(event, d) {
            d3.select(this).attr("stroke-width", 2).attr("stroke", d.color);
            tooltip.transition().duration(500).style("opacity", 0);
        });
}

function rotateTo(centroid, scale) {
    var rotate = projection.rotate();
    var currentScale = projection.scale();
    var targetRotate = [-centroid[0], -centroid[1]];
    d3.transition().duration(1500).tween("rotate", function() {
        var r = d3.interpolate(rotate, targetRotate);
        var s = d3.interpolate(currentScale, scale);
        return function(t) {
            projection.rotate(r(t));
            projection.scale(s(t));
            // Redraw everything
            svg.selectAll("path").attr("d", path);
            
            // Special handling for routes (since they aren't standard geojson features)
            svg.selectAll(".shipping-route").attr("d", d => path({
                type: "Feature", 
                geometry: { type: "LineString", coordinates: d.path }
            }));
        };
    });
}

// --- 5. GLOBAL VARS FOR DATA ---
var GLOBAL_SHIPPING_DATA = [];

// --- 6. LOAD & DRAW ---
Promise.all([
    d3.json("dbs/ne_10m_admin_0_countries.json"),
    d3.json("dbs/ne_10m_rivers_lake_centerlines.json"),
    d3.json("dbs/ne_10m_lakes.json"),
    d3.json("dbs/ne_10m_coastline.json"),
    // ⬇️ CHANGED THIS LINE: dsv(";") handles semicolons!
    d3.dsv(";", "dbs/trade_data.csv") 
]).then(function(files) {

    var countries = files[0];
    var rivers = files[1];
    var lakes = files[2];
    var coastlines = files[3];
    var tradeData = files[4];

    // STEP A: CREATE COORDINATE LOOKUP
    // We need to know where "IRL" or "ESP" is on the map.
    var countryCoords = {}; // Object to store { "USA": [-98, 38], ... }
    
    countries.features.forEach(function(feature) {
        // "ADM0_A3" is the standard ISO code in Natural Earth data
        var isoCode = feature.properties.ADM0_A3; 
        if (isoCode && feature.geometry) {
            // d3.geoCentroid calculates the visual center of the country
            countryCoords[isoCode] = d3.geoCentroid(feature);
        }
    });

    // STEP B: PROCESS CSV INTO ROUTES
    tradeData.forEach(function(row) {
        // 1. Identify Start and End based on 'Import' vs 'Export'
        var startCode, endCode;

        if (row.flowDesc === "Import") {
            startCode = row.partnerISO;   // Goods come FROM Partner
            endCode = row.reporterISO;    // Goods go TO Reporter
        } else {
            startCode = row.reporterISO;  // Goods leave Reporter
            endCode = row.partnerISO;     // Goods go TO Partner
        }

        // 2. Check if we have coordinates for both
        var startCoord = countryCoords[startCode];
        var endCoord = countryCoords[endCode];

        if (startCoord && endCoord) {
            GLOBAL_SHIPPING_DATA.push({
                name: row.reporterDesc + " <-> " + row.partnerDesc,
                value: row.primaryValue,
                color: row.flowDesc === "Import" ? "#C0392B" : "#27AE60", // Red for Import, Green for Export (Example)
                path: [startCoord, endCoord], // The line
                countries: [row.reporterDesc, row.partnerDesc] // For filtering
            });
        }
    });

    console.log("Generated Routes:", GLOBAL_SHIPPING_DATA.length);

    // --- DRAWING ---

    // LAYER 1: OCEAN
    svg.append("path")
       .datum({type: "Sphere"})
       .attr("class", "sphere")
       .attr("d", path)
       .attr("fill", oceanTexture.url()) 
       .on("click", function() {
           updateRoutes(GLOBAL_SHIPPING_DATA);
           rotateTo([0, 0], initialScale);
       });

    // LAYER 2: COUNTRIES
    svg.selectAll(".country")
        .data(countries.features).enter().append("path")
        .attr("class", "country")
        .attr("d", path)
        .attr("fill", "#e8e4d3")   
        .attr("stroke", "#6e6259") 
        .attr("stroke-width", 0.8)
        .style("filter", "url(#hand-drawn)") 
        .on("click", function(event, d) {
            event.stopPropagation();
            var countryName = d.properties.NAME; // Or ADM0_A3 if names don't match perfectly
            
            // Filter routes that involve this country
            var relevantRoutes = GLOBAL_SHIPPING_DATA.filter(r => r.countries.includes(countryName));
            
            if (relevantRoutes.length > 0) { 
                updateRoutes(relevantRoutes); 
            } else {
                console.log("No trade routes found for " + countryName);
            }

            var centroid = d3.geoCentroid(d);
            rotateTo(centroid, initialScale * 2.5);
        });

    // LAYER 3 & 4: LAKES & RIVERS
    svg.selectAll(".lake").data(lakes.features).enter().append("path")
        .attr("class", "lake").attr("d", path).attr("fill", "#b0c4de").style("filter", "url(#hand-drawn)");
    
    svg.selectAll(".river").data(rivers.features).enter().append("path")
        .attr("class", "river").attr("d", path).attr("fill", "none")
        .attr("stroke", "#8da3ba").attr("stroke-width", 0.6).style("filter", "url(#hand-drawn)");

    // LAYER 5: DRAW ROUTES
    updateRoutes(GLOBAL_SHIPPING_DATA);

    // LAYER 6: FRAME
    svg.append("path").datum({type: "Sphere"}).attr("d", path)
       .attr("fill", "none").attr("stroke", "#444").attr("stroke-width", 2)
       .style("filter", "url(#hand-drawn)").attr("pointer-events", "none");


    // --- INTERACTION ---
    var sensitivity = 75;
    var drag = d3.drag().on("drag", function(event) {
        var rotate = projection.rotate();
        var k = sensitivity / projection.scale();
        projection.rotate([rotate[0] + event.dx * k, rotate[1] - event.dy * k]);
        path = d3.geoPath().projection(projection);
        svg.selectAll("path").attr("d", path);
        // Redraw routes manually because they are custom objects
        svg.selectAll(".shipping-route").attr("d", d => path({
            type: "Feature", geometry: { type: "LineString", coordinates: d.path }
        }));
    });

    var zoom = d3.zoom().scaleExtent([200, 2000]).on("zoom", function(event) {
        projection.scale(event.transform.k);
        path = d3.geoPath().projection(projection);
        svg.selectAll("path").attr("d", path);
        svg.selectAll(".shipping-route").attr("d", d => path({
            type: "Feature", geometry: { type: "LineString", coordinates: d.path }
        }));
    });

    svg.call(drag);
    svg.call(zoom).call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(initialScale));

}).catch(function(error) {
    console.error("Error:", error);
});