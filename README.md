# imagemarkup

Private, browser-based image annotation. Images stay on the device and the built app is static-hostable.

Live application: [imagemarkup.com](https://imagemarkup.com/)

## Development

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Run the verification gate with:

```sh
npm test
npm run build
npx playwright install
npm run test:e2e
```

## Features

- Paste, drop, or choose a base image; add more images as editable layers.
- Preserve transparent PNG pixels while editing, cropping, resizing, and exporting PNG files, including transparency behind marks.
- Keep off-canvas artwork hidden by default, or enable View > Show overflow to reveal it and expand PNG exports with a transparent background.
- Set measurement units, document resolution, and a high-contrast selection color from File > Preferences. Preferences persist between browser sessions.
- Draw boxes, ellipses, lines, arrows, pen strokes, highlights, direct multiline text, counters, symbols, and redactions.
- Use Microsoft-style standard stroke/fill palettes, five quick thickness presets, custom colors, independent Stroke and Fill on/off controls, line caps and joins, independent start and end arrowheads in five styles, and a 21-item visual symbol library with matching previews and separate map-marker and target-reticle symbols. Numeric, letter, or Roman counter sequences can restart or continue from any value. Step counters have independent shape and text colors, with standard presets, exact color inputs, and image pickers for both. Selecting an existing counter exposes its own value without changing neighbouring counters or the next sequence value.
- Create rich text with locally bundled Kalam, Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Merriweather, Libre Baskerville, and Oswald fonts; quick size presets; bold, italic, underline; and left, center, right, or justified alignment.
- Select, move, resize, rotate, restyle, reorder, delete, undo, and redo objects. Lines and arrows use a centerline selection with fixed-opposite endpoint grips, a midpoint rotation handle, and a four-way cursor because either endpoint can move freely. Type exact width and height values in the top bar using the preferred measurement unit, with an optional aspect-ratio lock. The independent floating Layers palette supports show/hide visibility, locking, contiguous Shift selection, non-contiguous Ctrl/Cmd selection, drag reordering, direct deletion, and right-click actions for renaming, duplicating, or deleting a layer. Visibility and lock controls sit together on the left of each layer, while delete remains isolated on the right. Hold Shift while drawing or resizing to constrain proportions, Shift while rotating to snap to 45-degree increments, Alt/Option to draw or resize from the center, or combine modifiers where applicable.
- Crop, resize, rotate, flip, add borders, and apply angled text or image watermarks. Resizing the base image scales every existing annotation with it, including non-proportional resizing. Text watermarks support the installed and uploaded font library, bold, italic, and overlap-safe tiling.
- Autosave locally, import/export editable `.imgmarkup` projects, and upload local fonts.
- Export PNG or JPG at 1x/2x, with a contextual JPG quality control, download, or copy PNG to the clipboard.
- Mouse, keyboard, pen, and touch input, including cursor zoom and two-finger pinch/pan.

## Using the editor

Open, save, transform, and export from the menu bar, or use the Save and Export buttons in the top bar. Pick a tool from the left rail; the floating options panel then shows only the settings that apply to that tool or the selected object, while the status bar shows only the relevant interaction hint. The Layers palette floats separately, remains available throughout the project, and can be positioned and resized independently. Options panel positions are remembered per tool, and the Layers position is remembered globally. File > Reset settings restores panel positions, colors, arrowheads, text and counter defaults, selection color, and editor preferences without changing artwork. Each canvas item is represented by its own layer row; drawing adds a row and deleting it removes that item. Press Ctrl+D to duplicate selected items with a small offset. Drag either palette by its heading when it covers the part of the image you need, or resize Layers from its lower-right edge. The rail keeps stroke and fill swatches available at all times, while the options palette offers quick palettes and exact controls. Text font, formatting, and alignment remain the defaults for the current project. Choose the Text tool and click existing text to place a caret, edit, or highlight characters without opening a transform box; double-click text from Move for the same inline editor. Choose a common whole-pixel font size from the dropdown or enter a custom size. Add Font stores TTF, OTF, WOFF, or WOFF2 files locally in IndexedDB so they remain available in later sessions. Drawing tools remain active after each mark. New objects are selected for immediate editing, while pen and highlighter strokes remain unselected for uninterrupted drawing. Press Escape to finish inline text, leave the current tool or selection, and return to Move. Choose Move when you want to select and transform an object. The Crop tool provides Apply and Cancel controls as soon as a crop area is active; applying it clips intersecting layers to the new canvas and removes layers that fall completely outside. The About dialog provides version information, the GitHub repository, creator attribution, and the project support link.

When the image editing canvas has focus, common shortcuts include `V` for Move, `R` for Rectangle, `P` for Pen, `H` for Highlighter, `T` for Text, Space-drag to pan, and arrow keys to move selected items by one pixel. Hold Shift with an arrow key to move by ten pixels. The mouse wheel zooms, and `Ctrl`/`Cmd` + `Z` undoes the last change.

## Acknowledgements

imagemarkup has no third-party runtime JavaScript dependencies. It bundles these third-party assets for offline use:

- [Google Material Symbols](https://fonts.google.com/icons), licensed under the [Apache License 2.0](public/icons/material-symbols-LICENSE.txt).
- Legacy hand gesture paths retained for compatibility with existing `.imgmarkup` projects come from [Font Awesome Free](https://fontawesome.com), copyright Fonticons, Inc., and are licensed under [CC BY 4.0](public/icons/font-awesome-NOTICE.txt). They are not offered in the current symbol menu.
- Inter, Kalam, Lato, Libre Baskerville, Merriweather, Montserrat, Open Sans, Oswald, Poppins, and Roboto, licensed under the SIL Open Font License 1.1. Individual copyright notices and license texts are in [public/fonts/licenses](public/fonts/licenses).
- The GitHub mark from [Primer Octicons](https://github.com/primer/octicons), copyright GitHub, Inc., licensed under the [MIT License](public/icons/octicons-LICENSE.txt). Use of the GitHub logo follows [GitHub's logo guidelines](https://github.com/logos).

Development, testing, and build tooling:

- `@axe-core/playwright`, MPL-2.0.
- `@napi-rs/canvas`, MIT.
- Playwright, Apache-2.0.
- jsdom, MIT.
- TypeScript, Apache-2.0.
- Vite, MIT.
- Vitest, MIT.

Exact installed versions and transitive dependency metadata are recorded in `package-lock.json`.

## Hosting

`npm run build` writes the complete static site to `dist/`. Deploy that directory to Cloudflare Pages, or any static host.

For Cloudflare Pages, connect the GitHub repository in the Cloudflare dashboard and use these build settings:

- Production branch: `main`
- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave blank to use the repository root
- Environment variable: `NODE_VERSION=22`

No Cloudflare API token or GitHub deployment secrets are required for this Git integration. Cloudflare builds and deploys the site when `main` changes. Add `imagemarkup.com` as the project's custom domain after the first deployment.

The tracked application version is stored in `package.json` and `package-lock.json`. Increment the patch version with `npm version patch --no-git-tag-version` as part of each release change. Vite places that version in the footer and About dialog during every build. The included GitHub Actions workflow runs tests and verifies the production build, but Cloudflare performs the deployment directly from the repository.
