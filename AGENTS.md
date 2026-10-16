
# Home Dashboard

## Project Overview

We are building a browser-based home dashboard for a digital photo frame.

The application is a static SvelteKit build hosted at a URL. The rooted photo frame boots directly into Google Chrome in fullscreen mode and loads that URL. Do not introduce a native Android wrapper or Capacitor.

## Tech Stack

- **SvelteKit** — Application framework
- **TypeScript** — Programming language
- **Lucide** — Icons ([lucide.dev](https://lucide.dev/))
- **shadcn-svelte** — Application UI components ([shadcn-svelte.com](https://shadcn-svelte.com/))
- **Bits UI** — Headless primitives used by shadcn-svelte ([bits-ui.com](https://www.bits-ui.com/docs/introduction))
- **FullCalendar** — Calendar views and iCalendar parsing

## Target Device

**Device:** dxmart Frameo digital photo frame  
**Amazon ASIN:** B0DNMGKW2H

### Specifications

- **Display size:** 10.1 inches
- **Resolution:** 1280 × 800 pixels
- **Aspect ratio:** 16:10
- **Touchscreen:** Yes
- **Browser:** Google Chrome in fullscreen/kiosk mode
- **Orientation:** Landscape

The interface should be designed primarily for the device's 1280 × 800 landscape touchscreen.

## Application Structure

- Generate a static site with `pnpm build`; deploy the contents of `build/`.
- Keep the interface optimized for the fixed 1280 × 800 touchscreen.
- Use shadcn-svelte as the default UI system for both the photo-frame interface and all responsive mobile companion views.
- Use an existing shadcn-svelte component whenever one can reasonably provide the required structure, control, state, feedback, or interaction. Compose and configure shadcn-svelte components before creating custom UI primitives.
- Add custom component implementations only when shadcn-svelte does not provide a suitable component. Keep any necessary custom styling limited to layout, responsive behavior, and domain-specific presentation that the component library cannot express.
- Preserve shadcn-svelte behavior, accessibility, design tokens, and interaction conventions when extending components. Do not recreate controls such as buttons, inputs, dialogs, menus, tabs, cards, forms, drawers, tooltips, scroll areas, or feedback states from scratch.
- Keep browser-only integrations free of native Android or Capacitor APIs.
- Local development and static preview may use Vite middleware.
- Production features that require secrets, CORS bypassing, or server-side requests must use a separately hosted same-origin or CORS-enabled endpoint.

## Calendar Proxy

Public Apple Calendar feeds do not reliably allow direct browser requests. The app reads `VITE_CALENDAR_PROXY_URL`, which must point to an endpoint accepting the calendar feed URL through a `url` query parameter. Vite supplies `/__apple-calendar` during local development and preview; the production host must provide an equivalent endpoint.

## Notes

- Use VS Code as the primary development environment.
- Do not introduce additional libraries unless necessary.
- The device setup, rooting, Chrome installation, and kiosk boot configuration are handled outside this repository.
