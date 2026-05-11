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
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { MessageSquare, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner@2.0.3";

export function BroadcastMessageModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'compose' | 'confirm' | 'success'>('compose');
  const [message, setMessage] = useState('');
  const [recipient, setRecipient] = useState('all');
  const [type, setType] = useState('info');

  const handleSend = () => {
    setStep('confirm');
    // Simulate API call
    setTimeout(() => {
        setStep('success');
        toast.success("Broadcast message sent successfully");
    }, 1000);
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
        setStep('compose');
        setMessage('');
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <MessageSquare className="mr-2 h-4 w-4" />
          Broadcast
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        {step === 'compose' && (
            <>
                <DialogHeader>
                <DialogTitle>Send Broadcast Message</DialogTitle>
                <DialogDescription>
                    Send a notification to your fleet drivers.
                </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                    <Label>Recipients</Label>
                    <Select value={recipient} onValueChange={setRecipient}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select recipients" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Active Drivers</SelectItem>
                        <SelectItem value="idle">Idle Drivers Only</SelectItem>
                        <SelectItem value="specific">Specific Route (Kingston)</SelectItem>
                    </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-2">
                    <Label>Message Type</Label>
                    <RadioGroup defaultValue="info" value={type} onValueChange={setType} className="flex gap-4">
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="info" id="info" />
                            <Label htmlFor="info">Info</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="warning" id="warning" />
                            <Label htmlFor="warning" className="text-amber-600">Warning</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="urgent" id="urgent" />
                            <Label htmlFor="urgent" className="text-red-600">Urgent</Label>
                        </div>
                    </RadioGroup>
                </div>
                <div className="grid gap-2">
                    <Label>Message</Label>
                    <Textarea 
                        placeholder="Type your message here..." 
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={4}
                    />
                    <div className="text-xs text-right text-slate-400">
                        {message.length} / 160 characters
                    </div>
                </div>
                </div>
                <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleSend} disabled={!message}>
                    <Send className="mr-2 h-4 w-4" />
                    Send Now
                </Button>
                </DialogFooter>
            </>
        )}

        {step === 'confirm' && (
             <div className="py-10 flex flex-col items-center justify-center space-y-4">
                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                 <p className="text-sm text-slate-500">Sending message to 12 drivers...</p>
             </div>
        )}

        {step === 'success' && (
            <div className="py-6 flex flex-col items-center justify-center space-y-4 text-center">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                    <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                    <h3 className="text-lg font-medium">Message Sent!</h3>
                    <p className="text-sm text-slate-500">Your broadcast has been delivered to 12 active drivers.</p>
                </div>
                <Button onClick={handleClose}>Close</Button>
            </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
