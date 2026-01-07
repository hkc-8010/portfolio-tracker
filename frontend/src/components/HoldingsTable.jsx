import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getHoldings, updateSettings, autoDiscover, uploadPortfolio } from '../lib/api';
import { ArrowUp, ArrowDown, RefreshCw, Wand2, Upload, ExternalLink, Edit2, Save, X } from 'lucide-react';
import clsx from 'clsx';

const HoldingsTable = () => {
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const queryClient = useQueryClient();
    const { data: holdings, isLoading, error, isPlaceholderData } = useQuery({
        queryKey: ['holdings'],
        queryFn: async () => {
            const data = await getHoldings();
            setLastUpdated(new Date());
            return data;
        },
        refetchInterval: 2000,
        refetchIntervalInBackground: true,
    });

    const updateMutation = useMutation({
        mutationFn: ({ isin, ticker, dateOfExit, target, stopLoss }) => updateSettings(isin, ticker, dateOfExit, target, stopLoss),
        onSuccess: () => {
            queryClient.invalidateQueries(['holdings']);
            setEditingId(null);
        },
    });

    const discoverMutation = useMutation({
        mutationFn: autoDiscover,
        onSuccess: (data) => {
            alert(`Auto-discovery completed! Updated ${data.updated} tickers.`);
            queryClient.invalidateQueries(['holdings']);
        }
    });

    const uploadMutation = useMutation({
        mutationFn: uploadPortfolio,
        onSuccess: () => {
            alert('Portfolio updated successfully!');
            queryClient.invalidateQueries(['holdings']);
        },
        onError: (error) => {
            alert(`Upload failed: ${error.response?.data?.detail || error.message}`);
        }
    });

    const fileInputRef = useRef(null);
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            uploadMutation.mutate(file);
        }
        e.target.value = '';
    };

    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ ticker: '', dateOfExit: '', target: '', stopLoss: '' });
    const [sortConfig, setSortConfig] = useState({ key: 'total_return_percent', direction: 'desc' });

    // Sorting - MUST be before conditional returns
    const sortedHoldings = React.useMemo(() => {
        if (!holdings) return [];
        let sortableItems = [...holdings];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                // Handle special cases
                if (sortConfig.key === 'current_value') {
                    aValue = (a.current_price || 0) * a.quantity;
                    bValue = (b.current_price || 0) * b.quantity;
                }

                if (aValue === null || aValue === undefined) aValue = -Infinity;
                if (bValue === null || bValue === undefined) bValue = -Infinity;

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [holdings, sortConfig]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) return <ArrowUp className="w-3 h-3 text-gray-300 ml-1 inline" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp className="w-3 h-3 text-indigo-600 ml-1 inline" />
            : <ArrowDown className="w-3 h-3 text-indigo-600 ml-1 inline" />;
    };

    // NOW conditional returns are safe
    if (isLoading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading portfolio data...</div>;
    if (error) return <div className="p-8 text-center text-red-500">Error loading data: {error.message}</div>;

    const handleEdit = (holding) => {
        setEditingId(holding.isin);
        setEditForm({
            ticker: holding.ticker || '',
            dateOfExit: holding.date_of_exit || '',
            target: holding.target || '',
            stopLoss: holding.stop_loss || '',
        });
    };

    const handleSave = () => {
        updateMutation.mutate({
            isin: editingId,
            ticker: editForm.ticker,
            dateOfExit: editForm.dateOfExit,
            target: editForm.target,
            stopLoss: editForm.stopLoss
        });
    };

    // Calculations
    const totalValue = (holdings || []).reduce((sum, h) => sum + (h.current_price ? h.current_price * h.quantity : 0), 0);
    const totalInvestment = (holdings || []).reduce((sum, h) => sum + (h.average_buy_price ? h.average_buy_price * h.quantity : 0), 0);
    const totalReturnAmount = totalValue - totalInvestment;
    const totalReturnPercent = totalInvestment > 0 ? (totalReturnAmount / totalInvestment) * 100 : 0;

    const totalDayChangeAmount = (holdings || []).reduce((sum, h) => sum + (h.day_change_amount ? h.day_change_amount * h.quantity : 0), 0);
    const prevDayTotalValue = totalValue - totalDayChangeAmount;
    const totalDayChangePercent = prevDayTotalValue > 0 ? (totalDayChangeAmount / prevDayTotalValue) * 100 : 0;

    const totalStocks = (holdings || []).length;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex flex-col items-start">
                    <h2 className="text-lg font-semibold text-gray-900">Portfolio Holdings</h2>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                        Last Refresh: {lastUpdated.toLocaleTimeString()}
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => discoverMutation.mutate()}
                        disabled={discoverMutation.isPending}
                        className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        {discoverMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                        <span>Auto-Discover Tickers</span>
                    </button>
                    <div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                            accept=".xlsx,.xls"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadMutation.isPending}
                            className="flex items-center space-x-2 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm"
                        >
                            {uploadMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            <span>Upload Sheet</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">Total Stocks</p>
                    <p className="text-2xl font-bold text-gray-900">{totalStocks}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">Portfolio Value</p>
                    <p className="text-2xl font-bold text-gray-900">₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">Investment</p>
                    <p className="text-2xl font-bold text-gray-900">₹{totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">Total Return</p>
                    <div className={clsx("text-xl font-bold", totalReturnAmount >= 0 ? "text-green-600" : "text-red-600")}>
                        <div className="flex items-center">
                            {totalReturnAmount >= 0 ? <ArrowUp className="w-4 h-4 mr-1" /> : <ArrowDown className="w-4 h-4 mr-1" />}
                            ₹{Math.abs(totalReturnAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                        <p className="text-xs font-medium opacity-80 mt-0.5">{totalReturnPercent.toFixed(2)}%</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">1-Day Return</p>
                    <div className={clsx("text-xl font-bold", totalDayChangeAmount >= 0 ? "text-green-600" : "text-red-600")}>
                        <div className="flex items-center">
                            {totalDayChangeAmount >= 0 ? <ArrowUp className="w-4 h-4 mr-1" /> : <ArrowDown className="w-4 h-4 mr-1" />}
                            ₹{Math.abs(totalDayChangeAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                        <p className="text-xs font-medium opacity-80 mt-0.5">{totalDayChangePercent.toFixed(2)}%</p>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-600 border-b border-gray-100">
                            <tr>
                                <th className="p-4 font-medium cursor-pointer hover:bg-gray-100" onClick={() => requestSort('stock_name')}>Stock Name <SortIcon columnKey="stock_name" /></th>
                                <th className="p-4 font-medium text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort('quantity')}>Qty <SortIcon columnKey="quantity" /></th>
                                <th className="p-4 font-medium text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort('average_buy_price')}>Avg Price <SortIcon columnKey="average_buy_price" /></th>
                                <th className="p-4 font-medium text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort('current_price')}>Current Price <SortIcon columnKey="current_price" /></th>
                                <th className="p-4 font-medium text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort('day_change_percent')}>Day Change <SortIcon columnKey="day_change_percent" /></th>
                                <th className="p-4 font-medium text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort('total_return_percent')}>Total Return <SortIcon columnKey="total_return_percent" /></th>
                                <th className="p-4 font-medium text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort('current_value')}>Value <SortIcon columnKey="current_value" /></th>
                                <th className="p-4 font-medium text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort('stop_loss')}>SL <SortIcon columnKey="stop_loss" /></th>
                                <th className="p-4 font-medium text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort('target')}>Target <SortIcon columnKey="target" /></th>
                                <th className="p-4 font-medium text-center cursor-pointer hover:bg-gray-100" onClick={() => requestSort('state')}>State <SortIcon columnKey="state" /></th>
                                <th className="p-4 font-medium cursor-pointer hover:bg-gray-100" onClick={() => requestSort('date_of_exit')}>Date of Exit <SortIcon columnKey="date_of_exit" /></th>
                                <th className="p-4 font-medium w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {sortedHoldings.map((holding) => (
                                <tr
                                    key={holding.isin}
                                    className={clsx(
                                        "transition-colors hover:bg-gray-50/50",
                                        holding.total_return_percent > 30 ? "bg-green-50/80 hover:bg-green-100/80" : ""
                                    )}
                                >
                                    <td className="p-4 font-medium text-gray-900">
                                        <div className="flex flex-col">
                                            <span>{holding.stock_name}</span>
                                            <span className="text-xs text-gray-500 font-normal">{holding.isin}</span>
                                            {holding.ticker && (
                                                <a
                                                    href={`https://finance.yahoo.com/quote/${holding.ticker}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-indigo-600 hover:underline flex items-center mt-1 w-fit"
                                                >
                                                    {holding.ticker} <ExternalLink className="w-3 h-3 ml-1" />
                                                </a>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right text-gray-600">{holding.quantity}</td>
                                    <td className="p-4 text-right text-gray-600">₹{holding.average_buy_price?.toLocaleString('en-IN')}</td>
                                    <td className="p-4 text-right font-medium text-gray-900">
                                        {holding.current_price ? `₹${holding.current_price.toLocaleString('en-IN')}` : '-'}
                                    </td>
                                    <td className={clsx("p-4 text-right font-medium",
                                        holding.day_change_percent > 0 ? "text-green-600" : holding.day_change_percent < 0 ? "text-red-600" : "text-gray-600"
                                    )}>
                                        {holding.day_change_percent ? `${holding.day_change_percent > 0 ? '+' : ''}${holding.day_change_percent.toFixed(2)}%` : '-'}
                                    </td>
                                    <td className={clsx("p-4 text-right font-medium",
                                        holding.total_return_percent > 0 ? "text-green-600" : holding.total_return_percent < 0 ? "text-red-600" : "text-gray-600"
                                    )}>
                                        {holding.total_return_percent ? `${holding.total_return_percent > 0 ? '+' : ''}${holding.total_return_percent.toFixed(2)}%` : '-'}
                                    </td>
                                    <td className="p-4 text-right font-medium text-gray-900">
                                        {holding.current_price ? `₹${(holding.current_price * holding.quantity).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '-'}
                                    </td>
                                    <td className="p-4 text-right">
                                        {editingId === holding.isin ? (
                                            <input
                                                type="number"
                                                value={editForm.stopLoss}
                                                onChange={e => setEditForm({ ...editForm, stopLoss: e.target.value })}
                                                placeholder="SL"
                                                className="w-20 text-xs p-1 border rounded"
                                            />
                                        ) : (
                                            <span className="text-gray-600">{holding.stop_loss ? `₹${holding.stop_loss}` : '-'}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {editingId === holding.isin ? (
                                            <input
                                                type="number"
                                                value={editForm.target}
                                                onChange={e => setEditForm({ ...editForm, target: e.target.value })}
                                                placeholder="Target"
                                                className="w-20 text-xs p-1 border rounded"
                                            />
                                        ) : (
                                            <span className="text-gray-600">{holding.target ? `₹${holding.target}` : '-'}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={clsx("inline-flex items-center px-2 py-1 rounded-full text-xs font-bold",
                                            holding.state === "SELL" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"
                                        )}>
                                            {holding.state}
                                        </span>
                                        {holding.state_reason && (
                                            <div className="text-[10px] text-gray-500 mt-0.5">{holding.state_reason}</div>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        {editingId === holding.isin ? (
                                            <input
                                                type="date"
                                                value={editForm.dateOfExit}
                                                onChange={e => setEditForm({ ...editForm, dateOfExit: e.target.value })}
                                                className="border rounded px-2 py-1 text-xs w-full"
                                            />
                                        ) : (
                                            <span className="text-gray-500 text-sm">{holding.date_of_exit || '-'}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {editingId === holding.isin ? (
                                            <div className="flex space-x-1 justify-end">
                                                <button onClick={handleSave} className="p-1 text-green-600 hover:bg-green-50 rounded">
                                                    <Save className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => setEditingId(null)} className="p-1 text-red-600 hover:bg-red-50 rounded">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button onClick={() => handleEdit(holding)} className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default HoldingsTable;
