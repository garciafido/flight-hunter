# Flight Hunter

Sistema inteligente de monitoreo de ofertas de vuelos. Scrapeá continuamente Google Flights, calculá un score de conveniencia y recibí alertas por dashboard, email y Telegram cuando aparece una oferta.

## Características

- **Monitoreo continuo**: scraping de Google Flights cada N minutos vía Playwright
- **Modelo de waypoints**: definí un origen, una lista ordenada de paradas (con estadías o conexiones), y el sistema explora todas las permutaciones válidas automáticamente
- **Pins**: fijá el primer o último waypoint para que el optimizador no lo reordene
- **Equipaje granular**: carry-on global por búsqueda + bolsos facturados por tramo (incluyendo el tramo de regreso)
- **Transparencia de costos**: precio Google Flights + estimado carry-on + estimado maletas + impuestos argentinos, todo por persona
- **Score de conveniencia (0-100)**: combina precio, horarios, duración, aerolínea y escalas
- **Alertas multi-canal**: dashboard en tiempo real, email y Telegram
- **Anti-spam**: cooldown por canal y deduplicación de vuelos repetidos
- **Config en caliente**: políticas de equipaje, tasas impositivas y parámetros del sistema editables desde `/system` sin reiniciar
- **Filtros configurables**: blacklist de aerolíneas, máximo de escalas, máximo de horas de viaje, requerir carry-on

## Arquitectura

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Scraper   │───▶│   Analyzer  │───▶│   Notifier  │    │  Dashboard  │
│  (TS + PW)  │    │ (scoring +  │    │ (email +    │    │  (Next.js)  │
│             │    │  combos)    │    │  telegram)  │    │             │
└──────┬──────┘    └──────┬──────┘    └─────────────┘    └──────┬──────┘
       │                  │                                      │
       │            ┌─────▼──────┐                               │
       └───────────▶│   Redis    │◀──────────────────────────────┘
                    │ (BullMQ)   │
                    └─────┬──────┘
                          │
                    ┌─────▼──────┐
                    │ PostgreSQL │
                    └────────────┘
```

4 microservicios Node.js/TypeScript en un monorepo `pnpm + Turborepo`, comunicados por colas BullMQ sobre Redis, persistiendo en PostgreSQL vía Prisma.

---

## Instalación

### Requisitos previos

- **Node.js 22+**
- **pnpm 9.15+**
- **Docker Desktop** (para Postgres y Redis)

### macOS

```bash
# 1. Homebrew (si no lo tenés)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Node, pnpm y Docker
brew install node@22 pnpm
brew install --cask docker
open -a Docker   # dejarlo iniciar al menos una vez

# 3. Clonar
cd ~/Documents/Developments
git clone <url-del-repo> flight-hunter
cd flight-hunter

# 4. Dependencias
pnpm install

# 5. Browser para Playwright
pnpm --filter @flight-hunter/scraper exec playwright install chromium
```

### Linux (Ubuntu/Debian)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
curl -fsSL https://get.pnpm.io/install.sh | sh -
source ~/.bashrc
sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
# cerrar sesión y volver a entrar para aplicar el grupo

cd ~/Documents/Developments
git clone <url-del-repo> flight-hunter
cd flight-hunter
pnpm install
pnpm --filter @flight-hunter/scraper exec playwright install --with-deps chromium
```

---

## Configuración

### 1. Crear el archivo `.env`

```bash
cp .env.example .env
```

Mínimo indispensable:

```env
DATABASE_URL=postgresql://flight_hunter:flight_hunter_dev@localhost:5433/flight_hunter
REDIS_URL=redis://localhost:6379
```

> La base de datos corre en el puerto **5433** (no 5432) por la configuración local.

Para **alertas por email**:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu@gmail.com
SMTP_PASS=tu_app_password    # Gmail: usar "Contraseña de aplicación", no la contraseña real
SMTP_FROM=tu@gmail.com
SMTP_TO=destinatario@gmail.com
```

> En Gmail: generá una "Contraseña de aplicación" desde https://myaccount.google.com/apppasswords (requiere 2FA).

Para **Telegram** (opcional):

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdef...   # Hablar con @BotFather
TELEGRAM_CHAT_ID=123456789               # Hablar con @userinfobot
```

