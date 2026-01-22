// ============================================================================
// DATA LOADING & PROCESSING
// ============================================================================

Promise.all([
    d3.json("data/basemap/ne_10m_admin_0_countries.json"),
    d3.json("data/basemap/ne_10m_lakes.json"),
    d3.json("data/basemap/ne_10m_coastline.json"),
    d3.json("data/basemap/ne_10m_ports.json"),
    // CRITICAL: dsv(";") tells D3 to parse semicolon-delimited files
    d3.dsv(";", "data/trade_data/trade_data.csv"),
    d3.dsv(";", "data/flows/ports.csv"),
    d3.json("data/flows/shipping_routes.json"),
    d3.json("data/trade_data/distilleries.json"),
    d3.json("data/basemap/wineregionseurope.json")
]).then(function(files) {

    var countries = files[0];
    var lakes = files[1];
    var coastlines = files[2];
    var portsGeo = files[3];
    var tradeData = files[4];
    var portData = files[5];
    var shippingRoutesFile = files[6];
    var distilleryData = files[7];
    var wineRegions = files[8];

    // Store wine regions globally for zoom functionality
    window.WINE_REGIONS_GEOJSON = wineRegions;
    // Store ports (CSV) globally and prepare GeoJSON Point features
    window.PORT_DATA = portData;
    window.PORT_FEATURES = Array.isArray(portData) ? portData.map(function(d) {
        return {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [parseFloat(d.Longitude), parseFloat(d.Latitude)]
            },
            properties: {
                name: d.Port_Name,
                iso: d.ISO_Code
            }
        };
    }) : [];

    // Fix geometry orientation for wine regions (same as countries)
    if (wineRegions && wineRegions.features) {
        wineRegions.features.forEach(function(f) {
            if (!f.geometry) return;
            if (f.geometry.type === "Polygon") f.geometry.coordinates.forEach(r => r.reverse());
            if (f.geometry.type === "MultiPolygon") f.geometry.coordinates.forEach(p => p.forEach(r => r.reverse()));
        });
    }

    // ========================================================================
    // STEP 1: INITIALIZE YEAR TIMELINE & COUNTRY MAPPING
    // ========================================================================

    window.GLOBAL_DISTILLERIES = distilleryData;

    // Extract all unique years from trade data for the slider
    ALL_YEARS = Array.from(new Set(tradeData.map(d => parseInt(d.refYear)))).sort(d3.ascending);

    // Create a global map of ISO codes to country names for tooltip display
    window.ISO_TO_COUNTRY = {};
    window.COUNTRY_FEATURES_MAP = {};
    countries.features.forEach(function(f) {
        if (f.properties && f.properties.ADM0_A3 && f.geometry) {
            // Map ISO code to country name
            window.ISO_TO_COUNTRY[f.properties.ADM0_A3] = f.properties.NAME || f.properties.ADMIN || f.properties.ADM0_A3;
            // Store feature for zooming
            window.COUNTRY_FEATURES_MAP[f.properties.ADM0_A3] = f;
        }

        // Fix geometry orientation (standard fix for Natural Earth data)
        if (!f.geometry) return;
        if (f.geometry.type === "Polygon") f.geometry.coordinates.forEach(r => r.reverse());
        if (f.geometry.type === "MultiPolygon") f.geometry.coordinates.forEach(p => p.forEach(r => r.reverse()));

        // Add random population for tooltip display (optional)
        f.properties.population = Math.floor(Math.random() * 50000000);
    });

    // ========================================================================
    // STEP 2: AGGREGATE TRADE DATA BY ROUTE
    // ========================================================================

    // Create a map of trade data keyed by reporter-partner-year for easy lookup
    var tradeByRoute = {};
    tradeData.forEach(function(row) {
        var key = row.reporterISO + '|' + row.partnerISO + '|' + row.refYear;
        if (!tradeByRoute[key]) {
            tradeByRoute[key] = { qty: 0, value: 0, count: 0 };
        }
        tradeByRoute[key].qty += parseFloat(row.qty) || 0;
        tradeByRoute[key].value += parseFloat(row.primaryValue) || 0;
        tradeByRoute[key].count += 1;
    });

    // ========================================================================
    // STEP 3: LOAD & PROCESS SHIPPING ROUTES
    // ========================================================================

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
                        // Esri-style paths: use coordinates directly (assuming WGS84)
                        feat.geometry.paths.forEach(function(p) {
                            p.forEach(function(c) {
                                coords.push([c[0], c[1]]);
                            });
                        });
                    }

                    var reporterISO = (feat.properties && feat.properties.reporterISO) || '';
                    var partnerISO = (feat.properties && feat.properties.partnerISO) || '';
                    var routeName = (feat.properties && (feat.properties.name || feat.properties.route || (reporterISO + ' - ' + partnerISO))) || 'Route';

                    // Look up trade data for this route in the default year
                    var tradeKey = reporterISO + '|' + partnerISO + '|' + defaultYear;
                    var tradeInfo = tradeByRoute[tradeKey] || { qty: 0, value: 0 };

                    GLOBAL_SHIPPING_DATA.push({
                        name: routeName,
                        info: routeName,
                        value: feat.properties && (feat.properties.Shape_Length || feat.properties.Shape_Length) || 0,
                        color: '#E63946',
                        path: coords,
                        countries: [reporterISO, partnerISO],
                        year: defaultYear,
                        tradeData: tradeInfo  // Attach aggregated trade info
                    });
                });
            }
        }
    } catch (e) {
        console.warn('Error loading shipping routes:', e);
    }

    // ========================================================================
    // STEP 4: INITIALIZE MAP VISUALIZATION
    // ========================================================================

    // Draw all map layers
    drawLayers(countries, lakes, wineRegions, window.PORT_FEATURES);

    // Build and display the countries with routes list in the sidebar
    buildCountriesWithRoutesList();

    // Initialize Distillery Layer
    if (typeof initDistilleryLayer === 'function') initDistilleryLayer();

    // ========================================================================
    // STEP 5: ADD WINE REGION DROPDOWN EVENT LISTENER
    // ========================================================================
    
    var wineRegionDropdown = document.getElementById('wine-region-dropdown');
    if (wineRegionDropdown && typeof zoomToWineRegion === 'function') {
        wineRegionDropdown.addEventListener('change', function(e) {
            var selectedRegion = e.target.value;
            if (selectedRegion) {
                console.log("Selected wine region:", selectedRegion);
                zoomToWineRegion(selectedRegion);
            }
        });
    }

}).catch(function(error) {
    console.error("Error loading data:", error);
})
