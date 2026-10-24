const files = import.meta.glob('../../../../docs/stitch/roam-plug/html/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function stitchHtml(name: string): string {
  const match = Object.entries(files).find(([key]) => key.endsWith(`/${name}`));
  return match?.[1] || '';
}

const BRIDGE = `<script>
function roamLabel(el) {
  return (el.innerText || '').replace(/\\s+/g, ' ').trim();
}
function roamPost(payload) {
  parent.postMessage(Object.assign({ source: 'roam-plug-stitch' }, payload), '*');
}
document.addEventListener('click', function (event) {
  var el = event.target && event.target.closest ? event.target.closest('a, button') : null;
  if (!el) return;
  var path = el.getAttribute('data-path') || '';
  var label = roamLabel(el);
  var fields = {};
  document.querySelectorAll('input, textarea, select').forEach(function (node) {
    if (!node.id) return;
    fields[node.id] = node.type === 'checkbox' ? !!node.checked : node.value;
  });
  if (path) event.preventDefault();
  if (/google maps/i.test(label)) {
    event.preventDefault();
    roamPost({ kind: 'directions', app: 'google', id: el.id || '', label: label });
    return;
  }
  if (/\\bwaze\\b/i.test(label)) {
    event.preventDefault();
    roamPost({ kind: 'directions', app: 'waze', id: el.id || '', label: label });
    return;
  }
  if (el.getAttribute('data-plug-open') === '1') {
    event.preventDefault();
    roamPost({ kind: 'open-station', stationId: el.getAttribute('data-station-id') || '', label: label });
    return;
  }
  if (/^directions/i.test(label) || el.getAttribute('data-plug-drive') === '1') {
    event.preventDefault();
    roamPost({ kind: 'directions-sheet', stationId: el.getAttribute('data-station-id') || '', label: label });
    return;
  }
  var grade = el.getAttribute('data-plug-grade');
  if (!grade && /E-10 87/i.test(label)) grade = 'e10_87';
  if (!grade && /E-10 90/i.test(label)) grade = 'e10_90';
  if (!grade && /ULSD|Diesel/i.test(label)) grade = 'diesel';
  if (grade && el.closest('section, div')) {
    event.preventDefault();
    roamPost({ kind: 'grade', grade: grade, label: label });
    return;
  }
  roamPost({ id: el.id || '', path: path, label: label, fields: fields });
});
window.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.source !== 'roam-plug-parent') return;
  if (data.kind === 'loading') roamStatus('Loading stations…');
  if (data.kind === 'stations') roamPaintStations(data.stations || [], data.grade || 'e10_87');
  if (data.kind === 'queue') roamQueueChip(data.count || 0);
  if (data.kind === 'gps') roamGps(data.accuracy);
});
function roamMoney(value) {
  return value == null || value === '' ? '—' : 'J$' + Number(value).toFixed(2);
}
function roamStatus(text) {
  var node = document.getElementById('plug-status');
  if (!node) {
    node = document.createElement('p');
    node.id = 'plug-status';
    node.style.cssText = 'position:fixed;top:108px;left:16px;right:16px;z-index:60;text-align:center;background:#fff;border-radius:12px;padding:10px;font:600 14px Inter,sans-serif';
    document.body.appendChild(node);
  }
  node.textContent = text;
}
function roamEnsureGrades(grade) {
  document.querySelectorAll('button').forEach(function (button) {
    if (button.getAttribute('data-plug-grade')) return;
    var label = roamLabel(button);
    if (/E-10 87/i.test(label)) button.setAttribute('data-plug-grade', 'e10_87');
    else if (/E-10 90/i.test(label)) button.setAttribute('data-plug-grade', 'e10_90');
    else if (/ULSD|Diesel/i.test(label)) button.setAttribute('data-plug-grade', 'diesel');
  });
  if (document.querySelector('[data-plug-grade]')) {
    document.querySelectorAll('[data-plug-grade]').forEach(function (button) {
      var on = button.getAttribute('data-plug-grade') === grade;
      button.style.outline = on ? '2px solid #ea580c' : '0';
      button.style.fontWeight = on ? '700' : '500';
    });
    return;
  }
  var bar = document.createElement('div');
  bar.id = 'plug-grade-bar';
  bar.style.cssText = 'position:fixed;top:64px;left:12px;right:12px;z-index:50;display:flex;gap:8px;justify-content:center';
  [['e10_87', 'E-10 87'], ['e10_90', 'E-10 90'], ['diesel', 'ULSD']].forEach(function (pair) {
    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-plug-grade', pair[0]);
    button.textContent = pair[1];
    button.style.cssText = 'min-height:40px;padding:8px 12px;border-radius:999px;border:0;background:#fff;font:600 13px Inter,sans-serif';
    if (pair[0] === grade) button.style.outline = '2px solid #ea580c';
    bar.appendChild(button);
  });
  document.body.appendChild(bar);
}
function roamSafe(value) {
  return String(value || '').replace(/[&<>"]/g, function (ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch];
  });
}
function roamPaintStations(stations, grade) {
  var status = document.getElementById('plug-status');
  if (status) status.remove();
  roamEnsureGrades(grade);
  var priced = stations.map(function (station) {
    var prices = station.prices || {};
    var amount = prices[grade] != null ? Number(prices[grade]) : null;
    return { station: station, amount: amount != null && !isNaN(amount) ? amount : null };
  }).sort(function (a, b) {
    if (a.amount == null) return 1;
    if (b.amount == null) return -1;
    return a.amount - b.amount;
  });
  var bubbles = Array.prototype.filter.call(document.querySelectorAll('.font-price-display'), function (node) {
    return !node.closest('#plug-live-list');
  });
  bubbles.forEach(function (node, index) {
    var row = priced[index];
    if (!row) {
      node.textContent = '';
      return;
    }
    node.textContent = roamMoney(row.amount);
    if (index === 0 && row.amount != null) node.style.color = '#a16207';
  });
  var fallback = priced[0] && priced[0].amount != null ? roamMoney(priced[0].amount) : '—';
  document.querySelectorAll('span, p, div').forEach(function (node) {
    if (node.closest('#plug-live-list') || node.children.length) return;
    if (new RegExp('J\\\\$\\\\d').test(node.textContent)) node.textContent = node.textContent.replace(new RegExp('J\\\\$[0-9.]+', 'g'), fallback);
  });
  if (!priced.length) {
    roamStatus('No verified stations near you yet');
    return;
  }
  var sheet = document.querySelector('.rounded-t-3xl') || document.querySelector('main');
  if (sheet) {
    Array.prototype.forEach.call(sheet.children, function (child) {
      if (child.id === 'plug-live-list') return;
      if ((child.innerText || '').trim().length < 3) return;
      child.style.display = 'none';
    });
  }
  var pin = 0;
  document.querySelectorAll('span, p, div').forEach(function (node) {
    if (node.closest('#plug-live-list') || node.closest('.rounded-t-3xl') || node.children.length) return;
    if (!/Fesco|Cool Oasis|Texaco|TotalEnergies|Rubis|AutoPlugs/.test(node.textContent || '')) return;
    var station = priced[pin];
    pin += 1;
    if (station) node.textContent = station.station.name;
  });
  if (!sheet) return;
  var list = document.getElementById('plug-live-list');
  if (!list) {
    list = document.createElement('div');
    list.id = 'plug-live-list';
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '8px';
    list.style.marginTop = '12px';
    sheet.appendChild(list);
  }
  list.innerHTML = priced.slice(0, 8).map(function (row, index) {
    var station = row.station;
    var cheapest = index === 0 && row.amount != null ? ' style="outline:2px solid #eab308"' : '';
    return '<button type="button" data-plug-open="1" data-station-id="' + roamSafe(station.id) + '"' + cheapest +
      ' style="text-align:left;background:#fff;border:0;border-radius:12px;padding:12px;min-height:48px">' +
      '<strong>' + roamSafe(station.name || 'Station') + '</strong><br>' + roamMoney(row.amount) +
      (index === 0 && row.amount != null ? ' · cheapest' : '') + '</button>';
  }).join('');
}
function roamQueueChip(count) {
  var chip = document.getElementById('plug-offline-chip');
  if (!count) {
    if (chip) chip.remove();
    return;
  }
  if (!chip) {
    chip = document.createElement('button');
    chip.id = 'plug-offline-chip';
    chip.type = 'button';
    chip.style.cssText = 'position:fixed;top:72px;left:16px;z-index:60;background:#fff7ed;color:#9a3412;border-radius:999px;padding:8px 12px;border:1px solid #fed7aa;font:600 12px Inter,sans-serif';
    document.body.appendChild(chip);
  }
  chip.textContent = count + (count === 1 ? ' log waiting' : ' logs waiting');
}
function roamGps(accuracy) {
  var good = typeof accuracy === 'number' && accuracy <= 50;
  document.querySelectorAll('button, a').forEach(function (el) {
    if (!/confirm/i.test(roamLabel(el))) return;
    el.disabled = !good;
    el.setAttribute('aria-disabled', good ? 'false' : 'true');
    el.style.opacity = good ? '1' : '0.45';
  });
  var line = document.getElementById('plug-gps-line');
  if (!line) {
    line = document.createElement('p');
    line.id = 'plug-gps-line';
    line.style.cssText = 'position:fixed;top:64px;left:16px;right:16px;z-index:60;text-align:center;font:600 13px Inter,sans-serif';
    document.body.appendChild(line);
  }
  var color = !accuracy && accuracy !== 0 ? '#dc2626' : accuracy <= 20 ? '#16a34a' : accuracy <= 50 ? '#d97706' : '#dc2626';
  line.style.color = color;
  line.textContent = accuracy == null ? 'GPS is off. Confirm stays off.' : 'GPS ±' + Math.round(accuracy) + ' m';
}
(function roamSheet() {
  var sheet = document.querySelector('.rounded-t-3xl');
  if (!sheet) return;
  var startY = 0;
  var startH = 0;
  sheet.addEventListener('pointerdown', function (event) {
    if (event.target.closest && event.target.closest('button, a, input')) return;
    startY = event.clientY;
    startH = sheet.getBoundingClientRect().height;
  });
  sheet.addEventListener('pointermove', function (event) {
    if (!startY) return;
    var next = Math.max(160, Math.min(window.innerHeight * 0.86, startH + (startY - event.clientY)));
    sheet.style.maxHeight = next + 'px';
    sheet.style.overflow = 'auto';
  });
  sheet.addEventListener('pointerup', function () { startY = 0; });
})();
</script>`;

export function presentStitch(name: string, html: string): string {
  let next = html;
  if (name === '05-otp.html') {
    const phone = sessionStorage.getItem('plug-phone');
    if (phone) next = next.replace('+1 (876) 842-9104', phone);
    let box = 0;
    next = next.replace(/<div class="flex-1 max-w-\[52px\][\s\S]*?<\/div>/g, (block) => {
      if (box >= 6) return block;
      const index = box;
      box += 1;
      return `<input id="otp-${index}" inputmode="numeric" maxlength="1" class="flex-1 max-w-[52px] h-14 rounded-xl bg-surface-container-lowest shadow-sm text-center text-on-surface font-price-display text-price-display font-extrabold" />`;
    });
  }
  return next.replace('</body>', () => `${BRIDGE}</body>`);
}
