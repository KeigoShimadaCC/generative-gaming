# Eval eval-2026-06-12T08-23-03-680Z

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

- Average novelty score: 0.42
- Near-duplicate count: 0 / 10

### Responsiveness

Named detectors per persona signature; hit-rate is the fraction of that persona's detectors satisfied by the manifest given trace facts. Cross-persona control expects lower hit-rates off-diagonal.

- Same-persona hit rate: 23.33%
- Cross-persona hit rate: 13.13%
- Detector count: 16

### Detector Proposal

| Persona | Detector | Uncertain | Definition |
|---|---|---|---|
| hoarder | hoarder_item_density | no | Floor offers above-minimum item count or multiple coin pickups. |
| hoarder | hoarder_thief_pressure | no | Roster includes a thief behavior enemy. |
| hoarder | hoarder_inventory_narration | yes | Narration references hoarding or carrying burden. |
| pacifist | pacifist_open_routes | no | Layout flavor or room span suggests alternate routes (open/halls or wide room span). |
| pacifist | pacifist_soft_threats | no | Few enemies are placed near the entrance; more keep-range/flee behaviors. |
| pacifist | pacifist_caution_narration | no | Narration acknowledges caution or non-violence. |
| speedrunner | speedrunner_compact_floor | no | Compact room span or open/halls flavor for fast routing. |
| speedrunner | speedrunner_near_entrance_loot | no | High-value entities placed near entrance for grab-and-go. |
| speedrunner | speedrunner_pace_narration | yes | Narration references stairs, exits, or urgency. |
| completionist | completionist_npc_present | no | At least one NPC is authored on the floor. |
| completionist | completionist_quest_present | no | A quest hook is present. |
| completionist | completionist_rich_callbacks | no | Multiple narration observations or callback tags. |
| chaos | chaos_behavior_diversity | yes | Three or more distinct enemy behavior kinds. |
| chaos | chaos_trap_variety | yes | Multiple traps or mixed trap/item effect verbs. |
| chaos | chaos_mixed_origins | yes | Origin tag summary shows mixed made/old_stock/kept content. |
| chaos | chaos_varied_engagement | yes | Trace shows mixed fight/avoid patterns and manifest offers diverse threats. |

## Cells

| Cell | Records | Valid | Solvable | Served | Fallback | Band Accurate | Avg Latency | Novelty | Same-Persona | Cross-Persona |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| shallows:hoarder | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.39 | 0% | 6.25% |
| middle:hoarder | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | 0 | 0% | 0% |
| lowest:hoarder | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.45 | 0% | 12.50% |
| shallows:pacifist | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.39 | 100% | 8.33% |
| middle:pacifist | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | 0 | 0% | 0% |
| lowest:pacifist | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.45 | 66.67% | 8.33% |
| shallows:speedrunner | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.39 | 33.33% | 6.25% |
| middle:speedrunner | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | 0 | 0% | 0% |
| lowest:speedrunner | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.45 | 33.33% | 12.50% |
| shallows:completionist | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.39 | 0% | 6.25% |
| middle:completionist | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | 0 | 0% | 0% |
| lowest:completionist | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.45 | 0% | 12.50% |
| shallows:chaos | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.39 | 0% | 33.33% |
| middle:chaos | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | 0 | 0% | 0% |
| lowest:chaos | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.45 | 0% | 25% |
