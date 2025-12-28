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
import { Trash2, Link as LinkIcon, AlertCircle, History } from "lucide-react";
import { TollTag } from "../../types/vehicle";

interface TollTagListProps {
  tags: TollTag[];
  isLoading: boolean;
  onDelete: (id: string) => void;
  onAssign: (tag: TollTag) => void;
  onUnassign: (tag: TollTag) => void;
  onViewHistory: (tag: TollTag) => void;
}

export function TollTagList({ tags, isLoading, onDelete, onAssign, onUnassign, onViewHistory }: TollTagListProps) {
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-700 hover:bg-green-100';
      case 'Inactive': return 'bg-slate-100 text-slate-700 hover:bg-slate-100';
      case 'Lost': return 'bg-red-100 text-red-700 hover:bg-red-100';
      case 'Damaged': return 'bg-amber-100 text-amber-700 hover:bg-amber-100';
      default: return 'bg-slate-100 text-slate-700 hover:bg-slate-100';
    }
  };

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
              <TableCell className="font-mono text-xs">{tag.tagNumber}</TableCell>
              <TableCell>
                <Badge variant="outline" className={`border-0 ${getStatusColor(tag.status)}`}>
                  {tag.status}
                </Badge>
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
                {new Date(tag.createdAt).toLocaleDateString()}
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
