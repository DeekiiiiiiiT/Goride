# Driver Portal Redesign Plan

This plan outlines the transformation of the Driver Portal from a simple Tab-based interface to a high-fidelity, mobile-first navigation experience with colorful gradient menus and deep-linking capabilities.

### Phase 1: Component Architecture & Design System
**Goal:** Create the reusable UI building blocks (cards, headers, icons) to ensure a consistent "High Fidelity" look.
- [ ] **Step 1:** Create `components/driver-portal/ui/DriverGradientCard.tsx`.
    -   **Props:** `title`, `subtitle`, `icon` (Lucide), `gradient` (string class), `onClick`.
    -   **Style:** Large rounded corners (`rounded-2xl`), shadow-lg, white text on colorful gradient backgrounds.
    -   **Layout:** Flex column, icon top-left (large), text bottom-left.
- [ ] **Step 2:** Create `components/driver-portal/ui/DriverHeader.tsx`.
    -   **Props:** `title`, `onBack` (optional function), `showProfile` (boolean).
    -   **Style:** Minimalist, sticky top, transparent backdrop blur.
    -   **Logic:** If `onBack` is present, show a ChevronLeft icon. If not, show the standard menu/profile trigger.
- [ ] **Step 3:** Define a "Theme Configuration" object in a new file `components/driver-portal/theme.ts`.
    -   **Content:** Define specific Tailwind gradient strings for each category (e.g., Claims = Purple/Pink, Expenses = Blue/Cyan, Fuel = Orange/Amber).

### Phase 2: Main Menu Implementation (Home Screen)
**Goal:** Build the top-level landing screen that replaces the current Tabs.
- [ ] **Step 1:** Create `components/driver-portal/views/PortalHome.tsx`.
    -   **Props:** `onNavigate(view: string)`.
- [ ] **Step 2:** Implement the Grid Layout.
    -   **Container:** `div` with `grid grid-cols-2 gap-4 p-4`.
- [ ] **Step 3:** Add the primary navigation cards using `DriverGradientCard`.
    -   **Card 1:** "Reimbursements" (Gradient: Violet/Purple) -> Triggers `onNavigate('menu-reimbursements')`.
    -   **Card 2:** "My Expenses" (Gradient: Blue/Cyan) -> Triggers `onNavigate('feature-expenses')`.
    -   **Card 3:** "Fuel & MPG" (Gradient: Amber/Orange) -> Triggers `onNavigate('feature-fuel')`.
    -   **Card 4:** "History" (Gradient: Emerald/Teal) -> Triggers `onNavigate('menu-history')`.

### Phase 3: Sub-Menu Implementation (Reimbursements)
**Goal:** Create the specific sub-menu for Claims (Tolls, Wait Time, etc.) seen in "Screenshot 2".
- [ ] **Step 1:** Create `components/driver-portal/views/ReimbursementMenu.tsx`.
    -   **Props:** `onNavigate(view: string)`.
- [ ] **Step 2:** Implement a List/Grid layout tailored for sub-options.
    -   **Layout:** `grid grid-cols-1 gap-3 p-4`.
- [ ] **Step 3:** Add detailed navigation cards.
    -   **Item 1:** "Toll Refunds" (Icon: Ticket) -> `onNavigate('claim-tolls')`.
    -   **Item 2:** "Wait Time" (Icon: Clock) -> `onNavigate('claim-wait')`.
    -   **Item 3:** "Cleaning Fee" (Icon: Sparkles) -> `onNavigate('claim-cleaning')`.
    -   **Item 4:** "My Claims History" (Icon: FileText) -> `onNavigate('claim-history')`.

### Phase 4: Navigation State Orchestration
**Goal:** Refactor the main container to handle switching between these new views.
- [ ] **Step 1:** Open `components/driver-portal/DriverExpenses.tsx`.
- [ ] **Step 2:** Refactor the component to use a robust state machine instead of Tabs.
    -   **State:** `const [currentView, setCurrentView] = useState('home')`.
- [ ] **Step 3:** Implement the render logic.
    -   Create a function `renderContent()` that switches on `currentView`.
    -   Case `'home'`: Render `<PortalHome />`.
    -   Case `'menu-reimbursements'`: Render `<ReimbursementMenu />`.
    -   Case `'feature-expenses'`: Render `<ExpenseLogger />`.
    -   Case `'feature-fuel'`: Render `<DriverFuelStats />`.
- [ ] **Step 4:** Implement the `DriverHeader` integration.
    -   Calculate `title` and `onBack` logic dynamically based on `currentView`.
    -   Example: If `currentView === 'home'`, `onBack` is undefined. Else, `onBack` sets view to previous parent.

### Phase 5: Deep-Linking Claims Components
**Goal:** Modify the existing `DriverClaims.tsx` to support opening directly to a specific tab without showing the tab bar.
- [ ] **Step 1:** Open `components/driver-portal/DriverClaims.tsx`.
- [ ] **Step 2:** Add props: `interface DriverClaimsProps { initialTab?: string; hideTabs?: boolean; }`.
- [ ] **Step 3:** Update the `Tabs` component usage.
    -   If `hideTabs` is true, do not render `<TabsList>`.
    -   Set `defaultValue` to `initialTab`.
- [ ] **Step 4:** Update `DriverExpenses.tsx` render logic.
    -   Case `'claim-tolls'`: Render `<DriverClaims initialTab="tolls" hideTabs={true} />`.
    -   Case `'claim-wait'`: Render `<DriverClaims initialTab="wait" hideTabs={true} />`.

### Phase 6: Final Polish & Visual Refinements
**Goal:** Ensure the app looks "High Fidelity" and colorful as requested.
- [ ] **Step 1:** Add "Glassmorphism" effects to the Header.
    -   `bg-white/80 backdrop-blur-md border-b border-slate-100`.
- [ ] **Step 2:** Implement animation transitions between views.
    -   Use `framer-motion` (Motion) for slide-in/slide-out effects if available, or simple CSS transitions.
- [ ] **Step 3:** Verify Mobile Responsiveness.
    -   Ensure touch targets are at least 44px.
    -   Check padding on iPhone SE/small screens.
- [ ] **Step 4:** Clean up unused code.
    -   Remove the old Tabs implementation from `DriverExpenses.tsx`.
