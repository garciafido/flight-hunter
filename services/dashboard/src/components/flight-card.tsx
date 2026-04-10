import { ScoreBar } from './score-bar';
import { AlertBadge } from './alert-badge';

interface FlightCardProps {
  airline: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  returnTime: string;
  price: number;
  currency: string;
  score: number;
  alertLevel?: string;
  bookingUrl: string;
  stopoverAirport?: string;
  stopoverDays?: number;
}

export function FlightCard(props: FlightCardProps) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{props.airline}</strong> — {props.departureAirport} → {props.arrivalAirport}
        </div>
        <div>
          {props.alertLevel && <AlertBadge level={props.alertLevel} />}
          <strong style={{ marginLeft: 8 }}>{props.currency} {props.price}</strong>
        </div>
      </div>
      <div style={{ margin: '8px 0' }}>
        <ScoreBar score={props.score} />
        <span style={{ fontSize: 12 }}>Score: {props.score}/100</span>
      </div>
      <div style={{ fontSize: 14, color: '#6b7280' }}>
        {props.departureTime.split('T')[0]} → {props.returnTime.split('T')[0]}
        {props.stopoverAirport && ` | Escala ${props.stopoverAirport}: ${props.stopoverDays} días`}
      </div>
      <a href={props.bookingUrl} target="_blank" rel="noopener noreferrer"
         style={{ color: '#2563eb', fontSize: 14 }}>
        Reservar →
      </a>
    </div>
  );
}
