# Eval tuning-02-ambient-smoke

Status: complete
Provider: ambient (ambient:codex)
Git: ec2f83721c88474494dc5800a9f798fb351c7464
Bank: persona-bank:d2132458d87a
Config: n=1, maxCalls=1, cells=1
Calls: 1/1 completed (cap 1)

## Overall

| Metric | Passed | Count | Percent |
|---|---:|---:|---:|
| validity | 1 | 1 | 100% |
| solvability | 1 | 1 | 100% |
| servedWithoutFallback | 1 | 1 | 100% |
| fallback | 0 | 1 | 0% |
| bandAccuracy | 0 | 1 | 0% |

Latency: min 35779ms, p50 35779ms, avg 35779ms, max 35779ms

## Thesis Metrics

### Novelty

Distance blends name similarity, enemy stat-vector distance, and behavior/effect composition overlap against the fallback pack plus prior manifests in the run. Score equals distance (higher is fresher); near-duplicate when distance ≤ threshold.

- Average novelty score: 0.43
- Near-duplicate count: 0 / 1

### Responsiveness

Named detectors per persona signature; hit-rate is the fraction of that persona's detectors satisfied by the manifest given trace facts. Cross-persona control expects lower hit-rates off-diagonal.

- Same-persona hit rate: 0%
- Cross-persona hit rate: 6.25%
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
| shallows:hoarder | 1 | 100% | 100% | 100% | 0% | 0% | 35779ms | 0.43 | 0% | 6.25% |
