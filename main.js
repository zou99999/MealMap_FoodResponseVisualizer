let sortedMatches;
let matchIndex = 0;

// -----------------------
// 1. Recommend a meal
// -----------------------
function recommendFood() {
  const target = {
    calorie: parseFloat(document.getElementById("calories").value),
    sugar:   parseFloat(document.getElementById("sugar").value),
    protein: parseFloat(document.getElementById("protein").value)
  };
  const windowHours = parseInt(document.getElementById("window").value, 10);

  const scales = {
    calorie:  1000,   // we expect calories up to ~1000 kcal
    sugar:    100,    // sugar up to ~100 g
    protein:  100     // protein up to ~100 g
  };
  // Build an array of Promises, one per participant
  const promises = [];
  for (let i = 1; i <= 14; i++) {
    if(i == 7 || i == 13) {
      continue;
    }
    const pid = String(i).padStart(3, "0");
    promises.push(
      d3.csv(`data_p${i}/Food_Meal_Aggregated.csv`)
        .then(data => data.map(d => ({
          participantId: pid,
          datetime:      d.datetime,
          logged_food:   d.logged_food,
          calorie:  +d.calorie   || 0,
          sugar:    +d.sugar     || 0,
          protein:  +d.protein   || 0
        })))
    );
  }

  // Wait for all participants, then flatten and find the closest meal
  Promise.all(promises).then(arrays => {
    const allMeals = arrays.flat();

    allMeals.forEach(d => {
      // 2) compute each normalized difference
      const dc = (d.calorie  - target.calorie) / scales.calorie;
      const ds = (d.sugar    - target.sugar)   / scales.sugar;
      const dp = (d.protein  - target.protein) / scales.protein;
      // 3) Euclidean in the normalized space
      d.distance = Math.hypot(dc, ds, dp);

      // parse the meal‐time once
      d.mealTime = new Date(d.datetime);
      d.timeStr  = d.mealTime.toLocaleTimeString([], {
        hour12: false, hour: "2-digit", minute: "2-digit"
      });
    });

    // Sort & show the best match
    sortedMatches = allMeals.sort((a, b) => a.distance - b.distance);
    matchIndex = 0;
    displayMatch(windowHours);
  });
}

// -----------------------
// 2. Show match & draw charts
// -----------------------
function displayMatch(windowHours) {
  const m = sortedMatches[matchIndex];

  // Show which participant the match came from
  document.getElementById("results").innerHTML = `
    <p><strong>Participant ${m.participantId}:</strong> ${m.logged_food}</p>
    <ul>
      <li>Calories: ${m.calorie}</li>
      <li>Sugar: ${m.sugar} g</li>
      <li>Protein: ${m.protein} g</li>
    </ul>
    <p>🕒 Time: ${m.timeStr} → +${windowHours} hour(s)</p>
    ${matchIndex < sortedMatches.length - 1
      ? `<button onclick="showNextMatch(${windowHours})">
           ❓ Try Next Best Match
         </button>`
      : `<p><em>No more matches.</em></p>`}
    <button onclick="window.location.href='mini-game/index.html'">
      🧠 Try Your Knowledge
    </button>
  `;

  // Now draw that participant’s charts
  drawAllCharts(m.participantId, m.mealTime.toISOString(), windowHours);
}

function showNextMatch(windowHours) {
  matchIndex++;
  displayMatch(windowHours);
}

