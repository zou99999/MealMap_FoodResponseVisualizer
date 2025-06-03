function recommendFood() {
  const target = {
    calorie: parseFloat(document.getElementById("calories").value),
    sugar: parseFloat(document.getElementById("sugar").value),
    protein: parseFloat(document.getElementById("protein").value),
  };
  const windowHours = parseInt(document.getElementById("window").value);

  d3.csv("data_p1/Food_Log_001.csv").then(data => {
    const foods = data.map(d => ({
      name: d.logged_food,
      time: d.time_begin,
      timeStr: d.time_begin.split(" ")[1],
      calorie: +d.calorie || 0,
      sugar: +d.sugar || 0,
      protein: +d.protein || 0,
    }));

    foods.forEach(d => {
      d.distance = Math.sqrt(
        Math.pow(d.calorie - target.calorie, 2) +
        Math.pow(d.sugar - target.sugar, 2) +
        Math.pow(d.protein - target.protein, 2)
      );
    });

    sortedMatches = foods.sort((a, b) => a.distance - b.distance);
    matchIndex = 0;
    displayMatch(windowHours);
  });
}

function displayMatch(windowHours) {
  const match = sortedMatches[matchIndex];
  document.getElementById("results").innerHTML = `
    <h3>✅ Closest Food Match</h3>
    <p><strong>${match.name}</strong></p>
    <ul>
      <li>Calories: ${match.calorie}</li>
      <li>Sugar: ${match.sugar}g</li>
      <li>Protein: ${match.protein}g</li>
    </ul>
    <p>🕒 Time window: ${match.timeStr} → +${windowHours}h</p>
    ${matchIndex < sortedMatches.length - 1
      ? `<button onclick="showNextMatch(${windowHours})">❓ Don't like this one 🤔️? Try Another! </button>`
      : `<p><em>No more similar matches available.</em></p>`}
  `;
  drawChartsFromCSV(match.time, windowHours);

  document.getElementById("results").innerHTML += `
  <button onclick="window.location.href='mini game/index.html'">🧠 Try Your Knowledge</button>
`;
}

function showNextMatch(windowHours) {
  matchIndex++;
  displayMatch(windowHours);
}


function drawChartsFromCSV(startTimeStr, windowHours) {
  const start = new Date(startTimeStr);
  const end = new Date(start.getTime() + windowHours * 60 * 60 * 1000);

  // glucose
  d3.csv("data_p1/Dexcom_001.csv").then(glucose => {
    const data = glucose
      .map(d => ({
        date: new Date(d["Timestamp (YYYY-MM-DDThh:mm:ss)"]),
        value: +d["Glucose Value (mg/dL)"]
      }))
      .filter(d => d.date >= start && d.date <= end);

    // clear and draw
    d3.select("#glucoseChart").html("");
    drawLineChart(data, "#glucoseChart", {
      title: "🩸 Glucose Trend",
      yLabel: "mg/dL"
    });
  });

  // heart rate
  d3.csv("data_p1/HR_001.csv").then(hr => {
    const data = hr
      .map(d => ({
        date: new Date(d["datetime"]),
        value: +d[" hr"]
      }))
      .filter(d => d.date >= start && d.date <= end);

    d3.select("#hrChart").html("");
    drawLineChart(data, "#hrChart", {
      title: "❤️ Heart Rate Trend",
      yLabel: "bpm"
    });
  });
}

function drawLineChart(data, containerSelector, { title, yLabel }) {
  const margin = { top: 40, right: 20, bottom: 40, left: 50 };
  const width = 600 - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;

  // create SVG and group
  const svg = d3.select(containerSelector)
    .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
    .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  // scales
  const x = d3.scaleTime()
    .domain(d3.extent(data, d => d.date))
    .range([0, width]);

  const y = d3.scaleLinear()
    .domain(d3.extent(data, d => d.value))
    .nice()
    .range([height, 0]);

  // axes generators
  const xAxis = d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%H:%M"));
  const yAxis = d3.axisLeft(y).ticks(6);

  // append axes
  const gx = svg.append("g")
    .attr("class", "x axis")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis);

  const gy = svg.append("g")
    .attr("class", "y axis")
    .call(yAxis);

  // line generator
  const lineGenerator = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.value));

  // path for line
  const path = svg.append("path")
    .datum(data)
    .attr("class", "line-path")
    .attr("d", lineGenerator);

  // draw dots
  const dots = svg.selectAll(".dot")
    .data(data)
    .enter().append("circle")
      .attr("class", "dot")
      .attr("cx", d => x(d.date))
      .attr("cy", d => y(d.value))
      .attr("r", 4);

  // zoom layer
  const zoomLayer = svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .style("fill", "none")
    .style("pointer-events", "all");

  // zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([1, 10])
    .translateExtent([[0, 0], [width, height]])
    .extent([[0, 0], [width, height]])
    .on("zoom", ({ transform }) => {
      // rescale x axis
      const zx = transform.rescaleX(x);
      gx.call(xAxis.scale(zx));
      // update line path
      path.attr("d", d3.line()
        .x(d => zx(d.date))
        .y(d => y(d.value))
      );
      // update dots
      dots
        .attr("cx", d => zx(d.date))
        .attr("cy", d => y(d.value));
    });

  zoomLayer.call(zoom);

  // chart title
  svg.append("text")
    .attr("class", "chart-title")
    .attr("x", width / 2)
    .attr("y", -margin.top / 2)
    .text(title);

  // y-axis label
  svg.append("text")
    .attr("class", "y-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -margin.left + 15)
    .text(yLabel);
}
