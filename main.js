let sortedMatches; 
let matchIndex;

function recommendFood() {
  const target = {
    calorie: parseFloat(document.getElementById("calories").value),
    sugar: parseFloat(document.getElementById("sugar").value),
    protein: parseFloat(document.getElementById("protein").value),
  };
  const windowHours = parseInt(document.getElementById("window").value);

  d3.csv("data_p1/Food_Meal_Aggregated.csv").then(data => {
    const meals = data.map(d => {
      const mealTime = new Date(d.datetime);

      const hhmm = mealTime.toLocaleTimeString([], {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit"
      });

      return {
        name:    d.logged_food,
        time:    mealTime,
        timeStr: hhmm,
        calorie: +d.calorie   || 0,
        sugar:   +d.sugar     || 0,
        protein: +d.protein   || 0
      };
    });

    meals.forEach(d => {
      d.distance = Math.sqrt(
        Math.pow(d.calorie - target.calorie, 2) +
        Math.pow(d.sugar   - target.sugar,   2) +
        Math.pow(d.protein - target.protein, 2)
      );
    });

    sortedMatches = meals.sort((a, b) => a.distance - b.distance);
    matchIndex = 0;
    displayMatch(windowHours);
  });
}


function displayMatch(windowHours) {
  const match = sortedMatches[matchIndex];

  document.getElementById("results").innerHTML = `
    <p><strong>${match.name}</strong></p>
    <ul>
      <li>Calories: ${match.calorie}</li>
      <li>Sugar: ${match.sugar} g</li>
      <li>Protein: ${match.protein} g</li>
    </ul>
    <p>🕒 Time: ${match.timeStr} → +${windowHours} hour(s)</p>
    ${matchIndex < sortedMatches.length - 1
      ? `<button onclick="showNextMatch(${windowHours})">
           ❓ Don't like this one? Try Another!
         </button>`
      : `<p><em>No more similar matches available.</em></p>`}
  `;

  drawChartsFromCSV(match.time.toISOString(), windowHours);

  // mini game
  document.getElementById("results").innerHTML += `
    <button onclick="window.location.href='mini-game/index.html'">
      🧠 Try Your Knowledge
    </button>
  `;
}

function showNextMatch(windowHours) {
  matchIndex++;
  displayMatch(windowHours);
}


function drawChartsFromCSV(startTimeStr, windowHours) {
  // 1. Parse the meal start time (ISO string → JS Date)
  const start = new Date(startTimeStr);
  const end = new Date(start.getTime() + windowHours * 60 * 60 * 1000);

  // 2. Load only the Dexcom (glucose) data
  d3.csv("data_p1/Dexcom_001.csv").then(raw => {
    // 3. Parse, filter, and compute minutes_after_meal
    const glucoseData = raw
      .map(d => {
        const ts = new Date(d["Timestamp (YYYY-MM-DDThh:mm:ss)"]);
        return {
          timestamp: ts,
          value: +d["Glucose Value (mg/dL)"]
        };
      })
      .filter(d => d.timestamp >= start && d.timestamp <= end)
      .map(d => ({
        // Compute “minutes since meal” as a plain number
        minutes_after: (d.timestamp - start) / 60000, 
        value: d.value
      }));

    // 4. Clear out any old SVG, then draw the “minutes vs. glucose” chart
    d3.select("#glucoseChart").html("");
    drawLineChart(
      glucoseData,
      "#glucoseChart",
      {
        title: "🩸 Glucose (mg/dL) After Meal",
        xLabel: "Minutes Since Meal",
        yLabel: "Glucose (mg/dL)"
      }
    );
  });
}

