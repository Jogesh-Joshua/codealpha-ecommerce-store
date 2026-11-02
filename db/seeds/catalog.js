/**
 * db/seeds/catalog.js
 *
 * Seed catalogue: 5 categories and 21 products (INR, price_minor in paise).
 * All prices are multiples of 100 (whole rupees). Do not edit prices or slugs
 * without updating the matching test expectations in tests/db/schema.test.js.
 */

export const categories = [
  { slug: 'desk-mats',       name: 'Desk mats',         sort_order: 1 },
  { slug: 'charging-cables', name: 'Charging & cables',  sort_order: 2 },
  { slug: 'stands-risers',   name: 'Stands & risers',    sort_order: 3 },
  { slug: 'lighting',        name: 'Lighting',           sort_order: 4 },
  { slug: 'organizers',      name: 'Organizers',         sort_order: 5 },
];

/** @type {Array<{slug:string, name:string, category:string, summary:string, description:string, specs:Array<{label:string,value:string}>, price_minor:number, stock_quantity:number, is_active:boolean, featured_rank:number|null, images:Array<{url:string,alt:string,width:number,height:number,sort_order:number}>}>} */
export const products = [
  // ── desk-mats ────────────────────────────────────────────────────────────
  {
    slug: 'felt-desk-mat-charcoal',
    name: 'Felt desk mat, charcoal',
    category: 'desk-mats',
    summary: 'A thick charcoal wool-blend felt mat that anchors your keyboard and mouse while deadening noise.',
    description:
      'Made from dense wool-blend felt, this charcoal desk mat protects your desk surface and reduces keyboard clatter. ' +
      'The anti-slip backing keeps it in place through long sessions. ' +
      'A clean, minimal aesthetic that suits any desk setup.',
    specs: [
      { label: 'Material', value: 'Wool-blend felt' },
      { label: 'Dimensions', value: '900 × 400 mm' },
      { label: 'Thickness', value: '5 mm' },
      { label: 'Colour', value: 'Charcoal' },
    ],
    price_minor: 149900,
    stock_quantity: 40,
    is_active: true,
    featured_rank: 1,
    images: [
      { url: '/images/products/felt-desk-mat-charcoal-1.webp', alt: 'Charcoal felt desk mat flat on a desk', width: 800, height: 1000, sort_order: 0 },
      { url: '/images/products/felt-desk-mat-charcoal-2.webp', alt: 'Charcoal felt desk mat with keyboard on top', width: 800, height: 1000, sort_order: 1 },
      { url: '/images/products/felt-desk-mat-charcoal-3.webp', alt: 'Close-up of charcoal felt texture', width: 800, height: 1000, sort_order: 2 },
    ],
  },
  {
    slug: 'felt-desk-mat-moss',
    name: 'Felt desk mat, moss',
    category: 'desk-mats',
    summary: 'Same dense wool-blend felt as the charcoal version, now in a calm moss green.',
    description:
      'Identical construction to our charcoal mat — dense wool-blend felt with an anti-slip backing. ' +
      'The moss colour brings a subtle natural tone to your workspace without distraction. ' +
      'Cleans easily with a lint roller.',
    specs: [
      { label: 'Material', value: 'Wool-blend felt' },
      { label: 'Dimensions', value: '900 × 400 mm' },
      { label: 'Thickness', value: '5 mm' },
      { label: 'Colour', value: 'Moss green' },
    ],
    price_minor: 149900,
    stock_quantity: 3,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/felt-desk-mat-moss-1.webp', alt: 'Moss green felt desk mat on a light wood desk', width: 800, height: 1000, sort_order: 0 },
    ],
  },
  {
    slug: 'leather-look-desk-pad',
    name: 'Leather-look desk pad',
    category: 'desk-mats',
    summary: 'A smooth PU surface desk pad with stitched edges for a refined, professional look.',
    description:
      'This desk pad features a smooth PU top surface that glides easily under your mouse and is simple to wipe clean. ' +
      'The stitched perimeter edge resists fraying and adds a polished finish. ' +
      'Non-slip backing keeps the pad firmly in place.',
    specs: [
      { label: 'Material', value: 'PU with cork backing' },
      { label: 'Dimensions', value: '800 × 350 mm' },
      { label: 'Colour', value: 'Tan brown' },
      { label: 'Edge', value: 'Stitched perimeter' },
    ],
    price_minor: 199900,
    stock_quantity: 25,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/leather-look-desk-pad-1.webp', alt: 'Tan leather-look desk pad with stitched edges', width: 800, height: 1000, sort_order: 0 },
    ],
  },
  {
    slug: 'wireless-charging-desk-mat',
    name: 'Wireless charging desk mat',
    category: 'desk-mats',
    summary: 'A desk mat with a built-in 10 W Qi charging pad so you can power your phone without a separate charger.',
    description:
      'Place your Qi-compatible phone anywhere on the charging zone and it powers up without a cable. ' +
      'The mat surface is smooth microfibre, comfortable under your wrists and easy to clean. ' +
      'A single USB-C cable powers the mat and your devices.',
    specs: [
      { label: 'Charging output', value: '10 W Qi wireless' },
      { label: 'Material', value: 'Microfibre top, rubber base' },
      { label: 'Dimensions', value: '800 × 350 mm' },
      { label: 'Power input', value: 'USB-C' },
    ],
    price_minor: 299900,
    stock_quantity: 0,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/wireless-charging-desk-mat-1.webp', alt: 'Wireless charging desk mat with phone resting on it', width: 800, height: 1000, sort_order: 0 },
    ],
  },

  // ── charging-cables ───────────────────────────────────────────────────────
  {
    slug: 'braided-usb-c-cable-1m',
    name: 'Braided USB-C cable, 1 m',
    category: 'charging-cables',
    summary: 'A tangle-resistant braided USB-C to USB-C cable rated for 60 W fast charging and data transfer.',
    description:
      'The nylon braid protects the cable from fraying and keeps it flexible after thousands of bends. ' +
      'Rated for 60 W PD fast charging and USB 2.0 data. ' +
      'The reinforced strain-relief connectors prevent cable damage at the plug end.',
    specs: [
      { label: 'Length', value: '1 m' },
      { label: 'Connector', value: 'USB-C to USB-C' },
      { label: 'Charging', value: '60 W PD' },
      { label: 'Jacket', value: 'Nylon braid' },
    ],
    price_minor: 49900,
    stock_quantity: 120,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/braided-usb-c-cable-1m-1.webp', alt: 'Braided USB-C cable coiled neatly on a desk', width: 800, height: 1000, sort_order: 0 },
    ],
  },
  {
    slug: 'braided-usb-c-cable-2m',
    name: 'Braided USB-C cable, 2 m',
    category: 'charging-cables',
    summary: 'Same durable braided build as our 1 m cable, extended to 2 m for more reach.',
    description:
      'Identical cable construction to the 1 m version — nylon braid, 60 W PD charging, reinforced connectors. ' +
      'The extra length works well when your charger is across the desk or on the floor. ' +
      'Compatible with laptops, tablets, and phones.',
    specs: [
      { label: 'Length', value: '2 m' },
      { label: 'Connector', value: 'USB-C to USB-C' },
      { label: 'Charging', value: '60 W PD' },
      { label: 'Jacket', value: 'Nylon braid' },
    ],
    price_minor: 64900,
    stock_quantity: 80,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/braided-usb-c-cable-2m-1.webp', alt: 'Two-metre braided USB-C cable on a wooden surface', width: 800, height: 1000, sort_order: 0 },
    ],
  },
  {
    slug: 'gan-charger-65w',
    name: '65 W GaN charger, 3 ports',
    category: 'charging-cables',
    summary: 'A compact GaN wall charger with two USB-C and one USB-A port, delivering up to 65 W total.',
    description:
      'GaN technology keeps the charger compact and cool even at full load. ' +
      'Two USB-C ports support PD charging for laptops and phones; the USB-A port handles accessories. ' +
      'Smart power distribution automatically adjusts output between ports.',
    specs: [
      { label: 'Total output', value: '65 W' },
      { label: 'Ports', value: '2 × USB-C PD, 1 × USB-A' },
      { label: 'Technology', value: 'GaN' },
      { label: 'Plug', value: 'Indian 3-pin' },
    ],
    price_minor: 189900,
    stock_quantity: 30,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/gan-charger-65w-1.webp', alt: 'Compact GaN charger with three ports on a white background', width: 800, height: 1000, sort_order: 0 },
    ],
  },
  {
    slug: 'cable-clips-set-of-6',
    name: 'Cable clips, set of 6',
    category: 'charging-cables',
    summary: 'Adhesive silicone cable clips that stick to any surface and keep your cables routed and tidy.',
    description:
      'Each clip uses a strong 3M adhesive pad that bonds to wood, glass, metal, and plastic without leaving residue. ' +
      'The silicone channel accepts cables from 3 mm to 8 mm in diameter. ' +
      'Set of six covers a typical desk setup.',
    specs: [
      { label: 'Material', value: 'Silicone' },
      { label: 'Adhesive', value: '3M tape' },
      { label: 'Cable diameter', value: '3–8 mm' },
      { label: 'Quantity', value: '6 clips' },
    ],
    price_minor: 24900,
    stock_quantity: 200,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/cable-clips-set-of-6-1.webp', alt: 'Six silicone cable clips arranged in a row', width: 800, height: 1000, sort_order: 0 },
    ],
  },

  // ── stands-risers ─────────────────────────────────────────────────────────
  {
    slug: 'aluminium-laptop-stand',
    name: 'Aluminium laptop stand',
    category: 'stands-risers',
    summary: 'A foldable aluminium stand that raises your laptop to eye level, improving posture and airflow.',
    description:
      'The single-piece aluminium construction is rigid and lightweight, folding flat for transport. ' +
      'Silicone pads on the arms and feet prevent scratching and sliding. ' +
      'Compatible with laptops from 11 to 16 inches.',
    specs: [
      { label: 'Material', value: 'Aluminium alloy' },
      { label: 'Compatibility', value: '11–16 inch laptops' },
      { label: 'Height raised', value: 'Approx. 150 mm' },
      { label: 'Foldable', value: 'Yes' },
    ],
    price_minor: 249900,
    stock_quantity: 35,
    is_active: true,
    featured_rank: 2,
    images: [
      { url: '/images/products/aluminium-laptop-stand-1.webp', alt: 'Silver aluminium laptop stand with a laptop on it', width: 800, height: 1000, sort_order: 0 },
      { url: '/images/products/aluminium-laptop-stand-2.webp', alt: 'Aluminium laptop stand folded flat', width: 800, height: 1000, sort_order: 1 },
      { url: '/images/products/aluminium-laptop-stand-3.webp', alt: 'Side view showing laptop height raised by the stand', width: 800, height: 1000, sort_order: 2 },
    ],
  },
  {
    slug: 'monitor-riser-with-drawer',
    name: 'Monitor riser with drawer',
    category: 'stands-risers',
    summary: 'Raises your monitor to a comfortable height and adds a pull-out drawer for pens and small accessories.',
    description:
      'The sturdy bamboo riser lifts your monitor or laptop by 100 mm, reducing neck strain during long sessions. ' +
      'A smooth-sliding drawer underneath stores pens, cables, and sticky notes out of sight. ' +
      'Fits most monitors and ultrawide displays up to 27 inches.',
    specs: [
      { label: 'Material', value: 'Bamboo and MDF' },
      { label: 'Raised height', value: '100 mm' },
      { label: 'Max load', value: '20 kg' },
      { label: 'Drawer', value: 'Yes, pull-out' },
    ],
    price_minor: 279900,
    stock_quantity: 18,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/monitor-riser-with-drawer-1.webp', alt: 'Wooden monitor riser with its drawer open', width: 800, height: 1000, sort_order: 0 },
    ],
  },
  {
    slug: 'vertical-laptop-dock',
    name: 'Vertical laptop dock',
    category: 'stands-risers',
    summary: 'A slim vertical dock that stores your closed laptop upright, saving desk space when using an external monitor.',
    description:
      'The adjustable width bracket accommodates laptops from 11 to 16 inches. ' +
      'The silicone-padded frame grips the device without scratching and keeps it upright and stable. ' +
      'A compact footprint frees your desk surface while keeping your laptop ventilated.',
    specs: [
      { label: 'Compatible width', value: '11–16 inch laptops' },
      { label: 'Adjustable', value: 'Yes' },
      { label: 'Material', value: 'Aluminium and silicone' },
      { label: 'Orientation', value: 'Vertical' },
    ],
    price_minor: 179900,
    stock_quantity: 22,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/vertical-laptop-dock-1.webp', alt: 'Vertical laptop dock holding a laptop upright on a desk', width: 800, height: 1000, sort_order: 0 },
    ],
  },
  {
    slug: 'adjustable-phone-stand',
    name: 'Adjustable phone stand',
    category: 'stands-risers',
    summary: 'A folding aluminium phone stand with an adjustable tilt angle for video calls and content viewing.',
    description:
      'The hinge mechanism locks at any angle from 15 to 90 degrees for portrait or landscape use. ' +
      'A notch in the base keeps cables tidy while the phone charges. ' +
      'Folds flat and weighs under 80 g.',
    specs: [
      { label: 'Material', value: 'Aluminium' },
      { label: 'Angle range', value: '15–90°' },
      { label: 'Cable notch', value: 'Yes' },
      { label: 'Foldable', value: 'Yes' },
    ],
    price_minor: 69900,
    stock_quantity: 60,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/adjustable-phone-stand-1.webp', alt: 'Aluminium phone stand with a smartphone resting at an angle', width: 800, height: 1000, sort_order: 0 },
    ],
  },

  // ── lighting ──────────────────────────────────────────────────────────────
  {
    slug: 'led-desk-lamp-dimmable',
    name: 'LED desk lamp, dimmable',
    category: 'lighting',
    summary: 'A minimalist dimmable LED desk lamp with five brightness levels and a flexible gooseneck arm.',
    description:
      'The flexible gooseneck positions the light exactly where you need it without casting shadows on your work. ' +
      'Five brightness levels suit reading, typing, video calls, and ambient use. ' +
      'USB-A charging port built into the base keeps a device powered without an extra adapter.',
    specs: [
      { label: 'Light source', value: 'LED' },
      { label: 'Brightness levels', value: '5' },
      { label: 'Colour temperature', value: '4000 K neutral white' },
      { label: 'Built-in USB', value: 'USB-A 5 W' },
    ],
    price_minor: 229900,
    stock_quantity: 28,
    is_active: true,
    featured_rank: 3,
    images: [
      { url: '/images/products/led-desk-lamp-dimmable-1.webp', alt: 'Dimmable LED desk lamp with gooseneck arm on a clean desk', width: 800, height: 1000, sort_order: 0 },
      { url: '/images/products/led-desk-lamp-dimmable-2.webp', alt: 'LED desk lamp illuminating a notebook and pen', width: 800, height: 1000, sort_order: 1 },
      { url: '/images/products/led-desk-lamp-dimmable-3.webp', alt: 'Close-up of the lamp base showing the USB port and touch control', width: 800, height: 1000, sort_order: 2 },
    ],
  },
  {
    slug: 'monitor-light-bar',
    name: 'Monitor light bar',
    category: 'lighting',
    summary: 'A monitor-mounted light bar that illuminates your desk without reflecting on the screen.',
    description:
      'The asymmetric optical design directs light downward onto your desk, not into your eyes or onto the monitor. ' +
      'Touch-sensitive controls on the bar adjust brightness and colour temperature from warm to cool. ' +
      'Clips securely onto monitors up to 32 mm thick without tools.',
    specs: [
      { label: 'Mounting', value: 'Monitor clip, up to 32 mm' },
      { label: 'Colour temperature', value: '2700–6500 K adjustable' },
      { label: 'Controls', value: 'Touch-sensitive dial' },
      { label: 'Power', value: 'USB-C' },
    ],
    price_minor: 299900,
    stock_quantity: 15,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/monitor-light-bar-1.webp', alt: 'Monitor light bar clipped on top of a widescreen monitor', width: 800, height: 1000, sort_order: 0 },
    ],
  },
  {
    slug: 'clip-on-reading-lamp',
    name: 'Clip-on reading lamp',
    category: 'lighting',
    summary: 'A small clip-on LED lamp with a flexible neck, ideal for reading, notebooks, or keyboard lighting.',
    description:
      'The spring-loaded clip attaches to shelves, headboards, desks, and monitors up to 40 mm thick. ' +
      'Three brightness levels and a warm-white LED keep glare low during evening use. ' +
      'Charges via USB-A and stores up to four hours of use at full brightness.',
    specs: [
      { label: 'Power', value: 'Built-in rechargeable battery (USB-A)' },
      { label: 'Battery life', value: 'Up to 4 hours at full brightness' },
      { label: 'Clip range', value: 'Up to 40 mm' },
      { label: 'Brightness levels', value: '3' },
    ],
    price_minor: 129900,
    stock_quantity: 5,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/clip-on-reading-lamp-1.webp', alt: 'Clip-on reading lamp attached to a shelf', width: 800, height: 1000, sort_order: 0 },
    ],
  },
  {
    slug: 'ultra-slim-monitor-light-bar-with-asymmetric-glare-free-optics-and-wireless-dial',
    name: 'Ultra-slim monitor light bar with asymmetric glare-free optics and wireless dial',
    category: 'lighting',
    summary:
      'A premium ultra-slim light bar with asymmetric optics and a wireless magnetic dial for precise brightness and colour control.',
    description:
      'Precision asymmetric optics project light onto your desk while keeping your monitor panel glare-free. ' +
      'The wireless dial detaches magnetically from the bar and can sit anywhere on your desk. ' +
      'Mounts on monitors up to 35 mm thick and is powered via USB-C.',
    specs: [
      { label: 'Mounting', value: 'Monitor clip, up to 35 mm' },
      { label: 'Colour temperature', value: '2700–6500 K adjustable' },
      { label: 'Controls', value: 'Wireless magnetic dial' },
      { label: 'Power', value: 'USB-C' },
    ],
    price_minor: 399900,
    stock_quantity: 12,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/ultra-slim-monitor-light-bar-with-asymmetric-glare-free-optics-and-wireless-dial-1.webp', alt: 'Ultra-slim monitor light bar on a widescreen monitor with the wireless dial beside it', width: 800, height: 1000, sort_order: 0 },
    ],
  },

  // ── organizers ────────────────────────────────────────────────────────────
  {
    slug: 'walnut-desk-tray',
    name: 'Walnut desk tray',
    category: 'organizers',
    summary: 'A solid walnut wood tray that corrals your daily carry items and keeps the desk clear.',
    description:
      'Milled from solid walnut with a smooth oil finish that shows the natural grain. ' +
      'Deep enough for a phone, keys, and small accessories without items sliding out. ' +
      'The weight and finish improve with age and use.',
    specs: [
      { label: 'Material', value: 'Solid walnut' },
      { label: 'Dimensions', value: '220 × 120 × 30 mm' },
      { label: 'Finish', value: 'Natural oil' },
    ],
    price_minor: 199900,
    stock_quantity: 20,
    is_active: true,
    featured_rank: 4,
    images: [
      { url: '/images/products/walnut-desk-tray-1.webp', alt: 'Solid walnut desk tray with a phone and keys inside', width: 800, height: 1000, sort_order: 0 },
      { url: '/images/products/walnut-desk-tray-2.webp', alt: 'Close-up of walnut grain and oil finish', width: 800, height: 1000, sort_order: 1 },
      { url: '/images/products/walnut-desk-tray-3.webp', alt: 'Walnut tray from above on a white desk', width: 800, height: 1000, sort_order: 2 },
    ],
  },
  {
    slug: 'stackable-drawer-organizer',
    name: 'Stackable drawer organizer',
    category: 'organizers',
    summary: 'A modular drawer insert that divides the drawer into sections; stacks with other units for deeper organisation.',
    description:
      'The interlocking tabs allow multiple units to stack securely inside a drawer. ' +
      'Each organizer has four fixed compartments suitable for cables, stationery, and small tools. ' +
      'Made from recycled polypropylene that is light, rigid, and easy to wipe clean.',
    specs: [
      { label: 'Material', value: 'Recycled polypropylene' },
      { label: 'Compartments', value: '4' },
      { label: 'Stackable', value: 'Yes' },
      { label: 'Dimensions', value: '300 × 200 × 50 mm' },
    ],
    price_minor: 159900,
    stock_quantity: 26,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/stackable-drawer-organizer-1.webp', alt: 'Three stackable drawer organizer units arranged in a drawer', width: 800, height: 1000, sort_order: 0 },
    ],
  },
  {
    slug: 'steel-pen-and-tool-cup',
    name: 'Pen and tool cup, powder-coated steel',
    category: 'organizers',
    summary: 'A weighted powder-coated steel cup that holds pens, scissors, and small tools upright and in reach.',
    description:
      'The sand-filled base keeps the cup stable even when holding heavy scissors or a multi-tool. ' +
      'Powder-coated matte black finish resists scratching and fingerprints. ' +
      'Wide enough for chunky markers and most multi-tools.',
    specs: [
      { label: 'Material', value: 'Powder-coated steel' },
      { label: 'Diameter', value: '80 mm' },
      { label: 'Height', value: '120 mm' },
      { label: 'Base', value: 'Sand-filled for stability' },
    ],
    price_minor: 79900,
    stock_quantity: 70,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/steel-pen-and-tool-cup-1.webp', alt: 'Matte black steel pen cup with pens and scissors inside', width: 800, height: 1000, sort_order: 0 },
    ],
  },
  {
    slug: 'large-cable-box',
    name: 'Cable box, large',
    category: 'organizers',
    summary: 'A vented cable management box that hides a power strip and its cables inside one tidy enclosure.',
    description:
      'Route cables through the openings at either end and place a standard power strip inside. ' +
      'The vented sides allow heat to escape, and the lift-off lid gives easy access. ' +
      'Made from ABS plastic with a natural wood-look wrap.',
    specs: [
      { label: 'Material', value: 'ABS plastic with wood-look wrap' },
      { label: 'Dimensions', value: '340 × 140 × 130 mm' },
      { label: 'Lid', value: 'Lift-off' },
      { label: 'Ventilation', value: 'Side vents' },
    ],
    price_minor: 99900,
    stock_quantity: 45,
    is_active: true,
    featured_rank: null,
    images: [
      { url: '/images/products/large-cable-box-1.webp', alt: 'Cable management box with cables routed through the ends', width: 800, height: 1000, sort_order: 0 },
    ],
  },

  // ── inactive ──────────────────────────────────────────────────────────────
  {
    slug: 'archived-basic-mouse-pad',
    name: 'Basic mouse pad',
    category: 'desk-mats',
    summary: 'A plain cloth mouse pad with rubber base. Archived; replaced by our felt mat range.',
    description:
      'Standard cloth surface with a thin rubber backing. ' +
      'This product has been archived and is no longer actively sold. ' +
      'Existing stock is available for purchase, but no reorder is planned.',
    specs: [
      { label: 'Material', value: 'Cloth top, rubber base' },
      { label: 'Dimensions', value: '250 × 210 mm' },
    ],
    price_minor: 39900,
    stock_quantity: 10,
    is_active: false,
    featured_rank: null,
    images: [
      { url: '/images/products/archived-basic-mouse-pad-1.webp', alt: 'Basic grey cloth mouse pad', width: 800, height: 1000, sort_order: 0 },
    ],
  },
];

