function recommendFood() {
  const calories = parseInt(document.getElementById('calories').value);
  const sugar = parseInt(document.getElementById('sugar').value);
  const protein = parseInt(document.getElementById('protein').value);
  const windowHours = parseInt(document.getElementById('window').value);

  document.getElementById('results').innerHTML = `
    <h3>✅ Closest Food Match</h3>
    <p><strong>Berry Smoothie</strong></p>
    <ul>
      <li>Calories: 310</li>
      <li>Sugar: 22g</li>
      <li>Protein: 9g</li>
    </ul>
    <p>Time window: 2020-02-13 18:00 → ${calculateEndTime('18:00', windowHours)}</p>
  `;

  drawCharts(windowHours);
}

function calculateEndTime(startTime, hours) {
  const [h, m] = startTime.split(":").map(Number);
  let endHour = (h + hours) % 24;
  return `${endHour.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

  
function drawCharts(windowHours) {
  // Generate mock time points based on hours
  const labels = [];
  const baseHour = 18;
  for (let i = 0; i <= windowHours * 4; i++) {
    const totalMinutes = i * 15;
    const hour = baseHour + Math.floor(totalMinutes / 60);
    const min = totalMinutes % 60;
    labels.push(`${hour}:${min.toString().padStart(2, '0')}`);
  }

  const glucoseValues = labels.map((_, i) => 90 + Math.round(40 * Math.sin(i / 3)));
  const hrValues = labels.map((_, i) => 72 + Math.round(8 * Math.cos(i / 3)));

  const glucoseTrace = {
    x: labels,
    y: glucoseValues,
    mode: 'lines+markers',
    name: 'Glucose (mg/dL)'
  };

  const hrTrace = {
    x: labels,
    y: hrValues,
    mode: 'lines+markers',
    name: 'Heart Rate (bpm)'
  };

  Plotly.newPlot('glucoseChart', [glucoseTrace], {
    title: `Glucose Trend (${windowHours}h)`,
    margin: { t: 40 }
  });

  Plotly.newPlot('hrChart', [hrTrace], {
    title: `Heart Rate Trend (${windowHours}h)`,
    margin: { t: 40 }
  });
}
