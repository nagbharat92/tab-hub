# Independent design evaluation

The reviewer received only the seven brief criteria and the synthetic screenshot matrix/MOV clips in this folder, not source files, test logs or implementation decisions. Scores below 4 fail the round; no score has been promoted merely because a test passed.

## Round 1 — fails

| Criterion | Score |
| --- | ---: |
| Every pixel earns its place | 2 |
| The saves are the interface | 4 |
| Shape tells the type | 2 |
| Not assembled by a model | 3 |
| Craft | 3 |
| Motion | 3 |
| Faithful to the brief | 2 |

The reviewer found a half-empty, weakly scrimmed region face (`region-card-light-desktop.png`); temporarily blank images after filtering and a staged mixed panel (`active-filter-light-narrow.png`, `panel-mixed-thread-light-desktop.png`, `r2-07-panel-mixed.mov`); an overlapping panel under reduced motion (`reduced-motion-panel-light-desktop.png`); undo toasts covering the narrow panel (`toast-fan-hover-light-narrow.png`, `r2-08-delete-undo.mov`); a truncated narrow filter label (`active-filter-light-narrow.png`); repeated synthetic thumbnails (`arrival-grid-light-desktop.png`); and a narrow bottom overlay (`grid-with-panel-light-narrow.png`).

In response, region fixture images now have full-bleed content, varied page-preview compositions and varied passages; screenshots wait for all relevant local images. Page-image slots reserve their final geometry while known images load, rather than shifting the masonry column. Reduced motion still positions the grid to the left, but without the slide animation. At narrow widths, the panel follows the unchanged grid in normal flow and scrolls into view instead of covering it; undo toasts move to the top. The narrow header frees search width when a filter is active and removes the extra visible clear icon. The updated matrix and clips replace the earlier captures; the original score is retained here.

Two other reviewer objections were contradictions with the brief, not defects: the empty header **must** hide search/filter (section 9), and both the popup separators and the filter group/type separator are explicitly specified (sections 8 and 4). Neither was removed to improve a score artificially.

## Round 2 — fails

| Criterion | Score |
| --- | ---: |
| Every pixel earns its place | 4 |
| The saves are the interface | 5 |
| Shape tells the type | 5 |
| Not assembled by a model | 4 |
| Craft | 3 |
| Motion | 3 |
| Faithful to the brief | 3 |

The fresh-context reviewer saw the narrow top-positioned three-toast stack covering the wordmark and, when fanned, card content (`three-stacked-toasts-light-narrow.png`, `toast-fan-hover-light-narrow.png`, `r2-08-delete-undo.mov`); dark metadata being harder to read than light metadata (`arrival-grid-dark-narrow.png` versus `arrival-grid-light-narrow.png`); and an instructional chip during region selection (`r2-04-save-region.mov`, with resulting card in `region-card-light-desktop.png`). The reviewer also noted still frames could not establish reduced-motion timing.

In response, move undo toasts back to the bottom now that the narrow panel is inline rather than a bottom overlay; add scroll room below that panel so it can be brought above the toast area. Use the existing primary-ink token for small dark metadata, preserving the brief's colour values. Hide the region selector's initial instruction chip while preserving error/too-small-drag feedback and an accessible Cancel action. Wait for Sonner's actual collapsed/fanned states when capturing the toast matrix instead of recording an in-between state. The second-round scores are not retrospectively changed.

## Round 3 — passes

| Criterion | Score |
| --- | ---: |
| Every pixel earns its place | 4.3 |
| The saves are the interface | 4.6 |
| Shape tells the type | 4.7 |
| Not assembled by a model | 4.2 |
| Craft | 4.4 |
| Motion | 4.0 |
| Faithful to the brief | 4.5 |

All seven criteria scored at least 4. Caveats: `r2-07-panel-mixed.mov` opens on blank frames and shows a grey band at the bottom, and `r2-05-hub-tour.mov` scrolls into a single uneven column at the end of the list, so motion evidence was "not fully clean"; the filter dropdown and popup (`filter-menu-light-desktop.png`, `popup-inside-group-light.png`) were flagged as a minor library-default risk. The round-3 matrix and clips are kept in `evaluator-rounds/round-3/`.

After round 3, a code-and-brief audit (not the evaluator) found letter-of-brief gaps the screenshots could not show: region faces used a fixed aspect ratio, page insets a fixed 8:5 crop, hover did not deepen the shadow, a deleted save vanished instead of fading, narrow cards used a 12px gutter against 14px padding, and the in-page region selector carried raw colour values. All were fixed (DECISIONS.md 24–26) and the matrix and clips were regenerated, so a fourth round was run on the actual final build.

## Round 4 — passes (final build)

| Criterion | Score |
| --- | ---: |
| Every pixel earns its place | 4 |
| The saves are the interface | 5 |
| Shape tells the type | 5 |
| Not assembled by a model | 4 |
| Craft | 4 |
| Motion | 4 |
| Faithful to the brief | 5 |

No high-confidence failures. The reviewer cited the save-first grid and receded chrome (`arrival-grid-light-desktop.png`); distinct faces (`page-card-light-desktop.png`, `passage-card-light-desktop.png`, `region-card-light-desktop.png`); an imageless page that stays a sans title card (`imageless-page-light-desktop.png`); a non-dialog panel, right-hand on desktop and inline on narrow (`grid-with-panel-light-*.png`); correct toast stacking (`three-stacked-toasts-light-desktop.png`); and calm motion in `r2-06-card-hover.mov`, `r2-07-panel-mixed.mov`, `r2-08-delete-undo.mov` and `r2-09-search-filter.mov`. Synthetic fixture artwork and first-load blank frames were noted as harness artefacts. The final matrix is `screenshots/` and `recordings/`; round 3 is kept in `evaluator-rounds/round-3/` for comparison.
