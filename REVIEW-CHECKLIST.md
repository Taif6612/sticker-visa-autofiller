# Code Review Quality Checklist

## Pre-Flight Requirements
- [ ] `manifest.json` permissions do not exceed MVP scope guidelines.
- [ ] No hardcoded secret tokens or production API hashes exist in public files.
- [ ] Hidden input elements (`type="hidden"`) are explicitly protected from script mutations.

## Framework Compatibility Pass
- [ ] Elements injected by the auto-filler trigger native event emissions (`input`, `change`) with bubbling enabled.
- [ ] Form elements keep values intact when the input looses focus manually.