// -----------------------
// 3. Draw Glucose, EDA & HR for a given participant
// -----------------------
function drawAllCharts(pid, startTimeStr, windowHours) {
  const partNum = +pid;
  const start = new Date(startTimeStr);
  const end   = new Date(start.getTime() + windowHours * 3600_000);

  // 3a. Glucose
  d3.csv(`data_p${partNum}/Dexcom_${pid}.csv`).then(raw => {
    const glucoseData = raw
      .map(d => ({
        timestamp: new Date(d["Timestamp (YYYY-MM-DDThh:mm:ss)"]),
        value:     +d["Glucose Value (mg/dL)"]
      }))
      .filter(d => d.timestamp >= start && d.timestamp <= end)
      .map(d => ({
        minutes_after: (d.timestamp - start)/60000,
        value:         d.value
      }));
    if (glucoseData.length === 0) {
    d3.select("#glucoseChart")
      .html(`<p style="text-align:center;color:#666;padding:1em;">
               No glucose data<br/>available for this nutrition build. Try another.
             </p>`);
    return; 
  }
    d3.select("#glucoseChart").html("");
    drawLineChart(glucoseData, "#glucoseChart", {
      title:  "🩸 Glucose (mg/dL) After Meal",
      xLabel: "Minutes Since Meal",
      yLabel: "Glucose (mg/dL)"
    });

    plotHR (partNum, pid, start, end);
  });
}


// -----------------------
// 5. plotHR: 1-min averages
// -----------------------
function plotHR(partNum, pid, start, end) {
  d3.csv(`data_p${partNum}/HR_${pid}.csv`).then(raw => {
    const filtered = raw
      .map(d => ({ timestamp: new Date(d.datetime), value: +d[" hr"] }))
      .filter(d => d.timestamp >= start && d.timestamp <= end);

    filtered.forEach(d => {
      d.minutes_after = (d.timestamp - start)/60000;
    });

    const bins = new Map();
    filtered.forEach(d => {
      const m = Math.floor(d.minutes_after);
      if (!bins.has(m)) bins.set(m, { sum:0, count:0 });
      const b = bins.get(m);
      b.sum   += d.value;
      b.count += 1;
    });

    const hrData = Array.from(bins.entries())
      .map(([m, {sum,count}]) => ({
        minutes_after: m + 0.5,
        value:         sum/count
      }))
      .sort((a,b)=>a.minutes_after - b.minutes_after);

    if (hrData.length === 0) {
      d3.select("#hrChart")
        .html(`<p style="text-align:center;color:#666;padding:1em;">
                No heart-rate data<br/>available for this nutrition build. Try another.
              </p>`);
      return; 
    }
    d3.select("#hrChart").html("");
    drawLineChart(hrData, "#hrChart", {
      title:  "❤️ Heart Rate (avg. bpm) After Meal",
      xLabel: "Minutes Since Meal",
      yLabel: "HR (bpm)"
    });
  });
}

// -----------------------
// 6. drawLineChart: clipped + x-only zoom + tooltip
// -----------------------
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

  // ===== NEW Y-SCALE  (fix upper bound so high-risk band shows) =====
const yExtent = d3.extent(data, d => d.value);

// 默认直接用数据范围；如果是“#glucoseChart”就强行给更大的缓冲
let yBottom, yTop;
if (containerSelector.includes("glucose")) {
  // 血糖图：顶部至少 200，底部至少 50，让绿色区块也露出来
  yTop    = Math.max(yExtent[1], 200);   // 高出 180 → 高危区一定可见
  yBottom = Math.min(yExtent[0], 50);    // 给低值留余量
} else {
  // 心率图：照旧，只加 10% padding
  const pad = (yExtent[1] - yExtent[0]) * 0.1;
  yTop    = yExtent[1] + pad;
  yBottom = yExtent[0] - pad;
}

const yScale = d3.scaleLinear()
  .domain([yBottom, yTop])   // 低 → 高（range 已是 [height,0]）
  .range([height, 0])
  .nice();
// ===============================================================


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
  .attr("x1", 0).attr("y1", yScale(minVal))   
  .attr("x2", 0).attr("y2", yScale(maxVal));  

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

  
  /* ---------- NEW: safe-zone (70–140) & high-risk (≥180) bands ---------- */
