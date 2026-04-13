# Flight Hunter

Sistema de monitoreo de ofertas de vuelos vía Google Flights (Playwright). Sin APIs externas ni API keys: todo el scraping se hace navegando Google Flights directamente, leyendo la solapa **Cheapest** (precios por persona, 1 adulto).

## Características

- **Monitoreo continuo**: scraping de Google Flights cada N minutos vía Playwright
- **Modelo de waypoints**: definí un origen y una lista ordenada de destinos intermedios (con estadías en noches o conexiones); el motor genera todas las permutaciones válidas automáticamente
- **Equipaje per-tramo**: carry-on global + bolsos facturados configurables por cada tramo (incluyendo el tramo de regreso)
- **Pasajeros per-tramo**: la búsqueda parametriza la cantidad de pasajeros en cada vuelo
- **Transparencia de costos**: precio Google Flights (per-person) + estimado carry-on + estimado maletas por tramo + impuestos argentinos PAIS + RG 5232, todo desglosado por persona y como total grupo
- **Score de conveniencia (0-100)**: combina precio, horarios, duración, aerolínea y escalas
- **Alertas multi-canal**: dashboard en tiempo real (WebSocket), email y Telegram
- **Notifier con dedup refresh**: las alertas existentes se actualizan con datos frescos en lugar de generar duplicados
- **Anti-spam**: cooldown por canal y deduplicación de vuelos repetidos
- **Config en caliente**: políticas de equipaje, tasas impositivas y parámetros del sistema editables desde `/system` sin reiniciar servicios
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

### Requisitos

- **Node.js 22+**
- **pnpm 9+**
- **Docker Desktop** (Postgres en puerto 5433, Redis en 6379)

### macOS

```bash
# Node, pnpm y Docker
brew install node@22 pnpm
brew install --cask docker
open -a Docker   # dejarlo iniciar

# Clonar e instalar
cd ~/Documents/Developments
git clone <url-del-repo> flight-hunter
cd flight-hunter
pnpm install

# Browser para Playwright
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

Mínimo indispensable (sin API keys externas requeridas):

```env
DATABASE_URL=postgresql://flight_hunter:flight_hunter@localhost:5433/flight_hunter
REDIS_URL=redis://localhost:6379
```

> La base de datos corre en el puerto **5433** (no 5432) para no pisar un Postgres local.

Para **alertas por email**:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu@gmail.com
SMTP_PASS=tu_app_password    # Gmail: usar "Contraseña de aplicación", no la contraseña real
SMTP_FROM=tu@gmail.com
SMTP_TO=destinatario@gmail.com
```

> En Gmail: generá una "Contraseña de aplicación" en https://myaccount.google.com/apppasswords (requiere 2FA).

