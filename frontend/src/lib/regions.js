const SPRITE_ROOT =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions";
const CRY_ROOT =
  "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";

export const SPRITE_PRESETS = {
  kanto:  { base: `${SPRITE_ROOT}/generation-iii/firered-leafgreen`,      ext: "png" },
  johto:  { base: `${SPRITE_ROOT}/generation-iv/heartgold-soulsilver`,    ext: "png" },
  hoenn:  { base: `${SPRITE_ROOT}/generation-iii/emerald`,                ext: "png" },
  sinnoh: { base: `${SPRITE_ROOT}/generation-iv/platinum`,                ext: "png" },
  unova:  { base: `${SPRITE_ROOT}/generation-v/black-white/animated`,     ext: "gif" },
};

export function getSpriteUrl(pokemonId, regionId) {
  const preset = SPRITE_PRESETS[regionId] ?? SPRITE_PRESETS.unova;
  return `${preset.base}/${pokemonId}.${preset.ext}`;
}

function makeStarter(regionId, key, id, label) {
  return {
    key,
    speciesName: key,
    pokemonId: id,
    label,
    sprite: getSpriteUrl(id, regionId),
    cry: `${CRY_ROOT}/${id}.ogg`,
  };
}

export const REGIONS = [
  {
    regionId: "kanto",
    label: "Kanto",
    starters: [
      makeStarter("kanto", "bulbasaur",  1, "Bulbasaur"),
      makeStarter("kanto", "charmander", 4, "Charmander"),
      makeStarter("kanto", "squirtle",   7, "Squirtle"),
    ],
  },
  {
    regionId: "johto",
    label: "Johto",
    starters: [
      makeStarter("johto", "chikorita", 152, "Chikorita"),
      makeStarter("johto", "cyndaquil", 155, "Cyndaquil"),
      makeStarter("johto", "totodile",  158, "Totodile"),
    ],
  },
  {
    regionId: "hoenn",
    label: "Hoenn",
    starters: [
      makeStarter("hoenn", "treecko", 252, "Treecko"),
      makeStarter("hoenn", "torchic", 255, "Torchic"),
      makeStarter("hoenn", "mudkip",  258, "Mudkip"),
    ],
  },
  {
    regionId: "sinnoh",
    label: "Sinnoh",
    starters: [
      makeStarter("sinnoh", "turtwig", 387, "Turtwig"),
      makeStarter("sinnoh", "chimchar", 390, "Chimchar"),
      makeStarter("sinnoh", "piplup",   393, "Piplup"),
    ],
  },
  {
    regionId: "unova",
    label: "Unova",
    starters: [
      makeStarter("unova", "snivy",    495, "Snivy"),
      makeStarter("unova", "tepig",    498, "Tepig"),
      makeStarter("unova", "oshawott", 501, "Oshawott"),
    ],
  },
];
