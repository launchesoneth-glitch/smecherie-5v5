# 5v5 pe Smecherie

Campionat LoL pe smecherie. Web app simpla pentru organizat meciuri 5v5 cu prietenii: login cu username + link op.gg, lobby cu chat live, admin alege capitanii, snake draft 1-2-2-2-2-1, echipe revealed.

## Stack
- Node.js + Express + Socket.io
- SQLite (better-sqlite3)
- Frontend vanilla (HTML/CSS/JS)

## Setup local

```bash
cd projects/smecherie-5v5
cp .env.example .env
# editeaza .env si pune ADMIN_USERNAMES=numele_tau
npm install
npm run dev
```

Apoi deschide `http://localhost:3000`.

### Variabile de mediu (.env)
- `PORT` - portul serverului (default 3000)
- `SESSION_SECRET` - secret pt cookie-uri (schimba in productie!)
- `ADMIN_USERNAMES` - lista comma-separated cu username-uri admin (ex: `cazix,gigi`)
- `DB_PATH` - path catre fisierul SQLite (default `./data/app.db`)
- `NODE_ENV` - `development` sau `production`

Daca nu setezi `ADMIN_USERNAMES`, primul user inregistrat devine automat admin.

## Flow

1. Userul intra pe `/` -> introduce username + link op.gg
2. Linkul de op.gg trebuie sa fie format: `https://op.gg/lol/summoners/{regiune}/{Nume-Tag}`
3. Toti userii intra in lobby cu chat live
4. Adminul vede `Admin Panel`, da click pe 2 useri din lista ca sa-i seteze capitani
5. Click pe `Porneste draftul` -> incepe snake draft 1-2-2-2-2-1
   - Pick #1 -> Capitan 1
   - Pick #2, #3 -> Capitan 2
   - Pick #4, #5 -> Capitan 1
   - Pick #6, #7 -> Capitan 2
   - Pick #8 -> Capitan 1
6. Cand toate pick-urile sunt facute, echipele finale sunt afisate
7. Admin poate face Reset pt urmatorul meci

## Deploy pe Railway

1. Conecteaza repo-ul la Railway
2. La `Variables` adauga:
   - `SESSION_SECRET` (genereaza unul lung: `openssl rand -hex 32`)
   - `ADMIN_USERNAMES` (numele tau)
   - `NODE_ENV=production`
   - `DB_PATH=/data/app.db`
3. La `Settings -> Volumes` adauga un volum montat la `/data` (asa SQLite persista)
4. Deploy. Railway iti da un URL public.

## Comenzi
- `npm run dev` - porneste local
- `npm start` - acelasi (pt productie)

## Structura
```
server/         # backend Node + Socket.io
  routes/       # /api/login, /api/lobby, /api/admin
  sockets/      # chat + draft realtime
  lib/          # validare op.gg, snake draft engine
public/         # frontend static
  js/login.js   # login page logic
  js/lobby.js   # lobby + chat + draft UI
data/           # SQLite db (gitignored)
```
