import React, { useEffect, useState } from 'react';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger,
  SheetDescription
} from "../ui/sheet";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Bell, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  X,
  Settings,
  Mail,
  Clock
} from "lucide-react";
import { Notification, NotificationType, NotificationSeverity } from '../../types/data';
import { api } from '../../services/api';
import { Badge } from "../ui/badge";
import { cn } from "../ui/utils";

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchNotifications();
    // Poll every minute
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      let data = await api.getNotifications();
      
      // If no notifications, seed some sample ones for demonstration
      if (data.length === 0) {
        await seedNotifications();
        data = await api.getNotifications();
      }
      
      setNotifications(data);
      setUnreadCount(data.filter(n => !n.read).length);
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    } finally {
      setLoading(false);
    }
  };

  const seedNotifications = async () => {
    const samples: Partial<Notification>[] = [
      {
        type: 'alert',
        severity: 'critical',
        title: 'High Cancellation Rate Detected',
        message: 'Cancellation rate in Downtown zone exceeded 15% in the last hour.',
        read: false,
      },
      {
        type: 'update',
        severity: 'success',
        title: 'Weekly Payout Processed',
        message: 'Your payout of $1,245.50 has been sent to your bank account.',
        read: false,
      },
      {
        type: 'reminder',
        severity: 'warning',
        title: 'Vehicle Inspection Due',
        message: 'Toyota Camry (License 8XYZ123) is due for inspection in 3 days.',
        read: true,
      },
      {
        type: 'info',
        severity: 'info',
        title: 'New Feature: Export Reports',
        message: 'You can now export comprehensive PDF reports from the dashboard.',
        read: false,
      }
    ];

    for (const n of samples) {
      await api.createNotification(n);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await api.markNotificationAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark as read", error);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    for (const n of unread) {
      markAsRead(n.id);
    }
  };

  const getIcon = (severity: NotificationSeverity) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-5 w-5 text-rose-500" />;
      case 'warning': return <Clock className="h-5 w-5 text-amber-500" />;
      case 'success': return <CheckCircle className="h-5 w-5 text-emerald-500" />;
      default: return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:w-[540px] flex flex-col p-0">
        <SheetHeader className="p-6 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle>Notifications</SheetTitle>
            {unreadCount > 0 && (
               <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs">
                 Mark all as read
               </Button>
            )}
          </div>
          <SheetDescription>
            Stay updated with alerts and system messages.
          </SheetDescription>
        </SheetHeader>
        
        <Tabs defaultValue="all" className="flex-1 flex flex-col">
          <div className="px-6 pt-4">
             <TabsList className="w-full justify-start">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
              <TabsTrigger value="alerts">Alerts</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all" className="flex-1 p-0 m-0">
            <NotificationList notifications={notifications} onRead={markAsRead} getIcon={getIcon} />
          </TabsContent>
          <TabsContent value="unread" className="flex-1 p-0 m-0">
            <NotificationList notifications={notifications.filter(n => !n.read)} onRead={markAsRead} getIcon={getIcon} />
          </TabsContent>
           <TabsContent value="alerts" className="flex-1 p-0 m-0">
            <NotificationList notifications={notifications.filter(n => n.type === 'alert')} onRead={markAsRead} getIcon={getIcon} />
          </TabsContent>
        </Tabs>

        <div className="p-4 border-t bg-slate-50 dark:bg-slate-900 mt-auto">
          <Button variant="outline" className="w-full" size="sm">
            <Settings className="mr-2 h-4 w-4" />
            Notification Preferences
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NotificationList({ notifications, onRead, getIcon }: { notifications: Notification[], onRead: (id: string) => void, getIcon: (s: NotificationSeverity) => React.ReactNode }) {
  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">
        <Mail className="h-12 w-12 mb-4 opacity-20" />
        <p>No notifications to show</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-200px)]">
      <div className="flex flex-col divide-y">
        {notifications.map((notification) => (
          <div 
            key={notification.id} 
            className={cn(
              "p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex gap-4 items-start",
              !notification.read ? "bg-slate-50/50 dark:bg-slate-800/30" : ""
            )}
          >
            <div className="mt-1 flex-shrink-0">
              {getIcon(notification.severity)}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <p className={cn("text-sm font-medium", !notification.read ? "text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-400")}>
                  {notification.title}
                </p>
                <span className="text-xs text-slate-400 whitespace-nowrap ml-2">
                  {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                {notification.message}
              </p>
              {!notification.read && (
                <Button 
                  variant="link" 
                  size="sm" 
                  className="px-0 h-auto text-xs text-indigo-600"
                  onClick={() => onRead(notification.id)}
                >
                  Mark as read
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
