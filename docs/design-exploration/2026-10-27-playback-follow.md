# Camera follow during satellite playback

Play follows the latest acquisition revealed by each interval, within the selected geography, time window, confidence and sensor filters. Camera bounds use nearby acquisitions rather than an entire distant municipality; a focus ring and place label identify the target. Empty intervals are skipped without inventing observations. The visual histogram retains its existing contract; a closed-right playback schedule handles exact boundary acquisitions.

Manual map movement releases auto follow, with an explicit resume control. Pausing retains the current view; completed playback can be replayed. Reduced motion uses immediate camera positioning. Reports and sharing retain their original clock, scope and UAV privacy rules. Atlas and Vector use the same playback schedule; their UAV markers remain simulations.

Verified with full regression suites, exact-edge stepping tests for 24/48/168-hour windows, actual desktop and 390px phone interaction, synchronized comparison maps, manual release/resume, and the zero-observation next-window hint.
