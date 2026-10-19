// Regenerates public/assets/og-default.png (the link preview for every page).
import fs from 'node:fs';
import { defaultCard } from '../server/ogcard.js';
fs.writeFileSync(new URL('../public/assets/og-default.png', import.meta.url), defaultCard());
console.log('wrote public/assets/og-default.png');
