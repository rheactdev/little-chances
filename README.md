# Little Chances

A cozy, enchanted pixel-art book of spinning wheels. Entirely local and offline-capable, with lossless transparent CSS character animations.

## Run it

Unzip and open `index.html` in a modern browser. No build tools, login, network, or external APIs are required. If your browser restricts local storage on `file://` pages, serve the directory with `python3 -m http.server 8000` and open http://localhost:8000.

## Features

- Multiple saved wheels; add, edit, or remove entries (2-32 per wheel).
- Cryptographically secure unbiased draws through Web Crypto's `crypto.getRandomValues` and rejection sampling.
- Spinning wheel lands on the chosen segment; the visual animation never affects the winner.
- All wheels and a brief result history are saved locally in your browser. Open **Recent Destinies** in the top bar to view or clear the current wheel's history.
- Click or tap the wheel **or the bookkeeper** to spin. Both controls are keyboard accessible; spin triggers are disabled while spinning.
- Responsive book interface; reduced-motion support.
- The bookkeeper announces the winning choice in a compact, RPG-style speech box closely tucked beside the character, with its pointer aimed toward the sprite. A reserved space below the wheel prevents the box from shifting the book layout. Longer labels wrap and scroll within the box.

## Pixel-art animation

The browser displays **CSS sprite-sheet animations**, not GIFs. `assets/idle-sprite.png` (6 frames), `assets/review-sprite.png` (6 frames), and `assets/celebrate-sprite.png` (11 frames, all 5 jump frames followed by the 6 idle frames) were assembled directly from the original supplied transparent 192x208 RGBA PNG images. No frame was redrawn, palette-quantized, or given a background.

CSS animates each sprite sheet's background position with `steps()`, using whole-frame jumps and `image-rendering: pixelated`. JavaScript only switches states based on wheel activity. Once the celebration finishes, a CSS `animationend` event returns the character to idle.

To modify timing, edit the `animation` durations of `.character-sprite[data-motion="..."]` in `styles.css`.
