---
name: clima
description: Consulta el clima actual y el pronóstico de Sincelejo, Colombia (por defecto) o de una ciudad indicada. Úsala cuando el usuario pregunte por el clima, el tiempo, la temperatura, si va a llover, o invoque /clima. Acepta opcionalmente una ciudad como argumento (ej. "/clima Bogotá").
---

# Clima

Obtén el clima sin API key usando servicios públicos. Responde siempre en español.

## Argumentos

- Sin argumentos → **Sincelejo, Colombia** (siempre; no uses la ubicación por IP). Usa `Sincelejo,Colombia` como `<CIUDAD>`.
- Con argumentos (`$ARGUMENTS`) → úsalos como ciudad. Reemplaza espacios por `+` en la URL (ej. `San+Gil`).

## Paso 1: Consultar wttr.in (fuente principal)

Ejecuta con la herramienta Bash (en Windows, `curl` de Git Bash; no uses el alias `curl` de PowerShell):

```bash
curl -s -m 15 "https://wttr.in/<CIUDAD>?format=j1&lang=es"
```

Por defecto: `https://wttr.in/Sincelejo,Colombia?format=j1&lang=es`.

Del JSON extrae:

- `nearest_area[0]`: `areaName`, `region`, `country` → ubicación.
- `current_condition[0]`: `temp_C`, `FeelsLikeC`, `humidity`, `windspeedKmph`, `winddir16Point`, `precipMM`, `uvIndex`, `lang_es[0].value` (o `weatherDesc[0].value` si falta) → condición actual.
- `weather[0..2]`: `date`, `mintempC`, `maxtempC`, y en `hourly[]` el máximo de `chanceofrain` → pronóstico de 3 días.

No muestres el JSON crudo al usuario.

## Paso 2: Respaldo con Open-Meteo (si wttr.in falla o responde vacío/no-JSON)

1. Coordenadas:
   - Sincelejo (por defecto): `LAT=9.3047`, `LON=-75.3978` (no hace falta geocodificar).
   - Otra ciudad: `curl -s -m 10 "https://geocoding-api.open-meteo.com/v1/search?name=<CIUDAD>&count=1&language=es"` → `results[0].latitude/longitude/name`.
2. Clima:

```bash
curl -s -m 15 "https://api.open-meteo.com/v1/forecast?latitude=<LAT>&longitude=<LON>&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max&timezone=auto&forecast_days=3"
```

Traduce `weather_code` (WMO): 0 despejado · 1–3 parcialmente nublado/nublado · 45–48 niebla · 51–57 llovizna · 61–67 lluvia · 71–77 nieve · 80–82 chubascos · 95–99 tormenta.

Si ambas fuentes fallan, dilo claramente (probablemente no hay conexión) y no inventes datos.

## Formato de respuesta

```
🌍 <Ciudad>, <Región>, <País>

Ahora: <emoji> <condición>, <temp>°C (sensación <sensación>°C)
💧 Humedad <h>% · 💨 Viento <v> km/h <dir> · ☔ Precipitación <p> mm · ☀️ UV <uv>

Próximos días:
- <día>: <min>°–<max>°C, lluvia <prob>%
- ...
```

Usa nombres de día en español (Hoy, Mañana, luego el día de la semana). Añade una recomendación breve si es útil (ej. "lleva paraguas" si la probabilidad de lluvia supera 50%, protector solar si UV ≥ 6).
