# Edge Functions API Reference

All endpoints are hosted on the `server` function and prefixed with `/make-server-37f42386`.

## Health Check
- `GET /health` - Service status check

## Trips Management
- `GET /trips` - List all trips (supports limit/offset)
- `POST /trips` - Create or sync trips
- `DELETE /trips` - Bulk delete all trips (and related data)
- `DELETE /trips/:id` - Delete a specific trip

## Drivers & Users
- `GET /drivers` - List all drivers
- `POST /drivers` - Create/Update driver profile
- `GET /users` - List all Auth users (Admin)
- `POST /invite-user` - Invite/Create a new user
- `POST /delete-user` - Delete a user and driver profile
- `GET /driver-metrics` - Get aggregated driver metrics
- `POST /driver-metrics` - Save driver metrics

## Vehicles & Fleet
- `GET /vehicles` - List all vehicles
- `POST /vehicles` - Create/Update vehicle
- `DELETE /vehicles/:id` - Delete a vehicle
- `GET /vehicle-metrics` - Get aggregated vehicle metrics
- `POST /vehicle-metrics` - Save vehicle metrics
- `GET /odometer-history/:vehicleId` - Get odometer history
- `POST /odometer-history` - Add odometer reading
- `DELETE /odometer-history/:id` - Delete odometer reading
- `GET /equipment/:vehicleId` - Get vehicle equipment
- `POST /equipment` - Add/Update equipment
- `DELETE /equipment/:vehicleId/:id` - Remove equipment

## Transactions & Finance
- `GET /transactions` - List all transactions
- `POST /transactions` - Create transaction
- `DELETE /transactions/:id` - Delete transaction
- `POST /expenses/approve` - Approve expense transaction
- `POST /expenses/reject` - Reject expense transaction
- `GET /financials` - Get organization financial summary
- `POST /financials` - Update organization financial summary
- `GET /budgets` - List budgets
- `POST /budgets` - Create/Update budget
- `GET /fixed-expenses/:vehicleId` - List fixed expenses for vehicle
- `POST /fixed-expenses` - Create/Update fixed expense
- `DELETE /fixed-expenses/:vehicleId/:id` - Delete fixed expense
- `GET /claims` - List insurance/damage claims
- `POST /claims` - Create/Update claim
- `DELETE /claims/:id` - Delete claim

## Fuel Management
- `GET /fuel-cards` - List fuel cards
- `POST /fuel-cards` - Add/Update fuel card
- `DELETE /fuel-cards/:id` - Delete fuel card
- `GET /fuel-entries` - List fuel logs
- `POST /fuel-entries` - Add fuel log
- `DELETE /fuel-entries/:id` - Delete fuel log
- `GET /fuel-disputes` - List fuel disputes
- `POST /fuel-disputes` - Create fuel dispute
- `DELETE /fuel-disputes/:id` - Delete fuel dispute
- `GET /mileage-adjustments` - List mileage adjustments
- `POST /mileage-adjustments` - Create adjustment
- `DELETE /mileage-adjustments/:id` - Delete adjustment

## Tolls
- `GET /toll-tags` - List toll tags
- `POST /toll-tags` - Add/Update toll tag
- `DELETE /toll-tags/:id` - Delete toll tag

## Maintenance
- `GET /maintenance-logs/:vehicleId` - List maintenance logs
- `POST /maintenance-logs` - Add maintenance log

## Notifications & Alerts
- `GET /notifications` - List notifications
- `POST /notifications` - Create notification
- `PATCH /notifications/:id/read` - Mark notification as read
- `GET /alert-rules` - List alert rules
- `POST /alert-rules` - Create/Update alert rule
- `DELETE /alert-rules/:id` - Delete alert rule

## Data Management (Batches & Admin)
- `GET /batches` - List import batches
- `POST /batches` - Create batch record
- `DELETE /batches/:id` - Delete batch and all associated data
- `POST /admin/preview-reset` - Preview data for deletion/reset
- `POST /admin/reset-by-date` - Execute data reset/deletion
- `POST /upload` - Upload file to storage (creates signed URL)
- `GET /settings/integrations` - Get integration settings
- `POST /settings/integrations` - Update integration settings
- `GET /settings/preferences` - Get general app preferences
- `POST /settings/preferences` - Update preferences
- `POST /fleet/sync` - Bulk sync complete fleet state (Drivers, Vehicles, Trips, etc.)

## AI & Intelligence Services
- `POST /parse-document` - AI parsing of Driver Docs (License, ID, etc.)
- `POST /parse-invoice` - AI parsing of Vehicle Invoices
- `POST /parse-inspection` - AI parsing of Vehicle Inspection Reports
- `POST /scan-receipt` - AI parsing of general receipts
- `POST /ai/map-csv` - AI Helper to map CSV headers
- `POST /analyze-fleet` - AI Agent for complex fleet analysis
- `POST /generate-vehicle-image` - Generate vehicle studio image (Gemini/DALL-E)
- `POST /ai/parse-toll-csv` - Parse toll data from CSV/Text
- `POST /ai/parse-toll-image` - Parse toll data from Images
- `POST /map-match` - Map matching via OSRM (Proxy)
- `GET /performance-report` - Generate driver performance report