if (containerSelector.includes("glucose")) {             // 只给血糖图加
  // ① 绿色安全带：70–140 mg/dL
  const safeTop    = yScale(140);
  const safeBottom = yScale(70);
  plotArea.append("rect")
    .attr("x", 0)
    .attr("y", safeTop)
    .attr("width",  width)
    .attr("height", safeBottom - safeTop)
    .attr("fill", "#C8E6C9")        // Material Green 100
    .attr("opacity", 0.35)
    .style("pointer-events", "none");

    // 黄色注意区：140–180 mg/dL
  const cautionTop    = yScale(180);
  const cautionBottom = yScale(140);
  plotArea.append("rect")
  .attr("x", 0)
  .attr("y", cautionTop)
  .attr("width", innerWidth)       // ← 用你的绘图区宽度变量
  .attr("height", cautionBottom - cautionTop)
  .attr("fill", "#FFF9C4")         // Material Yellow 100
  .attr("opacity", 0.45)
  .style("pointer-events", "none");


  // ② 红色高危带：≥180 mg/dL（如果数据没到 180 就不画）
  if (yScale.domain()[1] > 180) {
    const riskTop    = yScale(Math.max(yScale.domain()[1], 180)); // 图顶或更高
    const riskBottom = yScale(180);
    plotArea.append("rect")
      .attr("x", 0)
      .attr("y", riskTop)
      .attr("width",  width)
      .attr("height", riskBottom - riskTop)
      .attr("fill", "#FFCDD2")      // Material Red 100
      .attr("opacity", 0.4)
      .style("pointer-events", "none");
  }
}
/* --------------------------------------------------------------------- */


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

    /* ---------- 6½. Mean reference line ----------------------------------- */
  // ① 计算均值
  const meanVal = d3.mean(data, d => d.value);

  // ② 画横向虚线
  plotArea.append("line")
    .attr("class", "mean-line")
    .attr("x1", 0)
    .attr("x2", width)
    .attr("y1", yScale(meanVal))
    .attr("y2", yScale(meanVal))
    .attr("stroke", containerSelector.includes("glucose") ? "#880E4F" : "#0D47A1") // 红/蓝
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "4 4")      // 虚线
    .style("pointer-events", "none");

  // ③ 可选：在右上角标注均值数值
  plotArea.append("text")
    .attr("x", width - 4)                 // 靠右
    .attr("y", yScale(meanVal) - 6)       // 稍上移
    .attr("text-anchor", "end")
    .attr("font-size", "0.75rem")
    .attr("fill", "#555")
    .text(`Mean: ${meanVal.toFixed(1)}`);
  /* ----------------------------------------------------------------------- */




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
  
    /* ---------------- 7. Legend (only for glucose chart) ------------------ */
if (containerSelector.includes("glucose")) {
  const legendData = [
    { label: "High-risk (≥180 mg/dL)",  color: "#FFCDD2" },  // 红
    { label: "Elevated (140–180 mg/dL)", color: "#FFF9C4" }, // 黄
    { label: "Target (70–140 mg/dL)",  color: "#C8E6C9" }  // 绿
  ];

  const legend = svgRoot.append("g")
    .attr("class", "risk-legend")
    .attr("font-size", "0.8rem")
    .attr("transform",
      `translate(${margin.left}, ${margin.top + innerHeight + 32})`);  // 图底往下 32px

  const item = legend.selectAll("g.item")
    .data(legendData)
    .enter()
    .append("g")
      .attr("class", "item")
      .attr("transform", (_, i) => `translate(${i * 160}, 0)`);        // 每项左右间隔 160px

  // 彩色方块
  item.append("rect")
    .attr("width", 18)
    .attr("height", 18)
    .attr("fill", d => d.color)
    .attr("stroke", "#666")
    .attr("stroke-width", 0.5);

  // 文字标签
  item.append("text")
    .attr("x", 24)            // 方块右侧 6px
    .attr("y", 13)            // 垂直略居中
    .text(d => d.label);
}
/* --------------------------------------------------------------------- */

}

// Grab the sections & their arrows
const sect1 = document.getElementById("section1");
const sect2 = document.getElementById("section2");
const sect3 = document.getElementById("section3");
const cue1  = sect1 .querySelector(".scroll-cue");
const cue2  = sect2 .querySelector(".scroll-cue");
const cue3  = sect3 .querySelector(".scroll-cue");

