import React from 'react';
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Separator } from "../ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Check, AlertCircle, TrendingUp, Download, Upload, Filter, Plus, Users } from "lucide-react";

export function DesignSystem() {
  return (
    <div className="space-y-10 pb-20">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Design System & Foundation</h1>
        <p className="text-lg text-slate-500 dark:text-slate-400">
          Visual identity, typography, and core components for Roam Fleet Management.
        </p>
      </div>

      <Separator />

      {/* Section 1: Colors */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">1. Color Palette</h2>
        <p className="text-slate-500">
          We use a professional Indigo primary theme with semantic colors for financial data.
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <ColorSwatch name="Primary" className="bg-indigo-600" text="text-white" label="Indigo 600" />
          <ColorSwatch name="Primary Light" className="bg-indigo-100" text="text-indigo-900" label="Indigo 100" />
          <ColorSwatch name="Success" className="bg-emerald-500" text="text-white" label="Emerald 500" />
          <ColorSwatch name="Warning" className="bg-amber-500" text="text-white" label="Amber 500" />
          <ColorSwatch name="Destructive" className="bg-rose-500" text="text-white" label="Rose 500" />
          <ColorSwatch name="Neutral" className="bg-slate-900" text="text-white" label="Slate 900" />
        </div>
      </section>

      {/* Section 2: Typography */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">2. Typography</h2>
        <Card>
          <CardContent className="p-6 space-y-6">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">Heading 1</h1>
              <span className="text-xs text-slate-400">text-4xl font-extrabold (Page Titles)</span>
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Heading 2</h2>
              <span className="text-xs text-slate-400">text-3xl font-semibold (Section Headers)</span>
            </div>
            <div>
              <h3 className="text-2xl font-semibold tracking-tight">Heading 3</h3>
              <span className="text-xs text-slate-400">text-2xl font-semibold (Card Titles)</span>
            </div>
            <div>
              <p className="leading-7 [&:not(:first-child)]:mt-6">
                The quick brown fox jumps over the lazy dog. This is the standard body text used for descriptions and general content.
                Roam aims to provide <span className="font-semibold text-indigo-600">clarity and control</span> for fleet managers.
              </p>
              <span className="text-xs text-slate-400">text-base leading-7 (Body)</span>
            </div>
            <div>
              <p className="text-sm text-slate-500">
                This is small text, typically used for metadata, captions, or less important information.
              </p>
              <span className="text-xs text-slate-400">text-sm text-slate-500 (Metadata)</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Section 3: Interactive Components */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">3. Core Components</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Buttons */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Buttons</h3>
            <div className="flex flex-wrap gap-2">
              <Button>Primary Action</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm">Small</Button>
              <Button>Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon"><Plus className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Badges */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Status Badges</h3>
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge className="bg-emerald-500 hover:bg-emerald-600">Active</Badge>
              <Badge className="bg-amber-500 hover:bg-amber-600">Pending</Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Data Density (Cards & Tables) */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">4. Data Visualization & Lists</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* KPI Card Example */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <span className="text-slate-500 font-bold">$</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$45,231.89</div>
              <p className="text-xs text-slate-500 flex items-center mt-1">
                <TrendingUp className="text-emerald-500 h-3 w-3 mr-1" />
                <span className="text-emerald-500 font-medium">+20.1%</span>
                <span className="ml-1">from last month</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
              <Users className="h-4 w-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+2350</div>
              <p className="text-xs text-slate-500 flex items-center mt-1">
                <span className="text-slate-500 font-medium">+180</span>
                <span className="ml-1">new this week</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Issues</CardTitle>
              <AlertCircle className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">12</div>
              <p className="text-xs text-slate-500 flex items-center mt-1">
                <span className="text-rose-500 font-medium">Requires attention</span>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Data Table Example */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Driver Performance</CardTitle>
                <CardDescription>Recent trip data and ratings.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Filter className="mr-2 h-4 w-4" /> Filter
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" /> Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                  <TableHead className="text-right">Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Liam Johnson</TableCell>
                  <TableCell>
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 shadow-none border-0">Online</Badge>
                  </TableCell>
                  <TableCell>Uber</TableCell>
                  <TableCell className="text-right font-medium">$1,250.00</TableCell>
                  <TableCell className="text-right">4.9</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Olivia Smith</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-slate-500 border-slate-200">Offline</Badge>
                  </TableCell>
                  <TableCell>Lyft</TableCell>
                  <TableCell className="text-right font-medium">$940.50</TableCell>
                  <TableCell className="text-right">4.8</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Noah Williams</TableCell>
                  <TableCell>
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 shadow-none border-0">On Trip</Badge>
                  </TableCell>
                  <TableCell>Bolt</TableCell>
                  <TableCell className="text-right font-medium">$1,105.25</TableCell>
                  <TableCell className="text-right">4.7</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Section 5: Forms */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">5. Input Forms</h2>
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" placeholder="name@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <div className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                   <span className="text-slate-500">Select a role...</span>
                   <span className="opacity-50">▼</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="file">Upload Data</Label>
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 cursor-pointer transition-colors">
                  <Upload className="h-8 w-8 text-slate-400 mb-2" />
                  <p className="text-sm font-medium text-slate-700">Drag files here or click to upload</p>
                  <p className="text-xs text-slate-400 mt-1">Supports CSV, XLS from Uber, Lyft</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ColorSwatch({ name, className, text, label }: { name: string, className: string, text: string, label: string }) {
  return (
    <div className="space-y-1.5">
      <div className={`h-24 w-full rounded-lg shadow-sm flex items-end p-2 ${className}`}>
        <span className={`text-xs font-mono font-medium ${text}`}>{label}</span>
      </div>
      <p className="text-sm font-medium text-slate-900">{name}</p>
    </div>
  );
}