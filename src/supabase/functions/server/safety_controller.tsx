import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const safetyApp = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Phase 5: Rolling 30-Day Efficiency Baseline
safetyApp.get("/make-server-37f42386/fleet/efficiency-baseline", async (c) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString().split('T')[0];

    // 1. Fetch Fuel Transactions for last 30 days
    const { data: fuelData } = await supabase
      .from("kv_store_37f42386")
      .select("value")
      .like("key", "transaction:%")
      .gte("value->>date", thirtyDaysAgoISO);
    
    const fuelTxs = (fuelData || []).map(d => d.value).filter(t => t.category === 'Fuel' || t.category === 'Fuel Reimbursement');

    // 2. Fetch Trip Logs for last 30 days
    const { data: tripData } = await supabase
      .from("kv_store_37f42386")
      .select("value")
      .like("key", "trip:%")
      .gte("value->>date", thirtyDaysAgoISO);
    
    const trips = (tripData || []).map(d => d.value);

    // 3. Group by Day for Trend Line
    const dailyStats = new Map();
    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        dailyStats.set(dateStr, { distance: 0, fuel: 0, count: 0 });
    }

    trips.forEach(t => {
        const date = t.date;
        if (dailyStats.has(date)) {
            const stats = dailyStats.get(date);
            stats.distance += Number(t.distance) || 0;
            stats.count += 1;
        }
    });

    fuelTxs.forEach(f => {
        const date = f.date;
        if (dailyStats.has(date)) {
            const stats = dailyStats.get(date);
            stats.fuel += (Number(f.quantity) || Number(f.metadata?.fuelVolume) || 0);
        }
    });

    const trend = Array.from(dailyStats.entries())
        .map(([date, stats]) => ({
            date,
            efficiency: stats.fuel > 0 ? Number((stats.distance / stats.fuel).toFixed(2)) : 0,
            distance: stats.distance,
            fuel: stats.fuel
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

    const totalDistance = trips.reduce((sum, t) => sum + (Number(t.distance) || 0), 0);
    const totalFuel = fuelTxs.reduce((sum, f) => sum + (Number(f.quantity) || Number(f.metadata?.fuelVolume) || 0), 0);
    const globalBaseline = totalFuel > 0 ? Number((totalDistance / totalFuel).toFixed(2)) : 0;

    return c.json({
        baseline: globalBaseline,
        period: "30-Day Rolling",
        unit: "km/L",
        trend,
        summary: {
            totalDistance,
            totalFuel,
            tripCount: trips.length,
            fuelTxCount: fuelTxs.length
        }
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Phase 5: Advanced Predictive Fatigue Detection
safetyApp.get("/make-server-37f42386/safety/fatigue-analysis", async (c) => {
  try {
    const driverId = c.req.query("driverId");
    
    // Fetch last 7 days of trips
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString().split('T')[0];

    let query = supabase
      .from("kv_store_37f42386")
      .select("value")
      .like("key", "trip:%")
      .gte("value->>date", sevenDaysAgoISO);
    
    if (driverId) {
        query = query.eq("value->>driverId", driverId);
    }

    const { data: tripData } = await query;
    const trips = (tripData || []).map(d => d.value);

    // Group by driver to analyze patterns
    const driverMetrics = new Map();

    trips.forEach(t => {
        const dId = t.driverId;
        if (!driverMetrics.has(dId)) {
            driverMetrics.set(dId, { 
                id: dId,
                totalHours: 0, 
                nightShiftMinutes: 0, 
                consecutiveDays: new Set(),
                longHauls: 0,
                lastTripEnd: null
            });
        }
        const m = driverMetrics.get(dId);
        const duration = Number(t.duration) || 30; // default 30 mins
        m.totalHours += duration / 60;
        m.consecutiveDays.add(t.date);

        // Analyze time of day (2AM - 5AM is high risk)
        const tripTime = t.requestTime ? new Date(t.requestTime) : new Date(`${t.date} 12:00:00`);
        const hour = tripTime.getHours();
        if (hour >= 2 && hour <= 5) {
            m.nightShiftMinutes += duration;
        }

        if (duration > 240) { // 4+ hour single trip
            m.longHauls += 1;
        }
    });

    const analysis = Array.from(driverMetrics.values()).map(m => {
        let riskScore = 0;
        const reasons = [];

        // Factor 1: Excess Hours (> 50 hrs/week)
        if (m.totalHours > 50) {
            riskScore += 40;
            reasons.push("Excessive weekly hours");
        } else if (m.totalHours > 40) {
            riskScore += 20;
        }

        // Factor 2: Night Driving
        if (m.nightShiftMinutes > 120) {
            riskScore += 30;
            reasons.push("High night-shift exposure (2AM-5AM)");
        }

        // Factor 3: Continuous Operation
        if (m.consecutiveDays.size >= 6) {
            riskScore += 25;
            reasons.push("Lack of rest days (6+ consecutive days)");
        }

        // Factor 4: Long Hauls without breaks
        if (m.longHauls > 0) {
            riskScore += 15 * m.longHauls;
            reasons.push(`${m.longHauls} long-duration trips detected`);
        }

        return {
            driverId: m.id,
            score: Math.min(100, riskScore),
            level: riskScore > 70 ? 'Critical' : riskScore > 40 ? 'Moderate' : 'Low',
            reasons,
            metrics: {
                weeklyHours: Number(m.totalHours.toFixed(1)),
                nightShiftHours: Number((m.nightShiftMinutes / 60).toFixed(1)),
                consecutiveDays: m.consecutiveDays.size
            }
        };
    });

    // If driverId was provided, return just that one, otherwise return top 10 at risk
    if (driverId) {
        return c.json(analysis[0] || { driverId, score: 0, level: 'Low', reasons: [], metrics: { weeklyHours: 0, nightShiftHours: 0, consecutiveDays: 0 } });
    }

    return c.json(analysis.sort((a, b) => b.score - a.score).slice(0, 10));

  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export default safetyApp;