let prevY = window.scrollY;
const fadeZone = 400;               // px to fade in/out
const vh       = window.innerHeight - 60;  // section height

window.addEventListener("scroll", () => {
  const y    = window.scrollY;
  const down = y > prevY;
  prevY = y;

  // Utility to apply opacity, translate, and cue
  function apply(sec, cue, op) {
    op = Math.max(0, Math.min(1, op));
    sec.style.opacity   = op;
    sec.style.transform = `translateY(${(1 - op) * 20}px)`;
    if (cue) {
      cue.style.opacity   = op > 0.8 ? 1 : 0;
      cue.style.transform = op > 0.8
        ? "translateY(0)"
        : "translateY(20px)";
    }
  }

  // ── Section 1: fade OUT at bottom, scroll‐direction‐independent ──
  let o1;
  if (y < vh - fadeZone) {
    o1 = 1;
  } else if (y < vh) {
    o1 = (vh - y) / fadeZone;
  } else {
    o1 = 0;
  }
  apply(sect1, cue1, o1);

  // ── Section 2: fade IN at top, fade OUT at bottom (only when scrolling down) ──
  const local2 = y - vh;  // 0 when top of section2 enters view
  let o2;
  if (local2 < -fadeZone) {
    o2 = 0;                              // too far above
  } else if (local2 < 0) {
    // fade‐in region at top
    o2 = (local2 + fadeZone) / fadeZone;
  } else if (local2 <= vh) {
    o2 = 1;                              // fully visible
  } else if (local2 <= vh + fadeZone && down) {
    // fade‐out region at bottom when scrolling down
    o2 = (vh + fadeZone - local2) / fadeZone;
  } else {
    o2 = 0;                              // below fade‐out zone
  }
  apply(sect2, cue2, o2);

  // ── Section 3: fade IN at top, never fade out ──
  const local3 = y - 2 * vh;
  let o3;
  if (local3 < -fadeZone) {
    o3 = 0;
  } else if (local3 < 0) {
    // fade‐in at top
    o3 = (local3 + fadeZone) / fadeZone;
  } else {
    o3 = 1;
  }
  apply(sect3, cue3, o3);
});

