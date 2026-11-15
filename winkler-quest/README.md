# Winkler Quest

Family quest-and-rewards app: chores, school, reading, lifting and more earn coins;
coins buy TV, gaming, car time and real-world prizes. Parent app for approvals,
penalties and oversight. Digital rewards switch devices on and off through UniFi.

> Temporarily living in this folder; it will move to its own repo.

- Plan and rules: [`docs/SPEC.md`](docs/SPEC.md)
- Rules engine: [`core/`](core/) — pure TypeScript, no dependencies
- Home bridge for UniFi: [`bridge/`](bridge/)

## Run the engine tests

Requires Node 22.18+ (runs TypeScript directly).

```sh
cd core && npm test
cd ../bridge && npm test
```