## Third-Party Integrations
### Uber
- `GET /uber/auth-url` - Generate OAuth URL
- `POST /uber/exchange` - Exchange OAuth code for tokens
- `GET /uber/callback` - Legacy callback handler
- `POST /uber/sync` - Sync Uber trip history



---------

Based on your API structure, I'd recommend organizing your Edge Functions into **5-7 separate functions** rather than one monolithic function. Here's the optimal breakdown:

## Recommended Structure (5 Functions)

### 1. **Core Fleet Management** - `fleet-management`
```
GET/POST/DELETE /trips
GET/POST /drivers
GET/POST/DELETE /vehicles
GET/POST /driver-metrics
GET/POST /vehicle-metrics
GET/POST/DELETE /equipment
POST /fleet/sync
```

### 2. **Financial Operations** - `financial-operations`
```
GET/POST/DELETE /transactions
POST /expenses/approve
POST /expenses/reject
GET/POST /financials
GET/POST /budgets
GET/POST/DELETE /fixed-expenses
GET/POST/DELETE /claims
```

### 3. **Fuel & Maintenance** - `fuel-maintenance`
```
GET/POST/DELETE /fuel-cards
GET/POST/DELETE /fuel-entries
GET/POST/DELETE /fuel-disputes
GET/POST/DELETE /mileage-adjustments
GET/POST/DELETE /odometer-history
GET/POST /maintenance-logs
GET/POST/DELETE /toll-tags
```

### 4. **AI & Intelligence** - `ai-services` (Most valuable to separate!)
```
POST /parse-document
POST /parse-invoice
POST /parse-inspection
POST /scan-receipt
POST /ai/map-csv
POST /analyze-fleet
POST /generate-vehicle-image
POST /ai/parse-toll-csv
POST /ai/parse-toll-image
POST /map-match
GET /performance-report
```

### 5. **Admin & Data Management** - `admin-operations`
```
GET/POST/DELETE /batches
POST /admin/preview-reset
POST /admin/reset-by-date
GET/POST /settings/integrations
GET/POST /settings/preferences
POST /upload
GET/POST /users
POST /invite-user
POST /delete-user
GET/POST /notifications
PATCH /notifications/:id/read
GET/POST/DELETE /alert-rules
```

### 6. **Third-Party Integrations** (Optional separate function) - `integrations`
```
GET /uber/auth-url
POST /uber/exchange
GET /uber/callback
POST /uber/sync
```

### 7. **Health Check** (Could be part of any function)
```
GET /health
```

## Why This Structure?

### **Benefits:**
1. **Independent Scaling**: AI services will have very different resource needs than simple CRUD operations
2. **Faster Deployments**: Smaller functions = quicker updates
3. **Better Cost Management**: You can set specific memory/timeouts per function type
4. **Isolated Failures**: One function's issue won't take down your entire API
5. **Team Organization**: Different teams can own different services

### **Memory/Timeout Recommendations:**
- **AI Services**: 2048MB+ memory, 60-120s timeout
- **Core Operations**: 1024MB memory, 30s timeout  
- **Admin Operations**: 1024MB memory, 30s timeout
- **Financial/Fuel**: 1024MB memory, 30s timeout
- **Integrations**: 1024MB memory, 30s timeout

### **Alternative: 3-Function Approach**
If you want to keep it simpler:
1. **Core API** (All non-AI endpoints)
2. **AI Services** (All AI endpoints)
3. **Integrations** (Uber, etc.)

### **Current Single Function Issues:**
- **Cold starts affect all endpoints**
- **AI processing blocks simple CRUD operations**
- **Harder to debug and monitor specific areas**
- **Noisy logs with mixed traffic types**

### **Implementation Strategy:**
```bash
# Step-by-step migration
supabase functions deploy fleet-management
supabase functions deploy financial-operations
supabase functions deploy fuel-maintenance
supabase functions deploy ai-services
supabase functions deploy admin-operations

# Update your client to use specific function endpoints
# Keep the old function temporarily during transition
```

### **Cost Considerations:**
- Supabase charges per invocation and GB-seconds
- Separating high-compute AI endpoints saves money
- Smaller functions = better resource utilization
- You can disable unused functions during development

### **Monitoring Setup:**
```sql
-- Create separate logging for each function
-- Track invocations, errors, and performance per service
```

**Recommendation**: Start with 5 functions as outlined above. This gives you the best balance of maintainability, performance, and cost efficiency. The AI services absolutely deserve their own function due to their different resource requirements.