function drawMultiLineChart(seriesArr, container, options) {
  const { title, xLabel, yLabel } = options;
  const margin = { top: 60, right: 120, bottom: 60, left: 70 };
  const W = 1000, H = 500;
  const w = W - margin.left - margin.right;
  const h = H - margin.top  - margin.bottom;

  // 1) Clear & SVG
  d3.select(container).html("");
  const svg = d3.select(container)
    .append("svg").attr("width", W).attr("height", H);

  // 2) Main group
  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // 3) Clip path
  svg.append("defs").append("clipPath").attr("id","multi-clip")
    .append("rect").attr("width", w).attr("height", h);

  // 4) Scales
  const allData = seriesArr.flatMap(s => s.data);
  const xMax = d3.max(allData, d => d.minutes_after);
  const xScale = d3.scaleLinear().domain([0, xMax]).range([0, w]);
  const yExtent = d3.extent(allData, d => d.value);
  const yPad = (yExtent[1] - yExtent[0]) * 0.1;
  const yScale = d3.scaleLinear()
    .domain([yExtent[0] - yPad, yExtent[1] + yPad])
    .range([h, 0]);

  // 5) Axes with larger text
  const xAxis = d3.axisBottom(xScale).ticks(8).tickFormat(d=>d);
  const yAxis = d3.axisLeft(yScale).ticks(6);

  const xAxisG = g.append("g")
    .attr("transform", `translate(0,${h})`)
    .call(xAxis)
    .selectAll("text")
      .style("font-size", "14px");

  g.append("g")
    .call(yAxis)
    .selectAll("text")
      .style("font-size", "14px");

  // axis labels
  g.append("text")
    .attr("x", w/2).attr("y", h + margin.bottom - 10)
    .attr("text-anchor","middle")
    .style("font-size","16px")
    .text(xLabel);

  g.append("text")
    .attr("transform","rotate(-90)")
    .attr("y", -margin.left + 20)
    .attr("x", -h/2)
    .attr("text-anchor","middle")
    .style("font-size","16px")
    .text(yLabel);

  // 6) Title
  g.append("text")
    .attr("x", w/2).attr("y", -margin.top/2 + 10)
    .attr("text-anchor","middle")
    .style("font-size","20px")
    .style("font-weight","600")
    .text(title);

  // 7) Zoom behaviour
  const zoom = d3.zoom()
    .scaleExtent([1, 10])
    .translateExtent([[0,0],[w,0]])
    .extent([[0,0],[w,h]])
    .on("zoom", ({transform}) => {
      const zx = transform.rescaleX(xScale);
      xAxisG.call(xAxis.scale(zx));
      seriesArr.forEach((_, i) => {
        g.select(`.line${i}`)
          .attr("d", lineGen.x(d => zx(d.minutes_after)));
        g.selectAll(`.dot${i}`)
          .attr("cx", d => zx(d.minutes_after));
      });
    });

  g.append("rect")
    .attr("width", w).attr("height", h)
    .style("fill","none").style("pointer-events","all")
    .attr("clip-path","url(#multi-clip)")
    .call(zoom);

  // 8) Line generator (smooth)
  const lineGen = d3.line()
    .x(d => xScale(d.minutes_after))
    .y(d => yScale(d.value))
    .curve(d3.curveCatmullRom.alpha(0.5));

  // 9) Tooltip
  let tooltip = d3.select("#tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div").attr("id","tooltip")
      .style("position","absolute")
      .style("pointer-events","none")
      .style("background","rgba(255,255,255,0.95)")
      .style("border","1px solid #ccc")
      .style("padding","8px")
      .style("border-radius","4px")
      .style("font-size","12px")
      .style("box-shadow","0 2px 6px rgba(0,0,0,0.1)")
      .style("display","none");
  }

  // 10) Draw lines & dots
  seriesArr.forEach((s, i) => {
    // path
    g.append("path")
      .datum(s.data)
      .attr("class", `line${i}`)
      .attr("clip-path","url(#multi-clip)")
      .attr("fill","none")
      .attr("stroke", s.color)
      .attr("stroke-width", 4)
      .attr("stroke-linecap","round")
      .attr("stroke-linejoin","round")
      .attr("d", lineGen);

    // dots
    g.selectAll(`.dot${i}`)
      .data(s.data)
      .enter().append("circle")
        .attr("class", `dot${i}`)
        .attr("clip-path","url(#multi-clip)")
        .attr("cx", d => xScale(d.minutes_after))
        .attr("cy", d => yScale(d.value))
        .attr("r", 5)
        .attr("fill", s.color)
        .attr("opacity", 0.8)
        .on("mouseover", (ev,d) => {
          tooltip.html(`<strong>${s.label}</strong><br/>
                        ${d.minutes_after.toFixed(0)} min: ${d.value.toFixed(0)} mg/dL`)
            .style("left", `${ev.pageX+10}px`)
            .style("top", `${ev.pageY-28}px`)
            .style("display","inline-block");
        })
        .on("mousemove", ev => {
          tooltip.style("left", `${ev.pageX+10}px`)
                 .style("top", `${ev.pageY-28}px`);
        })
        .on("mouseout", () => tooltip.style("display","none"));
  });

  // 11) Legend
  const legend = g.append("g")
    .attr("class", "legend")
    // place top-right of the plot area, offset inwards
    .attr("transform", `translate(${w - 140}, ${-margin.top/2 + 10})`);

  const itemHeight = 24;
  seriesArr.forEach((s, i) => {
    const entry = legend.append("g")
      .attr("transform", `translate(0, ${i * itemHeight})`);

    // color swatch
    entry.append("rect")
      .attr("width", 18)
      .attr("height", 3)
      .attr("fill", s.color)
      .attr("y", -4);

    // label text, no wrapping
    entry.append("text")
      .attr("x", 24)
      .attr("y", 0)
      .style("font-size", "14px")
      .style("alignment-baseline", "middle")
      .style("white-space", "nowrap")
      .text(s.label);
  });
}

