export type AlertLevel = 'info' | 'good' | 'urgent';
export type NotificationChannel = 'email' | 'telegram' | 'websocket';

export interface Alert {
  searchId: string;
  flightResultId: string;
  level: AlertLevel;
  channelsSent: NotificationChannel[];
  sentAt: Date;
}

export interface ScoreBreakdown {
  price: number;
  schedule: number;
  stopover: number;
  airline: number;
  flexibility: number;
}
