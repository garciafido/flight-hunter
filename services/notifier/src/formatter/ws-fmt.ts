import type { AlertJob } from '@flight-hunter/shared';

export interface WebSocketMessage {
  type: 'alert';
  data: {
    searchId: string;
    searchName: string;
    flightResultId: string;
    level: string;
    score: number;
    scoreBreakdown: {
      price: number;
      schedule: number;
      stopover: number;
      airline: number;
      flexibility: number;
    };
    flightSummary: AlertJob['flightSummary'];
  };
}

export function formatWebSocket(alert: AlertJob, searchName: string): WebSocketMessage {
  return {
    type: 'alert',
    data: {
      searchId: alert.searchId,
      searchName,
      flightResultId: alert.flightResultId,
      level: alert.level,
      score: alert.score,
      scoreBreakdown: alert.scoreBreakdown,
      flightSummary: alert.flightSummary,
    },
  };
}
