export const EXTERIOR_SECTIONS = {
    "Front Section": [
        "Front Bumper",
        "Front Grille",
        "Hood (Bonnet)",
        "Headlight (Left)",
        "Headlight (Right)",
        "Fog Light (Left)",
        "Fog Light (Right)",
        "Front Fender (Left)",
        "Front Fender (Right)",
    ],
    "Side Section": [
        "Front Door (Left)",
        "Front Door (Right)",
        "Rear Door (Left)",
        "Rear Door (Right)",
        "Side Mirror (Left)",
        "Side Mirror (Right)",
        "Rocker Panel (Left)",
        "Rocker Panel (Right)",
        "Window (Front Left)",
        "Window (Front Right)",
        "Window (Rear Left)",
        "Window (Rear Right)",
        "A-Pillar (Left)",
        "A-Pillar (Right)",
        "B-Pillar (Left)",
        "B-Pillar (Right)",
        "C-Pillar (Left)",
        "C-Pillar (Right)",
    ],
    "Rear Section": [
        "Rear Bumper",
        "Trunk Lid / Tailgate",
        "Quarter Panel (Left)",
        "Quarter Panel (Right)",
        "Taillight (Left)",
        "Taillight (Right)",
        "Rear Glass / Hatch Window",
    ],
    "Wheels and Roof": [
        "Wheel (Front Left)",
        "Wheel (Front Right)",
        "Wheel (Rear Left)",
        "Wheel (Rear Right)",
        "Tire (Front Left)",
        "Tire (Front Right)",
        "Tire (Rear Left)",
        "Tire (Rear Right)",
        "Spare Tire",
        "Roof"
    ]
};

export const STANDARD_EXTERIOR_PARTS = Object.values(EXTERIOR_SECTIONS).flat();

export const DAMAGE_TYPES = [
    "Scratches/Scrapes",
    "Dents/Dings",
    "Chips (Paint or Glass)",
    "Cracks (Plastic, Glass, or Lighting)",
    "Punctures/Cuts (Tires)",
    "Missing Parts"
];

export const SEVERITY_LEVELS = [
    'Cosmetic',
    'Monitor',
    'Critical'
];