Las claves de Kiwi, Skyscanner, Amadeus y Duffel pueden omitirse — esas fuentes están stubbeadas y devuelven resultados vacíos. Solo Google Flights está completamente implementado.

### 2. Levantar Postgres y Redis

```bash
docker compose up redis postgres -d
docker compose ps   # verificar que aparezcan como (healthy)
```

### 3. Sincronizar la base de datos

```bash
pnpm db:push
```

Crea o actualiza las tablas en Postgres a partir del schema de Prisma (sin migraciones).

---

## Ejecución

### Modo desarrollo (hot reload)

```bash
pnpm dev
```

Levanta los 4 servicios en paralelo:

- **scraper**: busca vuelos según el intervalo de cada búsqueda
- **analyzer**: scorea resultados, detecta combos y deals
- **notifier**: envía alertas (WebSocket en puerto 8080)
- **dashboard**: UI web en **http://localhost:3000**

### Detener

```bash
Ctrl+C                  # detiene pnpm dev
docker compose down     # detiene Postgres y Redis
```

### Seed canónico

Para recrear la búsqueda de referencia BUE → CUZ con escala en LIM:

```bash
pnpm seed:current
```

Esto inserta una búsqueda con LIM (3-4d) + CUZ (7-10d) como waypoints desde BUE.

### Tests

```bash
pnpm test             # todos los servicios
pnpm test:coverage    # con coverage
```

---

## Cómo crear una búsqueda

### Opción 1: desde el dashboard web

1. Ir a **http://localhost:3000** → sección **Búsquedas**
2. Click en **+ Nueva búsqueda**
3. Completar el formulario:

**Cabecera**
- **Nombre**: identificador descriptivo, ej. `"BUE → CUZ Julio 2026"`
- **Origen**: código IATA del aeropuerto de partida (ej. `BUE`)
- **Salida desde / hasta**: rango de fechas posibles para la primera salida
- **Pasajeros**

**Constructor de waypoints** (flujo visual)

El formulario muestra: `[ORIGEN] → [waypoint 1] → [waypoint 2] → ... → [REGRESO]`

Cada tarjeta de waypoint tiene:
- **Aeropuerto**: código IATA del destino intermedio o final
- **Tipo**: `estadía` (rango de días min/max) o `conexión` (máximo de horas)
- **Pin**: `primero` o `último` para fijar ese waypoint en esa posición al calcular permutaciones
- **Bolsos facturados**: cantidad de maletas en ese tramo (sobreescribe el global)

El ancla **REGRESO** permite configurar los bolsos facturados del tramo de vuelta.

**Filtros**
- **Requerir carry-on**: toggle global (aplica a todos los tramos)
- **Máximo de escalas**
- **Máximo de horas de viaje**
- **Blacklist de aerolíneas**

**Precios y alertas**
- **Precio máximo**: descartar resultados por encima de este valor
- **Precio target**: umbral para alerta nivel `good`
- **Precio dream**: umbral para alerta nivel `urgent`
- **Intervalo de escaneo**: cada cuántos minutos buscar (mínimo recomendado: 15)

4. **Guardar** — los resultados empiezan a aparecer en el próximo ciclo del scraper.

Para editar una búsqueda existente: ir a `/searches/[id]/settings`.

### Opción 2: desde la API REST

#### Búsqueda con waypoints (formato actual)

Ejemplo: BUE → CUZ con escala en LIM de 3-4 días — el motor prueba ambas permutaciones (LIM→CUZ y CUZ→LIM):

