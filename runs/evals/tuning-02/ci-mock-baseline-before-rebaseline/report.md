# Eval ci-mock-baseline

Status: complete
Provider: mock (director:mock)
Git: 81f1b9fa8b2ec3c9184d3eb60a71658d6f578ccc
Bank: persona-bank:bc7a48f5ab54
Config: n=1, maxCalls=15, cells=15
Calls: 15/15 completed (cap 15)

## Overall

| Metric | Passed | Count | Percent |
|---|---:|---:|---:|
| validity | 10 | 15 | 66.67% |
| solvability | 10 | 15 | 66.67% |
| servedWithoutFallback | 10 | 15 | 66.67% |
| fallback | 5 | 15 | 33.33% |
| bandAccuracy | 0 | 10 | 0% |

Latency: min 10ms, p50 10ms, avg 10ms, max 10ms

## Thesis Metrics

### Novelty

Distance blends name similarity, enemy stat-vector distance, and behavior/effect composition overlap against the fallback pack plus prior manifests in the run. Score equals distance (higher is fresher); near-duplicate when distance ≤ threshold.

- Average novelty score: 0.49
- Near-duplicate count: 0 / 10

### Responsiveness

Named detectors per persona signature; hit-rate is the fraction of that persona's detectors satisfied by the manifest given trace facts. Cross-persona control expects lower hit-rates off-diagonal.

- Same-persona hit rate: 23.33%
- Cross-persona hit rate: 13.13%
- Detector count: 16 (see report JSON for proposal list)

## Cells

| Cell | Records | Valid | Solvable | Served | Fallback | Band Accurate | Avg Latency | Novelty | Same-Persona | Cross-Persona |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| shallows:hoarder | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.48 | 0% | 6.25% |
| middle:hoarder | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | 0 | 0% | 0% |
| lowest:hoarder | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.50 | 0% | 12.50% |
| shallows:pacifist | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.48 | 100% | 8.33% |
| middle:pacifist | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | 0 | 0% | 0% |
| lowest:pacifist | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.50 | 66.67% | 8.33% |
| shallows:speedrunner | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.48 | 33.33% | 6.25% |
| middle:speedrunner | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | 0 | 0% | 0% |
| lowest:speedrunner | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.50 | 33.33% | 12.50% |
| shallows:completionist | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.48 | 0% | 6.25% |
| middle:completionist | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | 0 | 0% | 0% |
| lowest:completionist | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.50 | 0% | 12.50% |
| shallows:chaos | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.48 | 0% | 33.33% |
| middle:chaos | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | 0 | 0% | 0% |
| lowest:chaos | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.50 | 0% | 25% |
