# FIGMA DESIGN PROMPT: Vehicle Fleet Expense Management System Redesign

## PROJECT OVERVIEW
**Current Problem:** Our vehicle expense system works well for single vehicles but becomes inefficient when managing 50+ vehicles. Users currently need to navigate to each vehicle individually to add/update expenses, creating repetitive work and no fleet-wide visibility.

**Goal:** Transform from single-vehicle expense tracking to comprehensive fleet management with bulk operations, inventory tracking, and global visibility.

---

## DESIGN PHASES

### **PHASE 1: FLEET DASHBOARD (WEEK 1)**

**Primary Screen: Fleet Expense Dashboard**
```
Design a dashboard that gives managers immediate visibility across all vehicles at once.

**Top Section - Key Metrics Cards:**
- 4 stat cards in a horizontal row
1. "Total Asset Value" - $ icon, large number with currency format
2. "Vehicles Equipped" - Car icon, count of vehicles with active equipment
3. "Upcoming Renewals" - Alert/bell icon, count of items expiring soon
4. "Inventory Value" - Warehouse icon, value of unassigned equipment

**Middle Section - Global Filters:**
- Multiple vehicle selector (dropdown with checkboxes)
- Date range picker (with presets: This Month, Last Quarter, Year-to-Date)
- Search bar for equipment names
- "Export Report" button

**Main Content Area - Tab Navigation:**
[Fleet Overview] [Bulk Operations] [Inventory] [Alerts] [Templates]

**Fleet Overview Tab Content:**
- Table with columns: Equipment Name → Vehicle ID (clickable) → Category → Status → Cost → Purchase Date → Actions (Edit/Remove)
- Each row represents one piece of equipment on one vehicle
- Color coding for status: Green = Active, Yellow = Expiring Soon, Red = Expired
```

**Wireframe Priority:** This is the main control center - should feel like a command dashboard with clear hierarchy.

---

### **PHASE 2: BULK OPERATIONS WIZARD (WEEK 2)**

**Design a multi-step modal/wizard for applying equipment to multiple vehicles at once:**

```
**Step 1: Select Vehicles**
- Left panel: List of all vehicles with checkboxes
- Right panel: Preview of selected count ("50 vehicles selected")
- Quick selection buttons: "Select All Active", "Select by Type", "Clear All"
- Vehicle groups organized by type/status

**Step 2: Choose Equipment**
- Three option cards:
  Option A: "From Template" - dropdown of predefined kits
  Option B: "Individual Items" - multi-select dropdown with categories
  Option C: "From Inventory" - shows available stock with quantities
  
- When template selected: show preview of included items
- Visual: Equipment cards with icons, names, quantities

**Step 3: Configure Details**
- Date picker: "Installation Date" (with "Today" quick option)
- Cost field: "Cost per Vehicle" (with "Use default price" checkbox)
- Notes field: "Installation notes"
- Preview section: "This will add [X items] to [Y vehicles]"

**Step 4: Review & Confirm**
- Summary screen: "You are about to add:"
  Left column: List of selected vehicles (truncated with "show all")
  Right column: List of equipment items with quantities
- Total cost calculation
- "Confirm & Apply" button (large, prominent)
```

**Visual Cue:** Show progress indicator at top (Step 1 of 4 → Step 2 of 4, etc.)

---

### **PHASE 3: INVENTORY MANAGEMENT (WEEK 3)**

**Primary Screen: Inventory Dashboard**
```
**Top Bar Actions:**
- "Add New Stock" button
- "Scan Items" button (barcode scanner icon)
- Filter by: Location, Category, Low Stock

**Inventory Table:**
Columns: Item Name → Category → Quantity → Location → Value → Reorder Level → Actions

**Visual Indicators:**
- Quantity cell turns orange when below reorder level
- Quantity cell turns red when out of stock
- "Reorder" button appears when low stock

**Right Panel - Item Detail:**
When clicking an inventory item, show:
- Item photo/icon
- Current stock level graph (over time)
- Recent assignments (which vehicles got this recently)
- "Assign to Vehicle" quick action button
```

**Secondary Screen: Inventory Transfer Modal**
```
**From/To Visual Flow:**
[INVENTORY: 5 available] → [arrow] → [VEHICLE SELECTOR]

**Vehicle Selection:**
- Search/filter vehicles
- Selected vehicle shows current equipment

**Quantity Selector:**
- Number input with max limit based on available stock
- "Assign All" button

**Confirmation:**
- Shows inventory count will decrease from 5→4
- Shows vehicle will receive 1 new item
```

---

### **PHASE 4: SMART ALERTS & TEMPLATES (WEEK 4)**

**Alerts Panel Design:**
```
**Alert Categories (as tabs or sections):**
1. Expiring Soon (30-day window)
2. Maintenance Due
3. Low Inventory
4. Unassigned Equipment

**Alert Card Design:**
Each alert shows:
- Alert type icon (warning bell, calendar, inventory, etc.)
- Priority badge: High/Medium/Low
- Short description: "Insurance expires in 14 days"
- Vehicle/Item reference (clickable)
- Due date
- Action button: "Renew Now", "Assign", "Ignore"
- Checkbox for bulk action selection

**Global Alert Summary:**
Badge on main navigation showing total active alerts
```

