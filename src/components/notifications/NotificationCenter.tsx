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
  Clock,
  Trash2
} from "lucide-react";
import { Notification, NotificationType, NotificationSeverity } from '../../types/data';
import { api } from '../../services/api';
import { Badge } from "../ui/badge";
import { cn } from "../ui/utils";
import { toast } from 'sonner@2.0.3';

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [persistentAlerts, setPersistentAlerts] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
    // Poll every 45 seconds for Phase 1 backbone
    const interval = setInterval(fetchData, 45000);
    
    // Listen for events to open the center
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-alert-center', handleOpen);

    return () => {
      clearInterval(interval);
      window.removeEventListener('open-alert-center', handleOpen);
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [notifs, alerts] = await Promise.all([
        api.getNotifications().catch(() => []),
        api.getPersistentAlerts().catch(() => [])
      ]);
      
      setNotifications(notifs);
      setPersistentAlerts(alerts);
      
      const totalUnread = notifs.filter(n => !n.read).length + alerts.filter(a => !a.read).length;
      setUnreadCount(totalUnread);
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string, isAlert: boolean = false) => {
    try {
      if (isAlert) {
        await api.acknowledgeAlert(id, false);
        setPersistentAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true, isRead: true } : a));
      } else {
        await api.markNotificationAsRead(id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      }
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark as read", error);
    }
  };

  const dismissAlert = async (id: string) => {
    try {
      await api.acknowledgeAlert(id, true);
      setPersistentAlerts(prev => prev.filter(a => a.id !== id));
      toast.success("Alert dismissed");
      
      // Recalculate unread
      fetchData();
    } catch (error) {
      toast.error("Failed to dismiss alert");
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
            <SheetTitle>Fleet Inbox</SheetTitle>
            <Badge variant="outline" className="ml-2">
              {unreadCount} New
            </Badge>
          </div>
          <SheetDescription>
            Production-ready persistent notifications and critical alerts.
          </SheetDescription>
        </SheetHeader>
        
        <Tabs defaultValue="alerts" className="flex-1 flex flex-col">
          <div className="px-6 pt-4">
             <TabsList className="w-full justify-start bg-slate-100 p-1">
              <TabsTrigger value="alerts" className="flex-1">
                Persistent Alerts ({persistentAlerts.length})
              </TabsTrigger>
              <TabsTrigger value="notifs" className="flex-1">
                System Log ({notifications.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="alerts" className="flex-1 p-0 m-0">
            <NotificationList 
              notifications={persistentAlerts} 
              onRead={(id) => markAsRead(id, true)} 
              onDismiss={dismissAlert}
              getIcon={getIcon} 
              isAlert
            />
          </TabsContent>
          <TabsContent value="notifs" className="flex-1 p-0 m-0">
            <NotificationList 
              notifications={notifications} 
              onRead={(id) => markAsRead(id, false)} 
              getIcon={getIcon} 
            />
          </TabsContent>
        </Tabs>

        <div className="p-4 border-t bg-slate-50 dark:bg-slate-900 mt-auto flex gap-2">
          <Button variant="outline" className="flex-1" size="sm" onClick={fetchData} disabled={loading}>
            <Clock className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Sync Now
          </Button>
          <Button variant="outline" className="flex-1" size="sm">
            <Settings className="mr-2 h-4 w-4" />
            Config
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface ListProps {
  notifications: Notification[];
  onRead: (id: string) => void;
  onDismiss?: (id: string) => void;
  getIcon: (s: NotificationSeverity) => React.ReactNode;
  isAlert?: boolean;
}

function NotificationList({ notifications, onRead, onDismiss, getIcon, isAlert }: ListProps) {
  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">
        <Mail className="h-12 w-12 mb-4 opacity-20" />
        <p>{isAlert ? "No critical alerts active" : "No system logs to show"}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="flex flex-col divide-y">
        {notifications.map((notification) => {
          const isUnread = !notification.read && !(notification as any).isRead;
          
          return (
            <div 
              key={notification.id} 
              className={cn(
                "p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex gap-4 items-start",
                isUnread ? "bg-indigo-50/30 border-l-2 border-indigo-500" : ""
              )}
            >
              <div className="mt-1 flex-shrink-0">
                {getIcon(notification.severity)}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className={cn("text-sm font-semibold", isUnread ? "text-slate-900" : "text-slate-500")}>
                    {notification.title}
                  </p>
                  <span className="text-[10px] uppercase font-bold text-slate-400 whitespace-nowrap ml-2">
                    {new Date(notification.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {notification.message}
                </p>
                <div className="flex items-center gap-4 pt-1">
                  {isUnread && (
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="px-0 h-auto text-xs text-indigo-600 font-bold"
                      onClick={() => onRead(notification.id)}
                    >
                      Acknowledge
                    </Button>
                  )}
                  {isAlert && onDismiss && (
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="px-0 h-auto text-xs text-slate-400 hover:text-rose-500"
                      onClick={() => onDismiss(notification.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Dismiss
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
