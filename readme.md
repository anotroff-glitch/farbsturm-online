[README.md](https://github.com/user-attachments/files/26273884/README.md)
# 🎴 Farbsturm – Online-Kartenspiel

Ein UNO-ähnliches Kartenspiel für 2–4 Spieler, spielbar im Browser!

## Spielregeln

- Lege Karten ab, die zur **Farbe** oder **Zahl** der obersten Karte passen
- **Aktionskarten:** Aussetzen (⊘), Richtungswechsel (⇄), +2 Ziehen
- **Jokerkarten:** Farbwahl (★) und +4 Farbwahl
- +2 und +4 können gestapelt werden!
- Bei **einer verbleibenden Karte**: drücke den FARBSTURM-Button!
- Vergisst du es, können Mitspieler dich erwischen → 2 Strafkarten
- Wer zuerst keine Karten mehr hat, gewinnt!

---

## 🚀 Lokal starten (zum Testen)

### Voraussetzungen
- [Node.js](https://nodejs.org/) installieren (Version 16 oder höher)

### Schritte

```bash
# 1. In den Projektordner wechseln
cd farbsturm

# 2. Abhängigkeiten installieren
npm install

# 3. Server starten
npm start
```

Dann im Browser öffnen: **http://localhost:3000**

Andere Geräte im selben WLAN können über deine lokale IP mitspielen
(z.B. `http://192.168.1.100:3000`). Deine IP findest du mit:
- Windows: `ipconfig`
- Mac/Linux: `ifconfig` oder `ip addr`

---

## 🌐 Online stellen (kostenlos mit Render)

Damit Freunde über das Internet mitspielen können:

### Option 1: Render (empfohlen, kostenlos)

1. Erstelle einen Account auf [render.com](https://render.com)
2. Lade den Farbsturm-Ordner auf GitHub hoch:
   - Erstelle ein Repository auf [github.com](https://github.com)
   - Lade alle Dateien hoch (package.json, server.js, public/)
3. Auf Render:
   - Klicke **"New" → "Web Service"**
   - Verbinde dein GitHub-Repository
   - Einstellungen:
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
   - Klicke **"Create Web Service"**
4. Nach 1-2 Minuten bekommst du eine URL wie `https://farbsturm-xxxx.onrender.com`
5. Diese URL mit Freunden teilen – fertig!

> ⚠️ Der kostenlose Plan schaltet den Server nach 15 Min. Inaktivität ab.
> Der erste Aufruf dauert dann ~30 Sekunden. Für dauerhaftes Hosting:
> Render Starter Plan (~7$/Monat) oder einen VPS nutzen.

### Option 2: Railway (Alternative)

1. Account auf [railway.app](https://railway.app)
2. **"New Project" → "Deploy from GitHub"**
3. Repository auswählen
4. Railway erkennt Node.js automatisch
5. URL wird automatisch erstellt

### Option 3: Eigener Server (VPS)

```bash
# Auf dem Server (z.B. Hetzner, DigitalOcean):
git clone <dein-repo>
cd farbsturm
npm install

# Mit PM2 dauerhaft laufen lassen:
npm install -g pm2
pm2 start server.js --name farbsturm
pm2 save
pm2 startup
```

---

## 📁 Projektstruktur

```
farbsturm/
├── package.json      # Abhängigkeiten (Express, Socket.io)
├── server.js         # Spielserver (Räume, Spiellogik, WebSockets)
├── public/
│   └── index.html    # Komplettes Frontend (HTML + CSS + JS)
└── README.md         # Diese Datei
```

---

## 🎮 So wird gespielt

1. **Raum erstellen:** Spieler 1 gibt seinen Namen ein und klickt "Neuen Raum erstellen"
2. **Code teilen:** Den 5-stelligen Code an Freunde senden
3. **Beitreten:** Freunde geben Name + Code ein und klicken "Raum beitreten"
4. **Starten:** Der Host klickt "Spiel starten" (mindestens 2 Spieler)
5. **Spielen:** Karten anklicken zum Spielen, auf den Stapel klicken zum Ziehen
6. **FARBSTURM:** Bei 1-2 Karten den Button drücken, sonst Strafkarten!

Viel Spaß! 🎉
