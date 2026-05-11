import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Loader2, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { TollProvider, TollTagStatus } from "../../types/vehicle";
import { api } from "../../services/api";
import { toast } from "sonner";

interface BulkImportTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ParsedTag {
  provider: string;
  tagNumber: string;
  status: string;
  isValid: boolean;
  error?: string;
}

export function BulkImportTagsModal({ isOpen, onClose, onImportComplete }: BulkImportTagsModalProps) {
  const [csvContent, setCsvContent] = useState('');
  const [parsedTags, setParsedTags] = useState<ParsedTag[]>([]);
  const [step, setStep] = useState<'input' | 'preview' | 'importing'>('input');
  const [importStats, setImportStats] = useState({ total: 0, success: 0, failed: 0 });

  const handleParse = () => {
    if (!csvContent.trim()) {
      toast.error("Please enter some CSV data");
      return;
    }

    const lines = csvContent.split('\n');
    const parsed: ParsedTag[] = lines
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('Provider')) // Skip header/empty
      .map(line => {
        const parts = line.split(',').map(p => p.trim());
        const provider = parts[0];
        const tagNumber = parts[1];
        const status = parts[2] || 'Active';

        let isValid = true;
        let error = '';

        if (!['JRC', 'T-Tag'].includes(provider)) {
            isValid = false;
            error = 'Invalid Provider (must be JRC or T-Tag)';
        }
        if (!tagNumber) {
            isValid = false;
            error = 'Missing Tag Number';
        }

        return {
          provider,
          tagNumber,
          status,
          isValid,
          error
        };
      });

    if (parsed.length === 0) {
        toast.error("No valid lines found");
        return;
    }

    setParsedTags(parsed);
    setStep('preview');
  };

  const handleImport = async () => {
    setStep('importing');
    setImportStats({ total: parsedTags.length, success: 0, failed: 0 });

    let successCount = 0;
    let failCount = 0;

    // Process sequentially to avoid overwhelming the server (and since we don't have a batch endpoint)
    for (const tag of parsedTags) {
      if (!tag.isValid) {
          failCount++;
          continue;
      }

      try {
        await api.saveTollTag({
            provider: tag.provider as TollProvider,
            tagNumber: tag.tagNumber,
            status: (tag.status as TollTagStatus) || 'Active'
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to import tag ${tag.tagNumber}`, error);
        failCount++;
      }
      
      // Update stats live
      setImportStats(prev => ({ ...prev, success: successCount, failed: failCount }));
    }

    toast.success(`Import complete. ${successCount} imported, ${failCount} failed.`);
    onImportComplete();
    
    // Reset after delay or user close
    setTimeout(() => {
        onClose();
        setStep('input');
        setCsvContent('');
        setParsedTags([]);
    }, 1500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Import Toll Tags</DialogTitle>
          <DialogDescription>
             Paste your CSV data below. Format: <code>Provider, TagNumber, Status</code>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
            {step === 'input' && (
                <div className="space-y-4">
                    <Textarea 
                        placeholder="JRC, 12345678, Active&#10;T-Tag, T-987654, Inactive" 
                        className="h-[300px] font-mono text-sm"
                        value={csvContent}
                        onChange={(e) => setCsvContent(e.target.value)}
                    />
                    <div className="text-sm text-slate-500">
                        <p>Supported Providers: JRC, T-Tag</p>
                        <p>Default Status: Active</p>
                    </div>
                </div>
            )}

            {step === 'preview' && (
                <div className="space-y-4">
                     <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Preview</AlertTitle>
                        <AlertDescription>
                            Found {parsedTags.length} tags. {parsedTags.filter(t => !t.isValid).length} invalid.
                        </AlertDescription>
                    </Alert>
                    
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Provider</TableHead>
                                    <TableHead>Tag Number</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Validation</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {parsedTags.map((tag, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{tag.provider}</TableCell>
                                        <TableCell>{tag.tagNumber}</TableCell>
                                        <TableCell>{tag.status}</TableCell>
                                        <TableCell>
                                            {tag.isValid ? (
                                                <span className="text-emerald-600 flex items-center gap-1 text-xs font-medium">
                                                    <CheckCircle2 className="h-3 w-3" /> OK
                                                </span>
                                            ) : (
                                                <span className="text-red-600 text-xs font-medium">
                                                    {tag.error}
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {step === 'importing' && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                    <h3 className="text-lg font-medium">Importing Tags...</h3>
                    <p className="text-slate-500">
                        Processed {importStats.success + importStats.failed} of {importStats.total}
                    </p>
                    <div className="w-full max-w-xs bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div 
                            className="bg-indigo-600 h-full transition-all duration-300"
                            style={{ width: `${((importStats.success + importStats.failed) / importStats.total) * 100}%` }}
                        />
                    </div>
                </div>
            )}
        </div>

        <DialogFooter>
          {step === 'input' && (
              <>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleParse}>
                    Next: Preview
                </Button>
              </>
          )}
          {step === 'preview' && (
              <>
                <Button variant="outline" onClick={() => setStep('input')}>Back</Button>
                <Button onClick={handleImport} disabled={parsedTags.filter(t => t.isValid).length === 0}>
                    Import {parsedTags.filter(t => t.isValid).length} Tags
                </Button>
              </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