function drawSection2Glucose() {
  const targets = [
    { calorie:404, sugar:60,  protein:16,  label:"Smoothie", color:"#D32F2F" },
    { calorie:535, sugar:56,  protein:6.6, label:"Cake & Ice Cream", color:"#1976D2" }
  ];
  const windowHours = 2;
  const scales = { calorie:1000, sugar:100, protein:100 };

  // load all meals
  const promises = [];
  for (let i = 1; i <= 14; i++) {
    if (i===7||i===13) continue;
    const pid = String(i).padStart(3,"0");
    promises.push(
      d3.csv(`data_p${i}/Food_Meal_Aggregated.csv`)
        .then(data => data.map(d => ({
          participantId: pid,
          datetime:      d.datetime,
          calorie:  +d.calorie||0,
          sugar:    +d.sugar  ||0,
          protein:  +d.protein||0
        })))
    );
  }

  Promise.all(promises).then(arrays => {
    const allMeals = arrays.flat();
    const bests = targets.map(t => {
      return allMeals
        .map(d => {
          const dc = (d.calorie - t.calorie)/scales.calorie;
          const ds = (d.sugar   - t.sugar)  /scales.sugar;
          const dp = (d.protein - t.protein)/scales.protein;
          return { ...d, distance: Math.hypot(dc,ds,dp), mealTime:new Date(d.datetime)};
        })
        .sort((a,b)=>a.distance - b.distance)[0];
    });

    // now fetch Dexcom and build two series
    const seriesPromises = bests.map((best, idx) => {
      const partNum = +best.participantId;
      const start   = best.mealTime;
      const end     = new Date(start.getTime() + windowHours*3600000);
      return d3.csv(`data_p${partNum}/Dexcom_${best.participantId}.csv`)
        .then(raw => ({
          label: targets[idx].label,
          color: targets[idx].color,
          data: raw
            .map(d => ({
              timestamp: new Date(d["Timestamp (YYYY-MM-DDThh:mm:ss)"]),
              value:     +d["Glucose Value (mg/dL)"]
            }))
            .filter(d => d.timestamp >= start && d.timestamp <= end)
            .map(d => ({
              minutes_after: (d.timestamp - start)/60000,
              value:         d.value
            }))
        }));
    });

    Promise.all(seriesPromises).then(seriesArr => {
      // draw both on one chart
      drawMultiLineChart(
        seriesArr,
        "#section2GlucoseChart",
        {
          title:  "🩸 Glucose: Smoothie vs Cake & Ice Cream",
          xLabel: "Minutes Since Meal",
          yLabel: "Glucose (mg/dL)"
        }
      );
    });
  });
}

// run on load
// Fade-in on scroll using Intersection Observer
document.addEventListener("DOMContentLoaded", () => {
  const fadeSections = document.querySelectorAll(".fade-section");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target); // Optional: only fade once
      }
    });
  }, { threshold: 0.1 });

  fadeSections.forEach(section => observer.observe(section));
});
// Smooth scroll on choice button click
document.addEventListener("DOMContentLoaded", () => {
  const smoothieBtn = document.getElementById("chooseSmoothie");
  const cakeBtn = document.getElementById("chooseCake");
  const section2 = document.getElementById("section2");

  function scrollToSection2() {
    section2.scrollIntoView({ behavior: "smooth" });
  }

  if (smoothieBtn) smoothieBtn.addEventListener("click", scrollToSection2);
  if (cakeBtn) cakeBtn.addEventListener("click", scrollToSection2);
}
);

window.addEventListener("DOMContentLoaded", drawSection2Glucose);
