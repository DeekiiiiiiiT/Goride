import * as React from "react"
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "./utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover"

interface DatePickerWithRangeProps {
  className?: string
  date: DateRange | undefined
  setDate: (date: DateRange | undefined) => void
}

export function DatePickerWithRange({
  className,
  date,
  setDate,
}: DatePickerWithRangeProps) {

  const setPreset = (preset: 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth') => {
    const today = new Date();
    let newRange: DateRange | undefined;
    
    switch (preset) {
        case 'thisWeek':
            newRange = { from: startOfWeek(today, { weekStartsOn: 1 }), to: endOfWeek(today, { weekStartsOn: 1 }) };
            break;
        case 'lastWeek':
            const lastWeek = subWeeks(today, 1);
            newRange = { from: startOfWeek(lastWeek, { weekStartsOn: 1 }), to: endOfWeek(lastWeek, { weekStartsOn: 1 }) };
            break;
        case 'thisMonth':
            newRange = { from: startOfMonth(today), to: endOfMonth(today) };
            break;
        case 'lastMonth':
            const lastMonth = subMonths(today, 1);
            newRange = { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
            break;
    }
    setDate(newRange);
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[300px] justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
            <div className="flex">
                <div className="flex flex-col gap-2 p-3 border-r bg-slate-50/50">
                    <Button variant="ghost" size="sm" className="justify-start text-left font-normal" onClick={() => setPreset('thisWeek')}>This Week</Button>
                    <Button variant="ghost" size="sm" className="justify-start text-left font-normal" onClick={() => setPreset('lastWeek')}>Last Week</Button>
                    <Button variant="ghost" size="sm" className="justify-start text-left font-normal" onClick={() => setPreset('thisMonth')}>This Month</Button>
                    <Button variant="ghost" size="sm" className="justify-start text-left font-normal" onClick={() => setPreset('lastMonth')}>Last Month</Button>
                </div>
                <div className="p-3">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={date?.from}
                    selected={date}
                    onSelect={setDate}
                    numberOfMonths={2}
                  />
                </div>
            </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
