---
description: "Use when changing or reviewing fontSize, typography, text scaling, or line height in the Expo React Native app."
---
# Font Size and Typography

- Text styles are defined in the `StyleSheet` in `App.js`; change the named style used by the affected `Text` or `TextInput` rather than applying broad replacements.
- React Native `fontSize` and `lineHeight` use density-independent units, not web CSS units. Keep line height and surrounding layout appropriate when changing font size.
- Check that text still fits, wraps, or truncates intentionally in its parent, especially in fixed-height controls and queue rows.
- Preserve system font scaling and accessibility labels; do not disable font scaling unless the task explicitly requires it.
- Run `npm run lint` and check the affected screen on a device-sized viewport; lint does not verify visual fit.