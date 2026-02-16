import React, { useState, useEffect } from 'react';
import { fuelService } from '../../../services/fuelService';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Loader2, Plus, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';

interface ParentCompany {
  id: string;
  name: string;
  createdAt: string;
}

export function ParentCompanyManager() {
  const [companies, setCompanies] = useState<ParentCompany[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const data = await fuelService.getParentCompanies();
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error('Failed to load parent companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newCompany: ParentCompany = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      createdAt: new Date().toISOString()
    };

    const updatedCompanies = [...companies, newCompany];
    
    try {
      setSaving(true);
      await fuelService.saveParentCompanies(updatedCompanies);
      setCompanies(updatedCompanies);
      setNewName('');
      toast.success('Parent company added successfully');
    } catch (error) {
      console.error('Error adding company:', error);
      toast.error('Failed to add parent company');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCompany = async (id: string) => {
    const updatedCompanies = companies.filter(c => c.id !== id);
    
    try {
      setSaving(true);
      await fuelService.saveParentCompanies(updatedCompanies);
      setCompanies(updatedCompanies);
      toast.success('Parent company removed');
    } catch (error) {
      console.error('Error deleting company:', error);
      toast.error('Failed to remove parent company');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-slate-900">Add Parent Company</h4>
          <p className="text-xs text-slate-500">Register a new entity to organize fuel stations and fleet data.</p>
        </div>
        <form onSubmit={handleAddCompany} className="flex gap-2">
          <Input
            placeholder="Enter company name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full md:w-64 bg-white"
          />
          <Button type="submit" disabled={saving || !newName.trim()} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Add Company
          </Button>
        </form>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Company Name</TableHead>
              <TableHead>Date Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-slate-500 italic">
                  No parent companies found. Add one above to get started.
                </TableCell>
              </TableRow>
            ) : (
              companies.map((company) => (
                <TableRow key={company.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <Building2 className="h-4 w-4 text-slate-400" />
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">{company.name}</TableCell>
                  <TableCell className="text-slate-500">
                    {new Date(company.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-slate-400 hover:text-red-600 hover:bg-red-50 h-8 w-8"
                      onClick={() => handleDeleteCompany(company.id)}
                      disabled={saving}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex gap-3">
        <div className="bg-blue-100 p-2 rounded-full h-fit">
          <Building2 className="h-4 w-4 text-blue-600" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-blue-900">About Parent Companies</p>
          <p className="text-xs text-blue-700 leading-relaxed">
            Parent companies act as top-level containers in the Fleet Integrity system. Stations assigned to a parent company 
            benefit from unified reporting, cross-fleet data synchronization, and shared cryptographic signing profiles.
          </p>
        </div>
      </div>
    </div>
  );
}
