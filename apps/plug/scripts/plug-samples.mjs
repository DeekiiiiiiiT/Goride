/** Stitch mockups are not the product. Generated screens must not keep sample people, ranks, or stock photos. */

export const BANNED_PHRASES = [
  'Road Scout — Level 3',
  'Road Scout Lvl 3',
  'Road Scout Grade 2',
  'Island Rank #18',
  'Island #18',
  '340 / 500',
  '340/500',
  'Top 5%',
  'Parish Pioneer',
  'Drivers Saved',
  '+25 XP',
  '+50 XP',
  '+15 XP',
  '+30 XP',
  'Scout XP',
  'Precision Auto Works',
  'J$9,800',
  '84,612',
  '79,400',
  'Insurance overdue by 3d',
  '12 Jun 2027',
  '10 Dec 2024',
  '962 days left',
  'TAJ Synced',
  '555-0192',
  '312 Verified pumps',
  '3 km/day',
  '39.3 km/day',
  'Tariq Campbell',
  '8241-HY',
  '14 Sep',
  '12 May',
  '28 Feb',
  '28 Apr',
  'aida-public',
  'Member since May 2023',
  '18,450',
  '85%',
  '123 Hope Road',
  'Rubis Hope Road',
  'Rubis Ultra',
  'RUBIS ULTRA',
  '84,210',
  'Invoice_Dunrobin_8241.jpg',
  'Road Scouts',
  'Road Scout',
  'community XP',
];

const PHRASES = [
  ['Your 2019 Toyota Roomy is now synced with Jamaican parish service schedules and live gas feeds.', 'Your car is ready.'],
  ['2019 Toyota Roomy updated • Odometer at', 'Odometer saved'],
  ['1 vehicle active • 2019 Toyota Roomy', 'Add a car'],
  ['2019 Toyota Roomy (84,612 km)', 'Add a car'],
  ['2019 Toyota Roomy • 8241-HY', 'Add a car'],
  ['2019 Toyota Roomy (Class 1)', 'Add a car'],
  ['2019 Toyota Roomy Custom', 'Add a car'],
  ['Pre-checked for your 2019 Toyota Roomy (M900A)', 'Parts for your car'],
  ['Brake pads (front) — 2019 Toyota Roomy', 'Brake pads (front)'],
  ['Parts for your 2019 Toyota Roomy are coming soon', 'Parts for your car are coming soon'],
  ['2019 Toyota Roomy, registration serial, and vehicle chassis number', 'Your car, registration, and chassis number'],
  ['2019 Toyota Roomy · GPS ±6 m · Matched by GPS', 'Matched by GPS'],
  ['“Daily Workhorse”', ''],
  ['Daily Workhorse', ''],
  ['FAQs, Road Scout guides, WhatsApp support', 'FAQs and WhatsApp support'],
  ['Pinning tyre shops, verification process, earning Scout XP', 'Pinning tyre shops and how verification works'],
  ['You will receive 50 Scout XP immediately upon approval!', 'You will be told when it is approved.'],
  ['SMS alerts (+1 876 555-0192)', 'SMS alerts'],
  ['Signed in as +1 (876) 555-0192', ''],
  ['Pin a Gas Station Here (+25 XP)', 'Pin a gas station here'],
  ['View My Contributions (3 Pins Added • 140 XP)', 'View my contributions'],
  ['Insurance overdue by 3d', ''],
  ['312 Verified pumps active island-wide', ''],
  ['Road Scout — Level 3', ''],
  ['Road Scout Lvl 3', ''],
  ['Rank: Road Scout Grade 2', ''],
  ['Road Scout Grade 2', ''],
  ['Road Scout Mission', 'Parish map'],
  ['Road Scout Impact', ''],
  ['Island Rank #18', ''],
  ['• Island #18 (340 XP)', ''],
  ['Next Tier: Senior Scout (60 XP to go)', ''],
  ['Island Contributor Pass', ''],
  ['Member since May 2023', ''],
  ['Parish Pioneer #1', ''],
  ['Drivers Saved ~$14k JMD', ''],
  ['Top 5%', ''],
  ['TAJ Synced', ''],
  ['Precision Auto Works', ''],
  ['4.9 ★ (128 reviews)', ''],
  ['J$9,800', ''],
  ['Last known was 79,400 km in May', ''],
  ['~39.3 km/day', ''],
  ['48 km/day', ''],
  ['3 km/day', ''],
  ['Expires on 28 Apr 2025. Book vehicle test inspection at Island Traffic Authority Depot.', ''],
  ['Valid until 28 Feb 2025 • Depot: Swallowfield', ''],
  ['14 Sep 2024 • Sammy\'s Tyre Repair', ''],
  ['12 May 2024 • Precision Auto Works', ''],
  ['14 Sep 2024 • 80,000 km', ''],
  ['12 Jun 2027', 'Not set'],
  ['10 Dec 2024', 'Not set'],
  ['15 Nov 2024', 'Not set'],
  ['Expired 21 Oct 2024', 'Not set'],
  ['962 days left', 'Not set'],
  ['+25 Community Points', 'this pin'],
  ['This will cancel your verification request for "Sammy\'s Tyre Repair" and forfeit the pending this pin.', 'This will cancel your verification request.'],
  ["Sammy's Tyre Repair & Free Air Pump", ''],
  ["Sammy's Tyre & Alignment", ''],
  ["Sammy's Tyre Repair", ''],
  ['Parish of St. Andrew Focus', ''],
  ['defaultValue={"84,612 km"}', 'defaultValue={""}'],
  ['defaultValue={"Today, 24 Oct 2024"}', 'defaultValue={""}'],
  ['defaultValue={"2024-11-15"}', 'defaultValue={""}'],
  ['placeholder={"e.g. TotalEnergies Half-Way-Tree"}', 'placeholder={"Place name"}'],
  ['Oct 2024', ''],
  ['-8.4% vs Sept', ''],
  ['J$ 1,600 scout saved', ''],
  ['Scout XP synced', ''],
];

