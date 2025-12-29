Simple Fleet App User Management

Project Context
App Type: Fleet Management App
Module: User Management for Drivers
Goal: Basic driver account control (create, login/logout) for a new app
Complexity: Minimal, functional MVP design



=======================================================================>
Screens to Design

1. Dashboard / Main View
Header: "Driver Management"

Stats Cards:

"Total Drivers: 12" (number badge)

"Active Now: 8" (green indicator)

"On Duty: 5" (blue indicator)

Driver List Table:

Columns: Photo/Initials, Name, Status (Online/Offline), Last Login, Actions

Each row has: Toggle (Active/Inactive), Login/Logout button, Edit icon

Floating Action Button (FAB): "+ Add Driver" (bottom right)
=======================================================================>


2. Add/Edit Driver Screen
Header: "Add New Driver" / "Edit Driver" with back arrow

Form Fields:

First Name (text input)

Last Name (text input)

Email (email input)

Phone (tel input)

License Number (text input)

License Expiry Date (date picker)

Toggle Switch: "Account Active" (on/off)

Buttons: "Save Driver" (primary), "Cancel" (secondary)

=======================================================================>


3. Driver Detail View
Driver Card:

Large profile photo/avatar

Full name (prominent)

Contact info (email, phone)

License info

Account status badge

Quick Actions:

"Send Login Link" button

"Force Logout" button (red, for emergencies)

"Reset Password" button

Activity Log:

Last 5 login/logout timestamps

Simple list with date/time and IP (optional)
=======================================================================>


4. Login/Status Management
Bulk Actions Bar (when selecting multiple drivers):

"Activate Selected" / "Deactivate Selected"

"Send Login Reminder to All"

Status Indicators:

Green dot = Logged in

Gray dot = Logged out

Red dot = Account disabled

One-tap Login Control: Toggle per driver row to force login/logout state

Design Specifications
Components to Create:
Driver Card (list view version)

Driver Form (modal or full screen)

Status Badges (Online, Offline, Disabled)

Action Buttons (Primary, Secondary, Danger variants)

Empty State (for no drivers added yet)

Visual Style:
Colors: Professional blue/grays (primary: #2563EB, secondary: #6B7280)

Spacing: Consistent 16px padding, 8px gaps

Typography: Clear hierarchy (Title: 20px, Body: 16px, Labels: 14px)

Icons: Simple line icons for actions (edit, delete, login, logout)

Interactions:
Row Click → Driver Detail view

Status Toggle → Immediate visual feedback

Login/Logout Button → Confirmation toast/message

Form Submission → Success message + return to list

User Flow
text
Dashboard → [Add Driver] → Form → Save → Back to Dashboard
Dashboard → [Click Driver] → Detail View → [Edit/Login/Logout Actions]
Dashboard → [Bulk Select] → Mass Status Update
Notes for Designer
Focus on clarity over aesthetics - this is an internal tool

Make status immediately visible at a glance

Ensure touch targets are large enough for mobile (44px min)

Include loading states for async actions (login/logout)

Consider accessibility: color contrast, screen reader labels

