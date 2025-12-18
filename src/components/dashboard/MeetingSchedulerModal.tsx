import React, { useState } from 'react';
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Calendar as CalendarIcon, Clock, User, Video, MapPin } from "lucide-react";
import { toast } from "sonner@2.0.3";

export function MeetingSchedulerModal() {
  const [open, setOpen] = useState(false);
  const [driver, setDriver] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState('review');

  const handleSchedule = () => {
    toast.success("Meeting scheduled successfully");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarIcon className="mr-2 h-4 w-4" />
          Schedule Meeting
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Schedule Driver Meeting</DialogTitle>
          <DialogDescription>
            Set up a 1:1 review or training session.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Driver</Label>
            <Select value={driver} onValueChange={setDriver}>
              <SelectTrigger>
                <SelectValue placeholder="Select driver" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kenny">Kenny (Performance Review)</SelectItem>
                <SelectItem value="sarah">Sarah (Training)</SelectItem>
                <SelectItem value="john">John (Onboarding)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Date</Label>
                <div className="relative">
                    <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                    <Input type="date" className="pl-9" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Time</Label>
                <div className="relative">
                    <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                    <Input type="time" className="pl-9" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>
          </div>

          <div className="grid gap-2">
            <Label>Meeting Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="review">Performance Review</SelectItem>
                <SelectItem value="training">Safety Training</SelectItem>
                <SelectItem value="onboarding">Document Check</SelectItem>
                <SelectItem value="urgent">Urgent Issue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
              <Label>Location</Label>
              <div className="flex gap-2 p-2 bg-slate-50 rounded border border-slate-100">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Video className="h-4 w-4" />
                      <span>Google Meet</span>
                  </div>
                  <div className="text-slate-300">|</div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                      <MapPin className="h-4 w-4" />
                      <span>Main Office</span>
                  </div>
              </div>
          </div>

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSchedule} disabled={!driver || !date || !time}>
            Send Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
