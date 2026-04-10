export interface DigestSearch {
  id: string;
  name: string;
  origin: string;
  destination: string;
  minPriceChange?: number; // negative = price dropped
  top3: Array<{
    price: number;
    currency: string;
    airline: string;
    departureDate: string;
    returnDate: string;
    bookingUrl: string;
  }>;
}

export interface DigestPayload {
  date: string; // "10 Abril 2026"
  searches: DigestSearch[];
}

export function formatDigest(payload: DigestPayload): { subject: string; html: string } {
  const subject = `Resumen Flight Hunter — ${payload.date}`;

  if (payload.searches.length === 0) {
    return {
      subject,
      html: `<!DOCTYPE html><html lang="es"><body><p>Sin novedades hoy.</p></body></html>`,
    };
  }

  const searchSections = payload.searches
    .map((s) => {
      const changeNote =
        s.minPriceChange !== undefined && s.minPriceChange < 0
          ? `El precio mínimo bajó ${s.top3[0]?.currency ?? 'USD'} ${Math.abs(s.minPriceChange)} desde ayer.`
          : 'Sin cambios desde ayer.';

      const top3Rows = s.top3
        .map(
          (r, i) =>
            `<tr>
              <td style="padding:4px 8px;">${i + 1}.</td>
              <td style="padding:4px 8px;">${r.currency} ${r.price}</td>
              <td style="padding:4px 8px;">${r.airline}</td>
              <td style="padding:4px 8px;">${r.departureDate} → ${r.returnDate}</td>
              <td style="padding:4px 8px;"><a href="${r.bookingUrl}" style="color:#2563eb;">Reservar</a></td>
            </tr>`,
        )
        .join('');

      return `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:16px;margin:0 0 8px;">📍 ${s.origin} → ${s.destination} — ${s.name}</h2>
      <p style="margin:0 0 8px;color:#6b7280;">${changeNote}</p>
      <table style="border-collapse:collapse;width:100%;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:4px 8px;text-align:left;">#</th>
            <th style="padding:4px 8px;text-align:left;">Precio</th>
            <th style="padding:4px 8px;text-align:left;">Aerolínea</th>
            <th style="padding:4px 8px;text-align:left;">Fechas</th>
            <th style="padding:4px 8px;text-align:left;">Enlace</th>
          </tr>
        </thead>
        <tbody>${top3Rows}</tbody>
      </table>
    </div>`;
    })
    .join('<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
    .container { background: #fff; border-radius: 8px; padding: 24px; max-width: 600px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="container">
    <h1 style="font-size:20px;margin:0 0 24px;">Resumen Flight Hunter — ${payload.date}</h1>
    ${searchSections}
  </div>
</body>
</html>`;

  return { subject, html };
}

/**
 * Format a date to "10 Abril 2026" (Spanish locale style)
 */
export function formatDigestDate(date: Date): string {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
