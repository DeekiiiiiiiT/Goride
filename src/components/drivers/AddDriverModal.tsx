import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Loader2, Upload, FileText, Check, ShieldCheck, ArrowRight, ArrowLeft, Sparkles, ScanLine, CreditCard, Calendar, Hash, Car, Globe, Camera, Lock } from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner@2.0.3';
import { cn } from "../ui/utils";

interface AddDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDriverAdded: (driver: any) => void;
}

const COUNTRY_CODES = [
  { code: '+1', label: 'US (+1)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+91', label: 'IN (+91)' },
  { code: '+81', label: 'JP (+81)' },
  { code: '+86', label: 'CN (+86)' },
  { code: '+876', label: 'JM (+876)' },
  { code: '+61', label: 'AU (+61)' },
  { code: '+49', label: 'DE (+49)' },
];

const FileUploadZone = ({ 
    label, 
    file, 
    onFileSelect, 
    accept = "image/*,.pdf",
    icon: Icon = Upload,
    required = false,
    className
}: { 
    label: string, 
    file: File | null, 
    onFileSelect: (f: File) => void,
    accept?: string,
    icon?: any,
    required?: boolean,
    className?: string
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
                    // Reset value so same file can be selected again if needed
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
                    className="border-2 border-dashed border-emerald-500 bg-emerald-50/50 rounded-lg p-4 flex flex-col items-center justify-center text-center gap-2 h-40 cursor-pointer transition-colors hover:bg-emerald-100/50" 
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

            <div className="flex flex-col gap-3">
                {/* Primary: Scan Camera */}
                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); cameraInputRef.current?.click(); }}
                    className="flex flex-col items-center justify-center gap-2 h-28 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-900 border-dashed rounded-xl transition-all text-slate-700 group shadow-sm hover:shadow-md"
                >
                    <div className="bg-slate-50 p-3 rounded-full group-hover:bg-slate-900 group-hover:text-white transition-colors">
                        <Camera className="h-6 w-6" />
                    </div>
                    <span className="text-sm font-semibold">Scan with Camera</span>
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 px-2">
                    <div className="h-px bg-slate-200 flex-1" />
                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">or</span>
                    <div className="h-px bg-slate-200 flex-1" />
                </div>

                {/* Secondary: Upload File */}
                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); inputRef.current?.click(); }}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                >
                    <Icon className="h-3.5 w-3.5" />
                    Upload from Device
                </button>
            </div>
        </div>
    );
};