**Templates Library:**
```
**Template Card Grid:**
Each card shows:
- Template name: "New Vehicle Setup Kit"
- Description: "Standard equipment for all new vehicles"
- Preview: Mini icons of included items
- Vehicle types: Badges for compatible types
- "Use This Template" button

**Template Creation/Edit Screen:**
- Template name and description fields
- "Add Item" button that opens equipment catalog
- Draggable list of included items
- Vehicle type compatibility selector
- Cost estimate calculation
```

---

### **PHASE 5: MOBILE OPTIMIZATION (WEEK 5)**

**Mobile-Specific Screens:**
```
**Scanning Interface:**
- Camera viewfinder overlay
- Scan result popup showing item details
- Quick actions: "Add to Inventory", "Assign to Current Vehicle"

**Field Technician View:**
- Simplified vehicle selection (QR code scan option)
- Quick equipment check-in/check-out
- Photo upload for condition reporting
- Offline capability indication

**Dashboard Mobile Adaptation:**
- Stack metrics cards vertically
- Simplified filters
- Larger touch targets for in-vehicle use
```

---

## VISUAL DESIGN SPECIFICATIONS

### **Color Palette:**
- **Primary**: Professional blue (#2563EB) for actions/headers
- **Secondary**: Green (#10B981) for active/positive states
- **Warning**: Amber (#F59E0B) for expiring soon
- **Alert**: Red (#EF4444) for expired/critical
- **Neutral**: Gray (#6B7280) for inactive/disabled
- **Background**: Light gray (#F9FAFB) for tables

### **Typography:**
- **Headers**: Inter, Bold, 20-24px
- **Body**: Inter, Regular, 14-16px
- **Tables**: Inter, Medium, 13-14px
- **Metrics**: Inter, Bold, 28-32px

### **Component Library Needs:**
1. Vehicle selection component (multi-select with search)
2. Equipment item cards (with status indicators)
3. Bulk action buttons
4. Status badges (Active, Pending, Expired, Low Stock)
5. Progress wizard steps
6. Alert/notification toast system
7. Inventory quantity indicators
8. Cost/number formatting components

### **Interaction Patterns:**
- **Bulk selection**: Shift+click for range, Ctrl+click for multiple
- **Quick actions**: Hover on table rows reveals action buttons
- **Drag & drop**: For template building and inventory transfers
- **Multi-step flows**: Clear back/next progression with save points

---

## USER FLOWS TO DESIGN

### **Flow 1: Adding GPS Trackers to 50 Vehicles**
```
Start → Fleet Dashboard → Bulk Operations tab
→ Step 1: Select All Active Vehicles (50 selected)
→ Step 2: Choose "GPS Tracker Pro" from equipment list
→ Step 3: Set install date to today, use default cost
→ Step 4: Review (shows 50× $199.99 = $9,999.50 total)
→ Confirm → Success message with option to print installation sheets
```

### **Flow 2: Identifying Vehicles Missing Safety Kits**
```
Start → Fleet Dashboard → Filters: Category = "Safety"
→ Sort by Status → Red indicators show expired/missing
→ Select all vehicles missing items → Click "Bulk Assign"
→ Choose "Standard Safety Kit" template → Apply to selected vehicles
```

### **Flow 3: Restocking Inventory**
```
Start → Inventory tab → Filter: Low Stock
→ Select items below reorder level → "Order More" button
→ Generate purchase order → Mark as ordered
→ When delivered: Scan items → Update inventory counts
```

---

## PROTOTYPE REQUIREMENTS

### **High-Fidelity Prototype Should Include:**
1. **Click-through flows** for main user journeys
2. **Interactive filters** showing live results updating
3. **Form validation** states (error, success, loading)
4. **Empty states** for new users/no data
5. **Loading states** for large operations
6. **Success/error toast notifications**
7. **Responsive behavior** (desktop → tablet → mobile)

### **Micro-interactions:**
- Progress indicators during bulk operations
- Smooth transitions between tabs/views
- Visual feedback on hover/click
- Animated status changes (e.g., inventory count decreasing)

---

## DESIGN HANDOFF NOTES

### **For Developers:**
- Export all components as React-ready with proper variants
- Include spacing tokens (4px base unit)
- Document all hover/focus/active states
- Provide animation timing curves (ease-in-out, 300ms standard)
- Include accessibility labels for screen readers

### **Success Metrics This Design Should Achieve:**
1. **Reduce clicks** to add equipment to multiple vehicles from 300+ to under 10
2. **Provide visibility** to expiring items 30 days in advance
3. **Reduce errors** through standardized templates vs free text
4. **Cut inventory waste** through stock level tracking
5. **Save time** on monthly reporting with export features

---

## PRESENTATION TO STAKEHOLDERS

When presenting to leadership, emphasize:
1. **Time Savings**: Current process vs. new process comparison
2. **Risk Reduction**: Alerts prevent expired insurance/registrations
3. **Cost Control**: Bulk purchasing visibility and inventory optimization
4. **Scalability**: System grows easily from 50 to 500 vehicles
5. **Mobile Efficiency**: Field technicians can update in real-time

**Priority Order:** Phase 1 (Dashboard) → Phase 2 (Bulk Ops) → Phase 3 (Inventory) → Phase 4 (Alerts) → Phase 5 (Mobile)

**Timeline:** 5 weeks total design + 2 weeks developer review + implementation in sprints