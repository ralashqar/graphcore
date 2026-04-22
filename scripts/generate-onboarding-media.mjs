import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')

const ASSETS = [
  { path: 'public/onboarding/project-types/story.svg', palette: ['#b58a5b', '#394b66', '#0a1018'], accent: '#f6d28b', scene: 'citadel' },
  { path: 'public/onboarding/project-types/game.svg', palette: ['#4b847b', '#2b3e58', '#091018'], accent: '#9be7d4', scene: 'frontier' },
  { path: 'public/onboarding/project-types/brand.svg', palette: ['#cc8e6f', '#5b3f4f', '#0d1018'], accent: '#ffd1a6', scene: 'campaign' },
  { path: 'public/onboarding/project-types/ugc.svg', palette: ['#6a789d', '#304258', '#091019'], accent: '#d8e7ff', scene: 'creator' },

  { path: 'public/onboarding/subtypes/feature_film.svg', palette: ['#ba8d61', '#364964', '#0a1018'], accent: '#ffe0a4', scene: 'citadel' },
  { path: 'public/onboarding/subtypes/tv_streaming_series.svg', palette: ['#a98a61', '#2f4059', '#0b1017'], accent: '#f4d091', scene: 'episode' },
  { path: 'public/onboarding/subtypes/short_film.svg', palette: ['#ad6d5d', '#28364b', '#0b0f16'], accent: '#ffd3b4', scene: 'spotlight' },
  { path: 'public/onboarding/subtypes/shortform_series.svg', palette: ['#8b7acf', '#33445c', '#0b1018'], accent: '#e4dbff', scene: 'vertical' },
  { path: 'public/onboarding/subtypes/animated_story.svg', palette: ['#db8d66', '#3d5274', '#0b1018'], accent: '#ffe4b3', scene: 'storybook' },

  { path: 'public/onboarding/subtypes/action_rpg.svg', palette: ['#5e8574', '#30435c', '#091018'], accent: '#b6f3d2', scene: 'action' },
  { path: 'public/onboarding/subtypes/narrative_adventure.svg', palette: ['#67a6a3', '#304663', '#091018'], accent: '#d1fff2', scene: 'adventure' },
  { path: 'public/onboarding/subtypes/strategy_builder.svg', palette: ['#6f9383', '#314152', '#0a1018'], accent: '#d6f7da', scene: 'builder' },
  { path: 'public/onboarding/subtypes/survival_craft.svg', palette: ['#708e6f', '#344238', '#0a1118'], accent: '#d7ecb3', scene: 'survival' },
  { path: 'public/onboarding/subtypes/shooter_combat.svg', palette: ['#7b7f92', '#28364b', '#090f17'], accent: '#f5c4c4', scene: 'combat' },
  { path: 'public/onboarding/subtypes/social_sim.svg', palette: ['#7290bb', '#415c74', '#0a1017'], accent: '#d8eaff', scene: 'community' },
  { path: 'public/onboarding/subtypes/open_world_sandbox.svg', palette: ['#5b8f8e', '#30455b', '#091018'], accent: '#b8f6e9', scene: 'sandbox' },
  { path: 'public/onboarding/subtypes/platformer_metroidvania.svg', palette: ['#6d7de2', '#32435e', '#091018'], accent: '#d7dbff', scene: 'platformer' },
  { path: 'public/onboarding/subtypes/horror_mystery.svg', palette: ['#7b6b78', '#2d3748', '#090e14'], accent: '#ffd6e4', scene: 'horror' },

  { path: 'public/onboarding/subtypes/campaign_world.svg', palette: ['#c48f73', '#5e4652', '#0b1017'], accent: '#ffe1c4', scene: 'campaign' },
  { path: 'public/onboarding/subtypes/product_storytelling.svg', palette: ['#d4937d', '#5a5268', '#0a1117'], accent: '#fff0d4', scene: 'product' },
  { path: 'public/onboarding/subtypes/mascot_ip.svg', palette: ['#d36e6a', '#5d4970', '#0a1017'], accent: '#ffd7d1', scene: 'mascot' },
  { path: 'public/onboarding/subtypes/brand_education_explainer.svg', palette: ['#af9e7f', '#4f556f', '#091018'], accent: '#fff1c9', scene: 'diagram' },

  { path: 'public/onboarding/subtypes/creator_organic.svg', palette: ['#8396ba', '#425568', '#0a1018'], accent: '#f4f8ff', scene: 'creator' },
  { path: 'public/onboarding/subtypes/direct_response_ad.svg', palette: ['#7e8db8', '#394b62', '#091018'], accent: '#fff4cc', scene: 'direct' },
  { path: 'public/onboarding/subtypes/faceless_explainer_demo.svg', palette: ['#8ca4b0', '#405366', '#091018'], accent: '#d9f1ff', scene: 'faceless' },
  { path: 'public/onboarding/subtypes/serialized_social_drama.svg', palette: ['#a17988', '#454f62', '#090f17'], accent: '#ffd9df', scene: 'drama' },
]

