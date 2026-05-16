# Dispatch audio

Drop SFPD scanner audio files here. Anything `.m4a`, `.mp3`, `.wav`, `.ogg`,
or `.aac` will be picked up by the simulation engine and rotated onto the
map at randomized intervals.

## Source

Captured from <https://openmhz.com/system/sfp25> (group filter
`61ccbc5045c0df14b86674e1`). OpenMHz blocks programmatic access; download
manually from their site (right-click any call → "Save audio as…") or
batch-export via DevTools.

## Optional metadata

Add a `manifest.json` next to the audio files to give the simulator real
per-call metadata (instead of plausible generated values):

```json
[
  {
    "file": "2026-05-16-tenderloin-001.m4a",
    "callType": "Suspicious person",
    "callTypeCode": "917",
    "priority": "C",
    "talkgroup": "SFPD Dispatch A1",
    "address": "Leavenworth & Turk",
    "neighborhood": "Tenderloin"
  }
]
```

All fields except `file` are optional. Missing fields are filled in from
a weighted SF call-type / hotspot distribution at runtime so the demo
stays varied.
