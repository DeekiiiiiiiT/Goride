import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Loader2, Upload, FileText, Check, Camera, Car, FileCheck, Sparkles } from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner@2.0.3';
import { Vehicle } from '../../types/vehicle';
import { cn } from "../ui/utils";
import { convertPdfToImage } from '../../utils/pdf-helper';

interface AddVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVehicleAdded: (vehicle: Vehicle) => void;
  existingVehicles?: Vehicle[];
}

const FileUploadZone = ({ 
    label, 
    file, 
    onFileSelect, 
    accept = "image/*,.pdf",
    icon: Icon = Upload,
    required = false,
    className,
    uploadLabel = "Upload File",
    scanLabel = "Scan / Photo"
}: { 
    label: string, 
    file: File | null, 
    onFileSelect: (f: File) => void,
    accept?: string,
    icon?: any,
    required?: boolean,
    className?: string,
    uploadLabel?: string,
    scanLabel?: string
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    // Helper to render hidden inputs safely
    const renderHiddenInputs = () => (
        <>
            <input 
                ref={inputRef}
                type="file" 
                className="hidden" 
                accept={accept}
                onChange={(e) => {
                    if (e.target.files?.[0]) onFileSelect(e.target.files[0]);
                    e.target.value = '';
                }}
            />
            <input 
                ref={cameraInputRef}
                type="file" 
                className="hidden" 
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                    if (e.target.files?.[0]) onFileSelect(e.target.files[0]);
                    e.target.value = '';
                }}
            />
        </>
    );

    if (file) {
        return (
             <div className={cn("space-y-2", className)}>
                <Label className={cn("text-xs font-medium uppercase text-slate-500", required && "after:content-['*'] after:ml-0.5 after:text-red-500")}>
                    {label}
                </Label>
                <div 
                    className="border-2 border-dashed border-emerald-500 bg-emerald-50/50 rounded-lg p-4 flex flex-col items-center justify-center text-center gap-2 h-32 cursor-pointer transition-colors hover:bg-emerald-100/50" 
                    onClick={() => inputRef.current?.click()}
                >
                    {renderHiddenInputs()}
                    <div className="bg-emerald-100 p-2 rounded-full">
                        <Check className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="text-sm font-medium text-emerald-900 w-full truncate px-2">
                        {file.name}
                    </div>
                    <div className="text-xs text-emerald-600 font-medium">Click to change</div>
                </div>
            </div>
        )
    }

    return (
        <div className={cn("space-y-2", className)}>
            <Label className={cn("text-xs font-medium uppercase text-slate-500", required && "after:content-['*'] after:ml-0.5 after:text-red-500")}>
                {label}
            </Label>
            
            {renderHiddenInputs()}

            <div className="flex flex-col gap-2">
                {/* Primary: Scan Camera */}
                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); cameraInputRef.current?.click(); }}
                    className="flex flex-col items-center justify-center gap-2 h-24 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-900 border-dashed rounded-xl transition-all text-slate-700 group shadow-sm hover:shadow-md"
                >
                    <div className="bg-slate-50 p-2 rounded-full group-hover:bg-slate-900 group-hover:text-white transition-colors">
                        <Camera className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-semibold">{scanLabel}</span>
                </button>

                {/* Secondary: Upload File */}
                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); inputRef.current?.click(); }}
                    className="flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                >
                    <Icon className="h-3.5 w-3.5" />
                    {uploadLabel}
                </button>
            </div>
        </div>
    );
};

