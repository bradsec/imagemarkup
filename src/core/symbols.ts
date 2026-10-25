import type { SymbolName } from "./types";

export interface SymbolDefinition {
  label: string;
  lucide: string;
  markup: string;
  closed: boolean;
  rotation?: number;
  flip?: boolean;
}

export const SYMBOLS: Record<SymbolName, SymbolDefinition> = {
  check: { label: "Check", lucide: "check", markup: `<path d="M20 6 9 17l-5-5" />`, closed: false },
  x: {
    label: "X",
    lucide: "x",
    markup: `<path d="M18 6 6 18" />
  <path d="m6 6 12 12" />`,
    closed: false,
  },
  star: {
    label: "Star",
    lucide: "star",
    markup: `<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />`,
    closed: true,
  },
  circle: {
    label: "Circle",
    lucide: "circle",
    markup: `<circle cx="12" cy="12" r="10" />`,
    closed: true,
  },
  triangle: {
    label: "Triangle",
    lucide: "triangle",
    markup: `<path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />`,
    closed: true,
  },
  square: {
    label: "Square",
    lucide: "square",
    markup: `<rect width="18" height="18" x="3" y="3" rx="2" />`,
    closed: true,
  },
  diamond: {
    label: "Diamond",
    lucide: "diamond",
    markup: `<path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z" />`,
    closed: true,
  },
  hexagon: {
    label: "Hexagon",
    lucide: "hexagon",
    markup: `<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />`,
    closed: true,
  },
  exclamation: {
    label: "Exclamation",
    lucide: "circle-alert",
    markup: `<circle cx="12" cy="12" r="10" />
  <line x1="12" x2="12" y1="8" y2="12" />
  <line x1="12" x2="12.01" y1="16" y2="16" />`,
    closed: false,
  },
  question: {
    label: "Question",
    lucide: "circle-help",
    markup: `<circle cx="12" cy="12" r="10" />
  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
  <path d="M12 17h.01" />`,
    closed: false,
  },
  info: {
    label: "Information",
    lucide: "info",
    markup: `<circle cx="12" cy="12" r="10" />
  <path d="M12 16v-4" />
  <path d="M12 8h.01" />`,
    closed: false,
  },
  warning: {
    label: "Warning",
    lucide: "triangle-alert",
    markup: `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
  <path d="M12 9v4" />
  <path d="M12 17h.01" />`,
    closed: false,
  },
  plus: {
    label: "Plus",
    lucide: "plus",
    markup: `<path d="M5 12h14" />
  <path d="M12 5v14" />`,
    closed: false,
  },
  minus: { label: "Minus", lucide: "minus", markup: `<path d="M5 12h14" />`, closed: false },
  heart: {
    label: "Heart",
    lucide: "heart",
    markup: `<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />`,
    closed: true,
  },
  "arrow-up": {
    label: "Arrow up",
    lucide: "arrow-up",
    markup: `<path d="m5 12 7-7 7 7" />
  <path d="M12 19V5" />`,
    closed: false,
  },
  "arrow-down": {
    label: "Arrow down",
    lucide: "arrow-down",
    markup: `<path d="M12 5v14" />
  <path d="m19 12-7 7-7-7" />`,
    closed: false,
  },
  "arrow-left": {
    label: "Arrow left",
    lucide: "arrow-left",
    markup: `<path d="m12 19-7-7 7-7" />
  <path d="M19 12H5" />`,
    closed: false,
  },
  "arrow-right": {
    label: "Arrow right",
    lucide: "arrow-right",
    markup: `<path d="M5 12h14" />
  <path d="m12 5 7 7-7 7" />`,
    closed: false,
  },
  lightning: {
    label: "Lightning",
    lucide: "zap",
    markup: `<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z" />`,
    closed: false,
  },
  flag: {
    label: "Flag",
    lucide: "flag",
    markup: `<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528" />`,
    closed: false,
  },
  pin: {
    label: "Map marker",
    lucide: "map-pin",
    markup: `<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
  <circle cx="12" cy="10" r="3" />`,
    closed: false,
  },
  target: {
    label: "Target reticle",
    lucide: "crosshair",
    markup: `<circle cx="12" cy="12" r="10" />
  <line x1="22" x2="18" y1="12" y2="12" />
  <line x1="6" x2="2" y1="12" y2="12" />
  <line x1="12" x2="12" y1="6" y2="2" />
  <line x1="12" x2="12" y1="22" y2="18" />`,
    closed: false,
  },
  speech: {
    label: "Speech bubble",
    lucide: "message-square",
    markup: `<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />`,
    closed: true,
  },
  eye: {
    label: "Eye",
    lucide: "eye",
    markup: `<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
  <circle cx="12" cy="12" r="3" />`,
    closed: false,
  },
  "hand-stop": {
    label: "Stop hand",
    lucide: "hand",
    markup: `<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
  <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
  <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />`,
    closed: false,
  },
  "hand-point-left": {
    label: "Point left hand",
    lucide: "pointer",
    markup: `<path d="M22 14a8 8 0 0 1-8 8" />
  <path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
  <path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1" />
  <path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10" />
  <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />`,
    closed: false,
    rotation: -90,
  },
  "hand-point-right": {
    label: "Point right hand",
    lucide: "pointer",
    markup: `<path d="M22 14a8 8 0 0 1-8 8" />
  <path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
  <path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1" />
  <path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10" />
  <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />`,
    closed: false,
    rotation: 90,
  },
  octagon: {
    label: "Octagon",
    lucide: "octagon",
    markup: `<path d="M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z" />`,
    closed: true,
  },
  "rounded-square": {
    label: "Rounded square",
    lucide: "square",
    markup: `<rect width="18" height="18" x="3" y="3" rx="2" />`,
    closed: true,
  },
  ring: {
    label: "Ring",
    lucide: "circle",
    markup: `<circle cx="12" cy="12" r="10" />`,
    closed: true,
  },
  "check-circle": {
    label: "Check circle",
    lucide: "circle-check",
    markup: `<circle cx="12" cy="12" r="10" />
  <path d="m16 9-5.5 5.5L8 12" />`,
    closed: false,
  },
  "close-circle": {
    label: "Close circle",
    lucide: "circle-x",
    markup: `<circle cx="12" cy="12" r="10" />
  <path d="m15 9-6 6" />
  <path d="m9 9 6 6" />`,
    closed: false,
  },
  "thumbs-up": {
    label: "Thumbs up",
    lucide: "thumbs-up",
    markup: `<path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
  <path d="M7 10v12" />`,
    closed: false,
  },
  "thumbs-down": {
    label: "Thumbs down",
    lucide: "thumbs-down",
    markup: `<path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
  <path d="M17 14V2" />`,
    closed: false,
  },
  lock: {
    label: "Lock",
    lucide: "lock",
    markup: `<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
  <path d="M7 11V7a5 5 0 0 1 10 0v4" />`,
    closed: false,
  },
  unlock: {
    label: "Unlock",
    lucide: "lock-open",
    markup: `<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
  <path d="M7 11V7a5 5 0 0 1 9.9-1" />`,
    closed: false,
  },
  bug: {
    label: "Bug",
    lucide: "bug",
    markup: `<path d="M12 20v-9" />
  <path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z" />
  <path d="M14.12 3.88 16 2" />
  <path d="M21 21a4 4 0 0 0-3.81-4" />
  <path d="M21 5a4 4 0 0 1-3.55 3.97" />
  <path d="M22 13h-4" />
  <path d="M3 21a4 4 0 0 1 3.81-4" />
  <path d="M3 5a4 4 0 0 0 3.55 3.97" />
  <path d="M6 13H2" />
  <path d="m8 2 1.88 1.88" />
  <path d="M9 7.13V6a3 3 0 1 1 6 0v1.13" />`,
    closed: false,
  },
  lightbulb: {
    label: "Lightbulb",
    lucide: "lightbulb",
    markup: `<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
  <path d="M9 18h6" />
  <path d="M10 22h4" />`,
    closed: false,
  },
  bell: {
    label: "Bell",
    lucide: "bell",
    markup: `<path d="M10.268 21a2 2 0 0 0 3.464 0" />
  <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />`,
    closed: false,
  },
  clock: {
    label: "Clock",
    lucide: "clock",
    markup: `<circle cx="12" cy="12" r="10" />
  <path d="M12 6v6l4 2" />`,
    closed: false,
  },
  calendar: {
    label: "Calendar",
    lucide: "calendar",
    markup: `<path d="M8 2v3" />
  <path d="M16 2v3" />
  <rect x="3" y="3" width="18" height="18" rx="2" />
  <path d="M3 9h18" />`,
    closed: false,
  },
  search: {
    label: "Search",
    lucide: "search",
    markup: `<path d="m21 21-4.34-4.34" />
  <circle cx="11" cy="11" r="8" />`,
    closed: false,
  },
  cursor: {
    label: "Pointer",
    lucide: "mouse-pointer-2",
    markup: `<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />`,
    closed: false,
  },
  home: {
    label: "Home",
    lucide: "house",
    markup: `<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
  <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />`,
    closed: false,
  },
  user: {
    label: "User",
    lucide: "user",
    markup: `<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
  <circle cx="12" cy="7" r="4" />`,
    closed: false,
  },
  mail: {
    label: "Mail",
    lucide: "mail",
    markup: `<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
  <rect x="2" y="4" width="20" height="16" rx="2" />`,
    closed: false,
  },
  link: {
    label: "Link",
    lucide: "link",
    markup: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />`,
    closed: false,
  },
};

export const SYMBOL_GROUPS: { label: string; names: SymbolName[] }[] = [
  {
    label: "Shapes",
    names: [
      "star",
      "circle",
      "triangle",
      "square",
      "diamond",
      "hexagon",
      "octagon",
      "heart",
    ],
  },
  {
    label: "Marks",
    names: [
      "check",
      "x",
      "check-circle",
      "close-circle",
      "exclamation",
      "question",
      "info",
      "warning",
      "plus",
      "minus",
      "target",
    ],
  },
  { label: "Arrows", names: ["arrow-up", "arrow-down", "arrow-left", "arrow-right", "cursor"] },
  {
    label: "Objects",
    names: [
      "lightning",
      "flag",
      "pin",
      "eye",
      "thumbs-up",
      "thumbs-down",
      "lock",
      "unlock",
      "bug",
      "lightbulb",
      "bell",
      "clock",
      "calendar",
      "search",
      "home",
      "user",
      "mail",
      "link",
    ],
  },
  { label: "Callouts", names: ["speech"] },
];

export const SYMBOL_PALETTE: SymbolName[] = SYMBOL_GROUPS.flatMap((group) => group.names);