function drawLineChart(data, containerSelector, { title, xLabel, yLabel }) {
  // === 1. SVG & Margins ===
  const margin = { top: 50, right: 30, bottom: 50, left: 60 };
  const outerWidth  = 1000;
  const outerHeight = 500;
  const width  = outerWidth  - margin.left - margin.right;
  const height = outerHeight - margin.top  - margin.bottom;

  // Clear previous content & create SVG container
  d3.select(containerSelector).html("");
  const svgRoot = d3.select(containerSelector)
    .style("display", "flex")
    .style("justify-content", "center")
    .append("svg")
      .attr("width",  outerWidth)
      .attr("height", outerHeight);

  // Define a clipPath for the plot area
  svgRoot.append("defs")
    .append("clipPath")
      .attr("id", "plot-clip")
    .append("rect")
      .attr("width",  width)
      .attr("height", height);

  // Create the main <g> shifted by margins
  const g = svgRoot.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  // === 2. Scales ===
  const xMax = d3.max(data, d => d.minutes_after);
  const xScale = d3.scaleLinear()
    .domain([0, xMax])
    .range([0, width]);

  const yExtent = d3.extent(data, d => d.value);
  const yPadding = (yExtent[1] - yExtent[0]) * 0.1;
  const yScale = d3.scaleLinear()
    .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
    .range([height, 0]);

  // === 3. Axes ===
  const xAxis = d3.axisBottom(xScale)
    .ticks(Math.min(10, Math.ceil(xMax / 5)))
    .tickFormat(d => d); // plain minute numbers

  const yAxis = d3.axisLeft(yScale).ticks(6);

  // Draw X axis at y = height
  const gx = g.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis);

  // X-axis label
  g.append("text")
    .attr("x", width / 2)
    .attr("y", height + margin.bottom - 10)
    .attr("text-anchor", "middle")
    .style("font-size", "13px")
    .text(xLabel);

  // Draw Y axis
  g.append("g").call(yAxis);

  // Y-axis label
  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 15)
    .attr("x", -height / 2)
    .attr("text-anchor", "middle")
    .style("font-size", "13px")
    .text(yLabel);

  // === 4. Plot Area (clipped) ===
  const plotArea = g.append("g")
    .attr("clip-path", "url(#plot-clip)");

  // === 5. Zoom & Pan (HORIZONTAL ONLY) ===
  // Prepare the zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([1, 10])
    .translateExtent([[0, 0], [width, 0]])
    .extent([[0, 0], [width, height]])
    .on("zoom", ({ transform }) => {
      // Compute new X-scale
      let zx = transform.rescaleX(xScale);

      // Clamp zx.domain() to [0, xMax]
      let [d0, d1] = zx.domain();
      if (d0 < 0)    d0 = 0;
      if (d1 > xMax) d1 = xMax;
      zx = zx.copy().domain([d0, d1]);

      // Update x-axis
      gx.call(xAxis.scale(zx));

      // Redraw line with new zx
      plotArea.selectAll(".glucose-line")
        .attr("d", d3.line()
          .x(d => zx(d.minutes_after))
          .y(d => yScale(d.value))
          .curve(d3.curveMonotoneX)
        );

      // Move circles only horizontally
      plotArea.selectAll(".glucose-dot")
        .attr("cx", d => zx(d.minutes_after))
        .attr("cy", d => yScale(d.value));
    });

  // Append a transparent rect (below circles) to capture zoom gestures
  plotArea.append("rect")
    .attr("width",  width)
    .attr("height", height)
    .style("fill", "none")
    .style("pointer-events", "all")
    .call(zoom);

  // === 6. Draw the Glucose Line ===
  const lineGenerator = d3.line()
    .x(d => xScale(d.minutes_after))
    .y(d => yScale(d.value))
    .curve(d3.curveMonotoneX);

  plotArea.append("path")
    .datum(data)
    .attr("class", "glucose-line")
    .attr("d", lineGenerator)
    .attr("fill", "none")
    .attr("stroke", "#D32F2F")
    .attr("stroke-width", 2);

  // === 7. Tooltip Setup ===
  let tooltip = d3.select("#tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body")
      .append("div")
      .attr("id", "tooltip");
  }

  // === 8. Draw Dots on Top of Zoom Rect ===
  plotArea.selectAll(".glucose-dot")
    .data(data)
    .enter()
    .append("circle")
      .attr("class", "glucose-dot")
      .attr("cx", d => xScale(d.minutes_after))
      .attr("cy", d => yScale(d.value))
      .attr("r", 4)
      .attr("fill", "#D32F2F")
      .attr("opacity", 0.8)
      .on("mouseover", function(event, d) {
        // Enlarge dot and change its color
        d3.select(this)
          .attr("r", 6)
          .attr("fill", "#E57373");

        // Show tooltip, positioned just above/right of cursor
        tooltip
          .style("left", (event.pageX + 10) + "px")
          .style("top",  (event.pageY - 28) + "px")
          .style("display", "inline-block")
          .html(`
            <strong>${d.minutes_after.toFixed(0)} min</strong><br/>
            Glucose: ${d.value.toFixed(1)} mg/dL
          `);
      })
      .on("mousemove", function(event) {
        // Move tooltip along with cursor
        tooltip
          .style("left", (event.pageX + 10) + "px")
          .style("top",  (event.pageY - 28) + "px");
      })
      .on("mouseout", function() {
        // Restore dot style and hide tooltip
        d3.select(this)
          .attr("r", 4)
          .attr("fill", "#D32F2F");
        tooltip.style("display", "none");
      });

  // === 9. Chart Title ===
  g.append("text")
    .attr("x", width / 2)
    .attr("y", -margin.top / 2 + 5)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "600")
    .text(title);
}

const second = document.getElementById("fadeSecond");
const scrollCue = document.getElementById("scrollCue");

window.addEventListener("scroll", function () {
  const scrollY = window.scrollY;

  // intro section fade
  const fadeStart1 = 0;
  const fadeEnd1 = 300;
  let opacity1 = 1 - (scrollY - fadeStart1) / (fadeEnd1 - fadeStart1);
  opacity1 = Math.max(opacity1, 0);
  document.getElementById("fadeIntro").style.opacity = opacity1;

  //second
  const fadeInStart = 200;
  const fadeInEnd = 500;
  const fadeOutStart = 700;
  const fadeOutEnd = 900;

  let opacity2 = 0;
  if (scrollY > fadeInStart && scrollY < fadeInEnd) {
    opacity2 = (scrollY - fadeInStart) / (fadeInEnd - fadeInStart);
  } else if (scrollY >= fadeInEnd && scrollY < fadeOutStart) {
    opacity2 = 1;
  } else if (scrollY >= fadeOutStart && scrollY < fadeOutEnd) {
    opacity2 = 1 - (scrollY - fadeOutStart) / (fadeOutEnd - fadeOutStart);
  }

  opacity2 = Math.max(0, Math.min(opacity2, 1));
  second.style.opacity = opacity2;
  second.style.transform = `translateY(${(1 - opacity2) * 20}px)`;
  // scroll cue fade-in
  const cueTrigger = 500;
  if (scrollY > cueTrigger) {
  scrollCue.style.opacity = 1;
  scrollCue.style.transform = "translateY(0)";
}
});