export function AddDriverModal({ isOpen, onClose, onDriverAdded }: AddDriverModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [step, setStep] = useState(1);
  
  // Personal Details
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nationality, setNationality] = useState('');
  const [status, setStatus] = useState('Active');
  
  // New License Details
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [dob, setDob] = useState('');
  const [licenseClass, setLicenseClass] = useState('');
  const [licenseToDrive, setLicenseToDrive] = useState('');
  const [controlNumber, setControlNumber] = useState('');

  // Verification
  const [address, setAddress] = useState('');
  const [licenseFront, setLicenseFront] = useState<File | null>(null);
  const [licenseBack, setLicenseBack] = useState<File | null>(null);
  const [proofType, setProofType] = useState<string>('');
  const [proofFile, setProofFile] = useState<File | null>(null);

  // -- Actions --

  const handleScanLicense = async () => {
    if (!licenseFront) {
        toast.error("Please upload the front of the Driver's License");
        return;
    }
    
    setIsScanning(true);
    try {
        // Send both front and back if available
        const res = await api.parseDocument(licenseFront, 'license', licenseBack || undefined);
        
        if (res.success && res.data) {
            if (res.data.firstName) setFirstName(res.data.firstName);
            if (res.data.lastName) setLastName(res.data.lastName);
            if (res.data.middleName) setMiddleName(res.data.middleName);
            
            // Smart Country Code Logic
            let code = res.data.countryCode || '+1';
            const nat = (res.data.nationality || '').toUpperCase();
            if (nat.includes('JAMAICA') || nat.includes('JM')) {
                 code = '+876';
            }
            setCountryCode(code);

            if (res.data.nationality) setNationality(res.data.nationality);
            
            // New fields
            if (res.data.licenseNumber) setLicenseNumber(res.data.licenseNumber);
            if (res.data.expirationDate) setLicenseExpiry(res.data.expirationDate);
            if (res.data.dateOfBirth) setDob(res.data.dateOfBirth);
            if (res.data.class) setLicenseClass(res.data.class);
            if (res.data.licenseToDrive) setLicenseToDrive(res.data.licenseToDrive);
            if (res.data.controlNumber) setControlNumber(res.data.controlNumber);
            
            toast.success("License scanned successfully!");
            setStep(2);
        } else {
            throw new Error("Could not extract data");
        }
    } catch (error: any) {
        console.error(error);
        if (error.message?.includes("503") || error.message?.includes("not configured")) {
             toast.error("AI Service unavailable. Please enter details manually.");
        } else {
             toast.error("Could not read license. Please verify manually.");
        }
        setStep(2); // Proceed to manual entry
    } finally {
        setIsScanning(false);
    }
  };

  const handleScanAddress = async () => {
      if (!proofFile) {
           // If no file, just skip scan
           return; 
      }
      setIsScanning(true);
      try {
          const res = await api.parseDocument(proofFile, 'address');
          if (res.success && res.data && res.data.address) {
              setAddress(res.data.address);
              toast.success("Address extracted!");
          } else {
              toast.info("Could not extract address automatically.");
          }
      } catch (e) {
          // Ignore error, user can type
          console.log("Address scan failed", e);
      } finally {
          setIsScanning(false);
      }
  };

  const handleNextStep1 = () => {
      // Allow skipping scan if files are present
      if (licenseFront && licenseBack) {
          setStep(2);
      } else {
          toast.error("Both sides of Driver's License are required");
      }
  };

  const handleNextStep2 = () => {
      if (!firstName || !lastName) {
          toast.error("First and Last Name are required");
          return;
      }
      if (!email) {
          toast.error("Email is required");
          return;
      }
      if (!password) {
          toast.error("Password is required for login");
          return;
      }
      if (!nationality) {
          toast.error("Nationality is required");
          return;
      }
      if (!dob) {
          toast.error("Date of Birth is required");
          return;
      }
      if (!licenseNumber || !licenseExpiry) {
          toast.error("License Number and Expiry Date are required");
          return;
      }
      if (!licenseClass) {
          toast.error("License Class is required");
          return;
      }
      if (!licenseToDrive) {
          toast.error("License to Drive is required");
          return;
      }
      if (!controlNumber) {
          toast.error("Control Number is required");
          return;
      }
      
      setStep(3);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!address) {
        toast.error("Address is required");
        return;
    }
    if (!proofType || !proofFile) {
        toast.error("Proof of Address is required");
        return;
    }

    setIsLoading(true);
    try {
      let licenseFrontUrl = '';
      let licenseBackUrl = '';
      let proofUrl = '';

      // Parallel Uploads
      const uploads = [];
      
      if (licenseFront) uploads.push(api.uploadFile(licenseFront).then(res => licenseFrontUrl = res.url));
      if (licenseBack) uploads.push(api.uploadFile(licenseBack).then(res => licenseBackUrl = res.url));
      if (proofFile) uploads.push(api.uploadFile(proofFile).then(res => proofUrl = res.url));

      await Promise.all(uploads);

      const fullName = `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`.trim();
      const fullPhone = phoneNumber ? `${countryCode} ${phoneNumber}` : '';

      const driverPayload = {
        password, // Send password for Account Creation
        name: fullName,
        phone: fullPhone,
        email: email || '',
        status: status,
        address,
        licenseFrontUrl,
        licenseBackUrl,
        // Legacy compat
        licenseUrl: licenseFrontUrl, 
        proofOfAddressUrl: proofUrl,
        proofOfAddressType: proofType,
        addressDocUrl: proofUrl,
        
        // New fields
        licenseNumber,
        licenseExpiry,
        dob,
        licenseClass,
        licenseToDrive,
        controlNumber,
        nationality,
        
        vehicle: 'Unassigned',
        totalTrips: 0,
        totalEarnings: 0,
        todaysEarnings: 0,
        todaysTrips: 0,
        acceptanceRate: 100,
        tier: 'Bronze',
        avatarUrl: ''
      };

      const res = await api.saveDriver(driverPayload);
      if (res.error) throw new Error(res.error);

      onDriverAdded(res.data);
      toast.success("Driver account created successfully");
      handleClose();
      
    } catch (error) {
      console.error(error);
      toast.error("Failed to create profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFirstName('');
    setMiddleName('');
    setLastName('');
    setCountryCode('+1');
    setPhoneNumber('');
    setEmail('');
    setNationality('');
    setStatus('Active');
    setAddress('');
    setLicenseFront(null);
    setLicenseBack(null);
    setProofType('');
    setProofFile(null);
    setLicenseNumber('');
    setLicenseExpiry('');
    setDob('');
    setLicenseClass('');
    setLicenseToDrive('');
    setControlNumber('');
    setStep(1);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] overflow-hidden max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Driver Profile</DialogTitle>
          <DialogDescription>
            {step === 1 ? "Start by scanning the driver's license." : "Verify details and complete onboarding."}
          </DialogDescription>
        </DialogHeader>
        
        {/* Progress Indicator */}
        <div className="flex items-center gap-2 mb-4 mt-2">
            <div className={cn("h-2 rounded-full flex-1 transition-all", step >= 1 ? "bg-slate-900" : "bg-slate-100")} />
            <div className={cn("h-2 rounded-full flex-1 transition-all", step >= 2 ? "bg-slate-900" : "bg-slate-100")} />
            <div className={cn("h-2 rounded-full flex-1 transition-all", step >= 3 ? "bg-slate-900" : "bg-slate-100")} />
        </div>
        
        <div className="flex justify-between text-xs font-medium text-slate-500 mb-6 uppercase tracking-wider">
            <span className={cn(step === 1 && "text-slate-900")}>License</span>
            <span className={cn(step === 2 && "text-slate-900")}>Details</span>
            <span className={cn(step === 3 && "text-slate-900")}>Proof of Address</span>
        </div>

        <form onSubmit={handleSubmit}>
            
            {/* STEP 1: LICENSE */}
            {step === 1 && (
                <div className="space-y-6 py-2 animate-in fade-in slide-in-from-left-4 duration-300">
                    <div>
                        <Label className="block mb-3 font-medium text-slate-900">Upload Driver's License <span className="text-red-500">*</span></Label>
                        <div className="grid grid-cols-2 gap-4">
                            <FileUploadZone 
                                label="Front" 
                                file={licenseFront} 
                                onFileSelect={setLicenseFront} 
                                icon={ScanLine}
                                required
                            />
                            <FileUploadZone 
                                label="Back" 
                                file={licenseBack} 
                                onFileSelect={setLicenseBack} 
                                icon={ShieldCheck}
                                required
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            Upload the front of the license to auto-fill personal details.
                        </p>
                    </div>
                </div>
            )}

            {/* STEP 2: DETAILS */}
            {step === 2 && (
                <div className="space-y-6 py-2 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="bg-emerald-50 p-3 rounded border border-emerald-100 mb-4 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-emerald-600" />
                        <span className="text-xs text-emerald-800 font-medium">Details extracted from license. Please verify.</span>
                    </div>

                    {/* Section 1: Personal Info */}
                    <div>
                        <h4 className="text-sm font-semibold text-slate-900 mb-3 border-b pb-1">Personal Information</h4>
                        <div className="space-y-4">
                            <div className="grid grid-cols-4 items-start gap-4">
                                <Label className="text-right pt-2.5">Name <span className="text-red-500">*</span></Label>
                                <div className="col-span-3 space-y-3">
                                    <div className="flex gap-3">
                                        <Input 
                                            placeholder="First Name" 
                                            value={firstName} 
                                            onChange={(e) => setFirstName(e.target.value)} 
                                            className="flex-1"
                                        />
                                        <Input 
                                            placeholder="Middle (Optional)" 
                                            value={middleName} 
                                            onChange={(e) => setMiddleName(e.target.value)} 
                                            className="w-[120px]"
                                        />
                                    </div>
                                    <Input 
                                        placeholder="Last Name" 
                                        value={lastName} 
                                        onChange={(e) => setLastName(e.target.value)} 
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right">DOB <span className="text-red-500">*</span></Label>
                                <Input 
                                    type="date"
                                    value={dob}
                                    onChange={(e) => setDob(e.target.value)}
                                    className="col-span-3"
                                />
                            </div>

                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right">Phone</Label>
                                <div className="col-span-3 flex gap-3">
                                    <Select value={countryCode} onValueChange={setCountryCode}>
                                    <SelectTrigger className="w-[110px]">
                                        <SelectValue placeholder="Code" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {COUNTRY_CODES.map((c) => (
                                            <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                                        ))}
                                    </SelectContent>
                                    </Select>
                                    <Input 
                                        placeholder="555-0123" 
                                        value={phoneNumber} 
                                        onChange={(e) => setPhoneNumber(e.target.value)} 
                                        className="flex-1"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="email" className="text-right">Email <span className="text-red-500">*</span></Label>
                                <Input
                                    id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                    className="col-span-3" placeholder="driver@example.com"
                                />
                            </div>

                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="password" className="text-right">Password <span className="text-red-500">*</span></Label>
                                <div className="col-span-3 relative">
                                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                        className="pl-9" placeholder="Set temporary password"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right">Nationality <span className="text-red-500">*</span></Label>
                                <div className="col-span-3 relative">
                                    <Globe className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                    <Input 
                                        value={nationality}
                                        onChange={(e) => setNationality(e.target.value)}
                                        placeholder="e.g. Jamaican"
                                        className="pl-9"
                                    />
                                </div>
                            </div>

                        </div>
                    </div>
                    
                    {/* Section 2: License Details */}
                    <div>
                        <h4 className="text-sm font-semibold text-slate-900 mb-3 border-b pb-1 mt-2">License Details</h4>
                        <div className="space-y-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right">License # <span className="text-red-500">*</span></Label>
                                <div className="col-span-3 relative">
                                    <CreditCard className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                    <Input 
                                        value={licenseNumber}
                                        onChange={(e) => setLicenseNumber(e.target.value)}
                                        className="pl-9"
                                        placeholder="Enter License Number"
                                    />
                                </div>
                            </div>

                             <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right">Expires <span className="text-red-500">*</span></Label>
                                <div className="col-span-3">
                                    <Input 
                                        type="date"
                                        value={licenseExpiry}
                                        onChange={(e) => setLicenseExpiry(e.target.value)}
                                    />
                                </div>
                            </div>

                             <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right">Class <span className="text-red-500">*</span></Label>
                                <div className="col-span-3">
                                    <Input 
                                        value={licenseClass}
                                        onChange={(e) => setLicenseClass(e.target.value)}
                                        placeholder="e.g. C, D"
                                    />
                                </div>
                            </div>

                             <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right">Licence to Drive <span className="text-red-500">*</span></Label>
                                <div className="col-span-3 relative">
                                    <Car className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                    <Input 
                                        value={licenseToDrive}
                                        onChange={(e) => setLicenseToDrive(e.target.value)}
                                        placeholder="e.g. Motor Car, Motorcycle"
                                        className="pl-9"
                                    />
                                </div>
                            </div>

                             <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right">Control No. <span className="text-red-500">*</span></Label>
                                <div className="col-span-3 relative">
                                    <Hash className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                    <Input 
                                        value={controlNumber}
                                        onChange={(e) => setControlNumber(e.target.value)}
                                        placeholder="Enter Control Number"
                                        className="pl-9"
                                    />
                                </div>
                            </div>

                        </div>
                    </div>

                </div>
            )}

            {/* STEP 3: ADDRESS */}
            {step === 3 && (
                <div className="space-y-6 py-2 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <Label className="block mb-3 font-medium text-slate-900">Proof of Address <span className="text-red-500">*</span></Label>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-xs font-medium uppercase text-slate-500 mb-2 block">Document Type</Label>
                                <Select value={proofType} onValueChange={setProofType}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select type..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="electric">Electric/Light Bill</SelectItem>
                                        <SelectItem value="water">Water Bill</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <FileUploadZone 
                                label="Bill Document" 
                                file={proofFile} 
                                onFileSelect={(f) => {
                                    setProofFile(f);
                                    // Trigger auto-scan if needed, but user might want manual control
                                }} 
                                icon={FileText}
                                required
                            />
                        </div>
                        {proofFile && !address && (
                            <Button type="button" variant="secondary" size="sm" onClick={handleScanAddress} disabled={isScanning} className="mt-2 w-full">
                                {isScanning ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Sparkles className="mr-2 h-3 w-3 text-amber-500" />}
                                Auto-fill Address from Document
                            </Button>
                        )}
                    </div>

                    <div className="grid grid-cols-4 items-start gap-4">
                        <Label className="text-right pt-2.5">
                            Address <span className="text-red-500">*</span>
                        </Label>
                        <div className="col-span-3">
                            <Input 
                                placeholder="Street Address, City, Zip"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                            />
                            <p className="text-xs text-slate-500 mt-1">Where the fleet vehicle will be kept.</p>
                        </div>
                    </div>
                </div>
            )}

            <DialogFooter className="mt-8 flex justify-between sm:justify-between items-center w-full">
                {step === 1 && (
                    <>
                         <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
                         <div className="flex gap-2">
                            {licenseFront && licenseBack && (
                                <Button type="button" variant="ghost" onClick={handleNextStep1}>
                                    Skip Scan
                                </Button>
                            )}
                            <Button 
                                type="button" 
                                onClick={handleScanLicense} 
                                disabled={isScanning || !licenseFront}
                                className="bg-slate-900 text-white hover:bg-slate-800 gap-2"
                            >
                                {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-300" />}
                                Scan & Continue
                            </Button>
                         </div>
                    </>
                )}

                {step === 2 && (
                     <>
                        <Button type="button" variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
                        <Button type="button" onClick={handleNextStep2} className="gap-2">Confirm Details <ArrowRight className="h-4 w-4" /></Button>
                     </>
                )}

                {step === 3 && (
                     <>
                        <Button type="button" variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
                        <Button type="submit" disabled={isLoading} className="bg-slate-900 text-white hover:bg-slate-800 gap-2 min-w-[140px]">
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    Create Profile <Check className="h-4 w-4" />
                                </>
                            )}
                        </Button>
                     </>
                )}
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}