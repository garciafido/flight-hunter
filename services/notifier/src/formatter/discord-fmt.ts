import type { AlertJob } from '@flight-hunter/shared';

const LEVEL_EMOJI: Record<string, string> = {
  urgent: '🚨',
  good: '✅',
  info: 'ℹ️',
};

const LEVEL_HEADERS: Record<string, string> = {
  urgent: 'OFERTA URGENTE',
  good: 'BUENA OFERTA',
  info: 'Info',
};

const LEVEL_COLORS: Record<string, number> = {
  urgent: 0xff0000,
  good: 0x22c55e,
  info: 0x3b82f6,
};

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  url?: string;
}

export function formatDiscord(alert: AlertJob, searchName: string): { content: string; embeds: DiscordEmbed[] } {
  const { level, score, flightSummary, combo } = alert;
  const emoji = LEVEL_EMOJI[level] ?? '🔔';
  const header = LEVEL_HEADERS[level] ?? level.toUpperCase();
  const color = LEVEL_COLORS[level] ?? 0x6b7280;

  if (combo) {
    const currency = flightSummary.currency;
    let description = `**${currency} ${combo.totalPrice} total (combinación)** | Score: ${score}/100\n\n`;
    combo.legs.forEach((leg, i) => {
      const depDate = leg.departureTime.slice(0, 10);
      description += `**Tramo ${i + 1}:** ${leg.departureAirport} → ${leg.arrivalAirport}\n`;
      description += `${leg.airline} | ${currency} ${leg.price}/persona | ${depDate}\n`;
      description += `[Reservar](${leg.bookingUrl})\n\n`;
    });
    if (combo.despegarUrl) {
      description += `🔗 [Buscar en Despegar](${combo.despegarUrl})\n`;
    }
    return {
      content: `${emoji} **${header}** — ${searchName}`,
      embeds: [{ title: `${header} — ${searchName}`, description, color }],
    };
  }

  const { price, currency, airline, departureAirport, arrivalAirport, departureTime, arrivalTime, bookingUrl } = flightSummary;
  const depDate = departureTime.slice(0, 10);
  const retDate = arrivalTime.slice(0, 10);

  const description =
    `**${currency} ${price}/persona** | Score: ${score}/100\n` +
    `${airline} | ${departureAirport} → ${arrivalAirport}\n` +
    `Ida: ${depDate} | Vuelta: ${retDate}\n` +
    `[Reservar aquí](${bookingUrl})`;

  return {
    content: `${emoji} **${header}** — ${searchName}`,
    embeds: [{ title: `${header} — ${searchName}`, description, color, url: bookingUrl }],
  };
}