```bash
curl -X POST http://localhost:3000/api/searches \
  -H "Content-Type: application/json" \
  -d '{
    "name": "BUE → CUZ con LIM Julio 2026",
    "origin": "BUE",
    "departureFrom": "2026-07-25",
    "departureTo": "2026-07-31",
    "passengers": 2,
    "waypoints": [
      {
        "airport": "LIM",
        "gap": { "type": "stay", "minDays": 3, "maxDays": 4 },
        "checkedBags": 0
      },
      {
        "airport": "CUZ",
        "gap": { "type": "stay", "minDays": 7, "maxDays": 10 },
        "pin": "last",
        "checkedBags": 1
      }
    ],
    "returnCheckedBags": 1,
    "filters": {
      "requireCarryOn": true,
      "airlineBlacklist": [],
      "maxUnplannedStops": 1,
      "maxTotalTravelTime": 15
    },
    "alertConfig": {
      "scoreThresholds": { "info": 60, "good": 75, "urgent": 90 },
      "maxPricePerPerson": 700,
      "targetPricePerPerson": 400,
      "dreamPricePerPerson": 300,
      "currency": "USD"
    },
    "scanIntervalMin": 15
  }'
```

**Notas sobre waypoints:**
- El array `waypoints` define los destinos intermedios y final en cualquier orden; el motor genera todas las permutaciones
- `pin: "first"` fija ese waypoint como primera parada (no se reordena)
- `pin: "last"` fija ese waypoint como última parada antes del regreso
- `gap.type: "connection"` con `maxHours` modela una escala técnica (no estadía)
- `checkedBags` en cada waypoint indica maletas en ese tramo específico
- `returnCheckedBags` es la cantidad de maletas en el vuelo de regreso

#### Búsqueda directa (un solo destino)

```bash
curl -X POST http://localhost:3000/api/searches \
  -H "Content-Type: application/json" \
  -d '{
    "name": "BUE → MAD Diciembre 2026",
    "origin": "BUE",
    "departureFrom": "2026-12-15",
    "departureTo": "2026-12-22",
    "passengers": 1,
    "waypoints": [
      {
        "airport": "MAD",
        "gap": { "type": "stay", "minDays": 10, "maxDays": 15 }
      }
    ],
    "returnCheckedBags": 0,
    "filters": {
      "requireCarryOn": false,
      "airlineBlacklist": ["Aerolíneas Argentinas"],
      "maxUnplannedStops": 2,
      "maxTotalTravelTime": 20
    },
    "alertConfig": {
      "scoreThresholds": { "info": 60, "good": 75, "urgent": 90 },
      "maxPricePerPerson": 900,
      "targetPricePerPerson": 600,
      "dreamPricePerPerson": 450,
      "currency": "USD"
    },
    "scanIntervalMin": 30
  }'
```

#### Listar / actualizar / borrar

```bash
# Listar todas
curl http://localhost:3000/api/searches

# Ver una
curl http://localhost:3000/api/searches/{id}

# Actualizar (campos parciales)
curl -X PUT http://localhost:3000/api/searches/{id} \
  -H "Content-Type: application/json" \
  -d '{ "scanIntervalMin": 30, "active": false }'

# Borrar (soft delete)
curl -X DELETE http://localhost:3000/api/searches/{id}
```

#### Otros endpoints

```bash
# Últimas alertas
curl http://localhost:3000/api/alerts

# Resultados de una búsqueda
curl "http://localhost:3000/api/searches/{id}/results?sort=price&limit=10"

# Estado del sistema (DB + Redis + colas)
curl http://localhost:3000/api/system
```

---

## Configuración en caliente (`/system`)

La página `/system` del dashboard expone una sección **Configuración** donde podés editar sin reiniciar:

| Parámetro | Descripción |
|---|---|
| **Políticas de equipaje por aerolínea** | Costo en USD de carry-on y maleta facturada por aerolínea |
| **Tasas impositivas AR** | PAIS % + RG5232 % (default: 30% + 45% = multiplicador 1.75x) |
| **Dedup TTL del notifier** | Tiempo en segundos antes de que una misma alerta pueda volver a enviarse |
| **Cooldown por canal** | Tiempo mínimo entre alertas por email/Telegram |
| **Max fechas por par** | Cuántas fechas escanear por combinación origen-destino |
| **Max waypoints** | Límite de waypoints por búsqueda |

