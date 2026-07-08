# Toll Geofence — Component Inventory

## TollFareBreakdownSheet

**Props:** `open`, `onClose`, `currency`, `breakdown`, `plazas?`, `state: 'loading' | 'empty' | 'error' | 'data'`  
**Breakpoints:** mobile-first; sheet max-width 480px on tablet  
**A11y:** 44px tap targets; info tooltip for toll disclaimer

## LiveTollBanner

**Props:** `variant: 'rider' | 'driver'`, `crossings`, `totalMinor`, `currency`, `state`  
**Breakpoints:** full-width above map/panel  
**A11y:** role="status" for live updates

## TripTollReceiptSection

**Props:** `baseMinor`, `actualTollsMinor`, `estimatedTollsMinor`, `waitTimeMinor`, `totalMinor`, `currency`  
**Shows:** toll credit when estimated > actual

## DriverTollToast

**Props:** `plazaName`, `amountMinor`, `currency`, `tripTotalMinor`, `onDismiss`  
**Pattern:** sonner toast + optional persistent chip

## AdminLiveTollMonitor

**Props:** `trips`, `filter`, `onFilterChange`, `onSelectTrip`, `state`  
**Columns:** Status, Last GPS, Tolls (count + JMD), Last plaza, Flag

## AdminTripTollDrawer

**Props:** `rideId`, `crossings`, `onOpenPlaza`, `onClose`  
**Desktop:** 400px side drawer

## GeofenceMatchBadge

**Props:** `status: 'confirmed' | 'none' | 'mismatch'`  
**Fleet:** inline chip in TollDetailOverlay
