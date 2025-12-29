# Robot Arena

Síťová tahová hra 1v1 - roboti v aréně bojují proti sobě.

## Popis

Robot Arena je webová hra pro 2 hráče, kde každý hráč ovládá robota v aréně. Hráči se pohybují po gridu, útočí na krátkou vzdálenost a musí se vyhýbat pastím, které se aktivují během hry.

## Technologie

- **Backend**: FastAPI (Python) + WebSocket
- **Frontend**: SSR (Jinja2) + vanilla JavaScript
- **Deployment**: Docker

## Herní mechanika

- **Tahová hra**: Každý hráč má 3 akce (AP) na tah
- **Pohyb**: 8-směr, 1 buňka = 1 akce
- **Útok**: Pouze 4-směr (N/E/S/W), kontrola dosahu zbraně
- **Pasti**: Definované v SVG, arming → active, damage per tah
- **Konec hry**: Robot s HP 0 prohrává

## Spuštění

### Lokálně s Docker Compose

```bash
docker compose up -d --build
```

Aplikace bude dostupná na `http://localhost:8080`

### Bez Dockeru

```bash
pip install -r requirements.txt
cd app
uvicorn main:app --reload
```

Aplikace bude dostupná na `http://localhost:8000`

## Struktura projektu

```
app/
  main.py              # FastAPI aplikace + WebSocket
  settings.py          # Nastavení
  templates/           # Jinja2 šablony
    base.html
    index.html
  static/
    css/              # Styly
    js/               # JavaScript
      app.js          # Hlavní logika
      arena.js        # Aréna a grid
      audio.js        # Audio manager
    arena/
      arena.svg       # SVG aréna s definicemi pastí
    sfx/              # Zvukové efekty (placeholdery)
  data/
    seed.json         # Seed data (roboti, zbraně)
```

## Deployment (Synology)

### Nasazení přes Container Manager

1. Vytvořte projekt v **Container Manager → Project**
2. Použijte `docker-compose.yml` z tohoto repozitáře
3. Image se automaticky stahuje z GHCR: `ghcr.io/elvisek2020/web-robot_battle_arena:latest`

### Update aplikace

```bash
docker compose pull
docker compose up -d
```

### Rollback na konkrétní verzi

Upravte `docker-compose.yml`:
```yaml
image: ghcr.io/elvisek2020/web-robot_battle_arena:sha-<commit>
```

Poté:
```bash
docker compose pull
docker compose up -d
```

### Poznámky

- Image je **public** na GHCR
- Automatický build při push do `main` branch
- Podporuje multi-arch: `linux/amd64` a `linux/arm64`

## WebSocket protokol

### Client → Server

- `join`: Připojení do hry
- `reconnect`: Reconnect s tokenem
- `select_loadout`: Výběr robota a zbraně
- `set_ready`: Označení jako připravený
- `action_move`: Pohyb robota
- `action_attack`: Útok na soupeře
- `end_turn`: Ukončení tahu

### Server → Client

- `join_ok`: Úspěšné připojení
- `seed`: Seed data (roboti, zbraně)
- `lobby_state`: Stav lobby
- `game_state`: Stav hry
- `action_rejected`: Zamítnutá akce
- `traps_state`: Stav pastí
- `game_over`: Konec hry

## Poznámky

- Aplikace běží na portu 8000 interně
- Statické soubory jsou součástí image
- Konfigurace přes ENV proměnné (viz `.env.example`)
- Healthcheck endpoint: `/health`

