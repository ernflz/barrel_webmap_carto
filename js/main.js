initSidebar(); // Start the button listeners immediately

Promise.all([
    d3.json("dbs/ne_10m_admin_0_countries.json"),
    d3.dsv(";", "dbs/trade_data.csv"),
    d3.dsv(";", "dbs/ports.csv")
]).then(function(files) {
    var countries = files[0];
    var tradeData = files[1];

    // Background Ocean
    svg.append("path")
       .datum({type: "Sphere"})
       .attr("class", "sphere")
       .attr("d", path)
       .attr("fill", "#1a1a1a"); // Change this color to fix the "white globe"

    // Draw Countries
    svg.selectAll(".country")
        .data(countries.features)
        .enter().append("path")
        .attr("class", "country")
        .attr("d", path)
        .attr("fill", "#f2f0e6") // Standard land color
        .attr("stroke", "#999")
        .on("click", function(event, d) {
            rotateTo(d3.geoCentroid(d), projection.scale() * 1.2);
        });

    ALL_YEARS = Array.from(new Set(tradeData.map(d => parseInt(d.refYear)))).sort(d3.ascending);
    updateMapByYear(ALL_YEARS[ALL_YEARS.length - 1]);
});