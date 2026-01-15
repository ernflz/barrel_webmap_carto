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