# Robot Arena

Síťová tahová hra 1v1 - roboti v aréně bojují proti sobě.

## Popis

Robot Arena je webová hra pro 2 hráče, kde každý hráč ovládá robota v aréně. Hráči se pohybují po gridu, útočí na krátkou vzdálenost a musí se vyhýbat pastím, které se aktivují během hry. Hra nevyžaduje registraci - stačí zadat přezdívku a začít hrát.

## Technologie

- **Backend**: FastAPI (Python 3.11) + WebSocket
- **Frontend**: SSR (Jinja2) + vanilla JavaScript
- **Deployment**: Docker + Docker Compose
- **CI/CD**: GitHub Actions → GHCR (multi-arch)

## Herní mechanika

- **Tahová hra**: Každý hráč má 3 akce (AP) na tah
- **Pohyb**: 8-směr (šipky na klávesnici nebo kliknutí), 1 buňka = 1 akce
- **Útok**: Pouze 4-směr (N/E/S/W), kontrola dosahu zbraně
- **Pasti**: Definované v SVG, 2 fáze (arming → active), damage per tah
- **Léčení**: 25% HP regenerace při pohybu na spawn pozici (pokud není protihráč v dosahu)
- **Konec hry**: Robot s HP 0 prohrává

## Spuštění

### Lokálně s Docker Compose

```bash
docker compose up -d --build
```

Aplikace bude dostupná na `http://localhost`

> **Poznámka**: Pro lokální vývoj se používá `build:`, pro produkci (po push na GitHub) se použije `image:` z GHCR.

### Bez Dockeru

```bash
pip install -r requirements.txt
cd app
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Aplikace bude dostupná na `http://localhost:8000`

## Struktura projektu

```
app/
  main.py              # FastAPI aplikace + WebSocket + herní logika
  settings.py          # Nastavení aplikace
  templates/           # Jinja2 šablony
    base.html          # Základní šablona
    index.html         # Hlavní stránka (login, lobby, game)
  static/
    css/
      style.css        # Styly aplikace
    js/
      app.js          # Hlavní logika (WebSocket, UI)
      arena.js        # Renderování arény a gridu
      audio.js        # Správa zvukových efektů
    arena/
      arena.svg       # SVG aréna s definicemi pastí a překážek
    images/
      robots/         # Ikony robotů (r1.png - r8.png)
      pozadi.png      # Pozadí aplikace
    sfx/              # Zvukové efekty
      weapons/        # Zvuky zbraní
      traps/          # Zvuky pastí
      explosion/      # Zvuky výbuchů
    favicon.ico       # Favicon
    version.json      # Informace o verzi
  data/
    seed.json         # Seed data (8 robotů, 12 zbraní)
```

## Deployment

### GitHub Actions CI/CD

Při každém push do `main` branch se automaticky:
- Vytvoří Docker image pro `linux/amd64` a `linux/arm64`
- Pushne image do GHCR jako `ghcr.io/elvisek2020/web-robot_battle_arena:latest`
- Vytvoří tag `sha-<commit-hash>` pro konkrétní verzi

Workflow: `.github/workflows/docker.yml`

### Nasazení na Synology (Container Manager)

1. Vytvořte projekt v **Container Manager → Project**
2. Použijte `docker-compose.yml` z tohoto repozitáře
3. Upravte `docker-compose.yml` - odkomentujte `image:` a zakomentujte `build:`
4. Image se automaticky stahuje z GHCR: `ghcr.io/elvisek2020/web-robot_battle_arena:latest`

#### Update aplikace

```bash
docker compose pull
docker compose up -d
```

#### Rollback na konkrétní verzi

Upravte `docker-compose.yml`:
```yaml
image: ghcr.io/elvisek2020/web-robot_battle_arena:sha-<commit-hash>
```

Poté:
```bash
docker compose pull
docker compose up -d
```

### Poznámky k deploymentu

- Image je **public** na GHCR
- Automatický build při push do `main` branch
- Podporuje multi-arch: `linux/amd64` a `linux/arm64`
- Healthcheck endpoint: `http://localhost:8000/health`
- Interní port: `8000`, externí port: `80` (lze změnit v `docker-compose.yml`)

## WebSocket protokol

### Client → Server

- `join`: Připojení do hry (přezdívka)
- `reconnect`: Reconnect s tokenem (obnovení spojení)
- `select_loadout`: Výběr robota a zbraně
- `set_ready`: Označení jako připravený
- `action_move`: Pohyb robota (x, y)
- `action_attack`: Útok na soupeře (target_player_id)
- `end_turn`: Ukončení tahu (automaticky po 3 AP)

### Server → Client

- `join_ok`: Úspěšné připojení (token, player_id)
- `reconnect_ok`: Úspěšné obnovení spojení
- `seed`: Seed data (roboti, zbraně)
- `lobby_state`: Stav lobby (hráči, ready status)
- `game_state`: Stav hry (pozice, HP, AP, turn)
- `action_rejected`: Zamítnutá akce (důvod)
- `traps_state`: Stav pastí (arming/active)
- `game_over`: Konec hry (vítěz)
- `error`: Chybová zpráva

## Funkce

- ✅ Přihlášení bez registrace (přezdívka)
- ✅ Lobby pro 2 hráče
- ✅ Výběr robota a zbraně
- ✅ Tahová hra s 3 AP na tah
- ✅ 8-směrný pohyb (kliknutí nebo šipky)
- ✅ Útok na 4 směry s kontrolou dosahu
- ✅ Pasti s 2 fázemi (arming → active)
- ✅ Léčení na spawn pozici
- ✅ Zvukové efekty (vypnuté ve výchozím nastavení)
- ✅ Optimistic UI s rollbackem
- ✅ Automatické ukončení tahu po 3 AP
- ✅ Reconnect při ztrátě spojení
- ✅ Healthcheck endpoint

## Technické detaily

- **Port**: Interně `8000`, externě `80` (lze změnit)
- **Healthcheck**: `GET /health`
- **Statické soubory**: Součástí Docker image
- **Session storage**: Ukládá token, player_id, vybraný loadout
- **Audio**: Vypnuté ve výchozím nastavení (`audio.js`)

## Vývoj

### Lokální vývoj

```bash
# Build a spuštění
docker compose up -d --build

# Logy
docker compose logs -f

# Restart
docker compose restart

# Zastavení
docker compose down
```

### Git workflow

```bash
# Commit změn
git add .
git commit -m "Popis změn"
git push origin main

# GitHub Actions automaticky vytvoří novou image
```

## Licence

Tento projekt je soukromý projekt.

