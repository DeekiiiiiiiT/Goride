/**
 * One-shot: convert Domino's legacy menu into menus.draft_snapshot.
 * Usage: node --env-file=.env scripts/unstick-domino-engine.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { convertMerchantMenu } from '../packages/menu-engine/src/convertLegacy.ts';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const merchantId = '3394880a-13c8-4689-8979-f965e4a26a03';
const menuId = '37a9e175-01ef-4807-9427-153aff3a72f9';
const sb = createClient(url, key, { db: { schema: 'delivery' } });

const { data: categories, error: cErr } = await sb
  .from('menu_categories')
  .select('id, name, section_kind, sort_order, pizza_menu')
  .eq('merchant_id', merchantId)
  .eq('is_active', true);
if (cErr) throw cErr;

const { data: items, error: iErr } = await sb
  .from('menu_items')
  .select(
    'id, category_id, name, description, image_url, in_store_price, price, options, pizza_recipe, prep_time_mins, source_price_checked_at',
  )
  .eq('merchant_id', merchantId)
  .eq('is_available', true);
if (iErr) throw iErr;

const snap = convertMerchantMenu({
  menuId,
  version: 0,
  categories: categories || [],
  items: items || [],
});

const { error } = await sb
  .from('menus')
  .update({ draft_snapshot: snap, updated_at: new Date().toISOString() })
  .eq('id', menuId);
if (error) throw error;

console.log(`Wrote Domino draft with ${snap.products.length} products`);
