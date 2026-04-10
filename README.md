# Flight Hunter

Sistema inteligente de monitoreo de ofertas de vuelos. Busca precios continuamente, calcula un puntaje de conveniencia (precio, horarios, escalas, aerolínea) y avisa por email, Telegram y dashboard web cuando aparece una oferta.

## Características

- **Búsqueda continua**: monitorea precios cada N minutos
- **Múltiples fuentes**: Google Flights (sin API key), Amadeus, Kiwi y Skyscanner (con API key)
- **Modo round trip**: ida y vuelta como un solo ticket
- **Modo split**: tramos separados (one-way) con combos automáticos — ideal para hacer escalas extendidas en una ciudad intermedia
- **Score de conveniencia (0-100)**: combina precio, horarios, duración, aerolínea y escalas
- **Alertas multi-canal**: dashboard en tiempo real, email y Telegram
- **Anti-spam**: cooldown por canal y deduplicación de vuelos repetidos
- **Filtros configurables**: blacklists de aerolíneas/aeropuertos, exigir carry-on, máximo de escalas, etc.

## Arquitectura

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Scraper   │───▶│   Analyzer  │───▶│   Notifier  │    │  Dashboard  │
│  (TS + PW)  │    │ (scoring +  │    │ (email +    │    │  (Next.js)  │
│             │    │  combos)    │    │  telegram)  │    │             │
└──────┬──────┘    └──────┬──────┘    └─────────────┘    └──────┬──────┘
       │                  │                                     │
       │            ┌─────▼──────┐                               │
       └───────────▶│   Redis    │◀──────────────────────────────┘
                    │ (BullMQ)   │
                    └─────┬──────┘
                          │
                    ┌─────▼──────┐
                    │ PostgreSQL │
                    └────────────┘
```

4 microservicios Node.js/TypeScript en un monorepo `pnpm + Turborepo`, comunicados por colas BullMQ sobre Redis y persistiendo en PostgreSQL via Prisma.

---

## Instalación

### Requisitos previos (todos los sistemas)

- **Node.js 22+**
- **pnpm 9.15+**
- **Docker Desktop** (para Postgres y Redis)
- **Git**

### macOS

```bash
# 1. Instalar Homebrew si no lo tenés
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Instalar Node, pnpm y Docker
brew install node@22 pnpm
brew install --cask docker

# 3. Abrir Docker Desktop al menos una vez para que arranque el daemon
open -a Docker

# 4. Clonar el proyecto
cd ~/Documents/Developments
git clone <url-del-repo> flight-hunter
cd flight-hunter

# 5. Instalar dependencias
pnpm install

# 6. Instalar el browser de Playwright (para Google Flights)
pnpm --filter @flight-hunter/scraper exec playwright install chromium
```

### Linux (Ubuntu/Debian)

```bash
# 1. Node.js 22 vía NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh -
source ~/.bashrc

# 3. Docker
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
# (cerrar sesión y volver a entrar para aplicar el grupo)

# 4. Clonar el proyecto
cd ~
git clone <url-del-repo> flight-hunter
cd flight-hunter

# 5. Instalar dependencias
pnpm install

# 6. Instalar el browser de Playwright (con dependencias del sistema)
pnpm --filter @flight-hunter/scraper exec playwright install --with-deps chromium
```

### Windows

```powershell
# 1. Instalar Node.js 22 desde https://nodejs.org/
#    (elegí la versión LTS para Windows x64)

# 2. Instalar pnpm (en PowerShell como admin)
iwr https://get.pnpm.io/install.ps1 -useb | iex

# 3. Instalar Docker Desktop desde https://www.docker.com/products/docker-desktop/
#    Abrirlo al menos una vez y dejar que arranque WSL2 si te lo pide

# 4. Instalar Git desde https://git-scm.com/download/win

# 5. Clonar el proyecto (en cualquier carpeta)
git clone <url-del-repo> flight-hunter
cd flight-hunter

# 6. Instalar dependencias
pnpm install

# 7. Instalar el browser de Playwright
pnpm --filter @flight-hunter/scraper exec playwright install chromium
```

---

## Configuración

### 1. Crear el archivo `.env`

Copiá el archivo de ejemplo:

```bash
cp .env.example .env
```

Editá `.env` con los valores reales. Lo mínimo indispensable:

```env
DATABASE_URL=postgresql://flight_hunter:flight_hunter_dev@localhost:5432/flight_hunter
REDIS_URL=redis://localhost:6379
```

Para que las **alertas por email** funcionen, agregá:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu@gmail.com
SMTP_PASS=tu_app_password    # En Gmail: usar "Contraseña de aplicación", no la real
SMTP_FROM=tu@gmail.com
SMTP_TO=destinatario@gmail.com
```

> **Gmail**: tenés que generar una "Contraseña de aplicación" desde https://myaccount.google.com/apppasswords (requiere 2FA activado).

