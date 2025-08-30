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
  const [loading, setLoading] = useState(false);
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
      (stat.name.toLowerCase().includes('yd') || stat.name.toLowerCase().includes('yard'))
    );
    
    if (passingStats && passingStats.displayValue) {
      const numericValue = parseInt(passingStats.displayValue.replace(/[^0-9-]/g, ''), 10);
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
    if (!competitors || competitors.length < 2) return '';
    
    // If game hasn't started yet, don't show scores
    if (gameStatus === 'pre' || !competitors[0].score || !competitors[1].score) {
      return '';
    }
    
    return `${competitors[0].score} - ${competitors[1].score}`;
  };

  const fetchGameData = async () => {
    setLoading(true);
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
              exactTeamMatch(teamName, { team })
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
    } finally {
      setLoading(false);
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
    <div className="min-h-screen bg-gray-100 p-4 fallback-container" style={{minHeight: '100vh', backgroundColor: '#f3f4f6', padding: '16px'}}>
      <div className="max-w-6xl mx-auto" style={{maxWidth: '1200px', margin: '0 auto'}}>
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 fallback-card">
          <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{fontSize: '30px', fontWeight: 'bold', color: '#111827', marginBottom: '8px'}}>
            Fantasy Fellas Draft Order Tracker – Aug 30, 2025
          </h1>
          <p className="text-gray-600" style={{color: '#6b7280'}}>
            Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6 fallback-error">
            Error: {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 fallback-card">
          <div className="flex items-center justify-between mb-4 fallback-status">
            <h2 className="text-xl font-semibold" style={{fontSize: '20px', fontWeight: '600'}}>Status</h2>
            {loading && <div className="text-blue-600 fallback-loading">Loading...</div>}
          </div>
          <p className="text-gray-600 text-sm" style={{color: '#6b7280', fontSize: '14px'}}>
            Data from ESPN public APIs • Polling every 15 seconds • Exact team matching only
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <table className="w-full fallback-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dude
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Team
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Passing Yards
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Game Status / Start
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900" style={{fontWeight: '500'}}>
                      {row.dude}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {row.teamName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={hasIncreased ? 'animate-pulse text-green-600 font-bold fallback-pulse' : ''}>
                        {row.passingYards !== null ? row.passingYards : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {row.score}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {row.status}
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