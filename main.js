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

  // Build an array of Promises, one per participant
  const promises = [];
  for (let i = 1; i <= 16; i++) {
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

    // Compute distances
    allMeals.forEach(d => {
      d.distance = Math.hypot(
        d.calorie  - target.calorie,
        d.sugar    - target.sugar,
        d.protein  - target.protein
      );
      // Also parse the meal-time once
      d.mealTime = new Date(d.datetime);
      d.timeStr  = d.mealTime.toLocaleTimeString([], {
        hour12: false, hour: "2-digit", minute: "2-digit"
      });
    });

    // Sort & keep
    sortedMatches = allMeals.sort((a,b) => a.distance - b.distance);
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

    d3.select("#glucoseChart").html("");
    drawLineChart(glucoseData, "#glucoseChart", {
      title:  "🩸 Glucose (mg/dL) After Meal",
      xLabel: "Minutes Since Meal",
      yLabel: "Glucose (mg/dL)"
    });

    // 3b. EDA
    plotEDA(partNum, pid, start, end);

    // 3c. HR
    plotHR (partNum, pid, start, end);
  });
}

// -----------------------
// 4. plotEDA: 1-min averages
// -----------------------
function plotEDA(partNum, pid, start, end) {
  d3.csv(`data_p${partNum}/EDA_${pid}.csv`).then(raw => {
    const filtered = raw
      .map(d => ({ timestamp: new Date(d.datetime), value: +d.eda }))
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

    const edaData = Array.from(bins.entries())
      .map(([m, {sum,count}]) => ({
        minutes_after: m + 0.5,
        value:         sum/count
      }))
      .sort((a,b)=>a.minutes_after - b.minutes_after);

    d3.select("#edaChart").html("");
    drawLineChart(edaData, "#edaChart", {
      title:  "💧 EDA (µS) After Meal",
      xLabel: "Minutes Since Meal",
      yLabel: "EDA (µS)"
    });
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
function drawLineChart(data, container, { title, xLabel, yLabel }) {
  const m = { top:50, right:30, bottom:50, left:60 };
  const W = 800, H = 350;
  const w = W - m.left - m.right;
  const h = H - m.top  - m.bottom;

  // Clear & create SVG
  d3.select(container).html("");
  const svg = d3.select(container)
    .style("display","flex").style("justify-content","center")
    .append("svg").attr("width",W).attr("height",H)
    .append("g").attr("transform",`translate(${m.left},${m.top})`);

  // Clip path
  svg.append("defs")
    .append("clipPath").attr("id","plot-clip")
    .append("rect").attr("width",w).attr("height",h);

  // Scales
  const xMax = d3.max(data, d=>d.minutes_after);
  const xScale = d3.scaleLinear().domain([0,xMax]).range([0,w]);
  const yE = d3.extent(data, d=>d.value);
  const pad= (yE[1]-yE[0])*0.1;
  const yScale = d3.scaleLinear()
    .domain([yE[0]-pad,yE[1]+pad]).range([h,0]);

  // Axes
  const xAxis = d3.axisBottom(xScale)
    .ticks(Math.min(10,Math.ceil(xMax/5))).tickFormat(d=>d);
  const yAxis = d3.axisLeft(yScale).ticks(6);

  const gx = svg.append("g")
    .attr("transform",`translate(0,${h})`).call(xAxis);
  svg.append("text")
    .attr("x",w/2).attr("y",h+m.bottom-10)
    .attr("text-anchor","middle").style("font-size","13px")
    .text(xLabel);

  svg.append("g").call(yAxis);
  svg.append("text")
    .attr("transform","rotate(-90)")
    .attr("y",-m.left+15).attr("x",-h/2)
    .attr("text-anchor","middle").style("font-size","13px")
    .text(yLabel);

  // Plot area
  const plot = svg.append("g")
    .attr("clip-path","url(#plot-clip)");

  // Zoom/pan (x-axis only)
  const zoom = d3.zoom()
    .scaleExtent([1,10])
    .translateExtent([[0,0],[w,0]])
    .extent([[0,0],[w,h]])
    .on("zoom",({transform})=>{
      let zx = transform.rescaleX(xScale);
      let [d0,d1] = zx.domain();
      if(d0<0)d0=0; if(d1>xMax)d1=xMax;
      zx = zx.copy().domain([d0,d1]);
      gx.call(xAxis.scale(zx));
      plot.selectAll(".line")
        .attr("d", d3.line()
          .x(d=>zx(d.minutes_after))
          .y(d=>yScale(d.value))
          .curve(d3.curveMonotoneX)
        );
      plot.selectAll(".dot")
        .attr("cx",d=>zx(d.minutes_after))
        .attr("cy",d=>yScale(d.value));
    });

  plot.append("rect")
    .attr("width",w).attr("height",h)
    .style("fill","none").style("pointer-events","all")
    .call(zoom);

  // Line
  plot.append("path")
    .datum(data)
    .attr("class","line")
    .attr("fill","none")
    .attr("stroke","#D32F2F")
    .attr("stroke-width",2)
    .attr("d",d3.line()
      .x(d=>xScale(d.minutes_after))
      .y(d=>yScale(d.value))
      .curve(d3.curveMonotoneX)
    );

  // Tooltip
  let tip = d3.select("#tooltip");
  if(tip.empty()) {
    tip = d3.select("body").append("div").attr("id","tooltip");
  }
  tip.style("position","absolute")
     .style("pointer-events","none")
     .style("display","none")
     .style("z-index",10)
     .style("background","rgba(255,255,255,0.95)")
     .style("border","1px solid #ccc")
     .style("padding","8px")
     .style("border-radius","4px")
     .style("font-size","12px")
     .style("box-shadow","0 2px 6px rgba(0,0,0,0.1)");

  // Dots
  plot.selectAll(".dot")
    .data(data).enter()
    .append("circle")
      .attr("class","dot")
      .attr("cx",d=>xScale(d.minutes_after))
      .attr("cy",d=>yScale(d.value))
      .attr("r",4).attr("fill","#D32F2F").attr("opacity",0.8)
      .on("mouseover",function(event,d){
        d3.select(this).attr("r",6).attr("fill","#E57373");
        tip.html(`<strong>${d.minutes_after.toFixed(0)} min</strong><br/>${d.value.toFixed(2)}`)
           .style("left",`${event.pageX+10}px`)
           .style("top", `${event.pageY-28}px`)
           .style("display","inline-block");
      })
      .on("mousemove",function(event){
        tip.style("left",`${event.pageX+10}px`)
           .style("top", `${event.pageY-28}px`);
      })
      .on("mouseout",function(){
        d3.select(this).attr("r",4).attr("fill","#D32F2F");
        tip.style("display","none");
      });

  // Title
  svg.append("text")
    .attr("x",w/2).attr("y",-m.top/2+5)
    .attr("text-anchor","middle")
    .style("font-size","16px").style("font-weight","600")
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
