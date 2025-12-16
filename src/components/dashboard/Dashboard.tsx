import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Users, 
  DollarSign, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Car, 
  AlertCircle, 
  Calendar,
  Download
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

// Mock Data
const earningsData = [
  { name: 'Mon', revenue: 4000 },
  { name: 'Tue', revenue: 3000 },
  { name: 'Wed', revenue: 2000 },
  { name: 'Thu', revenue: 2780 },
  { name: 'Fri', revenue: 1890 },
  { name: 'Sat', revenue: 2390 },
  { name: 'Sun', revenue: 3490 },
];

const platformData = [
  { name: 'Uber', value: 45 },
  { name: 'Lyft', value: 30 },
  { name: 'Bolt', value: 15 },
  { name: 'Other', value: 10 },
];

const COLORS = ['#4f46e5', '#818cf8', '#fbbf24', '#cbd5e1'];

export function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Dashboard</h2>
          <p className="text-slate-500 dark:text-slate-400">
            Overview of your fleet's performance and financial health.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Calendar className="mr-2 h-4 w-4" />
            Last 7 Days
          </Button>
          <Button>
            <Download className="mr-2 h-4 w-4" />
            Download Report
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="realtime">Real-time</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          {/* KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard 
              title="Total Revenue" 
              value="$45,231.89" 
              icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
              trend="+20.1%"
              trendUp={true}
              description="from last month"
            />
            <KpiCard 
              title="Active Drivers" 
              value="2,350" 
              icon={<Users className="h-4 w-4 text-indigo-600" />}
              trend="+180"
              trendUp={true}
              description="new this week"
            />
            <KpiCard 
              title="Total Trips" 
              value="12,234" 
              icon={<Car className="h-4 w-4 text-blue-600" />}
              trend="+19%"
              trendUp={true}
              description="from last month"
            />
            <KpiCard 
              title="Fleet Utilization" 
              value="87%" 
              icon={<Activity className="h-4 w-4 text-orange-600" />}
              trend="-2.5%"
              trendUp={false}
              description="from last week"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
            {/* Main Chart */}
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Revenue Overview</CardTitle>
                <CardDescription>
                  Daily revenue across all platforms for the current week.
                </CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <div className="flex justify-center overflow-x-auto">
                    <AreaChart width={600} height={300} data={earningsData}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis 
                        dataKey="name" 
                        stroke="#888888" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                      />
                      <YAxis 
                        stroke="#888888" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(value) => `$${value}`} 
                      />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => [`$${value}`, 'Revenue']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="#4f46e5" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorRevenue)" 
                      />
                    </AreaChart>
                </div>
              </CardContent>
            </Card>

            {/* Secondary Chart */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Platform Share</CardTitle>
                <CardDescription>
                  Trip volume distribution by provider.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-center overflow-x-auto">
                    <PieChart width={300} height={300}>
                      <Pie
                        data={platformData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {platformData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Bottom Row: Recent Activity & Alerts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest driver actions and system events.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                        <Users className="h-4 w-4 text-slate-500" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">New driver onboarded</p>
                        <p className="text-xs text-slate-500">Alex Johnson joined the fleet</p>
                      </div>
                      <div className="text-xs text-slate-400">2h ago</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
               <CardHeader>
                <CardTitle>System Alerts</CardTitle>
                <CardDescription>Issues requiring immediate attention.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                   <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-100 rounded-md">
                     <AlertCircle className="h-5 w-5 text-rose-500 mt-0.5" />
                     <div>
                       <h4 className="text-sm font-medium text-rose-900">Payment Failed</h4>
                       <p className="text-xs text-rose-700 mt-1">Weekly payout for Group B failed due to banking error.</p>
                     </div>
                   </div>
                   <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-md">
                     <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                     <div>
                       <h4 className="text-sm font-medium text-amber-900">High Cancellation Rate</h4>
                       <p className="text-xs text-amber-700 mt-1">Abnormal cancellation spike detected in Downtown zone.</p>
                     </div>
                   </div>
                </div>
              </CardContent>
            </Card>
          </div>

        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ title, value, icon, trend, trendUp, description }: { title: string, value: string, icon: React.ReactNode, trend: string, trendUp: boolean, description: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
        <p className="text-xs text-slate-500 flex items-center mt-1">
          {trendUp ? (
            <TrendingUp className="text-emerald-500 h-3 w-3 mr-1" />
          ) : (
            <TrendingDown className="text-rose-500 h-3 w-3 mr-1" />
          )}
          <span className={trendUp ? "text-emerald-500 font-medium" : "text-rose-500 font-medium"}>
            {trend}
          </span>
          <span className="ml-1 text-slate-400">{description}</span>
        </p>
      </CardContent>
    </Card>
  );
}