function renderScene(scene, accent) {
  switch (scene) {
    case 'citadel':
      return `
        <path d="M118 470c72-44 140-90 198-170 39-53 80-86 124-86 42 0 74 20 94 54 14 23 26 35 36 35 11 0 22-10 34-31 30-54 78-81 145-81 54 0 111 29 171 87v203H96l22-11Z" fill="${fade(accent, 0.16)}"/>
        <path d="M430 188h56l22 84h36v188H372V272h36l22-84Z" fill="${fade(accent, 0.28)}" stroke="${fade(accent, 0.58)}" stroke-width="4"/>
        <path d="M306 314h60v146h-86v-95l26-51Zm288 0h60l26 51v95h-86V314Z" fill="${fade(accent, 0.18)}"/>
      `
    case 'episode':
      return `
        <rect x="142" y="128" width="676" height="358" rx="26" fill="${fade(accent, 0.14)}" stroke="${fade(accent, 0.36)}" stroke-width="4"/>
        <rect x="184" y="168" width="174" height="278" rx="22" fill="${fade(accent, 0.12)}"/>
        <rect x="392" y="168" width="174" height="278" rx="22" fill="${fade(accent, 0.18)}"/>
        <rect x="600" y="168" width="174" height="278" rx="22" fill="${fade(accent, 0.12)}"/>
        <path d="M184 418c64-44 114-89 152-136M392 384c58-40 98-76 124-112M600 406c52-34 89-69 112-104" stroke="${fade(accent, 0.52)}" stroke-width="12" stroke-linecap="round"/>
      `
    case 'spotlight':
      return `
        <ellipse cx="486" cy="320" rx="204" ry="188" fill="${fade(accent, 0.18)}"/>
        <path d="M468 178c20 0 40 12 60 38 20 25 30 57 30 95v149H414V311c0-38 10-70 30-95 20-26 38-38 54-38Z" fill="${fade(accent, 0.24)}"/>
        <path d="M334 126 493 402 652 126" fill="${fade(accent, 0.08)}"/>
        <path d="M336 126 493 402 650 126" stroke="${fade(accent, 0.58)}" stroke-width="6"/>
      `
    case 'vertical':
      return `
        <rect x="238" y="106" width="196" height="420" rx="32" fill="${fade(accent, 0.16)}" stroke="${fade(accent, 0.44)}" stroke-width="4"/>
        <rect x="526" y="146" width="196" height="340" rx="28" fill="${fade(accent, 0.1)}" stroke="${fade(accent, 0.24)}" stroke-width="4"/>
        <path d="M286 436c44-54 76-102 96-144M574 404c30-32 58-73 84-123" stroke="${fade(accent, 0.52)}" stroke-width="14" stroke-linecap="round"/>
      `
    case 'storybook':
      return `
        <path d="M160 468c132-138 248-206 350-206 82 0 172 32 270 96v116H152l8-6Z" fill="${fade(accent, 0.16)}"/>
        <path d="M292 388c26-71 56-115 92-131 36-16 72-4 108 36 22 24 42 35 58 35 26 0 52-18 80-55" stroke="${fade(accent, 0.5)}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="622" cy="194" r="74" fill="${fade(accent, 0.14)}"/>
      `
    case 'frontier':
      return `
        <path d="M112 496c98-110 190-165 276-165 68 0 126 35 174 106 26 38 54 57 84 57 34 0 72-24 114-72l88 74H100l12-0Z" fill="${fade(accent, 0.18)}"/>
        <path d="M248 242c42-26 77-38 104-38 31 0 61 17 88 52 28 37 55 55 80 55 29 0 63-18 102-55" stroke="${fade(accent, 0.46)}" stroke-width="14" stroke-linecap="round"/>
        <circle cx="712" cy="176" r="64" fill="${fade(accent, 0.14)}"/>
      `
    case 'action':
      return `
        <path d="M224 438 420 242l56 57 132-132 88 88-133 132 54 54-198 59 1-62Z" fill="${fade(accent, 0.22)}" stroke="${fade(accent, 0.54)}" stroke-width="4"/>
        <path d="M142 470c138-26 254-82 350-168" stroke="${fade(accent, 0.38)}" stroke-width="12" stroke-linecap="round"/>
      `
    case 'adventure':
      return `
        <path d="M144 472c78-96 154-144 228-144 58 0 114 28 168 84 36 38 74 57 116 57 28 0 70-11 126-33v60H152l-8-24Z" fill="${fade(accent, 0.16)}"/>
        <path d="M306 230 446 344l228-180" stroke="${fade(accent, 0.52)}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
      `
    case 'builder':
      return `
        <rect x="182" y="188" width="136" height="136" rx="24" fill="${fade(accent, 0.16)}"/>
        <rect x="342" y="244" width="136" height="136" rx="24" fill="${fade(accent, 0.14)}"/>
        <rect x="502" y="168" width="136" height="136" rx="24" fill="${fade(accent, 0.18)}"/>
        <path d="M250 352h160M410 216h160M570 332h150" stroke="${fade(accent, 0.48)}" stroke-width="12" stroke-linecap="round"/>
      `
    case 'survival':
      return `
        <path d="M156 494c56-96 112-164 168-204 55-40 108-41 160-3 34 26 67 39 100 39 44 0 96-24 156-72v140H152l4-100Z" fill="${fade(accent, 0.15)}"/>
        <path d="M460 202c26 74 38 120 38 138 0 22-10 42-31 60-20 18-30 40-30 66" stroke="${fade(accent, 0.5)}" stroke-width="16" stroke-linecap="round"/>
      `
    case 'combat':
      return `
        <path d="M140 456c104-90 204-135 300-135 74 0 132 24 174 72 34 38 74 57 122 57 31 0 73-7 124-22v68H138l2-40Z" fill="${fade(accent, 0.14)}"/>
        <path d="M284 250 416 382M438 224 602 388M560 190 744 340" stroke="${fade(accent, 0.46)}" stroke-width="14" stroke-linecap="round"/>
      `
    case 'community':
      return `
        <circle cx="298" cy="272" r="62" fill="${fade(accent, 0.18)}"/>
        <circle cx="486" cy="228" r="52" fill="${fade(accent, 0.14)}"/>
        <circle cx="658" cy="284" r="68" fill="${fade(accent, 0.18)}"/>
        <path d="M228 420c20-56 54-84 102-84 51 0 87 28 108 84M424 402c18-48 47-72 86-72 42 0 72 24 90 72M590 430c20-62 58-93 114-93 56 0 95 31 118 93" stroke="${fade(accent, 0.46)}" stroke-width="14" stroke-linecap="round"/>
      `
    case 'sandbox':
      return `
        <path d="M118 490c92-106 183-159 273-159 68 0 127 29 177 88 35 41 72 61 110 61 39 0 91-19 156-58v74H106l12-6Z" fill="${fade(accent, 0.18)}"/>
        <path d="M218 368 336 252l76 70 154-156 72 64" stroke="${fade(accent, 0.5)}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="666" cy="172" r="66" fill="${fade(accent, 0.14)}"/>
      `
    case 'platformer':
      return `
        <rect x="144" y="370" width="182" height="34" rx="17" fill="${fade(accent, 0.22)}"/>
        <rect x="364" y="298" width="158" height="34" rx="17" fill="${fade(accent, 0.18)}"/>
        <rect x="576" y="224" width="142" height="34" rx="17" fill="${fade(accent, 0.2)}"/>
        <path d="M198 342c22-70 62-126 118-166 42-30 91-46 146-46" stroke="${fade(accent, 0.48)}" stroke-width="14" stroke-linecap="round"/>
        <path d="M318 434h410" stroke="${fade(accent, 0.16)}" stroke-width="10" stroke-linecap="round"/>
      `
    case 'horror':
      return `
        <path d="M164 486c72-116 146-174 224-174 48 0 94 22 138 66 34 34 66 51 98 51 40 0 84-24 132-72v139H154l10-10Z" fill="${fade(accent, 0.14)}"/>
        <path d="M298 218c38-28 74-42 108-42 44 0 84 22 120 66 24 28 45 42 64 42 24 0 52-16 84-48" stroke="${fade(accent, 0.38)}" stroke-width="14" stroke-linecap="round"/>
        <circle cx="654" cy="176" r="78" fill="${fade(accent, 0.08)}"/>
        <path d="M638 126v100M588 176h100" stroke="${fade(accent, 0.18)}" stroke-width="6" stroke-linecap="round"/>
      `
    case 'campaign':
      return `
        <path d="M178 458c120-96 231-144 334-144 82 0 172 31 270 92v90H168l10-38Z" fill="${fade(accent, 0.16)}"/>
        <path d="M310 176h92l18 140h-128l18-140Zm230 28 82 24-44 148-86-24 48-148Z" fill="${fade(accent, 0.22)}" stroke="${fade(accent, 0.5)}" stroke-width="4"/>
      `
    case 'product':
      return `
        <rect x="230" y="164" width="240" height="260" rx="48" fill="${fade(accent, 0.2)}" stroke="${fade(accent, 0.54)}" stroke-width="4"/>
        <rect x="502" y="226" width="162" height="162" rx="32" fill="${fade(accent, 0.14)}"/>
        <path d="M258 282h184M258 326h132M532 300h102" stroke="${fade(accent, 0.42)}" stroke-width="12" stroke-linecap="round"/>
      `
    case 'mascot':
      return `
        <circle cx="478" cy="258" r="116" fill="${fade(accent, 0.2)}"/>
        <circle cx="430" cy="226" r="22" fill="${fade(accent, 0.56)}"/>
        <circle cx="526" cy="226" r="22" fill="${fade(accent, 0.56)}"/>
        <path d="M400 300c36 40 90 60 162 60" stroke="${fade(accent, 0.56)}" stroke-width="16" stroke-linecap="round"/>
        <path d="M356 172c18-48 49-72 92-72M600 172c-18-48-49-72-92-72" stroke="${fade(accent, 0.42)}" stroke-width="14" stroke-linecap="round"/>
      `
    case 'diagram':
      return `
        <rect x="198" y="172" width="146" height="96" rx="24" fill="${fade(accent, 0.14)}"/>
        <rect x="432" y="128" width="146" height="96" rx="24" fill="${fade(accent, 0.18)}"/>
        <rect x="616" y="292" width="146" height="96" rx="24" fill="${fade(accent, 0.14)}"/>
        <rect x="304" y="356" width="146" height="96" rx="24" fill="${fade(accent, 0.16)}"/>
        <path d="M344 218h88l52-42M578 218l78 74M616 340H450M376 356l-32-88" stroke="${fade(accent, 0.48)}" stroke-width="10" stroke-linecap="round"/>
      `
    case 'creator':
      return `
        <rect x="598" y="128" width="126" height="224" rx="28" fill="${fade(accent, 0.18)}" stroke="${fade(accent, 0.44)}" stroke-width="4"/>
        <circle cx="350" cy="256" r="88" fill="${fade(accent, 0.16)}"/>
        <path d="M256 444c22-82 74-123 156-123 84 0 139 41 164 123" stroke="${fade(accent, 0.5)}" stroke-width="18" stroke-linecap="round"/>
        <path d="M628 184h66M628 218h42M628 252h54" stroke="${fade(accent, 0.54)}" stroke-width="10" stroke-linecap="round"/>
      `
    case 'direct':
      return `
        <rect x="132" y="146" width="238" height="318" rx="26" fill="${fade(accent, 0.16)}" stroke="${fade(accent, 0.34)}" stroke-width="4"/>
        <path d="M430 248h214M430 306h164M430 364h194" stroke="${fade(accent, 0.48)}" stroke-width="12" stroke-linecap="round"/>
        <path d="M224 226h62M224 264h102M224 302h82" stroke="${fade(accent, 0.56)}" stroke-width="10" stroke-linecap="round"/>
        <circle cx="716" cy="252" r="58" fill="${fade(accent, 0.15)}"/>
      `
    case 'faceless':
      return `
        <rect x="174" y="174" width="620" height="312" rx="34" fill="${fade(accent, 0.14)}" stroke="${fade(accent, 0.34)}" stroke-width="4"/>
        <rect x="228" y="226" width="206" height="206" rx="26" fill="${fade(accent, 0.12)}"/>
        <path d="M490 248h224M490 302h176M490 356h194" stroke="${fade(accent, 0.5)}" stroke-width="12" stroke-linecap="round"/>
      `
    case 'drama':
      return `
        <circle cx="336" cy="250" r="74" fill="${fade(accent, 0.16)}"/>
        <circle cx="604" cy="250" r="74" fill="${fade(accent, 0.16)}"/>
        <path d="M250 444c16-70 53-106 110-106 60 0 98 36 114 106M518 444c16-70 53-106 110-106 60 0 98 36 114 106" stroke="${fade(accent, 0.5)}" stroke-width="16" stroke-linecap="round"/>
        <path d="M412 298c34 24 68 36 102 36 34 0 70-12 108-36" stroke="${fade(accent, 0.42)}" stroke-width="12" stroke-linecap="round"/>
      `
    default:
      return ''
  }
}

