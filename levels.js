'use strict';

// Challenge levels are pure data: adding one only needs a new entry here (or
// a push onto LEVELS at runtime); the start menu and HUD are built from it.
//
// level = {
//   id, name, description,
//   objective: { type: 'lines' | 'survive' | 'clearFixed', target? },
//   rules:     { timeLimitMs?, garbageIntervalMs?, presetRows?, invisibleLocked?, invertRotation? },
//   defeat:    { timeOut: boolean, topOut: true },
// }
// presetRows: strings of board width, '#' = fixed block, '.' = empty. They are
// stacked at the bottom of the board (the last string is the bottom row) and
// must not contain a complete row.
const LEVELS = [
  {
    id: 'sprint',
    name: 'Sprint',
    description: 'Limpia 40 líneas en 2 minutos.',
    objective: { type: 'lines', target: 40 },
    rules: { timeLimitMs: 120000 },
    defeat: { timeOut: true, topOut: true },
  },
  {
    id: 'garbage',
    name: 'Basura',
    description: 'Sobrevive 2 minutos: cada 10 s sube una fila con un hueco.',
    objective: { type: 'survive', target: 120000 },
    rules: { timeLimitMs: 120000, garbageIntervalMs: 10000 },
    defeat: { timeOut: false, topOut: true },
  },
  {
    id: 'preset',
    name: 'Tablero armado',
    description: 'Elimina todos los bloques fijos grises.',
    objective: { type: 'clearFixed' },
    rules: {
      presetRows: [
        '....##....',
        '..######..',
        '.########.',
        '##.####.##',
        '####.#.###',
      ],
    },
    defeat: { timeOut: false, topOut: true },
  },
  {
    id: 'invisible',
    name: 'Invisible',
    description: 'Las piezas fijadas no se ven. Limpia 20 líneas.',
    objective: { type: 'lines', target: 20 },
    rules: { invisibleLocked: true },
    defeat: { timeOut: false, topOut: true },
  },
  {
    id: 'reverse',
    name: 'Rotación inversa',
    description: 'La rotación va en sentido antihorario. Limpia 30 líneas.',
    objective: { type: 'lines', target: 30 },
    rules: { invertRotation: true },
    defeat: { timeOut: false, topOut: true },
  },
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LEVELS };
}
