import { useState, useEffect, useRef } from 'react'

const MATCHUPS = [
  ["Blake", "Washington"],
  ["Chris", "Boston College"],
  ["David", "Washington State"],
  ["Higgins", "Eastern Michigan"],
  ["Nic", "Florida State"],
  ["Q", "Alabama"],
  ["Sam", "Nicholls"],
  ["Shyam", "Middle Tennessee"],
  ["Steven", "Oklahoma"],
  ["Tommy", "Florida"],
  ["Vandy", "Northern Arizona"],
  ["Will", "UAlbany"],
];

const GAME_DATE = '20250830';

function App() {
  const [gameData, setGameData] = useState([]);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const previousYards = useRef({});

  const exactTeamMatch = (teamName, competitor) => {
    const fields = [
      competitor.team?.location,
      competitor.team?.shortDisplayName,
      competitor.team?.displayName,
      competitor.team?.name
    ];
    
    return fields.some(field => 
      field && field.trim().toLowerCase() === teamName.trim().toLowerCase()
    );
  };

  const extractPassingYards = (statistics) => {
    if (!statistics || !Array.isArray(statistics)) return null;
    
    const passingStats = statistics.find(stat => 
      stat.name && 
      stat.name.toLowerCase().includes('pass') && 
      (stat.name.toLowerCase().includes('yd') || stat.name.toLowerCase().includes('yard') || stat.name.toLowerCase().includes('yards'))
    );
    
    if (passingStats && (passingStats.displayValue || passingStats.value !== undefined)) {
      // Try displayValue first, then value
      const rawValue = passingStats.displayValue || passingStats.value;
      const numericValue = parseInt(String(rawValue).replace(/[^0-9-]/g, ''), 10);
      return isNaN(numericValue) ? 0 : numericValue;
    }
    
    return null;
  };

  const formatGameTime = (competition) => {
    if (competition.status?.type?.state === 'pre') {
      const date = new Date(competition.date);
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }
    return competition.status?.type?.description || 'Unknown';
  };

  const getScore = (competitors, gameStatus) => {
    if (!competitors || competitors.length < 2) return '0-0';
    
    // If game hasn't started yet, show 0-0
    if (gameStatus === 'pre' || !competitors[0].score || !competitors[1].score) {
      return '0-0';
    }
    
    return `${competitors[0].score} - ${competitors[1].score}`;
  };

  const fetchGameData = async () => {
    setError(null);
    
    try {
      const scoreboard = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${GAME_DATE}`,
        { cache: "no-store" }
      );
      
      if (!scoreboard.ok) throw new Error('Failed to fetch scoreboard');
      const scoreboardData = await scoreboard.json();
      
      const results = await Promise.all(
        MATCHUPS.map(async ([dude, teamName]) => {
          const matchedEvent = scoreboardData.events?.find(event => 
            event.competitions?.[0]?.competitors?.some(comp => 
              exactTeamMatch(teamName, comp)
            )
          );
          
          if (!matchedEvent) {
            return {
              dude,
              teamName,
              passingYards: null,
              score: 'No game found',
              status: 'No game found',
              startTime: null,
              eventId: null
            };
          }
          
          try {
            const eventId = matchedEvent.id;
            const summary = await fetch(
              `https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${eventId}`,
              { cache: "no-store" }
            );
            
            if (!summary.ok) throw new Error('Failed to fetch game summary');
            const summaryData = await summary.json();
            
            const competition = summaryData.header?.competitions?.[0];
            const competitors = competition?.competitors || [];
            
            const matchedTeam = summaryData.boxscore?.teams?.find(team => 
              exactTeamMatch(teamName, team)
            );
            
            const passingYards = matchedTeam ? extractPassingYards(matchedTeam.statistics) : null;
            
            return {
              dude,
              teamName,
              passingYards,
              score: getScore(competitors, competition?.status?.type?.state),
              status: formatGameTime(competition),
              startTime: competition?.date ? new Date(competition.date) : null,
              eventId
            };
          } catch (err) {
            console.error(`Error fetching data for ${teamName}:`, err);
            return {
              dude,
              teamName,
              passingYards: null,
              score: 'Error',
              status: 'Error',
              startTime: null,
              eventId: null
            };
          }
        })
      );
      
      setGameData(results);
      setLastUpdated(new Date());
      
    } catch (err) {
      setError(err.message);
      console.error('Error fetching game data:', err);
    }
  };

  useEffect(() => {
    fetchGameData();
    const interval = setInterval(fetchGameData, 15000);
    return () => clearInterval(interval);
  }, []);

  const sortedData = [...gameData].sort((a, b) => {
    if (a.passingYards !== null && b.passingYards !== null) {
      return b.passingYards - a.passingYards;
    }
    
    if (a.passingYards === null && b.passingYards === null) {
      if (a.startTime && b.startTime) {
        return a.startTime - b.startTime;
      }
    }
    
    if (a.passingYards === null) return 1;
    if (b.passingYards === null) return -1;
    
    return 0;
  });

  return (
    <div className="min-h-screen bg-gray-100 p-2 sm:p-4 fallback-container" style={{minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '8px'}}>
      <div className="max-w-6xl mx-auto" style={{maxWidth: '1200px', margin: '0 auto'}}>
        <div className="bg-white rounded-lg shadow-lg p-3 sm:p-6 mb-4 sm:mb-6 fallback-card">
          <div className="mb-2">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 leading-tight" style={{fontSize: 'clamp(18px, 4vw, 30px)', fontWeight: 'bold', color: '#1e40af', lineHeight: '1.2'}}>
              Fantasy Fellas Draft Order Tracker – Aug 30, 2025
            </h1>
          </div>
          <p className="text-gray-600 mb-1 text-sm" style={{color: '#6b7280', fontSize: '14px'}}>
            Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}
          </p>
          <p className="text-gray-600 text-xs sm:text-sm" style={{color: '#6b7280', fontSize: '12px'}}>
            Data from ESPN public APIs • Polling every 15 seconds
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-3 sm:px-4 py-3 rounded mb-4 sm:mb-6 text-sm fallback-error">
            Error: {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-1 sm:px-4 lg:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  #
                </th>
                <th className="px-1 sm:px-4 lg:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-1 sm:px-4 lg:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Team
                </th>
                <th className="px-1 sm:px-4 lg:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Yards
                </th>
                <th className="px-1 sm:px-4 lg:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedData.map((row, index) => {
                const prevYards = previousYards.current[row.dude] || 0;
                const hasIncreased = row.passingYards > prevYards;
                
                if (row.passingYards !== null) {
                  previousYards.current[row.dude] = row.passingYards;
                }
                
                return (
                  <tr key={row.dude} className="hover:bg-gray-50">
                    <td className="px-1 sm:px-4 lg:px-6 py-3 sm:py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                      {index + 1}
                    </td>
                    <td className="px-1 sm:px-4 lg:px-6 py-3 sm:py-4 text-sm font-medium text-gray-900">
                      <div className="font-semibold">{row.dude}</div>
                      <div className="text-xs text-gray-500 sm:hidden">
                        <div>{row.teamName}</div>
                        <div>{row.score} • {row.status}</div>
                      </div>
                    </td>
                    <td className="px-1 sm:px-4 lg:px-6 py-3 sm:py-4 text-sm text-gray-900 hidden sm:table-cell">
                      {row.teamName}
                    </td>
                    <td className="px-1 sm:px-4 lg:px-6 py-3 sm:py-4 whitespace-nowrap text-sm font-bold">
                      <div className={`text-lg font-bold ${hasIncreased ? 'animate-pulse text-green-600' : 'text-blue-600'}`}>
                        {row.passingYards !== null ? row.passingYards : '—'}
                      </div>
                    </td>
                    <td className="px-1 sm:px-4 lg:px-6 py-3 sm:py-4 text-sm text-gray-900 hidden sm:table-cell">
                      {row.score}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App