import React, { useState } from 'react';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "../ui/table";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuLabel, 
    DropdownMenuSeparator, 
    DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import { Search, MoreHorizontal, Pencil, Trash2, CreditCard, User, Eye, UserPlus, Loader2 } from "lucide-react";
import { FuelCard } from '../../types/fuel';
import { FuelCardTransactionsSheet } from './FuelCardTransactionsSheet';
import { getCustomerFacingFuelProvider, ROAM_FUEL_PROVIDER_LABEL } from '../../utils/fuelCardDisplay';
import { useIsMobile } from '../ui/use-mobile';
import { cn } from '../ui/utils';

interface FuelCardListProps {
    cards: FuelCard[];
    /** True while first card inventory fetch is in flight */
    loading?: boolean;
    /** Shown when card fetch failed — not the same as empty inventory */
    loadError?: string | null;
    drivers: any[];
    onEdit: (card: FuelCard) => void;
    /** Roam-managed cards only — opens assign-driver flow */
    onAssignDriver: (card: FuelCard) => void;
    onDelete: (cardId: string) => void;
    isRoamManaged: (card: FuelCard) => boolean;
    getVehicleName: (id?: string) => string;
    getDriverName: (id?: string) => string;
}

function cardCodeMobile(cardNumber: string): string {
    return cardNumber.length > 6 ? cardNumber.slice(-6) : cardNumber;
}

