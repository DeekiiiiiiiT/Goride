/**
 * k6 load smoke for rides quote endpoint.
 * Run: k6 run scripts/loadtests/k6-rides-smoke.js
 *
 * Set env K6_RIDES_URL (full quote URL) and K6_RIDES_TOKEN (Bearer JWT or anon key).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const url = __ENV.K6_RIDES_URL || 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/rides/v1/quote';
const token = __ENV.K6_RIDES_TOKEN || '';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  const payload = JSON.stringify({
    pickup_lat: 18.0179,
    pickup_lng: -76.8099,
    dropoff_lat: 18.0281,
    dropoff_lng: -76.7436,
  });
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: token,
    },
  };
  const res = http.post(url, payload, params);
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(0.3);
}
