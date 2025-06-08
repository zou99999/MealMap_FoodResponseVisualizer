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
    plotHR(start, end);
  });
}

function plotHR(start, end) {
  d3.csv("data_p1/HR_001.csv").then(raw => {
    const filtered = raw
      .map(d => {
        const ts = new Date(d.datetime);
        return {
          timestamp: ts,
          value:     +d[" hr"]
        };
      })
      .filter(d => d.timestamp >= start && d.timestamp <= end);

    // Compute minutes_after for each reading
    filtered.forEach(d => {
      d.minutes_after = (d.timestamp - start) / 60000;
    });

    // Group into 1-minute bins by Math.floor(minutes_after)
    const hrByMinute = new Map();
    filtered.forEach(d => {
      const minuteIndex = Math.floor(d.minutes_after);
      if (!hrByMinute.has(minuteIndex)) {
        hrByMinute.set(minuteIndex, { sum: 0, count: 0 });
      }
      const bucket = hrByMinute.get(minuteIndex);
      bucket.sum   += d.value;
      bucket.count += 1;
    });

    // Build hrData: one point per minute (centered at minuteIndex + 0.5)
    const hrData = Array.from(hrByMinute.entries())
      .map(([minuteIndex, { sum, count }]) => ({
        minutes_after: minuteIndex + 0.5,
        value:         sum / count
      }))
      .sort((a, b) => a.minutes_after - b.minutes_after);

    // Clear old container, then draw HR plot
    d3.select("#hrChart").html("");
    drawLineChart(
      hrData,
      "#hrChart",
      {
        title:  "❤️ Heart Rate (avg. bpm) After Meal",
        xLabel: "Minutes Since Meal",
        yLabel: "HR (bpm)"
      }
    );
  });
}