function stripArticles(source) {
  const open = '<article';
  const close = '</article>';
  let out = '';
  let i = 0;
  while (i < source.length) {
    const start = source.indexOf(open, i);
    if (start < 0) {
      out += source.slice(i);
      break;
    }
    out += source.slice(i, start);
    let depth = 1;
    let j = start + open.length;
    while (j < source.length && depth > 0) {
      const nextOpen = source.indexOf(open, j);
      const nextClose = source.indexOf(close, j);
      if (nextClose < 0) return source;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        j = nextOpen + open.length;
      } else {
        depth -= 1;
        j = nextClose + close.length;
      }
    }
    i = j;
  }
  return out;
}

function stripPhotos(source) {
  let next = source.replace(/<img\b[^>]*\/>/g, (tag) => {
    if (!tag.includes('aida-public')) return tag;
    const className = tag.match(/className=\{"([^"]*)"\}/)?.[1] || 'w-full h-full';
    return `<div className={"${className} bg-surface-container flex items-center justify-center text-primary"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>`;
  });
  next = next.replace(/<div\b[^>]*aida-public[^>]*\/>/g, (tag) => {
    const className = (tag.match(/className=\{"([^"]*)"\}/)?.[1] || 'w-full h-full')
      .replace(/\bbg-cover\b/g, 'bg-surface-container')
      .replace(/\bbg-center\b/g, 'flex items-center justify-center text-primary');
    return `<div className={"${className}"} aria-hidden={"true"}><span className={"material-symbols-outlined text-[32px]"}>image</span></div>`;
  });
  next = next.replace(/ style=\{\{ backgroundImage: "url\('https:\/\/lh3\.googleusercontent\.com\/aida-public\/[^']+'\)" \}\}/g, '');
  return next;
}

function floorType(source) {
  return source.replace(/className=(?:"([^"]*)"|\{"([^"]*)"\})/g, (full, plain, braced) => {
    const classes = plain ?? braced;
    if (!classes || classes.includes('material-symbols-outlined')) return full;
    const sized = classes.replace(/text-\[(8|9|10|11)px\]/g, 'text-[12px]');
    if (sized === classes) return full;
    return plain != null ? `className="${sized}"` : `className={"${sized}"}`;
  });
}

function labelExamples(source) {
  if (source.includes('Example · Fesco')) return source;
  return source
    .replace('Fesco - White River', 'Example · Fesco - White River')
    .replace('Toyota Probox (2018)', 'Example · Toyota Probox (2018)');
}

function tagCarSlots(source) {
  return source.replace(
    /(<(?:span|h1|h2|h3|h4|p|strong)\b(?![^>]*data-slot)[^>]*)(>\s*)2019 Toyota Roomy[^<]*/g,
    '$1 data-slot={"car"}$2Add a car',
  );
}

function tagSpend(source) {
  if (source.includes('data-slot={"spend"}') || source.includes('data-slot="spend"')) return source;
  return source.replace(
    /(<(?:h2|p|span)\b(?![^>]*data-slot)[^>]*)(>\s*)18,450/g,
    '$1 data-slot={"spend"}$2No fuel spend yet',
  );
}

function tagName(source) {
  if (source.includes('data-slot={"display-name"}')) return source;
  return source.replace(
    /(<(?:h2|span|p)\b(?![^>]*data-slot)[^>]*)(>\s*)Your account/g,
    '$1 data-slot={"display-name"}$2Your account',
  );
}

