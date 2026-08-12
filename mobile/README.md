# Follow Through — mobile client

Expo / React Native (TypeScript, Expo Router) client for the Follow Through API. Thin
vertical slice: auth + plans/workouts CRUD against the local dev backend.

## Setup

```bash
cd mobile
npm install
cp .env.example .env   # fill in EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start
```

## `EXPO_PUBLIC_API_URL` — set this per run target

`EXPO_PUBLIC_*` env vars are inlined into the JS bundle at build time. The single most common
"the app can't reach the backend" bug is leaving `EXPO_PUBLIC_API_URL` set to the wrong host
for whatever you're running on. The backend (`uv run uvicorn app.main:app --reload`) binds to
one address; each run target reaches your Mac differently:

| Target                        | `EXPO_PUBLIC_API_URL`         | Notes                                                        |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------ |
| iOS Simulator                  | `http://127.0.0.1:8000`        | Simulator shares the Mac's network namespace.                |
| Physical device (Expo Go)      | `http://<your-mac-LAN-IP>:8000`| Start uvicorn with `--host 0.0.0.0`; find your IP via `ipconfig getifaddr en0`. |
| Android emulator                | `http://10.0.2.2:8000`         | Emulator's alias for the host machine's loopback.            |

After changing `.env`, restart `expo start` — env vars are only read at bundler startup.

## Supabase keys

`EXPO_PUBLIC_SUPABASE_ANON_KEY` is a publishable key, designed to be shipped in client code.
Never put a service-role key or any other secret behind an `EXPO_PUBLIC_*` variable — those
values ship in the bundle.
