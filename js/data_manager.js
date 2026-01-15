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

