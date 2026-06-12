# Eval tuning-02-baseline

Status: complete
Provider: ambient (ambient:codex)
Git: ec2f83721c88474494dc5800a9f798fb351c7464
Bank: persona-bank:bc7a48f5ab54
Config: n=1, maxCalls=15, cells=15
Calls: 15/15 completed (cap 15)

## Overall

| Metric | Passed | Count | Percent |
|---|---:|---:|---:|
| validity | 0 | 15 | 0% |
| solvability | 0 | 15 | 0% |
| servedWithoutFallback | 0 | 15 | 0% |
| fallback | 15 | 15 | 100% |
| bandAccuracy | 0 | 0 | 0% |

Latency: min 215ms, p50 222ms, avg 223.53ms, max 241ms

## Thesis Metrics

### Novelty

Distance blends name similarity, enemy stat-vector distance, and behavior/effect composition overlap against the fallback pack plus prior manifests in the run. Score equals distance (higher is fresher); near-duplicate when distance ≤ threshold.

- Average novelty score: 0
- Near-duplicate count: 0 / 0

### Responsiveness

Named detectors per persona signature; hit-rate is the fraction of that persona's detectors satisfied by the manifest given trace facts. Cross-persona control expects lower hit-rates off-diagonal.

- Same-persona hit rate: 0%
- Cross-persona hit rate: 0%
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
| shallows:hoarder | 1 | 0% | 0% | 0% | 100% | 0% | 217ms | — (fallback) | — (fallback) | — (fallback) |
| middle:hoarder | 1 | 0% | 0% | 0% | 100% | 0% | 217ms | — (fallback) | — (fallback) | — (fallback) |
| lowest:hoarder | 1 | 0% | 0% | 0% | 100% | 0% | 225ms | — (fallback) | — (fallback) | — (fallback) |
| shallows:pacifist | 1 | 0% | 0% | 0% | 100% | 0% | 217ms | — (fallback) | — (fallback) | — (fallback) |
| middle:pacifist | 1 | 0% | 0% | 0% | 100% | 0% | 215ms | — (fallback) | — (fallback) | — (fallback) |
| lowest:pacifist | 1 | 0% | 0% | 0% | 100% | 0% | 221ms | — (fallback) | — (fallback) | — (fallback) |
| shallows:speedrunner | 1 | 0% | 0% | 0% | 100% | 0% | 224ms | — (fallback) | — (fallback) | — (fallback) |
| middle:speedrunner | 1 | 0% | 0% | 0% | 100% | 0% | 230ms | — (fallback) | — (fallback) | — (fallback) |
| lowest:speedrunner | 1 | 0% | 0% | 0% | 100% | 0% | 232ms | — (fallback) | — (fallback) | — (fallback) |
| shallows:completionist | 1 | 0% | 0% | 0% | 100% | 0% | 231ms | — (fallback) | — (fallback) | — (fallback) |
| middle:completionist | 1 | 0% | 0% | 0% | 100% | 0% | 220ms | — (fallback) | — (fallback) | — (fallback) |
| lowest:completionist | 1 | 0% | 0% | 0% | 100% | 0% | 218ms | — (fallback) | — (fallback) | — (fallback) |
| shallows:chaos | 1 | 0% | 0% | 0% | 100% | 0% | 241ms | — (fallback) | — (fallback) | — (fallback) |
| middle:chaos | 1 | 0% | 0% | 0% | 100% | 0% | 223ms | — (fallback) | — (fallback) | — (fallback) |
| lowest:chaos | 1 | 0% | 0% | 0% | 100% | 0% | 222ms | — (fallback) | — (fallback) | — (fallback) |
