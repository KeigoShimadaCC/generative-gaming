# Eval tuning-02-baseline-envfix

Status: complete
Provider: ambient (ambient:codex)
Git: ec2f83721c88474494dc5800a9f798fb351c7464
Bank: persona-bank:bc7a48f5ab54
Config: n=1, maxCalls=15, cells=15
Calls: 15/15 completed (cap 15)

## Overall

| Metric | Passed | Count | Percent |
|---|---:|---:|---:|
| validity | 15 | 15 | 100% |
| solvability | 13 | 15 | 86.67% |
| servedWithoutFallback | 13 | 15 | 86.67% |
| fallback | 2 | 15 | 13.33% |
| bandAccuracy | 0 | 15 | 0% |

Latency: min 33459ms, p50 37555ms, avg 39795.07ms, max 64179ms

## Thesis Metrics

### Novelty

Distance blends name similarity, enemy stat-vector distance, and behavior/effect composition overlap against the fallback pack plus prior manifests in the run. Score equals distance (higher is fresher); near-duplicate when distance ≤ threshold.

- Average novelty score: 0.44
- Near-duplicate count: 0 / 13

### Responsiveness

Named detectors per persona signature; hit-rate is the fraction of that persona's detectors satisfied by the manifest given trace facts. Cross-persona control expects lower hit-rates off-diagonal.

- Same-persona hit rate: 5.13%
- Cross-persona hit rate: 7.05%
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
| shallows:hoarder | 1 | 100% | 100% | 100% | 0% | 0% | 33509ms | 0.44 | 0% | 6.25% |
| middle:hoarder | 1 | 100% | 100% | 100% | 0% | 0% | 42151ms | 0.46 | 0% | 6.25% |
| lowest:hoarder | 1 | 100% | 100% | 100% | 0% | 0% | 64179ms | 0.45 | 0% | 6.25% |
| shallows:pacifist | 1 | 100% | 100% | 100% | 0% | 0% | 35211ms | 0.41 | 0% | 8.33% |
| middle:pacifist | 1 | 100% | 100% | 100% | 0% | 0% | 42441ms | 0.45 | 0% | 8.33% |
| lowest:pacifist | 1 | 100% | 100% | 100% | 0% | 0% | 37555ms | 0.45 | 0% | 8.33% |
| shallows:speedrunner | 1 | 100% | 100% | 100% | 0% | 0% | 38816ms | 0.44 | 33.33% | 6.25% |
| middle:speedrunner | 1 | 100% | 100% | 100% | 0% | 0% | 37490ms | 0.45 | 33.33% | 6.25% |
| lowest:speedrunner | 1 | 100% | 0% | 0% | 100% | 0% | 35332ms | — (fallback) | — (fallback) | — (fallback) |
| shallows:completionist | 1 | 100% | 100% | 100% | 0% | 0% | 37021ms | 0.40 | 0% | 6.25% |
| middle:completionist | 1 | 100% | 100% | 100% | 0% | 0% | 40994ms | 0.46 | 0% | 6.25% |
| lowest:completionist | 1 | 100% | 100% | 100% | 0% | 0% | 36136ms | 0.47 | 0% | 6.25% |
| shallows:chaos | 1 | 100% | 100% | 100% | 0% | 0% | 38897ms | 0.41 | 0% | 8.33% |
| middle:chaos | 1 | 100% | 0% | 0% | 100% | 0% | 33459ms | — (fallback) | — (fallback) | — (fallback) |
| lowest:chaos | 1 | 100% | 100% | 100% | 0% | 0% | 43735ms | 0.45 | 0% | 8.33% |
