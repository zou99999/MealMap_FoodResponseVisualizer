let foodOptions = [];
let playerName = prompt("Enter your name for the leaderboard:");
if (!playerName) {
  playerName = "Anonymous";
}

// Load existing leaderboard or initialize it
let leaderboard = JSON.parse(localStorage.getItem("leaderboard")) || {};

// If new player, create entry
if (!leaderboard[playerName]) {
  leaderboard[playerName] = {
    totalPlays: 0,
    correctGuesses: 0
  };
}

d3.csv("../data_p1/Food_Log_001.csv").then(data => {
  foodOptions = data.map(d => ({
    name: d.logged_food,
    calorie: +d.calorie || 0,
    sugar: +d.sugar || 0,
    protein: +d.protein || 0
  }));
});

function startQuiz() {
  if (foodOptions.length < 2) return;

  const metric = document.getElementById("quizType").value;

  const i = Math.floor(Math.random() * foodOptions.length);
  let j = Math.floor(Math.random() * foodOptions.length);
  while (j === i) j = Math.floor(Math.random() * foodOptions.length);

  const food1 = foodOptions[i];
  const food2 = foodOptions[j];

  const correct =
    food1[metric] > food2[metric] ? food1.name : food2.name;

  document.getElementById("quizArea").innerHTML = `
    <p><strong>${metric.toUpperCase()}</strong>: Which food has more?</p>
    <button onclick="checkAnswer('${food1.name}', '${correct}', '${metric}', ${food1[metric]}, ${food2[metric]})">${food1.name}</button>
    <button onclick="checkAnswer('${food2.name}', '${correct}', '${metric}', ${food1[metric]}, ${food2[metric]})">${food2.name}</button>
    <div id="feedback"></div>
  `;
}

function checkAnswer(choice, correct, metric, v1, v2) {
    const feedback = document.getElementById("feedback");
    const [a, b] = [v1, v2];
  
    // Update total plays
    leaderboard[playerName].totalPlays += 1;
  
    if (choice === correct) {
      // Update correct guesses
      leaderboard[playerName].correctGuesses += 1;
  
      feedback.innerHTML = `
        <p style="color:green">✅ Correct! <strong>${correct}</strong> has more ${metric}.</p>
        <p>Values: ${a} vs. ${b}</p>
        <button onclick="startQuiz()">🔁 Next Question</button>
      `;
    } else {
      feedback.innerHTML = `
        <p style="color:red">❌ Oops! <strong>${correct}</strong> actually has more ${metric}.</p>
        <p>Values: ${a} vs. ${b}</p>
        <button onclick="startQuiz()">🔁 Try Again</button>
      `;
    }
  
    // Save leaderboard after each play
    localStorage.setItem("leaderboard", JSON.stringify(leaderboard));
  }
  

leaderboard[playerName].totalPlays += 1;
if (isCorrect) {
  leaderboard[playerName].correctGuesses += 1;
}

// Save back to localStorage
localStorage.setItem("leaderboard", JSON.stringify(leaderboard));