export function sanitizePlugScreen(source, fileName = '') {
  let next = stripPhotos(source);
  next = floorType(next);
  if (fileName.includes('Contributions')) {
    next = next.replace(
      /<section className=\{"relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary-container to-secondary[\s\S]*?(?=<section className=\{"flex flex-col gap-space-sm"\}>)/,
      '',
    );
    next = stripArticles(next);
    next = next.replace(
      /<span className=\{"px-1\.5 py-0\.2 bg-(?:white\/20|surface-container-high) rounded-full font-label-sm text-label-sm"\}>\s*\d+\s*<\/span>/g,
      '',
    );
    if (!next.includes('data-slot={"pins"}')) {
      next = next.replace(
        'id={"contributions-list"}>',
        'id={"contributions-list"}>\n                <p data-slot={"pins"}>No places yet.</p>',
      );
    }
    next = next.replace(
      /<section className=\{"flex flex-col gap-space-sm"\}>\s*<div className=\{"flex items-center justify-between"\}>[\s\S]*?Scout Milestones[\s\S]*?<\/section>\s*(?=<section className=\{"flex flex-col gap-space-sm"\}>)/,
      '',
    );
  }
  if (fileName.includes('History')) {
    next = stripArticles(next);
    if (!next.includes('data-slot={"history"}')) {
      next = next.replace(
        /<main\b([^>]*)>/,
        '<main$1>\n        <p data-slot={"history"} className={"px-4 py-3"}>No fuel logs yet.</p>',
      );
    }
  }
  for (const [from, to] of PHRASES) next = next.split(from).join(to);
  next = tagCarSlots(next);
  next = tagSpend(next);
  next = next.replace(/2019 Toyota Roomy/g, 'your car');
  next = next.replace(/\(\s*8241-HY\s*\)/g, '');
  next = next.replace(/🇯🇲\s*8241-HY/g, '');
  next = next.replace(/8241-HY/g, '');
  next = next.replace(/84,612(?:\s*km)?/g, '');
  next = next.replace(/79,400(?:\s*km)?/g, '');
  next = next.replace(/\+\d+\s*(?:Scout )?XP[^<\n]*/g, '');
  next = next.replace(/\d+\s*Scout XP[^<\n]*/g, '');
  next = next.replace(/\d+\s*\/\s*\d+\s*(?:Scout )?XP/g, '');
  next = next.replace(/Scout XP[^<\n]*/g, '');
  next = next.replace(/14 Sep[^<\n]*/g, '');
  next = next.replace(/12 May[^<\n]*/g, '');
  next = next.replace(/28 Feb[^<\n]*/g, '');
  next = next.replace(/28 Apr[^<\n]*/g, '');
  next = next.replace(/85%/g, '');
  next = next.replace(/18,450/g, 'No fuel spend yet');
  next = labelExamples(next);
  next = tagName(next);
  next = stripMockReadings(next);
  return next;
}

function stripMockReadings(source) {
  return source
    .replace(/123 Hope Road, Liguanea, Kingston 6, St\. Andrew/g, '')
    .replace(/123 Hope Road, Kingston, Jamaica/g, '')
    .replace(/GPS ±6 m · Rubis Hope Road/g, '')
    .replace(/Rubis Hope Road/g, '')
    .replace(/Rubis Ultra/g, '')
    .replace(/RUBIS ULTRA/g, '')
    .replace(/84,210 km/g, 'No reading yet')
    .replace(/84,210/g, 'No reading yet')
    .replace(/Invoice_Dunrobin_8241\.jpg/g, 'No file attached')
    .replace(/1\.4 MB • Uploaded/g, '')
    .replace(/1\/6 Photos/g, '')
    .replace(/Updated 18m ago/g, '')
    .replace(/Under Review by 2 Road Scouts/g, 'Waiting for Roam')
    .replace(/local Jamaican Road Scouts will stop reviewing/g, 'Roam will stop reviewing')
    .replace(/Local Jamaican Road Scouts review all submissions to keep island motoring data accurate\. Typically verified within 2 to 4 hours\./g, 'Roam reviews every place.')
    .replace(/Join fellow Jamaican Road Scouts in filling missing fuel stops, tyre shops, and trusted roadside mechanics across all 14 parishes\./g, 'Help fill in missing fuel stops, tyre shops, and mechanics across all 14 parishes.')
    .replace(/verified by Road Scouts/g, 'approved by Roam')
    .replace(/and community XP/g, '')
    .replace(/A Kingston Road Scout verified your coordinates\./g, 'Roam reviews every place.')
    .replace(/\+50 First-Time Bonus XP & \+15 Points/g, '')
    .replace(/Road Scouts/g, 'Roam')
    .replace(/Road Scout/g, 'Roam');
}

export function sampleViolations(source) {
  return BANNED_PHRASES.filter((phrase) => source.includes(phrase));
}

export function polishPlugFile(source) {
  return floorType(stripPhotos(source));
}
