---
name: local-weather
description: "Trigger: clima, tiempo, pronóstico, temperatura, lluvia, weather, forecast. Get current weather and today's forecast by running a local script."
license: Apache-2.0
metadata:
  author: "rosendoalves"
  version: "1.0"
---

## Activation Contract

Load when the user asks for the current weather or today's forecast for any place.

## Hard Rules

- MUST get data by running `assets/weather.mjs`; MUST NOT use WebSearch or scrape weather sites.
- MUST compare `location` in the output with the requested place before reporting. If it does not match, do not report the data: retry with `--lat=`/`--lon=`.
- MUST report only values present in the output.
- On a non-zero exit, report the error from stderr. MUST NOT estimate the weather.

## Decision Gates

| Request | Arguments |
|---------|-----------|
| No place named | none (defaults to San Miguel de Tucumán) |
| City named | `--city "<name>"` |
| Ambiguous city, or `--city` resolved to the wrong place | `--lat=<lat> --lon=<lon> --name "<label>"` (the `=` is required for negative values) |

## Execution Steps

1. Pick the arguments from Decision Gates.
2. Run `node .claude/skills/local-weather/assets/weather.mjs <arguments>` from the project root.
3. Parse the JSON on stdout and verify `location`.
4. Reply in the user's language.

## Output Contract

Return a short summary containing:

- Location and `observedAt`.
- Current temperature, feels-like temperature, and `current.condition`.
- Today's min and max, `today.condition`, and `today.rainChancePct`.
- Humidity and wind.
- `source`, named as the data source.

## References

- `assets/weather.mjs` — dependency-free Node script that prints the weather as JSON.
