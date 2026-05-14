"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "./utils";
import { buttonVariants } from "./button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("block p-3", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row sm:gap-2",
        month: "flex w-full flex-col gap-4",
        caption: "flex w-full flex-wrap items-center justify-between gap-2 pt-1",
        caption_label:
          "relative z-[1] inline-flex items-center gap-1 whitespace-nowrap rounded-md border-2 border-transparent px-1.5 py-1 text-sm font-medium text-slate-900 dark:text-slate-100",
        nav: "flex shrink-0 items-center gap-0.5",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "static",
        nav_button_next: "static",
        table: "w-full border-collapse",
        head_row: "table-row",
        head_cell:
          "text-muted-foreground h-10 w-10 pb-2 text-center align-middle text-[0.8rem] font-normal",
        row: "mt-2 table-row border-collapse",
        cell: cn(
          "relative table-cell h-10 w-10 p-0 text-center align-middle text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-md",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md",
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "mx-auto flex size-9 items-center justify-center p-0 font-normal aria-selected:opacity-100",
        ),
        day_range_start:
          "day-range-start aria-selected:bg-primary aria-selected:text-primary-foreground",
        day_range_end:
          "day-range-end aria-selected:bg-primary aria-selected:text-primary-foreground",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        /** Screen-reader-only; must not take layout space (replaces rdp-vhidden when style.css is not imported). */
        vhidden: "sr-only",
        /** Row containing month + year dropdown controls */
        caption_dropdowns: "relative inline-flex flex-wrap items-center justify-center gap-3",
        /**
         * Native `<select>` for month/year: must cover the visible label with opacity 0
         * (see react-day-picker Dropdown + dist/style.css `.rdp-dropdown`).
         */
        dropdown:
          "absolute inset-0 z-[2] m-0 h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0 font-inherit text-inherit opacity-0 disabled:cursor-not-allowed disabled:opacity-100",
        dropdown_month:
          "relative inline-flex min-h-9 min-w-[5.5rem] items-center rounded-md border border-slate-200 bg-white px-1 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/35 dark:border-slate-600 dark:bg-slate-900",
        dropdown_year:
          "relative inline-flex min-h-9 min-w-[4.5rem] items-center rounded-md border border-slate-200 bg-white px-1 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/35 dark:border-slate-600 dark:bg-slate-900",
        dropdown_icon: "ml-0.5 size-3 shrink-0 text-slate-500 dark:text-slate-400",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("size-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("size-4", className)} {...props} />
        ),
      }}
      {...props}
    />
  );
}

export { Calendar };
