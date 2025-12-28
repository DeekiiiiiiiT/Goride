# How the System Works

This application is a Fleet Management System designed for tracking vehicle metrics, maintenance, financials, and toll tags.

## Architecture

- **Frontend**: React + Tailwind CSS (using shadcn/ui components).
- **Backend**: Supabase Edge Functions (Hono server) acting as a REST API.
- **Database**: Supabase KV Store (Redis-like key-value storage).
- **Storage**: Supabase Storage for document uploads.

## Key Modules

### 1. Vehicles
- **List View**: Overview of all vehicles with status, utilization, and quick actions.
- **Detail View**: Comprehensive dashboard for a single vehicle including:
    - **Performance**: Earnings per hour/trip, fuel efficiency.
    - **Financials**: P&L, expense breakdown.
    - **Maintenance**: Service history, upcoming service predictions (based on odometer).
    - **Documents**: Management of Registration, Fitness, Insurance, etc.
    - **Toll Tag**: Link/Unlink JRC/T-Tag transponders.

### 2. Toll Tags (Inventory)
- **Centralized Inventory**: Manage a pool of toll tags independent of vehicles.
- **Assignment**: Assign tags to vehicles. This updates both the Tag record (setting `assignedVehicleId`) and the Vehicle record (setting `tollTagId`).
- **Management**: Add, Edit, Delete, and track status (Active, Lost, Damaged).

### 3. Drivers
- **Driver Portal**: Simplified view for drivers to log fuel and service requests.
- **Performance**: Track driver earnings and efficiency.

### 4. Financials
- **General Ledger**: Track income and expenses.
- **Budgets**: Set monthly budgets for maintenance and fuel.

## Data Flow
1. **Frontend** calls API endpoints defined in `services/api.ts`.
2. **API** (`supabase/functions/server/index.tsx`) handles logic and interacts with KV Store.
3. **KV Store** persists data as JSON blobs.

## Recent Updates (Toll Tag System)
- Moved from simple string fields on Vehicle to a relational model.
- **TollTag Entity**: Contains `provider`, `tagNumber`, `status`.
- **Linking**: When a tag is assigned, the system ensures referential integrity by updating both the TollTag and Vehicle entities.
- **Unlinking**: Can be done from the Toll Tag Inventory list or the Vehicle Detail page.

## Authentication
- Supabase Auth is used for user management.
- API requests are secured via Bearer tokens (public anon key for now, expandable to RLS).

## Deployment
- Frontend is built with Vite.
- Backend functions are deployed to Supabase Edge Functions.
