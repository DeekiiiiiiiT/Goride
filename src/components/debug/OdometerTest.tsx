import React, { useState } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';

export function OdometerTest() {
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            
            // Show preview
            const reader = new FileReader();
            reader.onload = () => setPreview(reader.result as string);
            reader.readAsDataURL(file);

            setLoading(true);
            setError(null);
            setResult(null);

            try {
                const res = await api.scanOdometerWithAI(file);
                setResult(res);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <Card className="w-full max-w-md mx-auto my-8">
            <CardHeader>
                <CardTitle>AI Odometer Test</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-2">
                    <Input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleFileChange} 
                        disabled={loading}
                    />
                </div>

                {loading && <div className="text-center text-sm text-muted-foreground">Analyzing Image...</div>}
                
                {error && (
                    <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md border border-red-200">
                        Error: {error}
                    </div>
                )}

                {preview && (
                    <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-slate-100">
                        <img src={preview} alt="Preview" className="object-cover w-full h-full" />
                    </div>
                )}

                {result && (
                    <div className="p-4 bg-slate-50 rounded-md border text-xs font-mono whitespace-pre-wrap">
                        {JSON.stringify(result, null, 2)}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