Para **Telegram** (opcional):

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdef...   # Hablar con @BotFather
TELEGRAM_CHAT_ID=123456789               # Hablar con @userinfobot
```

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

Antes de arrancar, limpia cachés y reconstruye `@flight-hunter/shared` automáticamente. Levanta los 4 servicios en paralelo:

- **scraper**: busca vuelos según el intervalo de cada búsqueda activa
- **analyzer**: scorea resultados, detecta combos de waypoints y deals
- **notifier**: envía alertas (WebSocket en puerto 8080)
- **dashboard**: UI web en **http://localhost:3000**

### Detener

```bash
Ctrl+C                  # detiene pnpm dev
docker compose down     # detiene Postgres y Redis
```

### Seed canónico

Para recrear la búsqueda de referencia (BUE → LIM → CUZ → BUE):

```bash
pnpm seed:current
```

Inserta una búsqueda con LIM (3-4 noches) y CUZ (7-10 noches) como waypoints desde BUE.

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
- **Tipo de pausa**: `estadía` (rango de noches min/max) o `conexión` (máximo de horas)
- **Pin**: `primero` o `último` para fijar ese waypoint en esa posición al calcular permutaciones
- **Bolsos facturados**: cantidad de maletas en ese tramo (sobreescribe el global)

El ancla **REGRESO** permite configurar los bolsos facturados del vuelo de vuelta.

**Filtros**
- **Requerir carry-on**: toggle global (aplica a todos los tramos)
- **Máximo de escalas**
- **Máximo de horas de viaje**
- **Blacklist de aerolíneas**

**Precios y alertas**
- **Precio máximo**: descartar resultados por encima de este valor (per-person)
- **Precio target**: umbral para alerta nivel `good`
- **Precio dream**: umbral para alerta nivel `urgent`
- **Intervalo de escaneo**: cada cuántos minutos buscar (mínimo recomendado: 15)

4. **Guardar** — los resultados empiezan a aparecer en el próximo ciclo del scraper.

### Opción 2: desde la API REST

#### Búsqueda con waypoints

Ejemplo: BUE → LIM (3-4 noches) → CUZ (7-10 noches) → BUE:

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
- El array `waypoints` define los destinos en cualquier orden; el motor genera todas las permutaciones válidas
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

# Borrar
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

La página `/system` del dashboard expone una sección **Configuración** editable sin reiniciar:

| Parámetro | Descripción |
|---|---|
| **Políticas de equipaje por aerolínea** | Costo en USD de carry-on y maleta facturada por aerolínea |
| **Tasas impositivas AR** | PAIS % + RG 5232 % (default: 30% + 45% = multiplicador 1.75x) |
| **Dedup TTL del notifier** | Tiempo en segundos antes de que una misma alerta pueda volver a enviarse |
| **Cooldown por canal** | Tiempo mínimo entre alertas por email/Telegram |
| **Max fechas por par** | Cuántas fechas escanear por combinación origen-destino |
| **Max waypoints** | Límite de waypoints por búsqueda |

Los cambios se persisten en `system_settings.runtime_config` (JSONB) y se recargan cada 30 segundos en todos los servicios.

---

## Cómo se muestran las alertas

Cada alerta incluye:

- **Timeline visual**: origen → parada → destino final con duración de cada vuelo y aerolínea; separadores de estadía entre tramos
- **Badges de waypoints**: resumen del itinerario generado
- **Desglose de costos por persona**:
  - Precio Google Flights (incluye impuestos aeroportuarios; per-person, 1 adulto)
  - Estimado carry-on (según política de la aerolínea)
  - Estimado maletas facturadas por tramo
  - Impuestos argentinos PAIS + RG 5232 (como línea separada)
  - Total grupo (precio per-person × pasajeros + equipaje)
- **Link de booking**: enlace directo a Google Flights con los pasajeros configurados
- **Botón copiar para WhatsApp**: genera texto formateado para compartir

---

## Precios: cómo se obtienen

El scraper abre Google Flights con la ruta y fechas configuradas, hace click en la solapa **Cheapest** y extrae el precio más barato disponible. Los precios son **per-person con 1 adulto** tal como los muestra Google (incluyen impuestos aeroportuarios). Los costos de equipaje e impuestos argentinos se calculan por separado en el analyzer.

---

## Estructura del proyecto

```
flight-hunter/
├── packages/shared/          # Tipos TS, schema Prisma, schemas Zod, utils
├── services/
│   ├── scraper/              # Playwright scraping de Google Flights
│   ├── analyzer/             # Scoring, permutaciones de waypoints, deal detection
│   ├── notifier/             # Email (SMTP), Telegram, WebSocket + dedup refresh
│   └── dashboard/            # Next.js 15 (API routes + UI en http://localhost:3000)
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
| El scraper no encuentra vuelos | Revisar logs de `@flight-hunter/scraper`. Si dice `Source google-flights: 0 result(s)`, Google cambió sus selectores; actualizar el scraper |
| Emails con `EENVELOPE: No recipients defined` | Falta `SMTP_TO` en `.env` |
| Telegram con `404 Not Found` | `TELEGRAM_BOT_TOKEN` vacío o incorrecto; el sistema sigue funcionando con email y dashboard |
| Cambié código y no veo el cambio | El dashboard (Next.js) tiene hot reload; los servicios backend usan `tsx watch`. Si persiste, reiniciar `pnpm dev` |
| Los costos de equipaje no cuadran | Revisar y actualizar las políticas de aerolínea en `/system` → Configuración |
| Las permutaciones no incluyen una ruta esperada | Verificar que no haya un `pin` incorrecto en algún waypoint que esté bloqueando el reordenamiento |
