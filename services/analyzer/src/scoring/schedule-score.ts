import type { FlightLeg } from '@flight-hunter/shared';

function scoreHour(hour: number, bestStart: number, bestEnd: number): number {
  if (hour >= bestStart && hour <= bestEnd) return 100;
  // Outside range: penalize proportionally
  const rangeSize = 24 - (bestEnd - bestStart);
  const distFromRange = hour < bestStart ? bestStart - hour : hour - bestEnd;
  return Math.max(0, 100 - (distFromRange / (rangeSize / 2)) * 100);
}

function scoreDepartureHour(hour: number): number {
  // 7-20 best
  return scoreHour(hour, 7, 20);
}

function scoreArrivalHour(hour: number): number {
  // 6-22 best
  return scoreHour(hour, 6, 22);
}

function scoreDuration(durationMinutes: number): number {
  // < 4h (240 min) = 100, degrades
  if (durationMinutes <= 240) return 100;
  // Penalize: each hour over 4h reduces by some amount
  // Let's say it hits 0 at 24h (1440 min)
  const extra = durationMinutes - 240;
  const maxExtra = 1440 - 240; // 1200 min
  return Math.max(0, 100 - (extra / maxExtra) * 100);
}

function scoreStops(stops: number): number {
  if (stops === 0) return 100;
  if (stops === 1) return 75;
  if (stops === 2) return 40;
  return Math.max(0, 40 - (stops - 2) * 20);
}

function parseHour(timeStr: string): number {
  // Handles "HH:MM" or ISO datetime strings
  const parts = timeStr.includes('T') ? timeStr.split('T')[1].split(':') : timeStr.split(':');
  return parseInt(parts[0], 10);
}

function scoreLeg(leg: FlightLeg): number {
  const depHour = parseHour(leg.departure.time);
  const arrHour = parseHour(leg.arrival.time);

  const depScore = scoreDepartureHour(depHour);
  const arrScore = scoreArrivalHour(arrHour);
  const timeScore = (depScore + arrScore) / 2;

  const durScore = scoreDuration(leg.durationMinutes);
  const stopScore = scoreStops(leg.stops);

  // Weighted: time 30%, duration 40%, stops 30%
  return timeScore * 0.3 + durScore * 0.4 + stopScore * 0.3;
}

export function computeScheduleScore(outbound: FlightLeg, inbound: FlightLeg): number {
  const outScore = scoreLeg(outbound);
  const inScore = scoreLeg(inbound);
  return Math.min(100, Math.max(0, (outScore + inScore) / 2));
}
