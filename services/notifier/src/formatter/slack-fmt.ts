import type { AlertJob } from '@flight-hunter/shared';

const LEVEL_EMOJI: Record<string, string> = {
  urgent: ':rotating_light:',
  good: ':white_check_mark:',
  info: ':information_source:',
};

const LEVEL_HEADERS: Record<string, string> = {
  urgent: 'OFERTA URGENTE',
  good: 'BUENA OFERTA',
  info: 'Info',
};

export function formatSlack(alert: AlertJob, searchName: string): string {
  const { level, score, flightSummary, combo } = alert;
  const emoji = LEVEL_EMOJI[level] ?? ':bell:';
  const header = LEVEL_HEADERS[level] ?? level.toUpperCase();

  if (combo) {
    const currency = flightSummary.currency;
    let text = `${emoji} *${header}* — ${searchName}\n`;
    text += `*${currency} ${combo.totalPrice} total (combinación)* | Score: ${score}/100\n`;
    combo.legs.forEach((leg, i) => {
      const depDate = leg.departureTime.slice(0, 10);
      text += `Tramo ${i + 1}: ${leg.departureAirport} → ${leg.arrivalAirport} | ${leg.airline} | ${currency} ${leg.price}/persona | ${depDate}\n`;
    });
    return text;
  }

  const { price, currency, airline, departureAirport, arrivalAirport, departureTime, arrivalTime, bookingUrl } = flightSummary;
  const depDate = departureTime.slice(0, 10);
  const retDate = arrivalTime.slice(0, 10);

  let text = `${emoji} *${header}* — ${searchName}\n`;
  text += `*${currency} ${price}/persona* | Score: ${score}/100\n`;
  text += `${airline} | ${departureAirport} → ${arrivalAirport}\n`;
  text += `Ida: ${depDate} | Vuelta: ${retDate}\n`;
  text += `<${bookingUrl}|Reservar aquí>`;

  return text;
}
