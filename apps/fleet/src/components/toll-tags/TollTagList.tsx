import React from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Trash2, Link as LinkIcon, History, Pencil, MoreHorizontal, UserPlus, UserMinus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { TollTag } from "../../types/vehicle";
import { formatJMD } from "../../utils/formatJMD";
import { useIsMobile } from "../ui/use-mobile";

interface TollTagListProps {
  tags: TollTag[];
  isLoading: boolean;
  onDelete: (id: string) => void;
  onAssign: (tag: TollTag) => void;
  onUnassign: (tag: TollTag) => void;
  onViewHistory: (tag: TollTag) => void;
  onEdit: (tag: TollTag) => void;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'Active': return 'bg-green-100 text-green-700 hover:bg-green-100';
    case 'Inactive': return 'bg-slate-100 text-slate-700 hover:bg-slate-100';
    case 'Lost': return 'bg-red-100 text-red-700 hover:bg-red-100';
    case 'Damaged': return 'bg-amber-100 text-amber-700 hover:bg-amber-100';
    default: return 'bg-slate-100 text-slate-700 hover:bg-slate-100';
  }
}

function TagRowActions({
  tag,
  compact,
  onDelete,
  onAssign,
  onUnassign,
  onViewHistory,
  onEdit,
}: {
  tag: TollTag;
  compact?: boolean;
  onDelete: (id: string) => void;
  onAssign: (tag: TollTag) => void;
  onUnassign: (tag: TollTag) => void;
  onViewHistory: (tag: TollTag) => void;
  onEdit: (tag: TollTag) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={compact ? 'min-h-11 min-w-11 p-0' : 'h-8 w-8 p-0'}
          aria-label="Tag actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        {tag.assignedVehicleId && (
          <DropdownMenuItem onClick={() => onViewHistory(tag)}>
            <History className="mr-2 h-4 w-4" />
            View History
          </DropdownMenuItem>
        )}
        {tag.assignedVehicleId ? (
          <DropdownMenuItem onClick={() => onUnassign(tag)}>
            <UserMinus className="mr-2 h-4 w-4" />
            Unassign
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onAssign(tag)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Assign
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onEdit(tag)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-rose-600 focus:text-rose-600"
          onClick={() => {
            if (window.confirm('Are you sure you want to delete this tag?')) {
              onDelete(tag.id);
            }
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TollTagList({ tags, isLoading, onDelete, onAssign, onUnassign, onViewHistory, onEdit }: TollTagListProps) {
  const isMobile = useIsMobile();

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading inventory...</div>;
  }

  if (tags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border rounded-lg border-dashed bg-slate-50">
        <div className="bg-slate-100 p-3 rounded-full mb-4">
          <LinkIcon className="h-6 w-6 text-slate-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No tags found</h3>
        <p className="text-slate-500 text-sm mt-1">Get started by adding your first toll tag.</p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2.75rem] items-center gap-x-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-500">
          <span>Tag Number</span>
          <span>Assigned</span>
          <span className="sr-only">Actions</span>
        </div>
        {tags.map((tag) => (
          <div
            key={tag.id}
            className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2.75rem] items-center gap-x-2 border-b border-slate-100 px-3 py-3 last:border-b-0"
          >
            <div className="min-w-0 font-mono text-xs text-slate-800">
              <span className="block truncate">{tag.tagNumber}</span>
            </div>
            <div className="min-w-0 truncate text-sm">
              {tag.assignedVehicleId ? (
                <span className="font-medium text-indigo-600">
                  {tag.assignedVehicleName || 'Linked'}
                </span>
              ) : (
                <span className="italic text-slate-400">Unassigned</span>
              )}
            </div>
            <div className="flex justify-center">
              <TagRowActions
                tag={tag}
                compact
                onDelete={onDelete}
                onAssign={onAssign}
                onUnassign={onUnassign}
                onViewHistory={onViewHistory}
                onEdit={onEdit}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <TableHead>Tag Number</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned Vehicle</TableHead>
            <TableHead>Added On</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tags.map((tag) => (
            <TableRow key={tag.id}>
              <TableCell className="font-medium">{tag.provider}</TableCell>
              <TableCell className="font-mono text-xs">
                <div className="flex items-center gap-1.5">
                  {tag.tagNumber}
                  {tag.providerBalance !== undefined && tag.providerBalance !== null && (
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="inline-flex h-4 items-center rounded bg-slate-100 px-1 text-[10px] font-normal text-slate-500">
                          {formatJMD(tag.providerBalance)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Manual {tag.provider} app checkpoint: {formatJMD(tag.providerBalance, 2)}</p>
                        <p className="text-xs text-slate-400">Not a live feed — last typed in from the provider app</p>
                        {tag.providerBalanceDate && (
                          <p className="text-xs text-slate-400">Checked: {new Date(tag.providerBalanceDate).toLocaleDateString()}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className={`border-0 ${getStatusColor(tag.status)}`}>
                    {tag.status}
                  </Badge>
                  {tag.assignedVehicleId && tag.lastCalculatedBalance !== undefined && 
                   tag.lastCalculatedBalance < (tag.lowBalanceThreshold ?? 500) && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant="outline" className="border-0 bg-red-100 text-red-700 hover:bg-red-100 text-[10px] px-1.5">
                          Low Balance
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Balance: {formatJMD(tag.lastCalculatedBalance, 2)} (below {formatJMD(tag.lowBalanceThreshold ?? 500)} threshold)</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {tag.assignedVehicleId ? (
                  <div className="flex items-center gap-1.5 text-indigo-600 font-medium text-sm">
                    <LinkIcon className="h-3 w-3" />
                    {tag.assignedVehicleName || 'Vehicle Linked'}
                  </div>
                ) : (
                  <span className="text-slate-400 text-sm italic">Unassigned</span>
                )}
              </TableCell>
              <TableCell className="text-slate-500 text-sm">
                {tag.dateAdded ? new Date(tag.dateAdded).toLocaleDateString() : "-"}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {tag.assignedVehicleId && (
                     <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-indigo-600"
                        title="View Transaction History"
                        onClick={() => onViewHistory(tag)}
                     >
                        <History className="h-4 w-4" />
                     </Button>
                  )}
                  {tag.assignedVehicleId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => onUnassign(tag)}
                    >
                      Unassign
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs border-dashed text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50"
                      onClick={() => onAssign(tag)}
                    >
                      Assign
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-slate-400 hover:text-blue-600"
                    onClick={() => onEdit(tag)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost"  
                    size="icon" 
                    className="h-8 w-8 text-slate-400 hover:text-red-600"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to delete this tag?')) {
                        onDelete(tag.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