export function AddVehicleModal({ isOpen, onClose, onVehicleAdded, existingVehicles = [] }: AddVehicleModalProps) {
  const [step, setStep] = useState(1); // 1 = Upload, 2 = Verify Details
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [fitnessFile, setFitnessFile] = useState<File | null>(null);
  const [registrationFile, setRegistrationFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    // Common
    status: 'Active',
    
    // Fitness Certificate Fields
    make: '',
    model: '',
    year: new Date().getFullYear().toString(),
    color: '',
    bodyType: '',
    engineNumber: '',
    ccRating: '',
    fitnessIssueDate: '',
    fitnessExpiryDate: '',

    // Registration Certificate Fields
    laNumber: '',
    licensePlate: '',
    mvid: '',
    vin: '',
    controlNumber: '',
    registrationIssueDate: '',
    registrationExpiryDate: ''
  });

  const formatDateForInput = (dateStr: string | undefined | null): string => {
      if (!dateStr) return '';
      let dStr = dateStr.trim();
      
      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr;
      
      // Handle DD/MM/YYYY or DD-MM-YYYY
      if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(dStr)) {
          const parts = dStr.split(/[\/-]/);
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2];
          return `${year}-${month}-${day}`;
      }

      // Try parsing standard formats
      const date = new Date(dStr);
      if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
      }
      return '';
  };

  const scanDocument = async (file: File, type: 'vehicle_registration' | 'fitness_certificate') => {
      try {
          const res = await api.parseDocument(file, type);
          return res.success ? res.data : null;
      } catch (e: any) {
          // Check for PDF text extraction failure (scanned PDF)
          const isPdf = file.type === 'application/pdf';
          const isExtractionError = e.message && (
             e.message.includes('Could not extract text') || 
             e.message.includes('scanned image') ||
             e.message.includes('upload a JPEG/PNG') ||
             e.message.includes('Invalid MIME type') ||
             e.message.includes('Only image types are supported')
          );

          if (isPdf && isExtractionError) {
              console.log("Scanned PDF detected. Converting to image...");
              toast.info("Scanned PDF detected. Converting to image for AI analysis...");
              
              try {
                  const imageFile = await convertPdfToImage(file);
                  if (imageFile) {
                      const res2 = await api.parseDocument(imageFile, type);
                      return res2.success ? res2.data : null;
                  }
              } catch (conversionError) {
                  console.error("PDF Rasterization failed:", conversionError);
              }
          }

          console.error(`Error scanning ${type}:`, e);
          toast.error(e.message || `Failed to scan ${type.replace('_', ' ')}`);
          return null;
      }
  };

  const handleScanClick = async () => {
      if (!registrationFile && !fitnessFile) {
          toast.error("Please upload a document to scan.");
          return;
      }

      setIsScanning(true);
      let newData = { ...formData };
      let attemptedScan = false;
      let scanSuccess = false;

      // 1. Scan Registration
      if (registrationFile) {
          attemptedScan = true;
          const data = await scanDocument(registrationFile, 'vehicle_registration');
          console.log("Registration Scan Result:", data);
          if (data) {
              newData = {
                  ...newData,
                  licensePlate: (data.plate || data.plateNumber || newData.licensePlate || '').toUpperCase(),
                  vin: (data.vin || newData.vin || '').toUpperCase(),
                  mvid: data.mvid || newData.mvid,
                  laNumber: data.laNumber || newData.laNumber,
                  controlNumber: data.controlNumber || newData.controlNumber,
                  registrationIssueDate: formatDateForInput(data.issueDate) || newData.registrationIssueDate,
                  registrationExpiryDate: formatDateForInput(data.expirationDate) || newData.registrationExpiryDate,
              };
              scanSuccess = true;
          }
      }

      // 2. Scan Fitness
      if (fitnessFile) {
          attemptedScan = true;
          const data = await scanDocument(fitnessFile, 'fitness_certificate');
          console.log("Fitness Scan Result:", data);
          if (data) {
              newData = {
                  ...newData,
                  make: data.make || newData.make,
                  model: data.model || newData.model,
                  year: data.year || newData.year,
                  color: data.color || newData.color,
                  bodyType: data.bodyType || newData.bodyType,
                  engineNumber: data.engineNumber || newData.engineNumber,
                  ccRating: data.ccRating || newData.ccRating,
                  fitnessIssueDate: formatDateForInput(data.issueDate) || newData.fitnessIssueDate,
                  fitnessExpiryDate: formatDateForInput(data.expirationDate) || newData.fitnessExpiryDate,
              };
              scanSuccess = true;
          }
      }

      setFormData(newData);
      setIsScanning(false);
      
      // Always proceed to step 2 to allow manual entry
      setStep(2);

      if (attemptedScan) {
          if (scanSuccess) {
              toast.success("Documents scanned successfully!");
          } else {
              toast.warning("Could not automatically extract all details. Please verify manually.");
          }
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation: Require at least some identifier or document
    const hasData = formData.licensePlate || formData.make || formData.model || registrationFile || fitnessFile;
    if (!hasData) {
      toast.error("Please provide vehicle details or upload a document.");
      return;
    }

    setIsLoading(true);
    try {
      // Upload Documents & Generate Image
      let fitnessUrl = '';
      let registrationUrl = '';
      let generatedImageUrl = ''; 
      
      const asyncTasks = [];

      if (fitnessFile) {
        asyncTasks.push(api.uploadFile(fitnessFile).then(res => fitnessUrl = res.url));
      }
      if (registrationFile) {
        asyncTasks.push(api.uploadFile(registrationFile).then(res => registrationUrl = res.url));
      }

      // Generate Image
      if (formData.make && formData.model && formData.color) {
           asyncTasks.push(
               (async () => {
                   try {
                       toast.info("Generating studio quality vehicle image... (this may take a moment)");
                       const imgRes = await api.generateVehicleImage({
                           make: formData.make,
                           model: formData.model,
                           year: formData.year,
                           color: formData.color,
                           bodyType: formData.bodyType,
                           licensePlate: formData.licensePlate
                       });
                       if (imgRes.url) {
                           generatedImageUrl = imgRes.url;
                       }
                   } catch (e) {
                       console.error("Image gen failed", e);
                   }
               })()
           );
      }

      await Promise.all(asyncTasks);

      // Determine Identity
      const plateToUse = formData.licensePlate ? formData.licensePlate.toUpperCase() : '';
      const fallbackId = `UNKNOWN-${Date.now()}`;
      
      // Try to find existing
      const existingVehicle = plateToUse 
        ? existingVehicles.find(v => (v.licensePlate || '').toUpperCase() === plateToUse || v.id === plateToUse)
        : null;

      let finalVehicle: Vehicle;

      if (existingVehicle) {
          // MERGE
          finalVehicle = {
              ...existingVehicle,
              // Update fields if they have value in formData
              make: formData.make || existingVehicle.make,
              model: formData.model || existingVehicle.model,
              year: formData.year || existingVehicle.year,
              color: formData.color || existingVehicle.color,
              bodyType: formData.bodyType || existingVehicle.bodyType,
              vin: formData.vin || existingVehicle.vin,
              
              // Only update specific fields if provided
              registrationExpiry: formData.registrationExpiryDate || existingVehicle.registrationExpiry,
              fitnessExpiry: formData.fitnessExpiryDate || existingVehicle.fitnessExpiry,
              registrationIssueDate: formData.registrationIssueDate || existingVehicle.registrationIssueDate,
              fitnessIssueDate: formData.fitnessIssueDate || existingVehicle.fitnessIssueDate,
              
              // Extended fields
              engineNumber: formData.engineNumber || existingVehicle.engineNumber,
              ccRating: formData.ccRating || existingVehicle.ccRating,
              controlNumber: formData.controlNumber || existingVehicle.controlNumber,
              mvid: formData.mvid || existingVehicle.mvid,
              laNumber: formData.laNumber || existingVehicle.laNumber,

              // Update Image only if generated
              image: generatedImageUrl || existingVehicle.image,
              
              // Update URLs only if new files
              fitnessCertificateUrl: fitnessUrl || existingVehicle.fitnessCertificateUrl,
              registrationCertificateUrl: registrationUrl || existingVehicle.registrationCertificateUrl,
          };
          toast.info(`Updated existing vehicle: ${plateToUse}`);
      } else {
          // CREATE NEW
          finalVehicle = {
            id: plateToUse || fallbackId,
            licensePlate: plateToUse, // Can be empty
            make: formData.make || 'Unknown',
            model: formData.model || 'Unknown',
            year: formData.year,
            vin: formData.vin || (plateToUse ? `${plateToUse}-VIN` : ''),
            status: formData.status as any,
            color: formData.color,
            
            bodyType: formData.bodyType,
            engineNumber: formData.engineNumber,
            ccRating: formData.ccRating,
            controlNumber: formData.controlNumber,
            fitnessIssueDate: formData.fitnessIssueDate,
            fitnessExpiry: formData.fitnessExpiryDate,
            registrationIssueDate: formData.registrationIssueDate,
            registrationExpiry: formData.registrationExpiryDate,
            
            image: generatedImageUrl || 'figma:asset/6426d17c3b251d9c214959cf1b6b0705de44c168.png',
            metrics: {
                todayEarnings: 0,
                utilizationRate: 0,
                totalLifetimeEarnings: 0,
                odometer: 0,
                fuelLevel: 100,
                healthScore: 100
            },
            serviceStatus: 'OK',
            nextServiceType: 'Inspection',
            daysToService: 90,
            
            fitnessCertificateUrl: fitnessUrl,
            registrationCertificateUrl: registrationUrl,
            mvid: formData.mvid,
            laNumber: formData.laNumber
          };
      }

      await api.saveVehicle(finalVehicle);
      onVehicleAdded(finalVehicle);
      toast.success(existingVehicle ? "Vehicle updated" : "Vehicle added");
      handleClose();
      
    } catch (error) {
      console.error(error);
      toast.error("Failed to save vehicle");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
        status: 'Active',
        make: '', model: '', year: new Date().getFullYear().toString(),
        color: '', bodyType: '', engineNumber: '', ccRating: '', fitnessIssueDate: '', fitnessExpiryDate: '',
        laNumber: '', licensePlate: '', mvid: '', vin: '', controlNumber: '', registrationIssueDate: '', registrationExpiryDate: ''
    });
    setFitnessFile(null);
    setRegistrationFile(null);
    setStep(1);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[900px] overflow-hidden max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Vehicle</DialogTitle>
          <DialogDescription>
            {step === 1 
                ? "Upload registration documents to autofill details."
                : "Verify the extracted details and add vehicle."}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="py-4">
          {/* Documents Section - Always visible in Step 1, minimized in Step 2? No, just keep simple logic */}
          {step === 1 && (
             <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                    <FileUploadZone 
                        label="Motor Vehicle Registration" 
                        file={registrationFile} 
                        onFileSelect={setRegistrationFile} 
                        accept="image/*,.pdf"
                        icon={Car}
                        uploadLabel="Upload Registration"
                        scanLabel="Scan Registration"
                    />
                    <FileUploadZone 
                        label="Certificate of Fitness" 
                        file={fitnessFile} 
                        onFileSelect={setFitnessFile} 
                        accept="image/*,.pdf"
                        icon={FileCheck}
                        uploadLabel="Upload Fitness"
                        scanLabel="Scan Fitness"
                    />
                </div>
            </div>
          )}
          
          {/* Step 2: Form Fields */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border">
                    <div className="flex gap-4">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                             <Car className="h-4 w-4" /> 
                             {registrationFile ? "Registration Uploaded" : "No Registration"}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                             <FileCheck className="h-4 w-4" /> 
                             {fitnessFile ? "Fitness Uploaded" : "No Fitness"}
                        </div>
                    </div>
                    <Button variant="link" size="sm" onClick={() => setStep(1)} className="text-xs h-auto p-0 text-emerald-600">
                        Re-upload documents
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Column 1: Certificate of Fitness */}
                    <div className="space-y-4">
                         <h4 className="text-sm font-semibold text-slate-900 border-b pb-2 flex items-center gap-2">
                            <FileCheck className="h-4 w-4 text-emerald-600" />
                            Certificate of Fitness
                        </h4>
                        
                        <div className="space-y-3">
                            <div>
                                <Label className="text-xs text-slate-500">Make</Label>
                                <Input value={formData.make} onChange={(e) => setFormData({...formData, make: e.target.value})} placeholder="Toyota" />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">Model</Label>
                                <Input value={formData.model} onChange={(e) => setFormData({...formData, model: e.target.value})} placeholder="Camry" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs text-slate-500">Year</Label>
                                    <Input value={formData.year} onChange={(e) => setFormData({...formData, year: e.target.value})} placeholder="2019" />
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-500">Colour</Label>
                                    <Input value={formData.color} onChange={(e) => setFormData({...formData, color: e.target.value})} placeholder="White" />
                                </div>
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">Body Type</Label>
                                <Input value={formData.bodyType} onChange={(e) => setFormData({...formData, bodyType: e.target.value})} placeholder="Sedan" />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">Motor Or Engine No.</Label>
                                <Input value={formData.engineNumber} onChange={(e) => setFormData({...formData, engineNumber: e.target.value})} />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">CC Rating</Label>
                                <Input value={formData.ccRating} onChange={(e) => setFormData({...formData, ccRating: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs text-slate-500">Issue Date</Label>
                                    <Input type="date" value={formData.fitnessIssueDate} onChange={(e) => setFormData({...formData, fitnessIssueDate: e.target.value})} />
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-500">Expiry Date</Label>
                                    <Input type="date" value={formData.fitnessExpiryDate} onChange={(e) => setFormData({...formData, fitnessExpiryDate: e.target.value})} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Vehicle Registration */}
                    <div className="space-y-4">
                         <h4 className="text-sm font-semibold text-slate-900 border-b pb-2 flex items-center gap-2">
                            <Car className="h-4 w-4 text-blue-600" />
                            Motor Vehicle Registration
                        </h4>
                        
                        <div className="space-y-3">
                            <div>
                                <Label className="text-xs text-slate-500">LA Number</Label>
                                <Input value={formData.laNumber} onChange={(e) => setFormData({...formData, laNumber: e.target.value})} />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">Reg. Plate No <span className="text-red-500">*</span></Label>
                                <Input value={formData.licensePlate} onChange={(e) => setFormData({...formData, licensePlate: e.target.value.toUpperCase()})} className="font-mono text-lg font-bold tracking-wider" placeholder="ABC-123" />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">MVID</Label>
                                <Input value={formData.mvid} onChange={(e) => setFormData({...formData, mvid: e.target.value})} />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">VIN / Chassis No</Label>
                                <Input value={formData.vin} onChange={(e) => setFormData({...formData, vin: e.target.value.toUpperCase()})} className="font-mono" />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">Control Number</Label>
                                <Input value={formData.controlNumber} onChange={(e) => setFormData({...formData, controlNumber: e.target.value})} />
                            </div>
                             <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs text-slate-500">Date Issued</Label>
                                    <Input type="date" value={formData.registrationIssueDate} onChange={(e) => setFormData({...formData, registrationIssueDate: e.target.value})} />
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-500">Expiry Date</Label>
                                    <Input type="date" value={formData.registrationExpiryDate} onChange={(e) => setFormData({...formData, registrationExpiryDate: e.target.value})} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border-t pt-4 mt-4">
                    <Label className="text-xs text-slate-500 mb-1.5 block">Vehicle Status</Label>
                    <Select 
                        value={formData.status} 
                        onValueChange={(val) => setFormData({...formData, status: val})}
                    >
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                    </SelectContent>
                    </Select>
                </div>
            </div>
          )}
          
          <DialogFooter className="mt-6">
             <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            
            {step === 1 ? (
                <Button 
                    type="button" 
                    onClick={handleScanClick}
                    disabled={(!registrationFile && !fitnessFile) || isScanning}
                    className="bg-slate-900 text-white hover:bg-slate-800"
                >
                    {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    {isScanning ? "Scanning..." : "Scan Documents"}
                </Button>
            ) : (
                <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Vehicle
                </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}