function CardRowActions({
    card,
    roamManaged,
    showStandaloneView,
    onView,
    onEdit,
    onAssignDriver,
    onDelete,
}: {
    card: FuelCard;
    roamManaged: boolean;
    showStandaloneView: boolean;
    onView: () => void;
    onEdit: (card: FuelCard) => void;
    onAssignDriver: (card: FuelCard) => void;
    onDelete: (cardId: string) => void;
}) {
    return (
        <div className="flex items-center justify-end gap-1">
            {showStandaloneView && (
                <Button
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title="View transactions"
                    onClick={onView}
                >
                    <Eye className="h-4 w-4 text-slate-600" />
                    <span className="sr-only">View transactions</span>
                </Button>
            )}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className={cn(
                            'p-0',
                            showStandaloneView ? 'h-8 w-8' : 'min-h-11 min-w-11',
                        )}
                    >
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={onView}>
                        <Eye className="mr-2 h-4 w-4" /> View transactions
                    </DropdownMenuItem>
                    {roamManaged ? (
                        <DropdownMenuItem onClick={() => onAssignDriver(card)}>
                            <UserPlus className="mr-2 h-4 w-4" /> Assign Driver
                        </DropdownMenuItem>
                    ) : (
                        <>
                            <DropdownMenuItem onClick={() => onEdit(card)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-rose-600" onClick={() => onDelete(card.id)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete Card
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

export function FuelCardList({
    cards,
    loading = false,
    loadError = null,
    drivers,
    onEdit,
    onAssignDriver,
    onDelete,
    isRoamManaged,
    getVehicleName,
    getDriverName,
}: FuelCardListProps) {
    const isMobile = useIsMobile();
    const [searchTerm, setSearchTerm] = useState('');
    const [viewCard, setViewCard] = useState<FuelCard | null>(null);

    const q = searchTerm.toLowerCase();
    const filteredCards = cards.filter((card) => {
        const roamManaged = isRoamManaged(card);
        const displayProvider = getCustomerFacingFuelProvider(card, roamManaged).toLowerCase();
        const typeLabel =
            card.jaaCardType === 'rental' ? 'rental' : card.jaaCardType === 'driver_tied' ? 'driver' : '';
        return (
            card.cardNumber.toLowerCase().includes(q) ||
            displayProvider.includes(q) ||
            (roamManaged && ROAM_FUEL_PROVIDER_LABEL.toLowerCase().includes(q)) ||
            typeLabel.includes(q) ||
            getVehicleName(card.assignedVehicleId).toLowerCase().includes(q) ||
            getDriverName(card.assignedDriverId).toLowerCase().includes(q)
        );
    });

    const emptyMessage = loading
        ? (
            <span className="inline-flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading cards…
            </span>
        )
        : loadError
            ? <span className="text-rose-600">Couldn’t load cards: {loadError}. Click Refresh Data and try again.</span>
            : <span className="text-slate-500">No cards found.</span>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                    <Input 
                        placeholder="Search cards..." 
                        className="pl-8 text-base md:text-sm" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {isMobile ? (
                <div className="overflow-hidden rounded-md border bg-white">
                    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,1.1fr)_2.75rem] items-center gap-x-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-500">
                        <span>Provider</span>
                        <span className="text-center">Card</span>
                        <span>Assigned</span>
                        <span className="sr-only">Actions</span>
                    </div>

                    {loading || loadError || filteredCards.length === 0 ? (
                        <div className="px-3 py-10 text-center text-sm">{emptyMessage}</div>
                    ) : (
                        filteredCards.map((card) => {
                            const roamManaged = isRoamManaged(card);
                            return (
                                <div
                                    key={card.id}
                                    className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,1.1fr)_2.75rem] items-center gap-x-2 border-b border-slate-100 px-3 py-3 last:border-b-0"
                                >
                                    <div className="min-w-0 truncate text-sm font-medium text-slate-800">
                                        {getCustomerFacingFuelProvider(card, roamManaged)}
                                    </div>
                                    <div className="min-w-0 text-center font-mono text-sm tabular-nums text-slate-700">
                                        {cardCodeMobile(card.cardNumber)}
                                    </div>
                                    <div className="min-w-0 truncate text-sm text-slate-600">
                                        {card.assignedDriverId
                                            ? getDriverName(card.assignedDriverId)
                                            : (
                                                <span className="text-xs italic text-slate-400">Unassigned</span>
                                            )}
                                    </div>
                                    <div className="flex justify-center">
                                        <CardRowActions
                                            card={card}
                                            roamManaged={roamManaged}
                                            showStandaloneView={false}
                                            onView={() => setViewCard(card)}
                                            onEdit={onEdit}
                                            onAssignDriver={onAssignDriver}
                                            onDelete={onDelete}
                                        />
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            ) : (
                <div className="rounded-md border bg-white">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Provider</TableHead>
                                <TableHead>Card Code</TableHead>
                                <TableHead>Assigned To</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading || loadError || filteredCards.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        {emptyMessage}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredCards.map((card) => {
                                    const roamManaged = isRoamManaged(card);
                                    return (
                                        <TableRow key={card.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                                        <CreditCard className="h-4 w-4" />
                                                    </div>
                                                    {getCustomerFacingFuelProvider(card, roamManaged)}
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono">{card.cardNumber}</TableCell>
                                            <TableCell>
                                                {card.assignedDriverId ? (
                                                    <div className="flex items-center gap-1.5 text-sm">
                                                        <User className="h-3.5 w-3.5 text-slate-400" />
                                                        <span>{getDriverName(card.assignedDriverId)}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs italic text-slate-400">Unassigned</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <Badge variant="outline" className={
                                                        card.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                        card.status === 'Lost' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                        'bg-slate-50 text-slate-700'
                                                    }>
                                                        {card.status}
                                                    </Badge>
                                                    {(() => {
                                                        const assignedDriver = drivers.find(d => d.id === card.assignedDriverId || d.driverId === card.assignedDriverId);
                                                        if (assignedDriver?.status === 'Inactive' && card.status === 'Active') {
                                                            return (
                                                                <Badge className="animate-pulse border-none bg-rose-600 text-[8px] font-black uppercase tracking-tighter text-white">
                                                                    DEACTIVATION REQUIRED
                                                                </Badge>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <CardRowActions
                                                    card={card}
                                                    roamManaged={roamManaged}
                                                    showStandaloneView
                                                    onView={() => setViewCard(card)}
                                                    onEdit={onEdit}
                                                    onAssignDriver={onAssignDriver}
                                                    onDelete={onDelete}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            <FuelCardTransactionsSheet
                card={viewCard}
                open={!!viewCard}
                onOpenChange={(open) => { if (!open) setViewCard(null); }}
                getDriverName={getDriverName}
                getVehicleName={getVehicleName}
                isRoamManaged={viewCard ? isRoamManaged(viewCard) : false}
            />
        </div>
    );
}
