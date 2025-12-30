# Robot Arena

Síťová tahová hra 1v1 - roboti v aréně bojují proti sobě.

## 📋 Popis

Robot Arena je webová hra pro 2 hráče, kde každý hráč ovládá robota v aréně. Hráči se pohybují po gridu, útočí na krátkou vzdálenost a musí se vyhýbat pastím, které se aktivují během hry. Hra nevyžaduje registraci - stačí zadat přezdívku a začít hrát.

## ✨ Funkce

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

## 📖 Použití

### Základní workflow

1. **Připojení**: Zadejte svou přezdívku a klikněte na "Připojit se"
2. **Lobby**: Počkejte na druhého hráče
3. **Výběr loadoutu**: Vyberte si robota a zbraň
4. **Připravenost**: Klikněte na "Připraven" když jste připraveni začít
5. **Hraní**:
   - Každý hráč má 3 akce (AP) na tah
   - Pohybujte se pomocí šipek na klávesnici nebo kliknutím na grid
   - Útočte na soupeře (pouze 4 směry: N/E/S/W)
   - Vyhýbejte se pastím, které se aktivují během hry
   - Léčte se na spawn pozici (25% HP regenerace)
   - Cíl: Zničit soupeřova robota (snížit HP na 0)

### Herní mechanika

- **Tahová hra**: Každý hráč má 3 akce (AP) na tah
- **Pohyb**: 8-směr (šipky na klávesnici nebo kliknutí), 1 buňka = 1 akce
- **Útok**: Pouze 4-směr (N/E/S/W), kontrola dosahu zbraně
- **Pasti**: Definované v SVG, 2 fáze (arming → active), damage per tah
- **Léčení**: 25% HP regenerace při pohybu na spawn pozici (pokud není protihráč v dosahu)
- **Konec hry**: Robot s HP 0 prohrává

## 🚀 Deployment

### Předpoklady

- Docker a Docker Compose

### Docker Compose

Aplikace je připravena pro spuštění pomocí Docker Compose. Soubor `docker-compose.yml` obsahuje veškerou potřebnou konfiguraci.

#### Spuštění

```bash
docker compose up -d --build
```

Aplikace bude dostupná na `http://localhost` (port 80 je mapován na port 8000 v kontejneru)

#### Konfigurace

Aplikace je konfigurována pomocí `docker-compose.yml`:

```yaml
services:
  app:
    # Pro vývoj použijte build:
    build:
      context: .
      dockerfile: Dockerfile
    # Pro produkci použijte image z GHCR:
    # image: ghcr.io/elvisek2020/web-robot_battle_arena:latest
    container_name: robot-arena
    hostname: robot-arena
    restart: unless-stopped
    ports:
      - "80:8000"
    environment:
      - PYTHONUNBUFFERED=1
      - LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR, CRITICAL
    # Pro produkci přidejte síťovou konfiguraci:
    # networks:
    #   core:
    #     ipv4_address: 172.20.0.xxx

# Pro produkci odkomentujte:
# networks:
#   core:
#     external: true
```

#### Update aplikace

```bash
docker compose pull
docker compose up -d
```

#### Rollback na konkrétní verzi

V `docker-compose.yml` změňte image tag:

```yaml
services:
  app:
    image: ghcr.io/elvisek2020/web-robot_battle_arena:sha-<commit-sha>
```

### GitHub a CI/CD

#### Inicializace repozitáře

1. **Vytvoření GitHub repozitáře**:

   ```bash
   # Vytvořte nový repozitář na GitHubu
   # Název: web-robot_battle_arena
   ```
