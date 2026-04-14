import type { AlertJob } from '@flight-hunter/shared';

export interface EmailPayload {
  subject: string;
  html: string;
}

export function formatEmail(alert: AlertJob, searchName: string): EmailPayload {
  const { level, score, scoreBreakdown, flightSummary, combo } = alert;

  const isUrgent = level === 'urgent';
  const levelLabel = isUrgent ? 'URGENTE' : level === 'good' ? 'BUENA OFERTA' : 'INFO';

  // Combo (waypoint trip) rendering
  if (combo) {
    const totalPrice = combo.totalPrice;
    const currency = flightSummary.currency;
    const waypointsLabel = combo.waypoints && combo.waypoints.length > 0
      ? ' · ' + combo.waypoints.map((wp) =>
          wp.type === 'stay'
            ? `${wp.airport} ${wp.minDays}-${wp.maxDays}d`
            : `${wp.airport} <${wp.maxHours}h`,
        ).join(' · ')
      : '';
    const subject = `[Flight Hunter] ${levelLabel}: ${currency} ${totalPrice} total${waypointsLabel} — ${searchName}`;

    const legsHtml = combo.legs
      .map((leg, i) => {
        const depDate = leg.departureTime.slice(0, 10);
        const stopoverRow =
          leg.stopoverAirport !== undefined && leg.stopoverDurationDays !== undefined
            ? `<tr><td><strong>Stopover</strong></td><td>${leg.stopoverAirport} (${leg.stopoverDurationDays} días)</td></tr>`
            : '';
        return `
      <h3 style="margin: 16px 0 8px; font-size: 14px; color: #374151;">Tramo ${i + 1}: ${leg.departureAirport} → ${leg.arrivalAirport}</h3>
      <table style="width:100%;border-collapse:collapse;margin:0 0 12px;">
        <tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:bold;width:40%">Aerolínea</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${leg.airline}</td></tr>
        <tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:bold;">Precio</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${currency} ${leg.price}/persona</td></tr>
        <tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:bold;">Fecha</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${depDate}</td></tr>
        ${stopoverRow}
        <tr><td style="padding:6px 10px;font-weight:bold;">Buscar</td><td style="padding:6px 10px;"><a href="${leg.bookingUrl}" style="color:#2563eb;">Google Flights</a>${leg.despegarUrl ? ` · <a href="${leg.despegarUrl}" style="color:#2563eb;">Despegar</a>` : ''}</td></tr>
      </table>`;
      })
      .join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
    .container { background: #fff; border-radius: 8px; padding: 24px; max-width: 600px; margin: 0 auto; }
    h1 { color: ${isUrgent ? '#c0392b' : '#2980b9'}; }
    .breakdown { font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${levelLabel}: ${currency} ${totalPrice} total</h1>
    <p><strong>${searchName}</strong> — Combinación de vuelos separados</p>
    ${combo.waypoints && combo.waypoints.length > 0 ? `<p style="background:#eff6ff;border-left:4px solid #2563eb;padding:8px 12px;color:#1e40af;font-size:13px;">Itinerario: ${combo.waypoints.map((wp) => wp.type === 'stay' ? `<strong>${wp.airport}</strong> (${wp.minDays}-${wp.maxDays}d)` : `<strong>${wp.airport}</strong> (<${wp.maxHours}h)`).join(' · ')}</p>` : ''}
    ${(combo.carryOnEstimateUSD ?? 0) > 0 || (combo.checkedBagEstimateUSD ?? 0) > 0 ? `<p style="font-size:13px;color:#475569;">${(combo.carryOnEstimateUSD ?? 0) > 0 ? `🧳 +USD ${combo.carryOnEstimateUSD} carry-on ` : ''}${(combo.checkedBagEstimateUSD ?? 0) > 0 ? `🧳 +USD ${combo.checkedBagEstimateUSD} valija ` : ''}(estimado) → <strong>USD ${(Number(totalPrice) + (combo.carryOnEstimateUSD ?? 0) + (combo.checkedBagEstimateUSD ?? 0)).toLocaleString()}</strong></p>` : ''}
    ${combo.argTaxEstimateUSD !== undefined ? `<p style="font-size:13px;color:#475569;">🇦🇷 con impuestos AR (PAIS 30% + RG 5232 45%, incluye equipaje): <strong>USD ${combo.argTaxEstimateUSD.toLocaleString()}</strong></p>` : ''}
    <p>Score: ${score}/100</p>
    ${legsHtml}
    <p class="breakdown">Desglose: precio=${scoreBreakdown.price} | horario=${scoreBreakdown.schedule} | stopover=${scoreBreakdown.stopover} | aerolínea=${scoreBreakdown.airline} | flex=${scoreBreakdown.flexibility}</p>
    <p style="font-size:11px;color:#94a3b8;font-style:italic;margin-top:16px;">Fuente: Google Flights · precio incluye impuestos y tasas aeroportuarias obligatorias</p>
  </div>
</body>
</html>`;

    return { subject, html };
  }

  // Standard single-flight rendering
  const { price, currency, airline, departureAirport, arrivalAirport, departureTime, arrivalTime, stopoverAirport, stopoverDurationDays, bookingUrl } = flightSummary;

  const subject = `[Flight Hunter] ${levelLabel}: ${currency} ${price}/persona — ${searchName}`;

  const depDate = departureTime.slice(0, 10);
  const retDate = arrivalTime.slice(0, 10);

  const stopoverRow = stopoverAirport !== undefined && stopoverDurationDays !== undefined
    ? `<tr><td><strong>Stopover</strong></td><td>${stopoverAirport} (${stopoverDurationDays} días)</td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
    .container { background: #fff; border-radius: 8px; padding: 24px; max-width: 600px; margin: 0 auto; }
    h1 { color: ${isUrgent ? '#c0392b' : '#2980b9'}; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    td { padding: 8px 12px; border-bottom: 1px solid #eee; }
    td:first-child { font-weight: bold; width: 40%; }
    .btn { display: inline-block; background: #27ae60; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; }
    .breakdown { font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${levelLabel}: ${currency} ${price}/persona</h1>
    <p><strong>${searchName}</strong></p>
    <table>
      <tr><td><strong>Precio/persona</strong></td><td>${currency} ${price}</td></tr>
      <tr><td><strong>Score</strong></td><td>${score}/100</td></tr>
      <tr><td><strong>Aerolínea</strong></td><td>${airline}</td></tr>
      <tr><td><strong>Ruta</strong></td><td>${departureAirport} → ${arrivalAirport}</td></tr>
      <tr><td><strong>Fechas</strong></td><td>Ida: ${depDate} | Vuelta: ${retDate}</td></tr>
      ${stopoverRow}
    </table>
    <p class="breakdown">Desglose: precio=${scoreBreakdown.price} | horario=${scoreBreakdown.schedule} | stopover=${scoreBreakdown.stopover} | aerolínea=${scoreBreakdown.airline} | flex=${scoreBreakdown.flexibility}</p>
    <a class="btn" href="${bookingUrl}">Reservar ahora</a>
  </div>
</body>
</html>`;

  return { subject, html };
}
