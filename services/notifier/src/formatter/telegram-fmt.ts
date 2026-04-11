import type { AlertJob } from '@flight-hunter/shared';

const LEVEL_HEADERS: Record<string, string> = {
  urgent: 'OFERTA URGENTE',
  good: 'BUENA OFERTA',
  info: 'Info',
};

export function formatTelegram(alert: AlertJob, searchName: string): string {
  const { level, score, scoreBreakdown, flightSummary, combo } = alert;
  const header = LEVEL_HEADERS[level];

  // Combo (waypoint trip) rendering
  if (combo) {
    const currency = flightSummary.currency;
    let text = `🚨 *${header}* — ${searchName}\n\n`;
    if (combo.waypoints && combo.waypoints.length > 0) {
      const summary = combo.waypoints.map((wp) =>
        wp.type === 'stay'
          ? `🏨 ${wp.airport} ${wp.minDays}-${wp.maxDays}d`
          : `✈ ${wp.airport} <${wp.maxHours}h`,
      ).join(' · ');
      text += `*Itinerario:* ${summary}\n`;
    }
    text += `💰 *${currency} ${combo.totalPrice} total (combinación)*\n`;
    const carryOn = combo.carryOnEstimateUSD ?? 0;
    const checkedBag = combo.checkedBagEstimateUSD ?? 0;
    if (carryOn > 0) text += `🧳 +USD ${carryOn} carry-on (estimado)\n`;
    if (checkedBag > 0) text += `🧳 +USD ${checkedBag} valija despachada (estimado)\n`;
    if (carryOn + checkedBag > 0) {
      text += `💵 *Total con equipaje: USD ${Number(combo.totalPrice) + carryOn + checkedBag}*\n`;
    }
    if (combo.argTaxEstimateUSD !== undefined) {
      text += `🇦🇷 con impuestos AR (PAIS+RG5232): *USD ${combo.argTaxEstimateUSD}*\n`;
    }
    text += `⭐ Score: ${score}/100\n\n`;

    combo.legs.forEach((leg, i) => {
      const depDate = leg.departureTime.slice(0, 10);
      text += `✈️ *Tramo ${i + 1}:* ${leg.departureAirport} → ${leg.arrivalAirport}\n`;
      text += `  ${leg.airline} — ${currency} ${leg.price}/persona — ${depDate}\n`;
      if (leg.stopoverAirport !== undefined && leg.stopoverDurationDays !== undefined) {
        text += `  🏨 Stopover: ${leg.stopoverAirport} (${leg.stopoverDurationDays} días)\n`;
      }
      text += `  🔗 [Reservar](${leg.bookingUrl})\n\n`;
    });

    text += `📊 Desglose: precio=${scoreBreakdown.price} horario=${scoreBreakdown.schedule} stopover=${scoreBreakdown.stopover} aerolínea=${scoreBreakdown.airline} flex=${scoreBreakdown.flexibility}`;
    return text;
  }

  // Standard single-flight rendering
  const { price, currency, airline, departureAirport, arrivalAirport, departureTime, arrivalTime, stopoverAirport, stopoverDurationDays, bookingUrl } = flightSummary;

  const depDate = departureTime.slice(0, 10);
  const retDate = arrivalTime.slice(0, 10);

  let text = `🚨 *${header}* — ${searchName}\n\n`;
  text += `💰 *${currency} ${price}/persona*\n`;
  text += `⭐ Score: ${score}/100\n`;
  text += `✈️ ${airline}\n`;
  text += `🛫 ${departureAirport} → ${arrivalAirport}\n`;
  text += `📅 Ida: ${depDate} | Vuelta: ${retDate}\n`;

  if (stopoverAirport !== undefined && stopoverDurationDays !== undefined) {
    text += `🏨 Stopover: ${stopoverAirport} (${stopoverDurationDays} días)\n`;
  }

  text += `\n📊 Desglose: precio=${scoreBreakdown.price} horario=${scoreBreakdown.schedule} stopover=${scoreBreakdown.stopover} aerolínea=${scoreBreakdown.airline} flex=${scoreBreakdown.flexibility}\n`;
  text += `\n🔗 [Reservar aquí](${bookingUrl})`;

  return text;
}