2. **Inicializace lokálního repozitáře**:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/elvisek2020/web-robot_battle_arena.git
   git push -u origin main
   ```
3. **Vytvoření GitHub Actions workflow**:

   Vytvořte soubor `.github/workflows/docker.yml` - viz [příklad workflow](.github/workflows/docker.yml) v tomto repozitáři.
4. **Nastavení viditelnosti image**:

   - Po prvním buildu jděte na GitHub → Packages
   - Najděte vytvořený package `web-robot_battle_arena`
   - V Settings → Change visibility nastavte na **Public**

#### Commitování změn a automatické buildy

1. **Proveďte změny v kódu**
2. **Commit a push**:

   ```bash
   git add .
   git commit -m "Popis změn"
   git push origin main
   ```
3. **Automatický build**:

   - Po push do `main` branch se automaticky spustí GitHub Actions workflow
   - Vytvoří se Docker image pro `linux/amd64` a `linux/arm64`
   - Image se nahraje do GHCR
   - Taguje se jako `latest` a `sha-<commit-sha>`
4. **Sledování buildu**:

   - GitHub → Actions → zobrazí se běžící workflow
   - Po dokončení je image dostupná na `ghcr.io/elvisek2020/web-robot_battle_arena:latest`

#### GitHub Container Registry (GHCR)

Aplikace je dostupná jako Docker image z GitHub Container Registry:

- **Latest**: `ghcr.io/elvisek2020/web-robot_battle_arena:latest`
- **Konkrétní commit**: `ghcr.io/elvisek2020/web-robot_battle_arena:sha-<commit-sha>`

Image je **veřejný** (public), takže není potřeba autentizace pro pull.

---

## 🔧 Technická dokumentace

### 🏗️ Architektura

Aplikace je postavena jako **real-time tahová hra** s následujícími charakteristikami:

- **1v1 hra**: Dva hráči hrají proti sobě
- **WebSocket komunikace**: Veškerá real-time komunikace probíhá přes WebSocket
- **SSR (Server-Side Rendering)**: Používá Jinja2 šablony pro renderování
- **State-less frontend**: Frontend pouze zobrazuje stav přijatý ze serveru
- **Server-side validace**: Veškerá herní logika a validace probíhá na serveru
- **In-memory storage**: Všechna data jsou uložena v RAM (žádná databáze)
- **SVG aréna**: Aréna je definována v SVG s pastmi a překážkami

### Technický stack

**Backend:**

- FastAPI (Python 3.11+)
- WebSockets pro real-time komunikaci
- Uvicorn jako ASGI server
- Jinja2 pro server-side rendering
- Python logging s konfigurovatelnou úrovní

**Frontend:**

- Vanilla JavaScript (ES6+)
- HTML5 + CSS3
- WebSocket API
- SVG pro vizualizaci arény

**Deployment:**

- Docker
- Docker Compose
- GitHub Actions CI/CD

### 📁 Struktura projektu

```
web-robot_battle_arena/
├── app/
│   ├── main.py              # FastAPI aplikace + WebSocket + herní logika
│   ├── settings.py          # Nastavení aplikace
│   ├── templates/           # Jinja2 šablony
│   │   ├── base.html        # Základní šablona
│   │   └── index.html       # Hlavní stránka (login, lobby, game)
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css    # Styly aplikace
│   │   ├── js/
│   │   │   ├── app.js        # Hlavní logika (WebSocket, UI)
│   │   │   ├── arena.js      # Renderování arény a gridu
│   │   │   └── audio.js      # Správa zvukových efektů
│   │   ├── arena/
│   │   │   └── arena.svg     # SVG aréna s definicemi pastí a překážek
│   │   ├── images/
│   │   │   ├── robots/       # Ikony robotů (r1.png - r8.png)
│   │   │   └── pozadi.png    # Pozadí aplikace
│   │   ├── sfx/              # Zvukové efekty
│   │   │   ├── weapons/       # Zvuky zbraní
│   │   │   ├── traps/         # Zvuky pastí
│   │   │   └── explosion/     # Zvuky výbuchů
│   │   ├── favicon.ico       # Favicon
│   │   └── version.json       # Informace o verzi
│   └── data/
│       └── seed.json          # Seed data (8 robotů, 12 zbraní)
├── requirements.txt          # Python závislosti
├── Dockerfile                # Docker image definice
├── docker-compose.yml        # Docker Compose konfigurace
└── README.md                 # Tato dokumentace
```

### 🔧 API dokumentace

#### WebSocket endpoint

**URL**: `ws://localhost/ws` (nebo `ws://localhost:8000/ws` při lokálním vývoji)

[Detailní popis API zpráv najdete v dokumentaci - `_docs/` nebo v kódu aplikace]

### 💻 Vývoj

#### Přidání nových funkcí

1. **Backend změny**:

   - Herní logika: `app/main.py`
   - Nastavení: `app/settings.py`
   - Datové modely: v `app/main.py`
2. **Frontend změny**:

   - UI logika: `app/static/js/app.js`
   - Aréna rendering: `app/static/js/arena.js`
   - HTML struktura: `app/templates/index.html`
   - Styly: `app/static/css/style.css` (používejte box-style komponenty)
3. **SVG aréna**:

   - `app/static/arena/arena.svg` - definice pastí a překážek

#### Testování

- **Multiplayer**: Otevřete aplikaci ve dvou prohlížečích nebo záložkách
- **Logy**: Sledujte serverové logy pomocí `docker logs robot-arena -f`

#### Debugging

- Nastavte `LOG_LEVEL=DEBUG` v `docker-compose.yml` pro detailní logy
- Server loguje všechny důležité události s timestampy
- Frontend loguje chyby do konzole prohlížeče

#### Úroveň logování (`LOG_LEVEL`)

- `DEBUG` - zobrazí všechny logy včetně detailních debug informací (vývoj)
- `INFO` - zobrazí informační logy (výchozí, vhodné pro testování)
- `WARNING` - zobrazí pouze varování a chyby (doporučeno pro produkci)
- `ERROR` - zobrazí pouze chyby (minimální logování)
- `CRITICAL` - zobrazí pouze kritické chyby

Pro produkci doporučujeme nastavit `LOG_LEVEL=WARNING` nebo `LOG_LEVEL=ERROR`.

### 🎨 UI/UX

Aplikace používá **box-style komponenty** pro konzistentní vzhled:

- Všechny komponenty mají boxový vzhled s rámečky
- Konzistentní barvy a rozestupy
- Responzivní design
- SVG vizualizace arény s gridem
- Optimistic UI s rollbackem při chybách
- Zvukové efekty (vypnuté ve výchozím nastavení)

### 📝 Historie změn

#### v.20251229.1150

- ✅ Základní implementace tahové hry Robot Arena
- ✅ WebSocket real-time komunikace
- ✅ Lobby systém s ready mechanikou
- ✅ Výběr robota a zbraně
- ✅ Herní logika: pohyb, útok, pasti, léčení
- ✅ SVG aréna s definicemi pastí
- ✅ Reconnect funkcionalita
- ✅ Docker podpora
- ✅ GitHub Actions CI/CD

### 🐛 Známé problémy

- Všechny data jsou uložena pouze v RAM (žádná persistence)
- Zvukové efekty jsou vypnuté ve výchozím nastavení (`audio.js`)
- Healthcheck endpoint: `http://localhost:8000/health`

### 📚 Další zdroje

- [FastAPI dokumentace](https://fastapi.tiangolo.com/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Docker dokumentace](https://docs.docker.com/)
- [SVG dokumentace](https://developer.mozilla.org/en-US/docs/Web/SVG)

## 📄 Licence

Tento projekt je vytvořen pro vzdělávací účely.
