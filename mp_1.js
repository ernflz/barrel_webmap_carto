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
// We start zoomed out
var initialScale = height / 2.5;
var projection = d3.geoOrthographic()
    .scale(initialScale)
    .translate([width / 2, height / 2])
    .clipAngle(90);

var path = d3.geoPath().projection(projection);

// --- 3. SHIPPING DATA ---
const SHIPPING_DATA = [
  { 
    name: "Atlantic Run",
    info: "Algeciras -> NYC | Cargo: Electronics",
    color: "#00FFFF", 
    countries: ["Spain", "United States of America"],
    path: [[-5.45, 36.14], [-5.80, 35.95], [-10.0, 35.50], [-40.0, 38.00], [-65.0, 39.00], [-74.0, 40.60]]
  },
  { 
    name: "Northern Link",
    info: "Bilbao -> Rotterdam | Cargo: Steel",
    color: "#FFA500", 
    countries: ["Spain", "Netherlands"],
    path: [[-3.03, 43.35], [-4.00, 44.50], [-6.00, 48.00], [-5.00, 49.00], [0.00, 50.50], [4.10, 51.95]]
  },
  { 
    name: "Galician Route",
    info: "Vigo -> Dublin | Cargo: Textiles",
    color: "#FFD700", 
    countries: ["Spain", "Ireland"],
    path: [[-8.72, 42.24], [-10.00, 43.00], [-12.00, 48.00], [-6.00, 51.50], [-6.26, 53.34]]
  },
  {
    name: "Transatlantic",
    info: "Southampton -> Miami | Cargo: Vehicles",
    color: "#00FF00", 
    countries: ["United Kingdom", "United States of America"],
    path: [[-1.40, 50.90], [-5.00, 49.50], [-20.00, 45.00], [-40.00, 35.00], [-60.00, 28.00], [-80.19, 25.76]]
  },
  {
    name: "Colonial Run",
    info: "Lisbon -> Rio | Cargo: Coffee",
    color: "#FF69B4", 
    countries: ["Portugal", "Brazil"],
    path: [[-9.13, 38.72], [-12.00, 36.00], [-25.00, 10.00], [-30.00, -10.00], [-43.17, -22.90]]
  },
  {
    name: "Med Connection",
    info: "Marseille -> Istanbul | Cargo: Machinery",
    color: "#1E90FF", 
    countries: ["France", "Turkey"],
    path: [[5.36, 43.29], [9.00, 41.00], [15.00, 37.00], [22.00, 36.00], [26.00, 39.00], [28.97, 41.00]]
  },
  {
    name: "African Link",
    info: "Le Havre -> Dakar | Cargo: Grain",
    color: "#FF4500", 
    countries: ["France", "Senegal"],
    path: [[0.10, 49.49], [-5.00, 48.00], [-10.00, 40.00], [-15.00, 30.00], [-18.00, 20.00], [-17.44, 14.69]]
  }
];

// --- 4. ANIMATION HELPERS ---
function updateRoutes(dataToShow) {
    var routeFeatures = dataToShow.map(route => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: route.path },
        properties: { name: route.name, color: route.color, info: route.info }
    }));
    var lines = svg.selectAll(".shipping-route").data(routeFeatures, d => d.properties.name);
    lines.exit().remove();
    lines.enter().append("path")
        .attr("class", "shipping-route")
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", d => d.properties.color)
        .attr("stroke-width", 3)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("opacity", 0.8)
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
    d3.json("dbs/ne_10m_coastline.json")
]).then(function(files) {

    var countries = files[0];
    var rivers = files[1];
    var lakes = files[2];
    var coastlines = files[3];

    // FIX GEOMETRY
    countries.features.forEach(function(f) {
        if(!f.geometry) return;
        if(f.geometry.type === "Polygon") f.geometry.coordinates.forEach(r => r.reverse());
        if(f.geometry.type === "MultiPolygon") f.geometry.coordinates.forEach(p => p.forEach(r => r.reverse()));
        
        f.properties.population = Math.floor(Math.random() * 50000000);
    });

    // LAYER 1: OCEAN (Reset on Click)
    svg.append("path")
       .datum({type: "Sphere"})
       .attr("class", "sphere")
       .attr("d", path)
       .attr("fill", "#a5bfdd")
       .on("click", function() {
           console.log("Resetting map...");
           updateRoutes(SHIPPING_DATA); // Show ALL
           
           // Rotate back to default view (0,0) and Zoom Out
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

            // 1. FILTER ROUTES
            var relevantRoutes = SHIPPING_DATA.filter(r => r.countries.includes(countryName));
            if (relevantRoutes.length > 0) {
                updateRoutes(relevantRoutes);
            } else {
                alert("No routes found for " + countryName);
            }

            // 2. ZOOM & ROTATE
            // Calculate the center of the clicked country
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

    // LAYER 5: INITIAL ROUTES
    updateRoutes(SHIPPING_DATA);

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
    console.error("Error:", error);
});