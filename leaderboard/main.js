function displayLeaderboard() {
    const leaderboard = JSON.parse(localStorage.getItem("leaderboard")) || {};
    const sortedPlayers = Object.entries(leaderboard).map(([name, data]) => {
      const winRate = data.totalPlays > 0 ? (data.correctGuesses / data.totalPlays) * 100 : 0;
      return { name, ...data, winRate };
    }).sort((a, b) => b.winRate - a.winRate);
  
    let tableHTML = "<table><tr><th>Rank</th><th>Name</th><th>Win Rate</th><th>Plays</th></tr>";
    sortedPlayers.forEach((player, index) => {
      tableHTML += `<tr>
        <td>${index + 1}</td>
        <td>${player.name}</td>
        <td>${player.winRate.toFixed(1)}%</td>
        <td>${player.totalPlays}</td>
      </tr>`;
    });
    tableHTML += "</table>";
  
    document.getElementById("leaderboard").innerHTML = tableHTML;
  }
  
  displayLeaderboard();
  