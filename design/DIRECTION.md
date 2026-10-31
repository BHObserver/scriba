# Scriba design direction: নতুন হালখাতা with the red cover

Chosen by the author on 31 Oct 2026: option **1b** (modern, Anek Bangla, khata details) with **1c's red cloth cover and seal** for the big moments. Light theme only. Bangla digits by default.

- Claude Design project **Scriba**: id `c10c8807-1a7d-4da4-84c8-c2ed1b2fc687`, https://claude.ai/design/p/c10c8807-1a7d-4da4-84c8-c2ed1b2fc687
- Exploration canvas: `Halkhata Directions.dc.html` (options 1a, 1b, 1c; history, don't edit).
- Feelings to hit: calm and in control day to day; modern and smart; proud and delighted at the big moments (cover, reveal, seal).

## How the khata shows up

| Element | Where | Spec |
|---|---|---|
| Binding band | Top edge of every screen | 7 px, `--red`, full width, above the status bar area |
| Stitched edge | Top of hero cards (drawer cash, page summary) | 18 px `--red` band inside the card top, with a 2 px dashed cream line 8 px from its top, inset 14 px |
| Red cover | Header of **Today**, **Close the day** and the onboarding **Welcome** (opening a new halkhata; added in D4) only | Woven cloth: `repeating-linear-gradient(45deg, oklch(1 0 0/.045) 0 2px, transparent 2px 5px), repeating-linear-gradient(-45deg, oklch(0 0 0/.07) 0 2px, transparent 2px 5px), linear-gradient(180deg, oklch(.45 .15 27), oklch(.41 .14 25))`; cream text; gold double rule (two 1 px lines, 5 px apart) 9 px above its bottom edge, inset 16 px |
| Seal | A page or day that balances | Double circle (3 px + 1.5 px), `--red`, rotated −12°, text "হিসাব মিলেছে" in Noto Serif Bengali 700 |
| Handwriting strip | Every check card, ledger entries, reminders | The line cut from his photo (CSS crop in the app; never a font), 84 px tall, radius 12, tag "ছবি থেকে" top right |
| Turmeric highlight | A value that needs a look | `--turmeric` fill, radius 6, inset bottom line `oklch(.75 .13 85)`, ink text |

Ruled paper appears only inside handwriting strips, never as a screen background.

## Colour tokens

```css
:root {
  --paper: oklch(0.972 0.014 85);        /* screen ground */
  --paper-card: oklch(0.992 0.007 85);   /* cards, tab bar */
  --photo: oklch(0.95 0.03 88);          /* strip placeholder ground */
  --ink: oklch(0.25 0.015 60);           /* text */
  --ink-soft: oklch(0.48 0.015 60);      /* secondary text, ≥ 4.5:1 on paper */
  --hair: oklch(0.86 0.015 70);          /* dividers, borders */
  --red: oklch(0.47 0.15 27);            /* khata red: identity, primary action, seal */
  --blue: oklch(0.47 0.15 262);          /* ink blue: money figures and readings */
  --green: oklch(0.47 0.15 150);         /* checked, matched */
  --turmeric: oklch(0.89 0.12 92);       /* needs a look (fill only, never text) */
  --turmeric-soft: oklch(0.95 0.06 92);  /* explanation panels */
  --gold: oklch(0.8 0.1 85);             /* cover rule and cover labels only */
  --cream: oklch(0.97 0.02 85);          /* text on red */
}
```

Meaning is fixed: **red is the khata, never danger.** Problems are turmeric. System failures (upload failed, offline) use a turmeric-soft panel with ink text and a clear action. Destructive actions are a red button whose label says exactly what happens. Green appears only for "checked/matched", never decoratively.

## Type

- **Anek Bangla** (Google Fonts, variable `wdth` 75–125, `wght` 300–800) for all UI and numerals. It has Latin glyphs for English mode.
- **Noto Serif Bengali** 700–800 only inside the red cover (title, hero figure) and the seal.
- Numerals: tabular, `font-stretch` 82–85%, weight 700, `--blue` for money.
- Amounts: `৳` directly before the figure (৳৪,৩২০), Bangladeshi lakh grouping (১,২৩,৪৫০). B1 checks `formatTaka` in `src/lib/numerals.ts` does this.

| Role | Font | Size / line | Weight, stretch |
|---|---|---|---|
| Cover hero figure | Noto Serif Bengali | 62 / 1.05 | 800 |
| Hero figure | Anek Bangla | 64 / 1 | 700, 82% |
| Screen title | Anek Bangla | 34 / 1 | 700, 90% |
| Card figure (qty, rate, amount) | Anek Bangla | 40 / 1 | 700, 82% |
| Tile figure | Anek Bangla | 28 / 1.1 | 700, 85% |
| Section / item title | Anek Bangla | 22 | 600 |
| Body, explanations | Anek Bangla | 17 / 1.45 | 500 |
| Label | Anek Bangla | 15 | 600, `--ink-soft` |
| Small | Anek Bangla | 13–14 | 500 |

Nothing a shopkeeper must read goes below 13 px; explanations and actions stay at 16 px or more.

## Space, shape, depth

- 4 px base. Screen padding 20. Card padding 16–20. Gap between cards 12.
- Radii: cards and tiles 26; strips 12; buttons and chips fully round (999).
- Buttons 56 px tall; every touch target ≥ 44 px. Primary is `--red` with cream text; secondary is a 1.5 px ink outline.
- Card elevation: `0 1px 0 oklch(0.85 0.02 70), 0 12px 32px oklch(0.4 0.03 60 / .10)`. No other shadows except the camera button.
- Tab bar: 86 px, `--paper-card`, hairline top border; tabs আজ, খাতা, (camera), বাকি, আরও; the active tab has a 22 × 4 px red mark above its label; the camera button is a 66 px red circle with a cream ring lens, raised 26 px above the bar.
- Reference frame 390 × 844. On laptops: flows (capture, check, close) in a centered 480 px column; Today and History may use two columns from 1024 px.

## Motion

- Taps 120 ms, screen transitions 220 ms, sheets 360 ms, ease-out. Swipe uses springs (`motion` defaults, stiffness ≈ 400, damping ≈ 32).
- **Reveal**: line boxes draw onto the photo one by one, 60 ms stagger, then each settles to green or turmeric in 180 ms as its checks resolve.
- **Seal**: lands from scale 1.6 and −20° to scale 1 and −12°, 420 ms with a slight overshoot, plus `navigator.vibrate(30)` where available.
- `prefers-reduced-motion`: fades only, no travel, no overshoot.

## Icons and copy

- Every icon carries a text label; text first. Simple line icons from `lucide-react` (chosen; B1 adds it). No emoji.
- Copy: short, warm, respectful (আপনি), everyday words a shopkeeper with little schooling uses. Explain a problem as arithmetic he can check ("২ × ৯৫ = ১৯০ হয়, কিন্তু পড়া হয়েছে ১৮০"), never as jargon.

## Known canvas defects (fixed in D2's kit)

- The 1a strip clips its text; in the app the strip is an image crop, but the kit must show it scaling, never clipping.
- Equations in 1a/1c wrap; use 1b's three-cell grid (পরিমাণ, দর, টাকা), which holds at 390 px.
