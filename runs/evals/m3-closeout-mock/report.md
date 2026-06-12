# Eval m3-closeout-mock

Status: complete
Provider: mock (director:mock)
Git: a6aabb205c6f16c5708ccfdd517ba8ebfc46314c
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

- Same-persona hit rate: 3.33%
- Cross-persona hit rate: 7.29%
- Detector count: 16

### Detector Proposal

| Persona | Detector | Uncertain | Definition |
|---|---|---|---|
| hoarder | hoarder_item_density | no | Floor offers above-minimum item count or multiple coin pickups. |
| hoarder | hoarder_thief_pressure | no | Roster includes a thief behavior enemy. |
| hoarder | hoarder_inventory_narration | yes | Narration ties hoarded/carrying pressure to a named authored item. |
| pacifist | pacifist_route_options | no | Low enemy density, wide route span, and spread/far placements offer avoidance routes. |
| pacifist | pacifist_soft_threats | no | Few enemies are placed near the entrance; more keep-range/flee behaviors. |
| pacifist | pacifist_caution_narration | no | Narration ties avoided/retreated combat to a named authored threat. |
| speedrunner | speedrunner_compact_floor | no | Compact floor with structured stairs/exit signal for fast routing. |
| speedrunner | speedrunner_near_entrance_loot | no | High-value entities placed near entrance for grab-and-go. |
| speedrunner | speedrunner_pace_narration | yes | Narration ties low-exploration play to structured stairs/exit routing. |
| completionist | completionist_dialogue_depth | no | At least one NPC has multi-node, multi-choice dialogue depth. |
| completionist | completionist_quest_richness | no | Quest has multiple richness signals: title, reward, entity reference, and NPC linkage. |
| completionist | completionist_rich_callbacks | no | Multiple callback observations are anchored to NPC or quest content. |
| chaos | chaos_behavior_diversity | yes | Three or more distinct enemy behavior kinds. |
| chaos | chaos_trap_variety | yes | Multiple traps or mixed trap/item effect verbs. |
| chaos | chaos_content_variance | yes | Within-seed content varies across behavior, item, trap, placement, and callback axes. |
| chaos | chaos_varied_engagement | yes | Trace shows mixed fight/avoid patterns and manifest offers diverse threats. |

## Cells

| Cell | Records | Valid | Solvable | Served | Fallback | Band Accurate | Avg Latency | Novelty | Same-Persona | Cross-Persona |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| shallows:hoarder | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.39 | 0% | 6.25% |
| middle:hoarder | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | — (fallback) | — (fallback) | — (fallback) |
| lowest:hoarder | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.45 | 0% | 12.50% |
| shallows:pacifist | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.39 | 0% | 8.33% |
| middle:pacifist | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | — (fallback) | — (fallback) | — (fallback) |
| lowest:pacifist | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.45 | 0% | 0% |
| shallows:speedrunner | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.39 | 33.33% | 6.25% |
| middle:speedrunner | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | — (fallback) | — (fallback) | — (fallback) |
| lowest:speedrunner | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.45 | 0% | 12.50% |
| shallows:completionist | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.39 | 0% | 6.25% |
| middle:completionist | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | — (fallback) | — (fallback) | — (fallback) |
| lowest:completionist | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.45 | 0% | 12.50% |
| shallows:chaos | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.39 | 0% | 8.33% |
| middle:chaos | 1 | 0% | 0% | 0% | 100% | 0% | 10ms | — (fallback) | — (fallback) | — (fallback) |
| lowest:chaos | 1 | 100% | 100% | 100% | 0% | 0% | 10ms | 0.45 | 0% | 0% |
