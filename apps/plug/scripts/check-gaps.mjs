import fs from 'node:fs';

const files = [
  'D1-review-queue.html',
  'D3-merge.html',
  '15b-explore-loading.html',
  '43c-poor-gps.html',
  '19b-directions.html',
  '15c-empty-map.html',
  '49b-empty-search.html',
  '29b-empty-garage.html',
  '50b-empty-inbox.html',
  '27b-first-save.html',
  '45c-submitted-toast.html',
  '46b-approved.html',
  '26b-save-error.html',
  '30b-remove-vehicle.html',
  '23b-withdraw.html',
  '15d-offline-chip.html',
];

const needles = ['Approve', 'Merge', 'skeleton', 'Confirm', 'Waze', 'No verified', 'No results', 'No vehicles', 'inbox', 'Saved', 'Submitted', 'Approved', 'Could not save', 'Remove this vehicle', 'Withdraw', 'waiting'];

for (const file of files) {
  const text = fs.readFileSync(`docs/stitch/roam-plug/html/${file}`, 'utf8');
  const title = text.match(/<title>([^<]+)/)?.[1] || '';
  const hits = needles.filter((word) => text.toLowerCase().includes(word.toLowerCase()));
  const desktop = /2560|1440/.test(text.slice(0, 1500));
  console.log(`${file} | ${title} | ${desktop ? 'wide' : 'phone'} | ${hits.join(', ')}`);
}