Para alertas por **Telegram** (opcional):

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdef...     # Hablar con @BotFather
TELEGRAM_CHAT_ID=123456789                  # Hablar con @userinfobot
```

Para usar **fuentes de datos pagas/registradas** (opcional, si las tenés):

```env
KIWI_API_KEY=...           # https://tequila.kiwi.com (requiere ser afiliado)
SKYSCANNER_API_KEY=...     # https://rapidapi.com (pago)
AMADEUS_API_KEY=...        # https://developers.amadeus.com (free tier 2000 req/mes)
AMADEUS_API_SECRET=...
```

> Sin ninguna de estas, **igual funciona** usando solamente Google Flights vía scraping.

### 2. Levantar Postgres y Redis

```bash
docker compose up redis postgres -d
```

Verificar que estén sanos:

```bash
docker compose ps
```

Deberías ver `(healthy)` en ambos.

### 3. Sincronizar la base de datos

```bash
pnpm db:push
```

Esto crea las tablas en Postgres a partir del schema de Prisma.

---

## Ejecución

### Modo desarrollo (con hot reload)

```bash
pnpm dev
```

Esto levanta los 4 servicios en paralelo:

- **scraper**: busca vuelos en intervalos
- **analyzer**: scorea y detecta ofertas
- **notifier**: envía alertas (puerto WebSocket: 8080)
- **dashboard**: UI web en http://localhost:3000

Abrí **http://localhost:3000** en el navegador.

### Detener todo

```bash
# En la terminal de pnpm dev
Ctrl+C

# Para detener Postgres y Redis
docker compose down
```

### Tests

```bash
pnpm test                  # Corre todos los tests de los 4 servicios
pnpm test:coverage         # Con coverage
```

---

## Cómo crear una búsqueda

### Opción 1: desde el dashboard web

1. Andá a **http://localhost:3000**
2. En la barra lateral, click en **Búsquedas**
3. Click en **+ Nueva búsqueda**
4. Completá:
   - **Nombre**: identificador descriptivo, ej. `"Buenos Aires → Cusco Julio 2026"`
   - **Origen / Destino**: códigos IATA (`BUE`, `CUZ`, `EZE`, `MAD`...)
   - **Salida desde / hasta**: rango de fechas posibles para la ida
   - **Días de viaje (mínimo / máximo)**: cuántos días totales dura el viaje
   - **Pasajeros**
   - **Modo de búsqueda**: `Round trip` o `Split` (ver abajo)
   - **Filtros**: aerolíneas blacklist/preferred, máximo de escalas, requerir carry-on, máximo de horas de viaje
   - **Alertas — precios**: precio máximo (descartar), precio target (alerta "good"), precio dream (alerta "urgent")
   - **Intervalo de escaneo**: cada cuántos minutos buscar (mínimo recomendado: 15)
5. **Guardar**

Una vez guardada, en el próximo tick del scraper (entre inmediato y el intervalo configurado) van a empezar a aparecer resultados.

### Opción 2: desde la API REST (JSON)

#### Round trip simple

Una sola compra (ida + vuelta como un solo ticket):

```bash
curl -X POST http://localhost:3000/api/searches \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Buenos Aires → Cusco Julio 2026",
    "mode": "roundtrip",
    "origin": "BUE",
    "destination": "CUZ",
    "departureFrom": "2026-07-25",
    "departureTo": "2026-07-31",
    "returnMinDays": 15,
    "returnMaxDays": 22,
    "passengers": 2,
    "filters": {
      "airlineBlacklist": [],
      "airlinePreferred": ["LATAM", "Aerolineas Argentinas"],
      "airportPreferred": { "BUE": ["AEP"] },
      "airportBlacklist": {},
      "maxUnplannedStops": 1,
      "minConnectionTime": 60,
      "maxConnectionTime": 480,
      "requireCarryOn": true,
      "maxTotalTravelTime": 15
    },
    "alertConfig": {
      "scoreThresholds": { "info": 60, "good": 75, "urgent": 90 },
      "maxPricePerPerson": 600,
      "targetPricePerPerson": 350,
      "dreamPricePerPerson": 250,
      "currency": "USD"
    },
    "proxyRegions": ["AR"],
    "scanIntervalMin": 15
  }'
