# New Vines Learning PWA v0.8.0

This version unifies Self Paced and Guided presentation into one canonical course JSON record.

## Key changes
- `public/courses/nvi-fgmm-m01.en-global.json` is now the single content record.
- Guided narration/facilitator metadata is supplemental data on the same page record (`page.guided`).
- Self Paced mode uses the existing canonical content and templates.
- Guided mode uses the same canonical content plus narration metadata.
- Self Paced header has a **Guided** button to the left of Present.
- Guided header has a **Self Paced** button.
- Pages without guided metadata are not included in the current guided prototype; clicking Guided from one of those pages opens the first guided page.
- Course version is displayed in the course band rather than the top brand band.
- Module title pages automatically show the New Vines International logo via the `title` template.
- Active guided content gets a temporary green left bar; it moves with the narration.
- Scripture content keeps persistent brown bars on both left and right.
- Guided mode scrolls the active content block into view automatically.
- Mobile Continue positioning and the narration disclosure were shortened/refined.
- AI disclosure text is now `AI-generated narration`.

## Guided narration modes / future CMS
Each page with guided narration supports `guided.narration_mode`:
- `browser_tts` — Use Browser Text to Speech; no API key required.
- `marin_opus` — Marin Opus AI Audio; requires OpenAI API configuration during publishing.

The course metadata includes `guided_presentation.narration_modes` so the future CMS can render these options. The CMS should hide/disable **Marin Opus AI Audio** unless an OpenAI API key is configured. The API key should never be stored in course JSON or delivered to the PWA.

## Run
```powershell
npm install
npm run generate:guided-audio
npm run build
npm run preview
```

Self Paced:
`http://localhost:4173/`

Guided:
`http://localhost:4173/?mode=guided`

If Marin files have already been generated and copied into `public/audio/guided-demo`, you do not need to regenerate them before every build.