function fade(hex, opacity) {
  const normalized = hex.replace('#', '')
  const full = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function renderSvg(asset) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600" fill="none">
  <defs>
    <linearGradient id="bg" x1="76" y1="38" x2="812" y2="562" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${asset.palette[0]}"/>
      <stop offset="52%" stop-color="${asset.palette[1]}"/>
      <stop offset="100%" stop-color="${asset.palette[2]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(726 118) rotate(115) scale(326 402)">
      <stop stop-color="${fade(asset.accent, 0.42)}"/>
      <stop offset="1" stop-color="${fade(asset.accent, 0)}"/>
    </radialGradient>
    <linearGradient id="veil" x1="480" y1="54" x2="480" y2="546" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="rgba(255,255,255,0.14)"/>
      <stop offset="100%" stop-color="rgba(4,8,14,0.08)"/>
    </linearGradient>
  </defs>
  <rect width="960" height="600" rx="0" fill="url(#bg)"/>
  <rect width="960" height="600" fill="url(#glow)"/>
  <circle cx="782" cy="118" r="148" fill="${fade(asset.accent, 0.08)}"/>
  <circle cx="188" cy="530" r="176" fill="${fade(asset.accent, 0.06)}"/>
  <rect x="50" y="50" width="860" height="500" rx="36" fill="url(#veil)" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
  <rect x="84" y="84" width="792" height="432" rx="28" fill="rgba(7,11,18,0.10)" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
  ${renderScene(asset.scene, asset.accent)}
  <path d="M86 478c98 10 188 14 270 14 180 0 352-20 516-60" stroke="rgba(255,255,255,0.12)" stroke-width="2" stroke-linecap="round"/>
</svg>`.trimStart()
}

for (const asset of ASSETS) {
  const outputPath = join(rootDir, asset.path)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, renderSvg(asset), 'utf8')
}

console.log(`Generated ${ASSETS.length} onboarding media assets.`)