```

#### Modo Split (recomendado para escalas extendidas)

Compra los tramos por separado. Es más caro de procesar pero permite **fechas exactas en cada tramo** y **escalas extendidas reales** en ciudades intermedias.

Ejemplo: viaje a Cusco con 3-4 días en Lima en la vuelta:

```bash
curl -X POST http://localhost:3000/api/searches \
  -H "Content-Type: application/json" \
  -d '{
    "name": "BUE → CUZ con escala en Lima a la vuelta",
    "mode": "split",
    "origin": "BUE",
    "destination": "CUZ",
    "departureFrom": "2026-07-25",
    "departureTo": "2026-07-31",
    "returnMinDays": 15,
    "returnMaxDays": 30,
    "passengers": 2,
    "legs": [
      {
        "origin": "BUE",
        "destination": "CUZ",
        "departureFrom": "2026-07-25",
        "departureTo": "2026-07-31"
      },
      {
        "origin": "CUZ",
        "destination": "BUE",
        "departureFrom": "2026-08-09",
        "departureTo": "2026-08-22",
        "stopover": { "airport": "LIM", "minDays": 3, "maxDays": 4 }
      }
    ],
    "filters": {
      "airlineBlacklist": [],
      "airlinePreferred": ["LATAM"],
      "airportPreferred": { "BUE": ["AEP"] },
      "airportBlacklist": {},
      "maxUnplannedStops": 1,
      "minConnectionTime": 60,
      "maxConnectionTime": 480,
      "requireCarryOn": true,
      "maxTotalTravelTime": 15
    },
    "alertConfig": {
      "scoreThresholds": { "info": 60, "good": 75, "urgent": 90 },
      "maxPricePerPerson": 700,
      "targetPricePerPerson": 400,
      "dreamPricePerPerson": 300,
      "currency": "USD"
    },
    "proxyRegions": ["AR"],
    "scanIntervalMin": 15
  }'
```

En modo split, el `analyzer` toma los mejores N resultados de cada tramo y arma todas las combinaciones válidas (respetando que la fecha del tramo 2 sea posterior al tramo 1) y scorea el combo entero. Las alertas que recibís incluyen los N tramos del combo con los links de reserva por separado.

#### Listar / actualizar / borrar búsquedas

```bash
# Listar
curl http://localhost:3000/api/searches

# Ver una específica
curl http://localhost:3000/api/searches/{id}

# Actualizar (PUT — podés mandar solo los campos que querés cambiar)
curl -X PUT http://localhost:3000/api/searches/{id} \
  -H "Content-Type: application/json" \
  -d '{ "scanIntervalMin": 30, "active": false }'

# Borrar (soft delete: pone active=false)
curl -X DELETE http://localhost:3000/api/searches/{id}
```

#### Otros endpoints útiles

```bash
# Ver últimas alertas
curl http://localhost:3000/api/alerts

# Ver últimos resultados de una búsqueda
curl "http://localhost:3000/api/searches/{id}/results?sort=price&limit=10"

# Ver mejores combos (solo para split mode)
curl http://localhost:3000/api/searches/{id}/combos

# Estado del sistema (DB + Redis + colas)
curl http://localhost:3000/api/system
```

---

## Glosario rápido

| Término | Qué es |
|---|---|
| **Round trip** | Comprar ida y vuelta como un solo ticket |
| **Split** | Comprar la ida y la vuelta como tickets separados (uno o más tramos) |
| **Stopover extendido** | Quedarse N días en una ciudad intermedia (no es una escala técnica corta) |
| **Score** | Puntaje 0-100 que combina precio, horarios, escalas, aerolínea, etc. |
| **Combo** | (solo en split) Combinación de un vuelo por tramo, scoreada como conjunto |
| **Alert level** | `info` (solo dashboard) / `good` (+ email) / `urgent` (+ Telegram) |

## Estructura del proyecto

```
flight-hunter/
├── packages/shared/          # Tipos, schema Prisma, schemas zod, utils
├── services/
│   ├── scraper/              # Búsqueda y normalización de vuelos
│   ├── analyzer/             # Scoring, filtros, deal detection, combos
│   ├── notifier/             # Email, Telegram, WebSocket
│   └── dashboard/            # Next.js (API routes + UI)
├── docs/
│   └── superpowers/
│       ├── specs/            # Diseño del sistema
│       └── plans/            # Plan de implementación
├── docker-compose.yml
├── docker-compose.dev.yml
└── .env.example
```

## Troubleshooting

| Problema | Solución |
|---|---|
| `pnpm db:push` falla con `DATABASE_URL not found` | Asegurate de tener `.env` en la raíz con `DATABASE_URL` |
| `docker compose ps` no muestra los contenedores como healthy | Esperá ~30s después de `docker compose up`, después chequeá `docker compose logs postgres` |
| El scraper no encuentra vuelos | Mirá los logs de `pnpm dev`, sección `@flight-hunter/scraper`. Si dice `Source google-flights: 0 result(s)`, probablemente la página de Google cambió selectores; se requiere actualizar el scraper |
| Emails con error `EENVELOPE: No recipients defined` | Falta `SMTP_TO` en `.env` |
| Telegram con error `404 Not Found` | El `TELEGRAM_BOT_TOKEN` está vacío o mal. El sistema sigue funcionando con email y dashboard |
| Cambié código y no veo el cambio | El `dashboard` (Next.js) tiene hot reload. Los servicios de backend (scraper/analyzer/notifier) usan `tsx watch` que también reinicia. Si no, parar `pnpm dev` con Ctrl+C y volver a arrancar |