Los cambios se persisten en `system_settings.runtime_config` (JSONB) y se recargan cada 30 segundos en todos los servicios.

---

## Cómo se muestran las alertas

Cada alerta incluye:

- **Timeline visual**: punto de salida → punto de llegada con duración del vuelo y aerolínea, separadores de estadía entre tramos (🏨/🏖)
- **Badges de waypoints**: resumen del itinerario generado
- **Desglose de costos por persona**:
  - Precio Google Flights (incluye impuestos aeroportuarios)
  - Estimado carry-on (según política de la aerolínea)
  - Estimado maletas facturadas (por tramo)
  - Impuestos argentinos PAIS + RG5232 (como línea separada)
- **Fuente**: "Fuente: Google Flights · incluye impuestos y tasas aeroportuarias"
- **Botón copiar para WhatsApp**: genera texto formateado para compartir

---

## Glosario

| Término | Qué es |
|---|---|
| **Waypoint** | Destino intermedio o final dentro de un viaje. Cada waypoint tiene aeropuerto, tipo de pausa (estadía o conexión) y opcionalmente un pin y cantidad de maletas |
| **Pin** | Restricción que fija un waypoint como `first` (primera parada) o `last` (última parada), impidiendo que el optimizador lo reordene al generar permutaciones |
| **Estadía** (`stay`) | Pausa de N a M días en un aeropuerto; el pasajero realmente para ahí |
| **Conexión** (`connection`) | Escala técnica con máximo de horas; el optimizador la trata como tránsito |
| **Per-tramo** | Configuración que aplica a un tramo específico del viaje (ej. `checkedBags` por waypoint) en lugar de al viaje completo |
| **Runtime config** | Parámetros del sistema editables desde `/system` sin reiniciar los servicios; se recargan cada 30s |
| **Score** | Puntaje 0-100 que combina precio, horarios, duración, aerolínea y cantidad de escalas |
| **Alert level** | `info` (solo dashboard) / `good` (+ email) / `urgent` (+ email + Telegram) |
| **Permutación** | Cada ordenamiento posible de los waypoints no pineados; el motor evalúa todas y devuelve el mejor combo |
| **returnCheckedBags** | Cantidad de maletas facturadas específicamente en el vuelo de regreso al origen |

---

## Estructura del proyecto

```
flight-hunter/
├── packages/shared/          # Tipos TS, schema Prisma, schemas Zod, utils
├── services/
│   ├── scraper/              # Playwright scraping, normalización de vuelos
│   ├── analyzer/             # Scoring, permutaciones de waypoints, deal detection
│   ├── notifier/             # Email (SMTP), Telegram, WebSocket
│   └── dashboard/            # Next.js 15 (API routes + UI)
├── docker-compose.yml
├── docker-compose.dev.yml
└── .env.example
```

---

## Troubleshooting

| Problema | Solución |
|---|---|
| `pnpm db:push` falla con `DATABASE_URL not found` | Verificar que `.env` exista en la raíz con `DATABASE_URL` apuntando al puerto 5433 |
| `docker compose ps` no muestra los contenedores como healthy | Esperar ~30s después de `docker compose up`; revisar `docker compose logs postgres` |
| El scraper no encuentra vuelos | Revisar logs de `@flight-hunter/scraper`. Si dice `Source google-flights: 0 result(s)`, Google cambió sus selectores; hay que actualizar el scraper |
| Emails con `EENVELOPE: No recipients defined` | Falta `SMTP_TO` en `.env` |
| Telegram con `404 Not Found` | `TELEGRAM_BOT_TOKEN` vacío o incorrecto; el sistema sigue funcionando con email y dashboard |
| Cambié código y no veo el cambio | El dashboard (Next.js) tiene hot reload; los servicios backend usan `tsx watch`. Si persiste, reiniciar `pnpm dev` |
| Los costos de equipaje no cuadran | Revisar y actualizar las políticas de aerolínea en `/system` → Configuración |
| Las permutaciones no incluyen una ruta esperada | Verificar que no haya un `pin` incorrecto en algún waypoint que esté bloqueando el reordenamiento |