function drawLineChart(data, containerSelector, { title, xLabel, yLabel }) {
  // 1. SVG & margins
  const margin = { top: 50, right: 30, bottom: 50, left: 60 };
  const outerWidth  = 1000;
  const outerHeight = 500;
  const width  = outerWidth  - margin.left - margin.right;
  const height = outerHeight - margin.top  - margin.bottom;

  // 1a. Clear container & append SVG
  d3.select(containerSelector).html("");
  const svgRoot = d3.select(containerSelector)
    .style("display", "flex")
    .style("justify-content", "center")
    .append("svg")
      .attr("width",  outerWidth)
      .attr("height", outerHeight);

  // 1b. Define clipPath
  svgRoot.append("defs")
    .append("clipPath")
      .attr("id", "plot-clip")
    .append("rect")
      .attr("width",  width)
      .attr("height", height);

  // 1c. Main <g> shifted by margins
  const g = svgRoot.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  // 2. Scales
  const xMax = d3.max(data, d => d.minutes_after);
  const xScale = d3.scaleLinear()
    .domain([0, xMax])
    .range([0, width]);

  const yExtent = d3.extent(data, d => d.value);
  const yPadding = (yExtent[1] - yExtent[0]) * 0.1;
  const yScale = d3.scaleLinear()
    .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
    .range([height, 0]);

  /* ---------- BOLDER PER-CHART GRADIENT ---------- */
const minVal = d3.min(data, d => d.value);
const maxVal = d3.max(data, d => d.value);

// ① 基于容器名生成唯一 ID
const gradientId = `${containerSelector.replace('#','')}-gradient`;

// ② 给不同图分配颜色组（想统一只留一组即可）
const colorStops = containerSelector.includes('glucose') ?     // 血糖：红系
  ["#FFEBEE", "#EF5350", "#7B1C1C"] :
  containerSelector.includes('hr') ?                           // 心率：蓝系
  ["#E3F2FD", "#42A5F5", "#0D47A1"] :
  ["#FFFDE7", "#FFEB3B", "#F9A825"];                           // 其他：黄系示例

// ③ 画 <linearGradient>
const defs = svgRoot.append("defs");
const gradient = defs.append("linearGradient")
  .attr("id", gradientId)
  .attr("gradientUnits", "userSpaceOnUse")
  .attr("x1", 0).attr("y1", yScale(maxVal))   // 顶：最大值
  .attr("x2", 0).attr("y2", yScale(minVal));  // 底：最小值

gradient.selectAll("stop")
  .data([
    { offset: "0%",   color: colorStops[0] },
    { offset: "50%",  color: colorStops[1] },
    { offset: "100%", color: colorStops[2] }
  ])
  .enter()
  .append("stop")
    .attr("offset", d => d.offset)
    .attr("stop-color", d => d.color);
/* ---------------------------------------------- */



  // 3. Axes
  const xAxis = d3.axisBottom(xScale)
    .ticks(Math.min(10, Math.ceil(xMax / 5)))
    .tickFormat(d => d);

  const yAxis = d3.axisLeft(yScale).ticks(6);

  // 3a. Draw X axis
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

  // 3b. Draw Y axis
  g.append("g").call(yAxis);

  // Y-axis label
  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 15)
    .attr("x", -height / 2)
    .attr("text-anchor", "middle")
    .style("font-size", "13px")
    .text(yLabel);

  // 4. Plot area (clipped)
  const plotArea = g.append("g")
    .attr("clip-path", "url(#plot-clip)");

  // 5. Zoom & pan (horizontal only)
  const zoom = d3.zoom()
    .scaleExtent([1, 10])
    .translateExtent([[0, 0], [width, 0]])   // lock vertical panning
    .extent([[0, 0], [width, height]])
    .on("zoom", ({ transform }) => {
      let zx = transform.rescaleX(xScale);
      // Clamp domain to [0, xMax]
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

      // Move circles horizontally
      plotArea.selectAll(".glucose-dot")
        .attr("cx", d => zx(d.minutes_after))
        .attr("cy", d => yScale(d.value));
    });

  // Transparent rect to capture zoom events (below circles)
  plotArea.append("rect")
    .attr("width",  width)
    .attr("height", height)
    .style("fill", "none")
    .style("pointer-events", "all")
    .call(zoom);

  // 6. Draw the line
  const lineGenerator = d3.line()
    .x(d => xScale(d.minutes_after))
    .y(d => yScale(d.value))
    .curve(d3.curveMonotoneX);

  plotArea.append("path")
    .datum(data)
    .attr("class", "glucose-line")
    .attr("d", lineGenerator)
    .attr("fill", "none")
    .attr("stroke", `url(#${gradientId})`) 
    .attr("stroke-width", 3)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round");

  // 7. Tooltip setup
  let tooltip = d3.select("#tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body")
      .append("div")
      .attr("id", "tooltip");
  }
  tooltip
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("display", "none")
    .style("z-index", 10)
    .style("background-color", "rgba(255,255,255,0.95)")
    .style("border", "1px solid #ccc")
    .style("padding", "8px")
    .style("border-radius", "4px")
    .style("font-size", "12px")
    .style("box-shadow", "0 2px 6px rgba(0, 0, 0, 0.1)");

  // 8. Draw dots on top
  plotArea.selectAll(".glucose-dot")
    .data(data)
    .enter()
    .append("circle")
      .attr("class", "glucose-dot")
      .attr("cx", d => xScale(d.minutes_after))
      .attr("cy", d => yScale(d.value))
      .attr("r", 4)
      .attr("fill", colorStops[2]) // Use the last color stop for dots
      .attr("opacity", 0.8)
      .on("mouseover", function(event, d) {
        d3.select(this)
          .attr("r", 6)
          .attr("fill", colorStops[1]);

        tooltip
          .style("left", (event.pageX + 10) + "px")
          .style("top",  (event.pageY - 28) + "px")
          .style("display", "inline-block")
          .html(`
            <strong>${d.minutes_after.toFixed(0)} min</strong><br/>
            Value: ${d.value.toFixed(1)}
          `);
      })
      .on("mousemove", function(event) {
        tooltip
          .style("left", (event.pageX + 10) + "px")
          .style("top",  (event.pageY - 28) + "px");
      })
      .on("mouseout", function() {
        d3.select(this)
          .attr("r", 4)
          .attr("fill", colorStops[2]);
        tooltip.style("display", "none");
      });

  // 9. Chart title
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
