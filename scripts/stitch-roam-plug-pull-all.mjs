/**
 * Pull roam-plug HTML via user-stitch download_file resource names.
 * Run from repo root with MCP-provided HTML saved as .cache/{id}.json: {"html":"..."}
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, 'docs/stitch/roam-plug/.cache');
const outDir = path.join(root, 'docs/stitch/roam-plug/html');

/** @type {[string, string][]} */
const MAPPING = [
  ['a10cab0348f846f6a069e50754093e5f', '01-splash.html'],
  ['d73ed4ed84264d7eac2aebf6e9b4cb05', '02-welcome.html'],
  ['6464e8fd691f458cbf7fa71e419840a8', '03-how-it-works.html'],
  ['48b4af1be489483da3cc4b57e825bf1b', '04-signup-phone.html'],
  ['343fb286bd2a48ed8974337de47ce283', '05-otp.html'],
  ['c217ef362fcf4e0c921e534c4d520d14', '06-profile.html'],
  ['3b9c91aa01ef4091aad4b0d7cf5cb533', '07-privacy-consent.html'],
  ['348269f490e64163b7d1364875f3a0ed', '08-permissions.html'],
  ['b50bc3ad8c894314956abdc5da0f7069', '09-add-vehicle-make.html'],
  ['042eab6af17c44b293646d995e9420e9', '10-model-year.html'],
  ['165dffb266d5440588b9d1a0a093db4d', '11-vehicle-not-found.html'],
  ['e1ea9b26cc0747f985d8fdb4b0c99195', '12-starting-odometer.html'],
  ['7cbe0552d67a4e4d9c34d223d1be6a95', '13-vehicle-added.html'],
  ['919e8eb65b6348d08d46d2b17e0eef8a', '14-login.html'],
  ['4c74f4a2c6914c00ab7bb19f42fe8ff2', '15-home-explore.html'],
  ['48d6b1d8bc3e43e6944f7c2bce907ef7', '16-guest-mode.html'],
  ['7c3dc4d3aff649ebaa230e6b354dfcf2', '17-station-list.html'],
  ['ab00bf8421524e76808c77c44757560b', '18-filters.html'],
  ['ee3d9d1f3de0421cab3ca8bc85cdf056', '19-station-detail.html'],
  ['26e4129fbbb44cd9b913ff2bdf00e742', '20-parts-store.html'],
  ['526065fa36384916be2e761001542a0e', '21-mechanic.html'],
  ['d3c6fb83a87a4ba68da26e5f6bbeea0e', '22-facility.html'],
  ['0fd4c419610a4abca544f786bb45bd9c', '23-pending-place.html'],
  ['141908c565e446ce8c62650e5f1bd098', '24-odometer-scan.html'],
  ['c52226f42b2c44058ece3ffcb088cf42', '25-confirm-odometer.html'],
  ['d230ade69260446e81d3e0d014a27781', '26-fuel-details.html'],
  ['ebcbacd4ebea436582cfdb14f965b034', '27-saved.html'],
  ['805f423810714c2a86890e7a165acafb', '28-saved-offline.html'],
  ['3447b35006ca4dc889dd9a28b22e5802', '29-my-vehicles.html'],
  ['b0781b7e32c04982a8c623b184054b48', '30-vehicle-overview.html'],
  ['bc3cc3429e114b9d8a6abf734bad1a21', '31-maintenance-schedule.html'],
  ['9e6595d4dd5a4e9fb20f9ee1785f616e', '32-service-item.html'],
  ['e7097f0f54a84f4fb143eb2790cabaec', '33-log-service.html'],
  ['6bec57e58464422c8dce8db31f1181d8', '34-history.html'],
  ['e8012ad700de4898b5cfbccf04e97774', '35-fuel-spend.html'],
  ['1fb9b0a74fde4f479e8ac983163558eb', '36-documents.html'],
  ['31ea95c558344cec886ae036e184528a', '37-document-reminder.html'],
  ['52b25580c1a64898b64db63edc962399', '38-parts-categories.html'],
  ['1324475f6f434aa6864c45380e92ffde', '39-parts-results.html'],
  ['8ca089ae43aa49818cb1280e00a758ef', '40-part-detail.html'],
  ['60aa77b1ebde49518de371102029b864', '41-parts-coming-soon.html'],
  ['1ef4f8fdc2d94d1e9fc2c04961a7efab', '42-choose-type.html'],
  ['f16cffce11bc410aba7ea3c3a76b7775', '43-place-pin.html'],
  ['4e9e0b07fa824a209758ccf8f61208aa', '43b-place-pin-variant.html'],
  ['0e6c3be0979a433c8ef48a2d51996eb5', '44-place-details.html'],
  ['484a1c5c62d14a23b40cd443f2e7ede2', '45-submitted.html'],
  ['bcf5dfee99f6476ebda16707a24e3734', '45b-submitted-variant.html'],
  ['2b49bafbe6f24d5495e102ad6674c8e9', '46-contributions.html'],
  ['bb277b9866094827b7ac219d78c94ab7', '47-help-map-parish.html'],
  ['1b67925331b94727b97f19b1a8635dac', '48-tolls.html'],
  ['c0238fbd713c4e919126d75d16fde46f', '49-search.html'],
  ['a530569a06fd4ad9ba8f362864e923b9', '50-notifications.html'],
  ['b6146a11122749c2b4da62aea6509074', '51-account.html'],
  ['9be984cd859640a8bf7187886e2e702a', '52-notification-settings.html'],
  ['df3ea20f39df40ef99f74577248637b7', '53-privacy-data.html'],
  ['432f817af2e449e39cfbb266544cb3df', '54-settings.html'],
  ['3cdde3d3bbce44309cba12a6a98cdf02', '55-help.html'],
  ['035ed5fd7fe6454ea4d123ef19e80c3b', '56-gps-issue.html'],
  ['39ada09d619c42b19d54d207bb417c45', '57-offline.html'],
];

fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const missing = [];
let written = 0;

for (const [id, filename] of MAPPING) {
  const cachePath = path.join(cacheDir, `${id}.json`);
  if (!fs.existsSync(cachePath)) {
    missing.push(id);
    continue;
  }
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch (e) {
    missing.push(`${id} (invalid json)`);
    continue;
  }
  const html = payload.html;
  if (!html || !String(html).trim()) {
    missing.push(`${id} (empty)`);
    continue;
  }
  fs.writeFileSync(path.join(outDir, filename), html, 'utf8');
  written++;
}

console.log(JSON.stringify({ written, expected: MAPPING.length, missing }, null, 2));
process.exit(missing.length ? 1 : 0);
