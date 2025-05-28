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

    const match = foods.sort((a, b) => a.distance - b.distance)[0];
    document.getElementById("results").innerHTML = `
      <h3>✅ Closest Food Match</h3>
      <p><strong>${match.name}</strong></p>
      <ul>
        <li>Calories: ${match.calorie}</li>
        <li>Sugar: ${match.sugar}g</li>
        <li>Protein: ${match.protein}g</li>
      </ul>
      <p>🕒 Time window: ${match.timeStr} → +${windowHours}h</p>
    `;

    drawChartsFromCSV(match.time, windowHours);
  });
}

function drawChartsFromCSV(startTimeStr, windowHours) {
  const start = new Date(startTimeStr);
  const end = new Date(start.getTime() + windowHours * 60 * 60 * 1000);

  d3.csv("data_p1/Dexcom_001.csv").then(glucose => {
    glucose = glucose
      .map(d => ({
        Timestamp: new Date(d["Timestamp (YYYY-MM-DDThh:mm:ss)"]),
        Value: +d["Glucose Value (mg/dL)"]
      }))
      .filter(d => d.Timestamp >= start && d.Timestamp <= end);

    Plotly.newPlot("glucoseChart", [{
      x: glucose.map(d => d.Timestamp),
      y: glucose.map(d => d.Value),
      mode: "lines+markers",
      name: "Glucose"
    }], { title: "🩸 Glucose Trend" });
  });

  d3.csv("data_p1/HR_001.csv").then(hr => {
    hr = hr
      .map(d => ({
        Timestamp: new Date(d["datetime"]),
        Value: +d[" hr"]
      }))
      .filter(d => d.Timestamp >= start && d.Timestamp <= end);

    Plotly.newPlot("hrChart", [{
      x: hr.map(d => d.Timestamp),
      y: hr.map(d => d.Value),
      mode: "lines+markers",
      name: "Heart Rate"
    }], { title: "❤️ Heart Rate Trend" });
  });
}
